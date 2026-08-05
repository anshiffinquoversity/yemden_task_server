const TaskStatus = require('../models/TaskStatus');
const { ApiError } = require('./http');
const {
  canChangeToTaskStatus,
  roleDefinitionFor,
} = require('./roleCatalog');

const validStatusCategories = ['open', 'closed', 'canceled'];
const approvedTaskStatusKey = 'approved';
const finalTaskStatusKeys = ['published', 'delivered'];
const employeeRestrictedTaskStatusKeys = new Set([
  approvedTaskStatusKey,
  'canceled',
  'cancelled',
  'delivered',
  'published',
]);

const defaultTaskStatuses = [
  {
    name: 'Open',
    key: 'open',
    category: 'open',
    color: '#22C55E',
    position: 10,
    isDefault: true,
  },
  {
    name: 'In Progress',
    key: 'in_progress',
    category: 'open',
    color: '#61C5F0',
    position: 20,
    isDefault: true,
  },
  {
    name: 'Review',
    key: 'review',
    category: 'open',
    color: '#FACC15',
    position: 30,
    isDefault: true,
  },
  {
    name: 'Completed',
    key: 'completed',
    category: 'closed',
    color: '#94A3B8',
    position: 40,
    isDefault: true,
  },
  {
    name: 'Canceled',
    key: 'canceled',
    category: 'canceled',
    color: '#EF4444',
    position: 50,
    isDefault: true,
  },
];

let defaultsReady = false;
let defaultsPromise = null;

const normalizeStatusKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

const taskStatusPolicyKey = (status) => {
  const data =
    status && typeof status === 'object'
      ? status
      : { key: status, name: '', category: '' };
  const key = normalizeStatusKey(data.key);
  const name = normalizeStatusKey(data.name);
  const category = normalizeStatusKey(data.category);

  if (category === 'canceled' || category === 'cancelled') {
    return 'canceled';
  }

  const displayIdentity = name || key;
  if (displayIdentity === 'canceled' || displayIdentity === 'cancelled') {
    return 'canceled';
  }

  for (const reservedKey of [
    approvedTaskStatusKey,
    'published',
    'delivered',
  ]) {
    if (displayIdentity === reservedKey) return reservedKey;
  }

  return displayIdentity;
};

const canEmployeeChangeTaskStatus = (
  previousStatus,
  nextStatus,
  priorityAccess = 'medium',
  canDeliver = false,
) => {
  const previousKey = normalizeStatusKey(previousStatus);
  const nextKey = normalizeStatusKey(nextStatus);

  if (previousKey === nextKey) return true;
  if (
    finalTaskStatusKeys.includes(previousKey) ||
    previousKey === 'canceled' ||
    previousKey === 'cancelled'
  ) {
    return false;
  }
  if (nextKey === 'published') {
    return normalizeStatusKey(priorityAccess) === 'high';
  }
  if (nextKey === 'delivered') return canDeliver;
  return !employeeRestrictedTaskStatusKeys.has(nextKey);
};

const canManagerChangeTaskStatus = (previousStatus, nextStatus) => {
  const previousKey = normalizeStatusKey(previousStatus);
  const nextKey = normalizeStatusKey(nextStatus);

  if (previousKey === nextKey) return true;
  return !['canceled', 'cancelled'].includes(previousKey) &&
    !['canceled', 'cancelled'].includes(nextKey);
};

const canUserChangeTaskStatus = (userOrRole, previousStatus, nextStatus) => {
  const role =
    typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  const priorityAccess =
    typeof userOrRole === 'object' ? userOrRole?.priorityAccess : undefined;

  if (typeof userOrRole === 'object' && roleDefinitionFor(userOrRole)) {
    if (normalizeStatusKey(previousStatus) === normalizeStatusKey(nextStatus)) {
      return true;
    }
    return canChangeToTaskStatus(userOrRole, nextStatus);
  }

  if (role === 'admin') return true;
  if (role === 'employee') {
    return canEmployeeChangeTaskStatus(
      previousStatus,
      nextStatus,
      priorityAccess,
    );
  }
  if (role === 'social_media_handler') {
    return canEmployeeChangeTaskStatus(
      previousStatus,
      nextStatus,
      'high',
      true,
    );
  }
  if (previousStatus === undefined || previousStatus === null) return true;
  if (role === 'manager') {
    return canManagerChangeTaskStatus(previousStatus, nextStatus);
  }
  return false;
};

const readableStatusKey = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const ensureDefaultTaskStatuses = async () => {
  if (defaultsReady) return;
  if (defaultsPromise) {
    await defaultsPromise;
    return;
  }

  defaultsPromise = Promise.all([
    ...defaultTaskStatuses.map((status) =>
      TaskStatus.updateOne(
        { key: status.key },
        { $setOnInsert: status },
        { upsert: true }
      )
    ),
    TaskStatus.updateOne(
      { key: 'in_progress', isDefault: true, color: '#38BDF8' },
      { $set: { color: '#61C5F0' } }
    ),
  ])
    .then(() => {
      defaultsReady = true;
    })
    .finally(() => {
      defaultsPromise = null;
    });

  await defaultsPromise;
};

const listTaskStatuses = async () => {
  await ensureDefaultTaskStatuses();
  return TaskStatus.find().sort({ position: 1, createdAt: 1, name: 1 });
};

const taskStatusToJson = (status) => {
  const data = typeof status.toJSON === 'function' ? status.toJSON() : status;
  return {
    id: data.id || data._id?.toString() || data.key,
    name: data.name,
    key: data.key,
    category: data.category,
    color: data.color,
    position: data.position || 0,
    isDefault: Boolean(data.isDefault),
  };
};

const fallbackStatusInfo = (key) => {
  const fallback = defaultTaskStatuses.find((status) => status.key === key);
  if (fallback) return taskStatusToJson(fallback);

  return {
    id: key,
    name: readableStatusKey(key),
    key,
    category: 'open',
    color: '#61C5F0',
    position: 0,
    isDefault: false,
  };
};

const getStatusInfoMap = async () => {
  const statuses = await listTaskStatuses();
  return statuses.reduce((map, status) => {
    const data = taskStatusToJson(status);
    map[data.key] = data;
    return map;
  }, {});
};

const resolveTaskStatusKey = async (value) => {
  const key = normalizeStatusKey(value);

  if (!key) {
    throw new ApiError(400, 'Task status is required');
  }

  await ensureDefaultTaskStatuses();
  const status = await TaskStatus.findOne({ key });

  if (!status) {
    throw new ApiError(400, `Task status "${value}" does not exist`);
  }

  return status.key;
};

const resolveTaskStatusPolicyKey = async (value) => {
  const key = normalizeStatusKey(value);

  if (!key) {
    throw new ApiError(400, 'Task status is required');
  }

  await ensureDefaultTaskStatuses();
  const status = await TaskStatus.findOne({ key });

  if (!status) {
    throw new ApiError(400, `Task status "${value}" does not exist`);
  }

  return taskStatusPolicyKey(status);
};

const getTaskStatusKeysByCategory = async (category) => {
  if (!validStatusCategories.includes(category)) {
    throw new ApiError(400, `Status category must be one of: ${validStatusCategories.join(', ')}`);
  }

  await ensureDefaultTaskStatuses();
  const statuses = await TaskStatus.find({ category }).select('key').lean();
  return statuses.map((status) => status.key);
};

const enrichTaskWithStatusInfo = async (task) => {
  const [enriched] = await enrichTasksWithStatusInfo([task]);
  return enriched;
};

const enrichTasksWithStatusInfo = async (tasks) => {
  const statusMap = await getStatusInfoMap();

  return tasks.map((task) => {
    const data = typeof task.toJSON === 'function' ? task.toJSON() : task;
    const key = data.status || 'open';
    const statusInfo = statusMap[key] || fallbackStatusInfo(key);
    return {
      ...data,
      statusInfo,
      statusLabel: statusInfo.name,
      statusCategory: statusInfo.category,
      statusColor: statusInfo.color,
    };
  });
};

module.exports = {
  validStatusCategories,
  defaultTaskStatuses,
  approvedTaskStatusKey,
  finalTaskStatusKeys,
  normalizeStatusKey,
  taskStatusPolicyKey,
  canEmployeeChangeTaskStatus,
  canManagerChangeTaskStatus,
  canUserChangeTaskStatus,
  ensureDefaultTaskStatuses,
  listTaskStatuses,
  taskStatusToJson,
  resolveTaskStatusKey,
  resolveTaskStatusPolicyKey,
  getTaskStatusKeysByCategory,
  enrichTaskWithStatusInfo,
  enrichTasksWithStatusInfo,
};
