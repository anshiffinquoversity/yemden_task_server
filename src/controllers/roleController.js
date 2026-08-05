const { Role, permissionKeys } = require('../models/Role');
const TaskStatus = require('../models/TaskStatus');
const User = require('../models/User');
const { ApiError, assertObjectId, sendCreated } = require('../utils/http');
const {
  allPermissions,
  ensureDefaultRoles,
  roleToJson,
} = require('../utils/roleCatalog');
const {
  ensureDefaultTaskStatuses,
  normalizeStatusKey,
} = require('../utils/taskStatusCatalog');

const validTaskScopes = ['assigned', 'projects', 'all'];
const validAccessModes = ['all', 'selected'];

const normalizeRoleKey = (value) => normalizeStatusKey(value).slice(0, 50);

const normalizePermissions = (value) => {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'Role permissions must be an array');
  }
  const permissions = [...new Set(value.map(String))];
  const invalid = permissions.filter((item) => !permissionKeys.includes(item));
  if (invalid.length > 0) {
    throw new ApiError(400, `Unknown role permissions: ${invalid.join(', ')}`);
  }
  return permissions;
};

const normalizeStatusAccess = async (value, label) => {
  if (!value || typeof value !== 'object') {
    throw new ApiError(400, `${label} settings are required`);
  }
  const mode = String(value.mode || '').trim();
  if (!validAccessModes.includes(mode)) {
    throw new ApiError(400, `${label} mode must be all or selected`);
  }

  const rawKeys = Array.isArray(value.statusKeys) ? value.statusKeys : [];
  const statusKeys = [
    ...new Set(rawKeys.map(normalizeStatusKey).filter(Boolean)),
  ];

  if (mode === 'selected' && statusKeys.length > 0) {
    await ensureDefaultTaskStatuses();
    const existingCount = await TaskStatus.countDocuments({
      key: { $in: statusKeys },
    });
    if (existingCount !== statusKeys.length) {
      throw new ApiError(400, `${label} contains an unknown task status`);
    }
  }

  return { mode, statusKeys: mode === 'all' ? [] : statusKeys };
};

const validateStatusAccessPair = (visibility, statusChange) => {
  if (visibility.mode === 'selected' && statusChange.mode === 'all') {
    throw new ApiError(
      400,
      'A role cannot change every status when only selected statuses are visible',
    );
  }
  if (visibility.mode !== 'selected' || statusChange.mode !== 'selected') {
    return;
  }

  const visibleKeys = new Set(visibility.statusKeys);
  const hiddenChangeKey = statusChange.statusKeys.find(
    (key) => !visibleKeys.has(key),
  );
  if (hiddenChangeKey) {
    throw new ApiError(
      400,
      'Every changeable status must also be visible to the role',
    );
  }
};

const rolePayload = async (body, { creating = false } = {}) => {
  const payload = {};

  if (creating || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (name.length < 2) {
      throw new ApiError(400, 'Role name must be at least 2 characters');
    }
    payload.name = name;
  }

  if (creating) {
    payload.key = normalizeRoleKey(body.key || payload.name);
    if (!payload.key) throw new ApiError(400, 'Role key is required');
  }

  if (creating || body.priority !== undefined) {
    const priority = Number(body.priority ?? 0);
    if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
      throw new ApiError(400, 'Role priority must be a whole number from 0 to 1000');
    }
    payload.priority = priority;
  }

  if (creating || body.taskScope !== undefined) {
    const taskScope = String(body.taskScope || 'assigned');
    if (!validTaskScopes.includes(taskScope)) {
      throw new ApiError(400, 'Task scope must be assigned, projects, or all');
    }
    payload.taskScope = taskScope;
  }

  if (creating || body.permissions !== undefined) {
    payload.permissions = normalizePermissions(body.permissions || []);
  }
  if (creating || body.statusVisibility !== undefined) {
    payload.statusVisibility = await normalizeStatusAccess(
      body.statusVisibility || { mode: 'all' },
      'Status visibility',
    );
  }
  if (creating || body.statusChange !== undefined) {
    payload.statusChange = await normalizeStatusAccess(
      body.statusChange || { mode: 'selected', statusKeys: [] },
      'Status change',
    );
  }

  const visibility = payload.statusVisibility;
  const statusChange = payload.statusChange;
  if (visibility && statusChange) {
    validateStatusAccessPair(visibility, statusChange);
  }

  return payload;
};

const listRoles = async (_req, res) => {
  await ensureDefaultRoles();
  const roles = await Role.find().sort({ priority: -1, name: 1, _id: 1 });
  res.json({ roles: roles.map(roleToJson), permissionKeys });
};

const createRole = async (req, res) => {
  await ensureDefaultRoles();
  const payload = await rolePayload(req.body, { creating: true });
  if (await Role.exists({ key: payload.key })) {
    throw new ApiError(409, 'A role with this name or key already exists');
  }

  const role = await Role.create({
    ...payload,
    isSystem: false,
    createdBy: req.user._id,
  });
  sendCreated(res, 'role', roleToJson(role));
};

const updateRole = async (req, res) => {
  assertObjectId(req.params.id, 'role id');
  await ensureDefaultRoles();
  const role = await Role.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found');

  const payload = await rolePayload(req.body);
  if (role.key === 'admin') {
    Object.assign(payload, {
      taskScope: 'all',
      permissions: allPermissions,
      statusVisibility: { mode: 'all', statusKeys: [] },
      statusChange: { mode: 'all', statusKeys: [] },
    });
  }

  const current = roleToJson(role);
  validateStatusAccessPair(
    payload.statusVisibility || current.statusVisibility,
    payload.statusChange || current.statusChange,
  );

  Object.assign(role, payload);
  await role.save();
  res.json({ role: roleToJson(role) });
};

const deleteRole = async (req, res) => {
  assertObjectId(req.params.id, 'role id');
  await ensureDefaultRoles();
  const role = await Role.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found');
  if (role.key === 'admin') {
    throw new ApiError(400, 'The admin role cannot be deleted');
  }
  if (await User.exists({ role: role.key })) {
    throw new ApiError(409, 'Reassign users from this role before deleting it');
  }

  await role.deleteOne();
  res.json({ message: 'Role deleted' });
};

module.exports = { listRoles, createRole, updateRole, deleteRole };
