const Project = require("../models/Project");
const Task = require("../models/Task");
const { sameId } = require("./http");

const isAdmin = (user) => user?.role === "admin";
const isManager = (user) => user?.role === "manager";
const isSocialMediaHandler = (user) =>
  user?.role === "social_media_handler";
const isEmployee = (user) =>
  user?.role === "employee" || isSocialMediaHandler(user);
const accessRank = { low: 0, medium: 1, high: 2 };

const normalizeIdList = (value) => {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.filter(Boolean).map((item) => item._id || item);
};

const hasAssignedUser = (taskOrAssignedTo, userId) => {
  const assignedTo = taskOrAssignedTo?.assignedTo ?? taskOrAssignedTo;
  return normalizeIdList(assignedTo).some((assigneeId) =>
    sameId(assigneeId, userId),
  );
};

const isTaskCreator = (task, userId) =>
  Boolean(task?.createdBy) && sameId(task.createdBy, userId);

const priorityAccessRank = (user) => accessRank[user?.priorityAccess] ?? accessRank.medium;

const hasPriorityAccess = (user, level) => {
  const requiredRank = accessRank[level] ?? accessRank.medium;
  return priorityAccessRank(user) >= requiredRank;
};

const isHighAccessEmployee = (user) =>
  isEmployee(user) && hasPriorityAccess(user, "high");

const getProjectQueryForUser = (user) => {
  if (isAdmin(user)) return {};

  return {
    $or: [{ owner: user._id }, { members: user._id }],
  };
};

const getVisibleProjectIds = async (user) => {
  const projects = await Project.find(getProjectQueryForUser(user))
    .select("_id")
    .lean();
  return projects.map((project) => project._id);
};

const getTaskQueryForUser = async (user) => {
  if (isAdmin(user)) return {};

  if (isEmployee(user)) {
    if (isHighAccessEmployee(user)) {
      const projectIds = await getVisibleProjectIds(user);
      if (projectIds.length === 0) return { assignedTo: user._id };

      return {
        $or: [{ assignedTo: user._id }, { project: { $in: projectIds } }],
      };
    }

    return { assignedTo: user._id };
  }

  const projectIds = await getVisibleProjectIds(user);
  return { project: { $in: projectIds } };
};

const canViewProject = (user, project) => {
  if (isAdmin(user)) return true;
  return (
    sameId(project.owner, user._id) ||
    project.members.some((member) => sameId(member, user._id))
  );
};

const canManageProjectWork = (user, project) => {
  if (isAdmin(user)) return true;
  if (!isManager(user)) return false;
  return (
    sameId(project.owner, user._id) ||
    project.members.some((member) => sameId(member, user._id))
  );
};

const canManageTaskWork = (user, project) => {
  if (canManageProjectWork(user, project)) return true;
  if (!isHighAccessEmployee(user)) return false;
  return canViewProject(user, project);
};

const canEditTask = (user, task) => {
  if (isAdmin(user)) return true;
  if (isManager(user)) {
    return Boolean(task?.project) && canManageProjectWork(user, task.project);
  }
  return isHighAccessEmployee(user) && isTaskCreator(task, user._id);
};

const canUpdateTaskStatus = (user, task) => {
  if (isAdmin(user)) return true;
  if (isManager(user))
    return Boolean(task.project) && canManageProjectWork(user, task.project);
  if (!isEmployee(user)) return false;
  return (
    hasAssignedUser(task, user._id) ||
    (isHighAccessEmployee(user) && isTaskCreator(task, user._id))
  );
};

const canCancelTasks = (user) => isAdmin(user) || isManager(user);

const combineQuery = (visibilityQuery, filters = {}) => {
  const parts = [];

  if (visibilityQuery && Object.keys(visibilityQuery).length > 0) {
    parts.push(visibilityQuery);
  }

  if (filters && Object.keys(filters).length > 0) {
    parts.push(filters);
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
};

const countVisibleEmployeeProjects = async (user) => {
  const [memberProjectIds, taskProjectIds] = await Promise.all([
    Project.distinct("_id", getProjectQueryForUser(user)),
    Task.distinct("project", { assignedTo: user._id }),
  ]);
  const uniqueProjectIds = new Set(
    [...memberProjectIds, ...taskProjectIds].map((projectId) =>
      projectId.toString(),
    ),
  );
  return uniqueProjectIds.size;
};

module.exports = {
  isAdmin,
  isManager,
  isSocialMediaHandler,
  isEmployee,
  hasPriorityAccess,
  isHighAccessEmployee,
  hasAssignedUser,
  isTaskCreator,
  getProjectQueryForUser,
  getTaskQueryForUser,
  canViewProject,
  canManageProjectWork,
  canManageTaskWork,
  canEditTask,
  canUpdateTaskStatus,
  canCancelTasks,
  combineQuery,
  countVisibleEmployeeProjects,
};
