const notFound = (_req, res) => {
  res.status(404).json({ message: 'Route not found' });
};

const uploadErrorMessage = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE' && err.field === 'logo') {
    return 'Project logo must be 5 MB or smaller';
  }
  if (err.code === 'LIMIT_FILE_SIZE' && err.field === 'thumbnail') {
    return 'Task thumbnail must be 5 MB or smaller';
  }
  if (err.code === 'LIMIT_FILE_SIZE') return 'Attached files must be 50 MB or smaller';
  if (err.code === 'LIMIT_FILE_COUNT') return 'A comment can include up to 8 attachments';
  return err.message || 'Upload failed';
};

const errorMiddleware = (err, _req, res, _next) => {
  console.error(err);

  const isUploadError = err.name === 'MulterError';
  const statusCode = isUploadError ? 400 : err.statusCode || 500;
  const message = isUploadError
    ? uploadErrorMessage(err)
    : err.message || 'Internal server error';

  res.status(statusCode).json({ message });
};

module.exports = { notFound, errorMiddleware };
