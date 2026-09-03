const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const { ApiError } = require('../utils/http');

const commentUploadPath = path.resolve(__dirname, '../../uploads/task-comments');
const projectLogoUploadPath = path.resolve(__dirname, '../../uploads/project-logos');
const taskThumbnailUploadPath = path.resolve(__dirname, '../../uploads/task-thumbnails');
const mediaLibraryUploadPath = path.resolve(__dirname, '../../uploads/media-library');

fs.mkdirSync(commentUploadPath, { recursive: true });
fs.mkdirSync(projectLogoUploadPath, { recursive: true });
fs.mkdirSync(taskThumbnailUploadPath, { recursive: true });
fs.mkdirSync(mediaLibraryUploadPath, { recursive: true });

const safeExtension = (filename) => {
  const extension = path.extname(filename || '').toLowerCase();
  return extension.replace(/[^a-z0-9.]/g, '').slice(0, 12);
};

const storageFor = (uploadPath) => multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadPath);
  },
  filename: (_req, file, callback) => {
    const extension = safeExtension(file.originalname);
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const allowedDocumentExtensions = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.rtf',
  '.zip',
]);

const allowedDocumentMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
]);

const isAllowedDocumentUpload = (file) => {
  const mimetype = String(file.mimetype || '').toLowerCase();
  const extension = path.extname(file.originalname || '').toLowerCase();
  return (
    allowedDocumentMimeTypes.has(mimetype) ||
    allowedDocumentExtensions.has(extension)
  );
};

const isAllowedCommentUpload = (file) => {
  const mimetype = String(file.mimetype || '').toLowerCase();
  return (
    mimetype.startsWith('image/') ||
    mimetype.startsWith('audio/') ||
    mimetype.startsWith('video/') ||
    isAllowedDocumentUpload(file)
  );
};

const isAllowedImageUpload = (file) => {
  const mimetype = String(file.mimetype || '').toLowerCase();
  return mimetype.startsWith('image/');
};

const isAllowedMediaLibraryUpload = (file) => {
  const mimetype = String(file.mimetype || '').toLowerCase();
  return mimetype.startsWith('image/') || mimetype.startsWith('video/');
};

const allowedTaskThumbnailMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const allowedTaskThumbnailExtensions = new Set([
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);

const isAllowedTaskThumbnailUpload = (file) => {
  const mimetype = String(file.mimetype || '').toLowerCase();
  const extension = path.extname(file.originalname || '').toLowerCase();
  return (
    allowedTaskThumbnailMimeTypes.has(mimetype) &&
    allowedTaskThumbnailExtensions.has(extension)
  );
};

const commentUpload = multer({
  storage: storageFor(commentUploadPath),
  limits: {
    files: 8,
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedCommentUpload(file)) {
      callback(new ApiError(400, 'Only image, video, audio, and document files can be attached to comments'));
      return;
    }

    callback(null, true);
  },
});

const projectLogoUpload = multer({
  storage: storageFor(projectLogoUploadPath),
  limits: {
    files: 1,
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedImageUpload(file)) {
      callback(new ApiError(400, 'Project logo must be an image file'));
      return;
    }

    callback(null, true);
  },
});

const taskThumbnailUpload = multer({
  storage: storageFor(taskThumbnailUploadPath),
  limits: {
    files: 1,
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedTaskThumbnailUpload(file)) {
      callback(new ApiError(400, 'Task thumbnail must be a PNG, JPG, or WebP image'));
      return;
    }

    callback(null, true);
  },
});

const mediaLibraryUpload = multer({
  storage: storageFor(mediaLibraryUploadPath),
  limits: {
    files: 1,
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedMediaLibraryUpload(file)) {
      callback(new ApiError(400, 'Media Library accepts only photo and video files'));
      return;
    }

    callback(null, true);
  },
});

module.exports = {
  commentUpload,
  mediaLibraryUpload,
  projectLogoUpload,
  taskThumbnailUpload,
};
