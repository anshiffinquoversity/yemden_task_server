const Task = require('../models/Task');
const TaskStatus = require('../models/TaskStatus');
const { Role } = require('../models/Role');
const { ApiError, assertObjectId, sendCreated } = require('../utils/http');
const {
  validStatusCategories,
  normalizeStatusKey,
  ensureDefaultTaskStatuses,
  listTaskStatuses,
  taskStatusToJson,
} = require('../utils/taskStatusCatalog');
const {
  canChangeToTaskStatus,
  canSeeTaskStatus,
} = require('../utils/roleCatalog');

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
    payload.color = String(body.color || '').trim() || '#61C5F0';
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

const getTaskStatuses = async (req, res) => {
  const statuses = await listTaskStatuses();
  res.json({
    taskStatuses: statuses
      .map(taskStatusToJson)
      .filter((status) => canSeeTaskStatus(req.user, status.key))
      .map((status) => ({
        ...status,
        canChangeTo: canChangeToTaskStatus(req.user, status.key),
      })),
  });
};

const createTaskStatus = async (req, res) => {
  await ensureDefaultTaskStatuses();

  const payload = statusPayload(req.body, { creating: true });
  const existing = await TaskStatus.findOne({ key: payload.key });

  if (existing) {
    throw new ApiError(409, 'A task status with this name already exists');
  }

  if (payload.position === undefined) {
    const statuses = await listTaskStatuses();
    const lastPosition = statuses.reduce(
      (highest, status) => Math.max(highest, Number(status.position) || 0),
      0
    );
    payload.position = lastPosition + 10;
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

const reorderTaskStatuses = async (req, res) => {
  const statusIds = req.body?.statusIds;

  if (!Array.isArray(statusIds) || statusIds.length === 0) {
    throw new ApiError(400, 'Status order is required');
  }

  const normalizedIds = statusIds.map((id) => String(id || '').trim());
  normalizedIds.forEach((id) => assertObjectId(id, 'task status id'));

  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new ApiError(400, 'Status order cannot contain duplicate statuses');
  }

  const statuses = await listTaskStatuses();
  const statusesById = new Map(
    statuses.map((status) => {
      const data = taskStatusToJson(status);
      return [data.id, data];
    })
  );

  if (
    normalizedIds.length !== statuses.length ||
    normalizedIds.some((id) => !statusesById.has(id))
  ) {
    throw new ApiError(
      400,
      'Status list changed. Refresh the statuses and try ordering them again'
    );
  }

  await TaskStatus.bulkWrite(
    normalizedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { position: (index + 1) * 10 } },
      },
    }))
  );

  res.json({
    taskStatuses: normalizedIds.map((id, index) => ({
      ...statusesById.get(id),
      position: (index + 1) * 10,
    })),
  });
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
  await Role.updateMany(
    {},
    {
      $pull: {
        'statusVisibility.statusKeys': status.key,
        'statusChange.statusKeys': status.key,
      },
    },
  );
  res.json({ message: 'Task status deleted' });
};

module.exports = {
  getTaskStatuses,
  createTaskStatus,
  updateTaskStatus,
  reorderTaskStatuses,
  deleteTaskStatus,
};
