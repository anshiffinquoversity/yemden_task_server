const mongoose = require('mongoose');

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const assertObjectId = (value, label = 'id') => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
};

const sameId = (left, right) => {
  if (!left || !right) return false;
  const leftId = left._id || left;
  const rightId = right._id || right;
  return leftId.toString() === rightId.toString();
};

const normalizeIdArray = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(Boolean).map((item) => item.toString()))];
};

const parseOptionalDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `Invalid date value: ${value}`);
  }
  return date;
};

const sendCreated = (res, key, value) => res.status(201).json({ [key]: value });

module.exports = {
  ApiError,
  assertObjectId,
  sameId,
  normalizeIdArray,
  parseOptionalDate,
  sendCreated,
};

