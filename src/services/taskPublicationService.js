const TaskComment = require('../models/TaskComment');
const TaskDocument = require('../models/TaskDocument');
const { ApiError } = require('../utils/http');

const publishableTypes = new Set(['image', 'video', 'document']);

const isPublishableType = (value) =>
  publishableTypes.has(String(value || '').trim().toLowerCase());

const documentAssetId = (document) => `document:${document._id}`;

const commentAssetId = (comment, attachment) =>
  `comment:${comment._id}:${attachment._id}`;

const publicationDate = (asset, fallback) =>
  asset.publishedAt || fallback || null;

const publicationAssetsForTask = async (taskId) => {
  const [documents, comments] = await Promise.all([
    TaskDocument.find({ task: taskId, type: { $in: [...publishableTypes] } })
      .sort({ createdAt: -1, _id: -1 }),
    TaskComment.find({
      task: taskId,
      'attachments.type': { $in: [...publishableTypes] },
    }).sort({ createdAt: -1, _id: -1 }),
  ]);

  const assets = [
    ...documents.map((document) => ({
      id: documentAssetId(document),
      title: document.title,
      url: document.url,
      type: document.type,
      mimeType: '',
      source: 'document',
      isPublished: Boolean(document.isPublished),
      publishedAt: document.publishedAt,
      createdAt: document.createdAt,
    })),
  ];

  for (const comment of comments) {
    for (const attachment of comment.attachments || []) {
      if (!isPublishableType(attachment.type)) continue;
      assets.push({
        id: commentAssetId(comment, attachment),
        title: attachment.title || attachment.url,
        url: attachment.url,
        type: attachment.type,
        mimeType: attachment.mimeType || '',
        source: 'comment',
        isPublished: Boolean(attachment.isPublished),
        publishedAt: attachment.publishedAt,
        createdAt: comment.createdAt,
      });
    }
  }

  assets.sort((left, right) => {
    const leftDate = publicationDate(left, left.createdAt);
    const rightDate = publicationDate(right, right.createdAt);
    return new Date(rightDate || 0).getTime() - new Date(leftDate || 0).getTime();
  });
  return assets;
};

const hasPublishedTaskAsset = async (taskId) => {
  const [document, comment] = await Promise.all([
    TaskDocument.exists({
      task: taskId,
      type: { $in: [...publishableTypes] },
      isPublished: true,
    }),
    TaskComment.exists({
      task: taskId,
      attachments: {
        $elemMatch: {
          type: { $in: [...publishableTypes] },
          isPublished: true,
        },
      },
    }),
  ]);
  return Boolean(document || comment);
};

const ensureTaskHasPublishedAsset = async (taskId) => {
  if (await hasPublishedTaskAsset(taskId)) return;
  throw new ApiError(
    400,
    'Publish at least one image, video, or document before publishing the task',
  );
};

const syncPublishedTaskAssets = async ({ taskId, assetIds, actor }) => {
  if (!Array.isArray(assetIds)) {
    throw new ApiError(400, 'Published asset IDs must be an array');
  }

  const selectedIds = new Set(
    assetIds.map((value) => String(value || '').trim()).filter(Boolean),
  );
  if (selectedIds.size === 0) {
    throw new ApiError(
      400,
      'Select at least one image, video, or document to publish',
    );
  }
  if (selectedIds.size > 200) {
    throw new ApiError(400, 'No more than 200 attachments can be published at once');
  }

  const [documents, comments] = await Promise.all([
    TaskDocument.find({ task: taskId, type: { $in: [...publishableTypes] } }),
    TaskComment.find({
      task: taskId,
      'attachments.type': { $in: [...publishableTypes] },
    }),
  ]);
  const availableIds = new Set();
  for (const document of documents) availableIds.add(documentAssetId(document));
  for (const comment of comments) {
    for (const attachment of comment.attachments || []) {
      if (isPublishableType(attachment.type)) {
        availableIds.add(commentAssetId(comment, attachment));
      }
    }
  }

  const unknownIds = [...selectedIds].filter((id) => !availableIds.has(id));
  if (unknownIds.length > 0) {
    throw new ApiError(400, 'One or more selected attachments no longer exist');
  }

  const now = new Date();
  const actorId = actor?._id || actor || null;
  const saveJobs = [];
  for (const document of documents) {
    const shouldPublish = selectedIds.has(documentAssetId(document));
    if (Boolean(document.isPublished) === shouldPublish) continue;
    document.isPublished = shouldPublish;
    document.publishedAt = shouldPublish ? now : null;
    document.publishedBy = shouldPublish ? actorId : null;
    saveJobs.push(document.save());
  }
  for (const comment of comments) {
    let changed = false;
    for (const attachment of comment.attachments || []) {
      if (!isPublishableType(attachment.type)) continue;
      const shouldPublish = selectedIds.has(commentAssetId(comment, attachment));
      if (Boolean(attachment.isPublished) === shouldPublish) continue;
      attachment.isPublished = shouldPublish;
      attachment.publishedAt = shouldPublish ? now : null;
      attachment.publishedBy = shouldPublish ? actorId : null;
      changed = true;
    }
    if (changed) saveJobs.push(comment.save());
  }

  await Promise.all(saveJobs);
  return publicationAssetsForTask(taskId);
};

module.exports = {
  publishableTypes,
  isPublishableType,
  publicationAssetsForTask,
  hasPublishedTaskAsset,
  ensureTaskHasPublishedAsset,
  syncPublishedTaskAssets,
};
