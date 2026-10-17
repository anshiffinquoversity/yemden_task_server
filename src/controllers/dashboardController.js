const Project = require("../models/Project");
const Task = require("../models/Task");
const TaskActivity = require("../models/TaskActivity");
const User = require("../models/User");
const {
  getProjectQueryForUser,
  getTaskQueryForUser,
  countVisibleEmployeeProjects,
} = require("../utils/accessControl");
const { ApiError, assertObjectId, sameId } = require("../utils/http");
const { taskScopeFor } = require("../utils/roleCatalog");
const {
  enrichTasksWithStatusInfo,
  taskStatusPolicyKey,
} = require("../utils/taskStatusCatalog");
const {
  enrichTaskWithSchedule,
  taskOverlapsDateRange,
} = require("../utils/taskSchedule");
const { hasCompletedDuty } = require("../utils/taskDuty");

const parseDateFilter = (value, label) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `Invalid ${label}. Use YYYY-MM-DD.`);
  }
  return date;
};

const taskId = (task) => String(task?.id || task?._id || "");
const userId = (user) => String(user?.id || user?._id || user || "");

const hasRecordedApproval = (task) =>
  Boolean(task?.approvedAt) ||
  ["approved", "published"].includes(
    taskStatusPolicyKey(task?.statusInfo || task?.status),
  );

const dashboardTaskCounts = (tasks) => ({
  totalTasks: tasks.length,
  openTasks: tasks.filter((task) => task.status === "open").length,
  inProgressTasks: tasks.filter((task) => task.status === "in_progress").length,
  reviewTasks: tasks.filter((task) => task.status === "review").length,
  completedTasks: tasks.filter((task) => task.statusCategory === "closed")
    .length,
  approvedTasks: tasks.filter(hasRecordedApproval).length,
  pendingTasks: tasks.filter(
    (task) => task.isPending && !hasRecordedApproval(task),
  ).length,
  overdueTasks: tasks.filter((task) => task.isOverdue).length,
});

const userJson = (user) => {
  const data = typeof user?.toJSON === "function" ? user.toJSON() : user;
  return {
    id: userId(data),
    name: data?.name || "",
    email: data?.email || "",
    role: data?.role || "employee",
    status: data?.status || "active",
    priorityAccess: data?.priorityAccess || "medium",
  };
};

const progressForUser = (user, tasks) => {
  const assignedTasks = tasks.filter((task) =>
    (task.assignedTo || []).some((assignee) => sameId(assignee, user)),
  );
  const completedTasks = assignedTasks.filter((task) =>
    hasCompletedDuty(task, user),
  ).length;
  const pendingTasks = assignedTasks.length - completedTasks;
  const overdueTasks = assignedTasks.filter(
    (task) => !hasCompletedDuty(task, user) && task.isOverdue,
  ).length;
  const statusCounts = new Map();

  for (const task of assignedTasks) {
    const status = task.status || "open";
    const current = statusCounts.get(status) || {
      key: status,
      label: task.statusLabel || status,
      color: task.statusColor || "",
      count: 0,
    };
    current.count += 1;
    statusCounts.set(status, current);
  }

  return {
    user: userJson(user),
    totalTasks: assignedTasks.length,
    completedTasks,
    pendingTasks,
    overdueTasks,
    completionPercent:
      assignedTasks.length === 0
        ? 0
        : Math.round((completedTasks / assignedTasks.length) * 100),
    statusCounts: [...statusCounts.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    ),
  };
};

const mergeDutyCompletionHistory = (tasks, activities) => {
  const activitiesByTask = new Map();
  for (const activity of activities) {
    const id = userId(activity.task);
    const entries = activitiesByTask.get(id) || [];
    entries.push(activity);
    activitiesByTask.set(id, entries);
  }

  return tasks.map((task) => {
    const assignedAt = new Date(task.assignedAt || 0).getTime();
    const assignedUsers = task.assignedTo || [];
    const dutyCompletedBy = [...(task.dutyCompletedBy || [])];

    for (const activity of activitiesByTask.get(taskId(task)) || []) {
      const changedAt = new Date(activity.createdAt || 0).getTime();
      if (
        Number.isFinite(assignedAt) &&
        assignedAt > 0 &&
        (!Number.isFinite(changedAt) || changedAt < assignedAt)
      ) {
        continue;
      }
      if (
        !assignedUsers.some((assignee) => sameId(assignee, activity.actor)) ||
        dutyCompletedBy.some((completedBy) =>
          sameId(completedBy, activity.actor),
        )
      ) {
        continue;
      }
      dutyCompletedBy.push(activity.actor);
    }

    return { ...task, dutyCompletedBy };
  });
};

const enrichTasksWithDutyCompletionHistory = async (tasks) => {
  if (tasks.length === 0) return tasks;
  const activities = await TaskActivity.find({
    task: { $in: tasks.map(taskId) },
    type: "status_changed",
    actor: { $ne: null },
  })
    .select("task actor createdAt")
    .lean();
  return mergeDutyCompletionHistory(tasks, activities);
};

const dashboardTaskDetail = (task, user) => {
  const dutyCompleted = hasCompletedDuty(task, user);
  return {
    id: taskId(task),
    title: task.title || "",
    status: task.status || "open",
    statusLabel: task.statusLabel || task.status || "Open",
    statusCategory: task.statusCategory || "open",
    statusColor: task.statusColor || "",
    project: task.project || null,
    assignedTo: task.assignedTo || [],
    startDate: task.startDate || null,
    dueDate: task.dueDate || null,
    assignedAt: task.assignedAt || null,
    isPending: !dutyCompleted,
    isOverdue: !dutyCompleted && task.isOverdue,
    dutyCompleted,
    carriedForwardDate: dutyCompleted ? null : task.carriedForwardDate,
  };
};

const dashboardUsers = async (requestUser, tasks) => {
  const scope = taskScopeFor(requestUser);
  if (scope === "all") {
    return User.find({})
      .select("name email role status priorityAccess")
      .sort({ name: 1, _id: 1 });
  }

  if (scope === "projects") {
    const users = new Map();
    for (const task of tasks) {
      for (const assignee of task.assignedTo || []) {
        users.set(userId(assignee), assignee);
      }
    }
    return [...users.values()].sort((left, right) =>
      String(left.name || "").localeCompare(String(right.name || "")),
    );
  }

  return [requestUser];
};

const getDashboardSummary = async (req, res) => {
  const fromDate = parseDateFilter(req.query.fromDate, "fromDate");
  const toDate = parseDateFilter(req.query.toDate, "toDate");
  const selectedUserId = String(req.query.userId || "").trim();
  if (fromDate && toDate && fromDate > toDate) {
    throw new ApiError(400, "fromDate cannot be after toDate");
  }
  if (selectedUserId) {
    if (req.user.role !== "admin") {
      throw new ApiError(403, "Only admins can inspect another user's progress");
    }
    assertObjectId(selectedUserId, "userId");
  }

  const projectQuery = getProjectQueryForUser(req.user);
  const taskQuery = await getTaskQueryForUser(req.user);
  const taskDocuments = await Task.find(taskQuery)
    .select(
      "title project assignedTo dutyCompletedBy status startDate dueDate originalDueDate assignedAt approvedAt createdAt",
    )
    .populate("project", "title status color logoUrl")
    .populate("assignedTo", "name email role status priorityAccess");
  const statusEnriched = await enrichTasksWithStatusInfo(taskDocuments);
  const scheduledTasks = statusEnriched
    .map((task) => enrichTaskWithSchedule(task))
    .filter((task) => taskOverlapsDateRange(task, fromDate, toDate));
  const tasks = await enrichTasksWithDutyCompletionHistory(scheduledTasks);
  const hasDateFilter = Boolean(fromDate || toDate);

  const totalProjects = hasDateFilter
    ? new Set(tasks.map((task) => userId(task.project)).filter(Boolean)).size
    : taskScopeFor(req.user) === "assigned"
      ? await countVisibleEmployeeProjects(req.user)
      : await Project.countDocuments(projectQuery);

  const users = await dashboardUsers(req.user, tasks);
  const userProgress = users.map((user) => progressForUser(user, tasks));
  const myTasks = tasks.filter((task) =>
    (task.assignedTo || []).some((assignee) => sameId(assignee, req.user)),
  );
  const selectedUser = selectedUserId
    ? users.find((user) => sameId(user, selectedUserId))
    : null;
  if (selectedUserId && !selectedUser) {
    throw new ApiError(404, "Dashboard user not found");
  }
  const detailUser = selectedUser || req.user;
  const detailTasks = tasks.filter((task) =>
    (task.assignedTo || []).some((assignee) => sameId(assignee, detailUser)),
  );
  const taskCounts = dashboardTaskCounts(tasks);

  res.json({
    summary: {
      totalProjects,
      ...taskCounts,
      myTasks: myTasks.length,
      userProgress,
      taskDetails:
        selectedUser || req.user.role !== "admin"
          ? detailTasks.map((task) => dashboardTaskDetail(task, detailUser))
          : [],
      dateFilter: {
        fromDate: fromDate?.toISOString() || null,
        toDate: toDate?.toISOString() || null,
      },
    },
  });
};

module.exports = {
  dashboardTaskCounts,
  getDashboardSummary,
  hasRecordedApproval,
  mergeDutyCompletionHistory,
  progressForUser,
};
