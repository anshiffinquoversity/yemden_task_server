const fs = require('fs/promises');
const path = require('path');

const Task = require('../models/Task');
const TaskActivity = require('../models/TaskActivity');
const TaskComment = require('../models/TaskComment');
const TaskDocument = require('../models/TaskDocument');
const {
  ApiError,
  assertObjectId,
  sameId,
} = require('../utils/http');
const {
  parsePageSize,
  decodeCursor,
  descendingCursorFilter,
  pageFromResults,
} = require('../utils/pagination');
const {
  canUpdateTaskStatus,
  isAdmin,
  getTaskQueryForUser,
  combineQuery,
} = require('../utils/accessControl');
const {
  createMentionNotifications,
  createTaskActivity,
  mentionableUsersForTask,
  resolveMentionedUsers,
  userLabel,
} = require('../services/taskCollaborationService');
const {
  publicationAssetsForTask,
  syncPublishedTaskAssets,
} = require('../services/taskPublicationService');

const validAttachmentTypes = ['image', 'video', 'document', 'audio', 'link'];
const validDocumentTypes = ['document', 'image', 'video', 'audio', 'link'];
const commentUploadDir = path.resolve(__dirname, '../../uploads/task-comments');

const populateTaskForCollaboration = (query) =>
  query
    .populate('project', 'title color logoUrl owner members')
    .populate('assignedTo', 'name email role status');

const populateComment = (query) =>
  query
    .populate('author', 'name email role status')
    .populate('mentions', 'name email role status');

const populateDocument = (query) =>
  query.populate('uploadedBy', 'name email role status');

const populateActivity = (query) =>
  query.populate('actor', 'name email role status');

const findVisibleTask = async (user, taskId) => {
  assertObjectId(taskId, 'task id');

  const visibilityQuery = await getTaskQueryForUser(user);
  const task = await populateTaskForCollaboration(
    Task.findOne(combineQuery(visibilityQuery, { _id: taskId }))
  );

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  return task;
};

const findTaskForPublication = async (user, taskId) => {
  assertObjectId(taskId, 'task id');
  const task = await populateTaskForCollaboration(Task.findById(taskId));

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }
  if (!canUpdateTaskStatus(user, task)) {
    throw new ApiError(403, 'You cannot publish attachments for this task');
  }
  return task;
};

const normalizeUrl = (value, label = 'url') => {
  const url = String(value || '').trim();
  if (!url) {
    throw new ApiError(400, `${label} is required`);
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new ApiError(400, `${label} must start with http:// or https://`);
  }

  return url;
};

const parseArrayField = (value, label) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_error) {
      throw new ApiError(400, `${label} must be a valid JSON array`);
    }
  }

  throw new ApiError(400, `${label} must be an array`);
};

const normalizeAttachment = (value) => {
  const item = value && typeof value === 'object' ? value : {};
  const type = String(item.type || 'link').trim().toLowerCase();

  if (!validAttachmentTypes.includes(type)) {
    throw new ApiError(400, `Attachment type must be one of: ${validAttachmentTypes.join(', ')}`);
  }

  const url = normalizeUrl(item.url, 'Attachment URL');
  const title = String(item.title || '').trim() || url;

  return {
    type,
    url,
    title,
    mimeType: String(item.mimeType || '').trim(),
  };
};

const normalizeAttachments = (value) => {
  const attachments = parseArrayField(value, 'Attachments');

  if (attachments.length > 8) {
    throw new ApiError(400, 'A comment can include up to 8 attachments');
  }

  return attachments.map(normalizeAttachment);
};

const normalizeMentionIds = (value) => {
  const ids = parseArrayField(value, 'Mention IDs');
  const cleanIds = [
    ...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)),
  ];

  cleanIds.forEach((id) => assertObjectId(id, 'mention id'));
  return cleanIds;
};

const publicUrlForUpload = (req, file) => {
  const relativePath = `/uploads/task-comments/${file.filename}`;
  return `${req.protocol}://${req.get('host')}${relativePath}`;
};

const deleteUploadedCommentFile = async (attachmentUrl) => {
  const rawUrl = String(attachmentUrl || '').trim();
  if (!rawUrl) return;

  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch (_error) {
    // Relative upload URLs are supported for older comment records.
  }

  if (!pathname.startsWith('/uploads/task-comments/')) return;
  const filename = path.basename(pathname);
  if (!filename || filename === '.' || filename === '..') return;

  const targetPath = path.resolve(commentUploadDir, filename);
  if (!targetPath.startsWith(`${commentUploadDir}${path.sep}`)) return;

  try {
    await fs.unlink(targetPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(
        `Unable to delete comment attachment ${targetPath}:`,
        error.message
      );
    }
  }
};

const videoExtensions = new Set(['.mp4', '.mov', '.webm', '.mkv']);

const inferUploadedAttachmentType = (file) => {
  const mimetype = String(file.mimetype || '').toLowerCase();
  const extension = path.extname(file.originalname || '').toLowerCase();

  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('video/') || videoExtensions.has(extension)) {
    return 'video';
  }

  return 'document';
};

const uploadedAttachmentType = (file, metadata) => {
  const inferredType = inferUploadedAttachmentType(file);
  const requestedType = String(metadata.type || inferredType).trim().toLowerCase();

  if (!['image', 'audio', 'video', 'document'].includes(requestedType)) {
    throw new ApiError(400, 'Uploaded comment files must be image, video, audio, or document attachments');
  }

  if (requestedType !== inferredType) {
    throw new ApiError(400, `Uploaded ${inferredType} file cannot be saved as ${requestedType}`);
  }

  return inferredType;
};

const normalizeUploadedAttachments = (req) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) return [];

  const metadata = parseArrayField(req.body.fileMetadata, 'File metadata');

  return files.map((file, index) => {
    const item = metadata[index] && typeof metadata[index] === 'object' ? metadata[index] : {};
    const type = uploadedAttachmentType(file, item);
    const title = String(item.title || '').trim() || file.originalname || file.filename;

    return {
      type,
      title,
      url: publicUrlForUpload(req, file),
      mimeType: file.mimetype || '',
      isLocalUpload: true,
    };
  });
};

const listTaskCollaboration = async (req, res) => {
  const task = await findVisibleTask(req.user, req.params.id);
  const section = String(req.query.section || 'all').trim().toLowerCase();
  if (!['all', 'comments', 'documents', 'activities'].includes(section)) {
    throw new ApiError(400, 'Invalid collaboration section');
  }
  const limit = parsePageSize(req.query.limit, {
    defaultPageSize: 25,
    maxPageSize: 50,
  });
  const queryFor = (cursorValue) => {
    const cursorFilter = descendingCursorFilter(decodeCursor(cursorValue));
    return Object.keys(cursorFilter).length
      ? { $and: [{ task: task._id }, cursorFilter] }
      : { task: task._id };
  };

  const includes = (name) => section === 'all' || section === name;
  const [commentResults, documentResults, activityResults, mentionableUsers] =
    await Promise.all([
      includes('comments')
        ? populateComment(TaskComment.find(queryFor(req.query.commentsCursor)))
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
        : [],
      includes('documents')
        ? populateDocument(TaskDocument.find(queryFor(req.query.documentsCursor)))
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
        : [],
      includes('activities')
        ? populateActivity(TaskActivity.find(queryFor(req.query.activitiesCursor)))
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
        : [],
      section === 'all' ? mentionableUsersForTask(task) : [],
    ]);
  const commentsPage = pageFromResults(commentResults, limit);
  const documentsPage = pageFromResults(documentResults, limit);
  const activitiesPage = pageFromResults(activityResults, limit);

  res.json({
    comments: commentsPage.items,
    documents: documentsPage.items,
    activities: activitiesPage.items,
    mentionableUsers,
    pageInfo: {
      comments: commentsPage.pageInfo,
      documents: documentsPage.pageInfo,
      activities: activitiesPage.pageInfo,
    },
  });
};

const createTaskComment = async (req, res) => {
  const task = await findVisibleTask(req.user, req.params.id);
  const body = String(req.body.body || '').trim();
  const mentionIds = normalizeMentionIds(req.body.mentionIds);
  const attachments = [
    ...normalizeAttachments(req.body.attachments),
    ...normalizeUploadedAttachments(req),
  ];

  if (attachments.length > 8) {
    throw new ApiError(400, 'A comment can include up to 8 attachments');
  }

  if (!body && attachments.length === 0) {
    throw new ApiError(400, 'Comment text or an attachment is required');
  }

  const mentionedUsers = await resolveMentionedUsers(
    body,
    task,
    req.user,
    mentionIds
  );
  const comment = await TaskComment.create({
    task: task._id,
    author: req.user._id,
    body,
    mentions: mentionedUsers.map((user) => user._id),
    attachments,
  });

  const [createdComment, notifications] = await Promise.all([
    populateComment(TaskComment.findById(comment._id)),
    createMentionNotifications({
      task,
      actor: req.user,
      commentBody: body,
      mentionedUsers,
    }),
    createTaskActivity({
      task,
      actor: req.user,
      type: 'comment_added',
      message: `${userLabel(req.user)} added a comment`,
      metadata: {
        comment: comment._id,
        mentions: mentionedUsers.map((user) => user._id),
      },
    }),
  ]);

  res.status(201).json({
    comment: createdComment,
    mentionsNotified: notifications.length,
  });
};

const deleteTaskComment = async (req, res) => {
  const task = await findVisibleTask(req.user, req.params.id);
  assertObjectId(req.params.commentId, 'comment id');

  const comment = await TaskComment.findOne({
    _id: req.params.commentId,
    task: task._id,
  });
  if (!comment) {
    throw new ApiError(404, 'Comment not found');
  }

  if (!isAdmin(req.user) && !sameId(comment.author, req.user._id)) {
    throw new ApiError(403, 'You can only delete your own comments');
  }

  const uploadedAttachmentUrls = (comment.attachments || [])
    .filter((attachment) => attachment.isLocalUpload)
    .map((attachment) => attachment.url);
  await comment.deleteOne();
  await Promise.all(uploadedAttachmentUrls.map(deleteUploadedCommentFile));

  res.json({ message: 'Comment deleted' });
};

const createTaskDocument = async (req, res) => {
  const task = await findVisibleTask(req.user, req.params.id);
  const title = String(req.body.title || '').trim();
  const type = String(req.body.type || 'document').trim().toLowerCase();

  if (!title) {
    throw new ApiError(400, 'Document title is required');
  }

  if (!validDocumentTypes.includes(type)) {
    throw new ApiError(400, `Document type must be one of: ${validDocumentTypes.join(', ')}`);
  }

  const url = normalizeUrl(req.body.url, 'Document URL');
  const source = type === 'audio' ? 'recording' : 'manual';
  const document = await TaskDocument.create({
    task: task._id,
    uploadedBy: req.user._id,
    title,
    url,
    type,
    source,
  });

  const [createdDocument] = await Promise.all([
    populateDocument(TaskDocument.findById(document._id)),
    createTaskActivity({
      task,
      actor: req.user,
      type: type === 'audio' ? 'recording_added' : 'document_added',
      message:
        type === 'audio'
          ? `${userLabel(req.user)} added a recording: ${title}`
          : `${userLabel(req.user)} added a document: ${title}`,
      metadata: {
        document: document._id,
        type,
      },
    }),
  ]);

  res.status(201).json({ document: createdDocument });
};

const listTaskPublicationAssets = async (req, res) => {
  const task = await findTaskForPublication(req.user, req.params.id);
  res.json({ assets: await publicationAssetsForTask(task._id) });
};

const updateTaskPublicationAssets = async (req, res) => {
  const task = await findTaskForPublication(req.user, req.params.id);
  const assets = await syncPublishedTaskAssets({
    taskId: task._id,
    assetIds: req.body.assetIds,
    actor: req.user,
  });

  res.json({ assets });
};

module.exports = {
  listTaskCollaboration,
  createTaskComment,
  deleteTaskComment,
  createTaskDocument,
  listTaskPublicationAssets,
  updateTaskPublicationAssets,
};
