const Task = require('../models/Task');
const TaskStatus = require('../models/TaskStatus');
const { ApiError, assertObjectId, sendCreated } = require('../utils/http');
const {
  validStatusCategories,
  normalizeStatusKey,
  ensureDefaultTaskStatuses,
  listTaskStatuses,
  taskStatusToJson,
} = require('../utils/taskStatusCatalog');

const statusPayload = (body, { creating = false } = {}) => {
  const payload = {};

  if (creating || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError(400, 'Status name is required');
    payload.name = name;
  }

  if (creating) {
    payload.key = normalizeStatusKey(body.key || payload.name);
    if (!payload.key) throw new ApiError(400, 'Status key is required');
  }

  if (creating || body.category !== undefined) {
    const category = String(body.category || 'open').trim();
    if (!validStatusCategories.includes(category)) {
      throw new ApiError(400, `Status category must be one of: ${validStatusCategories.join(', ')}`);
    }
    payload.category = category;
  }

  if (body.color !== undefined) {
    payload.color = String(body.color || '').trim() || '#38BDF8';
  }

  if (body.position !== undefined) {
    const position = Number(body.position);
    if (!Number.isFinite(position)) {
      throw new ApiError(400, 'Status position must be a number');
    }
    payload.position = position;
  }

  return payload;
};

const getTaskStatuses = async (_req, res) => {
  const statuses = await listTaskStatuses();
  res.json({ taskStatuses: statuses.map(taskStatusToJson) });
};

const createTaskStatus = async (req, res) => {
  await ensureDefaultTaskStatuses();

  const payload = statusPayload(req.body, { creating: true });
  const existing = await TaskStatus.findOne({ key: payload.key });

  if (existing) {
    throw new ApiError(409, 'A task status with this name already exists');
  }

  const status = await TaskStatus.create({
    ...payload,
    createdBy: req.user._id,
  });

  sendCreated(res, 'taskStatus', taskStatusToJson(status));
};

const updateTaskStatus = async (req, res) => {
  assertObjectId(req.params.id, 'task status id');

  await ensureDefaultTaskStatuses();
  const status = await TaskStatus.findById(req.params.id);

  if (!status) {
    throw new ApiError(404, 'Task status not found');
  }

  const payload = statusPayload(req.body);
  Object.assign(status, payload);
  await status.save();

  res.json({ taskStatus: taskStatusToJson(status) });
};

const deleteTaskStatus = async (req, res) => {
  assertObjectId(req.params.id, 'task status id');

  await ensureDefaultTaskStatuses();
  const status = await TaskStatus.findById(req.params.id);

  if (!status) {
    throw new ApiError(404, 'Task status not found');
  }

  if (status.isDefault) {
    throw new ApiError(400, 'Default task statuses cannot be deleted');
  }

  const inUse = await Task.exists({ status: status.key });
  if (inUse) {
    throw new ApiError(400, 'This status is assigned to tasks and cannot be deleted');
  }

  await status.deleteOne();
  res.json({ message: 'Task status deleted' });
};

module.exports = {
  getTaskStatuses,
  createTaskStatus,
  updateTaskStatus,
  deleteTaskStatus,
};
