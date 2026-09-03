const fs = require('fs/promises');
const path = require('path');

const MediaLibraryItem = require('../models/MediaLibraryItem');
const { isAdmin } = require('../utils/accessControl');
const { ApiError, assertObjectId, sameId, sendCreated } = require('../utils/http');
const {
  parsePageSize,
  decodeCursor,
  descendingCursorFilter,
  pageFromResults,
} = require('../utils/pagination');

const validTypes = ['image', 'video', 'link'];
const mediaUploadDir = path.resolve(__dirname, '../../uploads/media-library');

const populateUploader = (query) =>
  query.populate('uploadedBy', 'name email role status');

const normalizeTitle = (value, fallback = '') => {
  const title = String(value || fallback).trim();
  if (!title) throw new ApiError(400, 'Title is required');
  if (title.length > 160) {
    throw new ApiError(400, 'Title must be 160 characters or fewer');
  }
  return title;
};

const normalizeExternalUrl = (value) => {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) throw new ApiError(400, 'Link URL is required');

  let url;
  try {
    url = new URL(rawUrl);
  } catch (_error) {
    throw new ApiError(400, 'Link URL must be a valid web address');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(400, 'Link URL must start with http:// or https://');
  }
  return url.toString();
};

const normalizeTypeFilter = (value) => {
  const type = String(value || '').trim().toLowerCase();
  if (!type || type === 'all') return null;
  if (!validTypes.includes(type)) {
    throw new ApiError(400, `Type must be one of: ${validTypes.join(', ')}`);
  }
  return type;
};

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseDateBoundary = (value, label) => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `Invalid ${label} filter. Use an ISO date.`);
  }
  return date;
};

const canManageItem = (user, item) =>
  isAdmin(user) || sameId(item.uploadedBy, user?._id);

const publicUrlForUpload = (file) =>
  `/uploads/media-library/${file.filename}`;

const removeUploadedFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(error);
  }
};

const localFilePathForItem = (item) => {
  if (!item?.isLocalUpload) return null;
  const rawUrl = String(item.url || '').trim();
  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch (_error) {
    // New media uploads use relative URLs, while absolute legacy URLs are safe too.
  }

  if (!pathname.startsWith('/uploads/media-library/')) return null;
  const filename = path.basename(pathname);
  const targetPath = path.resolve(mediaUploadDir, filename);
  if (!targetPath.startsWith(`${mediaUploadDir}${path.sep}`)) return null;
  return targetPath;
};

const listMediaLibraryItems = async (req, res) => {
  const limit = parsePageSize(req.query.limit);
  const cursor = decodeCursor(req.query.cursor);
  const type = normalizeTypeFilter(req.query.type);
  const search = String(req.query.search || '').trim();
  const createdFrom = req.query.createdFrom
    ? parseDateBoundary(req.query.createdFrom, 'createdFrom')
    : null;
  const createdBefore = req.query.createdBefore
    ? parseDateBoundary(req.query.createdBefore, 'createdBefore')
    : null;
  if (createdFrom && createdBefore && createdFrom >= createdBefore) {
    throw new ApiError(400, 'createdFrom must be earlier than createdBefore');
  }

  const createdAt = {
    ...(createdFrom ? { $gte: createdFrom } : {}),
    ...(createdBefore ? { $lt: createdBefore } : {}),
  };
  const filters = {
    ...descendingCursorFilter(cursor),
    ...(type ? { type } : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    ...(search
      ? { title: { $regex: escapeRegExp(search), $options: 'i' } }
      : {}),
  };

  const results = await populateUploader(
    MediaLibraryItem.find(filters).sort({ createdAt: -1, _id: -1 }).limit(limit + 1)
  );
  const page = pageFromResults(results, limit);
  res.json({ items: page.items, pageInfo: page.pageInfo });
};

const createMediaLibraryItem = async (req, res) => {
  const file = req.file;

  try {
    let itemData;
    if (file) {
      const mimeType = String(file.mimetype || '').toLowerCase();
      const type = mimeType.startsWith('video/') ? 'video' : 'image';
      itemData = {
        title: normalizeTitle(req.body.title, file.originalname),
        type,
        url: publicUrlForUpload(file),
        mimeType,
        originalFileName: String(file.originalname || '').trim(),
        sizeBytes: Number(file.size) || 0,
        isLocalUpload: true,
        uploadedBy: req.user._id,
      };
    } else {
      const type = String(req.body.type || 'link').trim().toLowerCase();
      if (type !== 'link') {
        throw new ApiError(400, 'Choose a photo or video file to upload');
      }
      const url = normalizeExternalUrl(req.body.url);
      itemData = {
        title: normalizeTitle(req.body.title, new URL(url).hostname),
        type: 'link',
        url,
        uploadedBy: req.user._id,
      };
    }

    const item = await MediaLibraryItem.create(itemData);
    await item.populate('uploadedBy', 'name email role status');
    return sendCreated(res, 'item', item);
  } catch (error) {
    if (file) await removeUploadedFile(file.path);
    throw error;
  }
};

const updateMediaLibraryItem = async (req, res) => {
  assertObjectId(req.params.id, 'media item id');
  const item = await MediaLibraryItem.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Media item not found');
  if (!canManageItem(req.user, item)) {
    throw new ApiError(403, 'You can only edit media items you added');
  }

  if (req.body.title !== undefined) {
    item.title = normalizeTitle(req.body.title);
  }
  if (item.type === 'link' && req.body.url !== undefined) {
    item.url = normalizeExternalUrl(req.body.url);
  }

  await item.save();
  await item.populate('uploadedBy', 'name email role status');
  res.json({ item });
};

const deleteMediaLibraryItem = async (req, res) => {
  assertObjectId(req.params.id, 'media item id');
  const item = await MediaLibraryItem.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Media item not found');
  if (!canManageItem(req.user, item)) {
    throw new ApiError(403, 'You can only delete media items you added');
  }

  const localFilePath = localFilePathForItem(item);
  await item.deleteOne();
  await removeUploadedFile(localFilePath);
  res.json({ message: 'Media item deleted' });
};

module.exports = {
  listMediaLibraryItems,
  createMediaLibraryItem,
  updateMediaLibraryItem,
  deleteMediaLibraryItem,
};
