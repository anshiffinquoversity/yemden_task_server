const { Role, permissionKeys } = require('../models/Role');

const allPermissions = [...permissionKeys];
const employeeStatuses = [
  'open',
  'in_progress',
  'review',
  'completed',
  'description_added',
  'scheduled',
];
const managerStatuses = [
  ...employeeStatuses,
  'approved',
  'published',
  'delivered',
];

const defaultRoles = [
  {
    name: 'Admin',
    key: 'admin',
    priority: 1000,
    taskScope: 'all',
    permissions: allPermissions,
    statusVisibility: { mode: 'all', statusKeys: [] },
    statusChange: { mode: 'all', statusKeys: [] },
    isSystem: true,
  },
  {
    name: 'Manager',
    key: 'manager',
    priority: 700,
    taskScope: 'projects',
    permissions: [
      'manageProjects',
      'manageTasks',
      'manageTaskStatuses',
      'deleteTasks',
      'changeTaskStatus',
    ],
    statusVisibility: { mode: 'all', statusKeys: [] },
    statusChange: { mode: 'selected', statusKeys: managerStatuses },
    isSystem: true,
  },
  {
    name: 'Social media handler',
    key: 'social_media_handler',
    priority: 400,
    taskScope: 'assigned',
    permissions: ['changeTaskStatus'],
    statusVisibility: { mode: 'all', statusKeys: [] },
    statusChange: {
      mode: 'selected',
      statusKeys: [...employeeStatuses, 'published', 'delivered'],
    },
    isSystem: true,
  },
  {
    name: 'Employee',
    key: 'employee',
    priority: 300,
    taskScope: 'assigned',
    permissions: ['changeTaskStatus'],
    statusVisibility: { mode: 'all', statusKeys: [] },
    statusChange: { mode: 'selected', statusKeys: employeeStatuses },
    isSystem: true,
  },
];

let defaultsPromise = null;
let defaultsReady = false;

const ensureDefaultRoles = async () => {
  if (defaultsReady) return;
  if (!defaultsPromise) {
    defaultsPromise = Promise.all(
      defaultRoles.map((role) =>
        Role.updateOne(
          { key: role.key },
          { $setOnInsert: role },
          { upsert: true },
        ),
      ),
    )
      .then(() => {
        defaultsReady = true;
      })
      .finally(() => {
        defaultsPromise = null;
      });
  }
  await defaultsPromise;
};

const normalizeStatusAccess = (value, fallbackMode = 'selected') => ({
  mode: value?.mode === 'all' ? 'all' : fallbackMode,
  statusKeys: [...new Set((value?.statusKeys || []).map(String))],
});

const roleToJson = (role) => {
  if (!role) return null;
  const data = typeof role.toJSON === 'function' ? role.toJSON() : role;
  const isAdmin = data.key === 'admin';
  return {
    id: data.id || data._id?.toString() || data.key,
    name: data.name,
    key: data.key,
    priority: Number(data.priority) || 0,
    taskScope: isAdmin ? 'all' : data.taskScope || 'assigned',
    permissions: isAdmin
      ? allPermissions
      : [...new Set((data.permissions || []).map(String))],
    statusVisibility: isAdmin
      ? { mode: 'all', statusKeys: [] }
      : normalizeStatusAccess(data.statusVisibility, 'selected'),
    statusChange: isAdmin
      ? { mode: 'all', statusKeys: [] }
      : normalizeStatusAccess(data.statusChange, 'selected'),
    isSystem: Boolean(data.isSystem),
  };
};

const getRoleByKey = async (key) => {
  await ensureDefaultRoles();
  return Role.findOne({ key: String(key || '').trim().toLowerCase() });
};

const attachRoleDefinition = async (user) => {
  if (!user) return null;
  const role = await getRoleByKey(user.role);
  const definition = roleToJson(role);
  if (user.$locals) user.$locals.roleDefinition = definition;
  user.roleDefinition = definition;
  return definition;
};

const userRoleFields = async (user, { includeDefinition = false } = {}) => {
  const definition = await attachRoleDefinition(user);
  return {
    roleName: definition?.name || String(user?.role || ''),
    rolePriority: definition?.priority || 0,
    ...(includeDefinition ? { roleDefinition: definition } : {}),
  };
};

const roleDefinitionFor = (user) =>
  user?.roleDefinition || user?.$locals?.roleDefinition || null;

const hasPermission = (user, permission) => {
  if (user?.role === 'admin') return true;
  const definition = roleDefinitionFor(user);
  if (!definition) {
    const legacyPermissions = {
      manager: [
        'manageProjects',
        'manageTasks',
        'manageTaskStatuses',
        'deleteTasks',
        'changeTaskStatus',
      ],
      employee: ['changeTaskStatus'],
      social_media_handler: ['changeTaskStatus'],
    };
    return (legacyPermissions[user?.role] || []).includes(permission);
  }
  return definition.permissions.includes(permission);
};

const taskScopeFor = (user) => {
  if (user?.role === 'admin') return 'all';
  if (roleDefinitionFor(user)?.taskScope) return roleDefinitionFor(user).taskScope;
  return user?.role === 'manager' ? 'projects' : 'assigned';
};

const statusAccessAllows = (access, statusKey) => {
  if (!access) return false;
  if (access.mode === 'all') return true;
  return access.statusKeys.includes(String(statusKey || '').trim().toLowerCase());
};

const canSeeTaskStatus = (user, statusKey) => {
  if (user?.role === 'admin') return true;
  if (!roleDefinitionFor(user)) return true;
  return statusAccessAllows(
    roleDefinitionFor(user)?.statusVisibility,
    statusKey,
  );
};

const canChangeToTaskStatus = (user, statusKey) => {
  if (!hasPermission(user, 'changeTaskStatus')) return false;
  if (!canSeeTaskStatus(user, statusKey)) return false;
  return statusAccessAllows(roleDefinitionFor(user)?.statusChange, statusKey);
};

const statusVisibilityQueryFor = (user) => {
  if (user?.role === 'admin') return {};
  const access = roleDefinitionFor(user)?.statusVisibility;
  if (!access) return {};
  if (access?.mode === 'all') return {};
  return { status: { $in: access?.statusKeys || [] } };
};

module.exports = {
  allPermissions,
  defaultRoles,
  ensureDefaultRoles,
  roleToJson,
  getRoleByKey,
  attachRoleDefinition,
  userRoleFields,
  roleDefinitionFor,
  hasPermission,
  taskScopeFor,
  canSeeTaskStatus,
  canChangeToTaskStatus,
  statusVisibilityQueryFor,
};
