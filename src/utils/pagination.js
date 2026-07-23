const mongoose = require('mongoose');

const { ApiError } = require('./http');

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const parsePageSize = (
  value,
  { defaultPageSize = DEFAULT_PAGE_SIZE, maxPageSize = MAX_PAGE_SIZE } = {}
) => {
  if (value === undefined || value === null || value === '') {
    return defaultPageSize;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxPageSize) {
    throw new ApiError(400, `limit must be an integer from 1 to ${maxPageSize}`);
  }

  return limit;
};

const encodeCursor = (item) => {
  const createdAt = item?.createdAt ? new Date(item.createdAt) : null;
  const id = item?._id || item?.id;

  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) return null;

  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id: id.toString() })
  ).toString('base64url');
};

const decodeCursor = (value) => {
  if (value === undefined || value === null || value === '') return null;

  try {
    const payload = JSON.parse(
      Buffer.from(String(value), 'base64url').toString('utf8')
    );
    const createdAt = new Date(payload.createdAt);
    const id = String(payload.id || '');

    if (
      Number.isNaN(createdAt.getTime()) ||
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      throw new Error('Invalid cursor payload');
    }

    return { createdAt, id: new mongoose.Types.ObjectId(id) };
  } catch (_error) {
    throw new ApiError(400, 'cursor is invalid or expired');
  }
};

const descendingCursorFilter = (cursor) => {
  if (!cursor) return {};

  return {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  };
};

const pageFromResults = (results, limit) => {
  const hasNext = results.length > limit;
  const items = hasNext ? results.slice(0, limit) : results;
  const nextCursor = hasNext ? encodeCursor(items.at(-1)) : null;

  return {
    items,
    pageInfo: {
      limit,
      hasNext,
      nextCursor,
    },
  };
};

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parsePageSize,
  decodeCursor,
  descendingCursorFilter,
  pageFromResults,
};
