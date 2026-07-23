const Project = require("../models/Project");
const Task = require("../models/Task");
const User = require("../models/User");
const {
  ApiError,
  assertObjectId,
  parseOptionalDate,
  sameId,
  sendCreated,
} = require("../utils/http");
const {
  parsePageSize,
  decodeCursor,
  descendingCursorFilter,
  pageFromResults,
} = require("../utils/pagination");
const {
  isAdmin,
  isManager,
  isEmployee,
  isHighAccessEmployee,
  getTaskQueryForUser,
  canManageProjectWork,
  canManageTaskWork,
  canEditTask,
  canUpdateTaskStatus,
  combineQuery,
} = require("../utils/accessControl");
const {
  validStatusCategories,
  resolveTaskStatusKey,
  getTaskStatusKeysByCategory,
  canEmployeeChangeTaskStatus,
  enrichTaskWithStatusInfo,
  enrichTasksWithStatusInfo,
} = require("../utils/taskStatusCatalog");
const {
  createTaskActivity,
  deleteTaskCollaboration,
  labelForUserIds,
  readableValue,
  userLabel,
} = require("../services/taskCollaborationService");
const { createUserNotifications } = require("../services/notificationService");
const { ensureTaskHasPublishedAsset } = require("../services/taskPublicationService");

const validPriorities = ["low", "medium", "high"];
const excludedOverdueStatusKeys = new Set([
  "canceled",
  "cancelled",
  "deleted",
]);

const ensureFutureReminder = (date) => {
  if (!date) return;
  if (date.getTime() <= Date.now()) {
    throw new ApiError(400, "Reminder time must be in the future");
  }
};

const parseReminderDate = (value) => {
  const date = parseOptionalDate(value);
  ensureFutureReminder(date);
  return date;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const isTruthyQueryValue = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const populateTask = (query) =>
  query
    .select('-reminderLeadSentAt -reminderSentAt')
    .populate("project", "title status color logoUrl owner members")
    .populate("assignedTo", "name email role status")
    .populate("createdBy", "name email role");

const populateTaskList = (query) =>
  query
    .select('-reminderLeadSentAt -reminderSentAt')
    .populate("project", "title status color logoUrl")
    .populate("assignedTo", "name email role status")
    .populate("createdBy", "name email role");

const ensureUserCanSetTaskStatus = async (user, statusKey, previousStatus) => {
  if (previousStatus === statusKey) return;

  if (
    isEmployee(user) &&
    !canEmployeeChangeTaskStatus(previousStatus, statusKey)
  ) {
    throw new ApiError(
      403,
      "Employees cannot change the status of a published or delivered task",
    );
  }

  const canceledStatusKeys = await getTaskStatusKeysByCategory("canceled");
  if (canceledStatusKeys.includes(statusKey) && !isAdmin(user)) {
    throw new ApiError(
      403,
      "Only admins can cancel tasks. Managers and employees can request cancellation from an admin.",
    );
  }
};

const ensureProjectCanManageTasks = async (user, projectId) => {
  assertObjectId(projectId, "project id");

  const project = await Project.findById(projectId);

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  if (!canManageTaskWork(user, project)) {
    throw new ApiError(403, "You cannot manage tasks in this project");
  }

  return project;
};

const projectMemberIdSet = (project) => {
  const ids = new Set();
  if (project?.owner) ids.add((project.owner._id || project.owner).toString());
  for (const member of project?.members || []) {
    ids.add((member._id || member).toString());
  }
  return ids;
};

const normalizeAssignedUserIds = (value) => {
  if (value === undefined || value === null || value === "") return [];
  const values = Array.isArray(value) ? value : [value];
  return [
    ...new Set(
      values.filter(Boolean).map((item) => (item._id || item).toString()),
    ),
  ];
};

const assignedUserIdList = (value) => normalizeAssignedUserIds(value);

const sameAssignedUsers = (left, right) => {
  const leftIds = assignedUserIdList(left).sort();
  const rightIds = assignedUserIdList(right).sort();
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  );
};

const excludeActorIds = (userIds, actor) =>
  normalizeAssignedUserIds(userIds).filter((userId) => !sameId(userId, actor?._id || actor));

const sameDateTime = (left, right) => {
  const leftTime = left ? new Date(left).getTime() : null;
  const rightTime = right ? new Date(right).getTime() : null;
  return leftTime === rightTime;
};

const createTaskNotificationsSafely = async (config) => {
  try {
    return await createUserNotifications(config);
  } catch (error) {
    console.warn(`Task notification failed: ${error.message}`);
    return [];
  }
};

const notifyTaskAssigned = ({
  task,
  project,
  actor,
  assignedUserIds,
}) => {
  const recipients = excludeActorIds(assignedUserIds, actor);
  if (recipients.length === 0) return Promise.resolve([]);

  const actorName = userLabel(actor);
  const projectTitle = project?.title ? ` in ${project.title}` : "";

  return createTaskNotificationsSafely({
    recipients,
    actor,
    task,
    project: project?._id || project || task.project,
    type: "task_assigned",
    title: "Task assigned to you",
    message: `${actorName} assigned "${task.title}" to you${projectTitle}.`,
    command: "Open the task to review the details.",
    data: { event: "task_assigned" },
  });
};

const notifyTaskStatusChanged = ({
  task,
  project,
  actor,
  previousStatus,
  nextStatus,
}) => {
  const recipients = excludeActorIds(task.assignedTo, actor);
  if (recipients.length === 0) return Promise.resolve([]);

  const actorName = userLabel(actor);
  const fromLabel = readableValue(previousStatus);
  const toLabel = readableValue(nextStatus);

  return createTaskNotificationsSafely({
    recipients,
    actor,
    task,
    project: project?._id || project || task.project,
    type: "task_status_changed",
    title: "Task status updated",
    message: `${actorName} changed "${task.title}" from ${fromLabel} to ${toLabel}.`,
    command: `Status changed from ${fromLabel} to ${toLabel}.`,
    data: {
      event: "task_status_changed",
      previousStatus,
      nextStatus,
    },
  });
};

const ensureAssignableUsers = async (value, project, actor) => {
  const userIds = normalizeAssignedUserIds(value);
  if (userIds.length === 0) return [];

  for (const userId of userIds) {
    assertObjectId(userId, "assigned user id");
  }

  const users = await User.find({ _id: { $in: userIds } });

  if (users.length !== userIds.length) {
    throw new ApiError(404, "Assigned user not found");
  }

  if (users.some((user) => user.status !== "active")) {
    throw new ApiError(400, "Cannot assign a task to an inactive user");
  }

  if (isHighAccessEmployee(actor)) {
    const projectMemberIds = projectMemberIdSet(project);
    const outsideProject = userIds.some(
      (userId) => !projectMemberIds.has(userId),
    );

    if (outsideProject) {
      throw new ApiError(
        403,
        "Project leads can only assign tasks to project members",
      );
    }
  }

  const usersById = new Map(
    users.map((user) => [user._id.toString(), user._id]),
  );
  return userIds.map((userId) => usersById.get(userId));
};

const parseDateFilter = (value, label, endOfDay = false) => {
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const date = new Date(`${value}${suffix}`);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `Invalid ${label} filter. Use YYYY-MM-DD.`);
  }

  return date;
};

const buildFilters = async (query) => {
  const filters = {};

  if (query.project) {
    assertObjectId(query.project, "project id");
    filters.project = query.project;
  }

  if (query.statuses) {
    const requestedStatuses = [
      ...new Set(
        String(query.statuses)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (requestedStatuses.length < 1 || requestedStatuses.length > 10) {
      throw new ApiError(400, "statuses must contain from 1 to 10 values");
    }
    filters.status = {
      $in: await Promise.all(
        requestedStatuses.map((status) => resolveTaskStatusKey(status)),
      ),
    };
  } else if (query.status) {
    filters.status = await resolveTaskStatusKey(query.status);
  } else if (query.statusCategory) {
    if (!validStatusCategories.includes(query.statusCategory)) {
      throw new ApiError(
        400,
        `Status category must be one of: ${validStatusCategories.join(", ")}`,
      );
    }
    filters.status = {
      $in: await getTaskStatusKeysByCategory(query.statusCategory),
    };
  }

  if (query.assignedTo) {
    assertObjectId(query.assignedTo, "assigned user id");
    filters.assignedTo = query.assignedTo;
  }

  if (query.priority) {
    if (!validPriorities.includes(query.priority)) {
      throw new ApiError(
        400,
        `Priority must be one of: ${validPriorities.join(", ")}`,
      );
    }
    filters.priority = query.priority;
  }

  if (isTruthyQueryValue(query.overdue)) {
    if (!filters.status) {
      const openStatusKeys = await getTaskStatusKeysByCategory("open");
      filters.status = {
        $in: openStatusKeys.filter(
          (statusKey) => !excludedOverdueStatusKeys.has(statusKey),
        ),
      };
    }
    filters.dueDate = { $lt: startOfToday() };
  } else if (query.startDate) {
    const start = parseDateFilter(query.startDate, "startDate");
    const end = parseDateFilter(query.startDate, "startDate", true);
    filters.startDate = { $gte: start, $lte: end };
  } else if (query.dueDate) {
    const start = parseDateFilter(query.dueDate, "dueDate");
    const end = parseDateFilter(query.dueDate, "dueDate", true);
    filters.dueDate = { $gte: start, $lte: end };
  } else {
    const startDate = {};

    if (query.fromDate) {
      startDate.$gte = parseDateFilter(query.fromDate, "fromDate");
    }

    if (query.toDate) {
      startDate.$lte = parseDateFilter(query.toDate, "toDate", true);
    }

    if (Object.keys(startDate).length > 0) {
      filters.startDate = startDate;
    }
  }

  return filters;
};

const createTask = async (req, res) => {
  const { title, description, project, status, priority } = req.body;

  if (!title || !String(title).trim()) {
    throw new ApiError(400, "Task title is required");
  }

  const managedProject = await ensureProjectCanManageTasks(req.user, project);

  const assignedTo = await ensureAssignableUsers(
    req.body.assignedTo,
    managedProject,
    req.user,
  );
  const statusKey = await resolveTaskStatusKey(status || "open");
  await ensureUserCanSetTaskStatus(req.user, statusKey);
  if (statusKey === "published") {
    throw new ApiError(
      400,
      "Create the task first, add attachments, and publish at least one attachment before publishing the task",
    );
  }

  const task = await Task.create({
    title: String(title).trim(),
    description: description ? String(description).trim() : "",
    project,
    assignedTo,
    status: statusKey,
    priority: priority || "medium",
    startDate: parseOptionalDate(req.body.startDate),
    dueDate: parseOptionalDate(req.body.dueDate),
    reminderAt: parseReminderDate(req.body.reminderAt),
    reminderLeadSentAt: null,
    reminderSentAt: null,
    createdBy: req.user._id,
  });

  await createTaskActivity({
    task,
    actor: req.user,
    type: "task_created",
    message: `${userLabel(req.user)} created this task`,
  });

  if (assignedTo.length > 0) {
    const assigneeLabel = await labelForUserIds(assignedTo);
    await Promise.all([
      createTaskActivity({
        task,
        actor: req.user,
        type: "assignee_changed",
        message: `${userLabel(req.user)} assigned this task to ${assigneeLabel}`,
        from: "Unassigned",
        to: assigneeLabel,
      }),
      notifyTaskAssigned({
        task,
        project: managedProject,
        actor: req.user,
        assignedUserIds: assignedTo,
      }),
    ]);
  }

  const createdTask = await populateTask(Task.findById(task._id));
  sendCreated(res, "task", await enrichTaskWithStatusInfo(createdTask));
};

const listTasks = async (req, res) => {
  const visibilityQuery = await getTaskQueryForUser(req.user);
  const filters = await buildFilters(req.query);
  const limit = parsePageSize(req.query.limit);
  const cursor = decodeCursor(req.query.cursor);
  const query = combineQuery(
    combineQuery(visibilityQuery, filters),
    descendingCursorFilter(cursor),
  );
  const results = await populateTaskList(Task.find(query))
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1);
  const page = pageFromResults(results, limit);

  res.json({
    tasks: await enrichTasksWithStatusInfo(page.items),
    pageInfo: page.pageInfo,
  });
};

const getTaskById = async (req, res) => {
  assertObjectId(req.params.id, "task id");

  const visibilityQuery = await getTaskQueryForUser(req.user);
  const task = await populateTask(
    Task.findOne(combineQuery(visibilityQuery, { _id: req.params.id })),
  );

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  res.json({ task: await enrichTaskWithStatusInfo(task) });
};

const listTasksByProject = async (req, res) => {
  assertObjectId(req.params.projectId, "project id");

  const visibilityQuery = await getTaskQueryForUser(req.user);
  const limit = parsePageSize(req.query.limit);
  const cursor = decodeCursor(req.query.cursor);
  const query = combineQuery(
    combineQuery(visibilityQuery, { project: req.params.projectId }),
    descendingCursorFilter(cursor),
  );
  const results = await populateTaskList(Task.find(query))
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1);
  const page = pageFromResults(results, limit);

  res.json({
    tasks: await enrichTasksWithStatusInfo(page.items),
    pageInfo: page.pageInfo,
  });
};

const listMyTasks = async (req, res) => {
  const limit = parsePageSize(req.query.limit);
  const cursor = decodeCursor(req.query.cursor);
  const query = combineQuery(
    { assignedTo: req.user._id },
    descendingCursorFilter(cursor),
  );
  const results = await populateTaskList(Task.find(query))
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1);
  const page = pageFromResults(results, limit);

  res.json({
    tasks: await enrichTasksWithStatusInfo(page.items),
    pageInfo: page.pageInfo,
  });
};

const updateTask = async (req, res) => {
  assertObjectId(req.params.id, "task id");

  const task = await Task.findById(req.params.id).populate("project");

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  if (!canEditTask(req.user, task)) {
    throw new ApiError(403, "You cannot edit this task");
  }

  const previousAssignedTo = assignedUserIdList(task.assignedTo);
  const previousStatus = task.status;
  const previousReminderAt = task.reminderAt;
  let taskProject = task.project;

  if (
    req.body.project !== undefined &&
    !sameId(req.body.project, task.project._id)
  ) {
    const newProject = await ensureProjectCanManageTasks(
      req.user,
      req.body.project,
    );
    task.project = newProject._id;
    taskProject = newProject;
  }

  if (req.body.title !== undefined) {
    if (!String(req.body.title).trim()) {
      throw new ApiError(400, "Task title cannot be empty");
    }
    task.title = String(req.body.title).trim();
  }

  if (req.body.description !== undefined) {
    task.description = String(req.body.description || "").trim();
  }

  if (req.body.assignedTo !== undefined) {
    task.assignedTo = await ensureAssignableUsers(
      req.body.assignedTo,
      taskProject,
      req.user,
    );
  }

  if (req.body.status !== undefined) {
    const statusKey = await resolveTaskStatusKey(req.body.status);
    await ensureUserCanSetTaskStatus(req.user, statusKey, previousStatus);
    if (statusKey === "published" && previousStatus !== statusKey) {
      await ensureTaskHasPublishedAsset(task._id);
    }
    task.status = statusKey;
  }

  if (req.body.priority !== undefined) {
    if (!validPriorities.includes(req.body.priority)) {
      throw new ApiError(
        400,
        `Priority must be one of: ${validPriorities.join(", ")}`,
      );
    }
    task.priority = req.body.priority;
  }

  if (req.body.startDate !== undefined)
    task.startDate = parseOptionalDate(req.body.startDate);
  if (req.body.dueDate !== undefined)
    task.dueDate = parseOptionalDate(req.body.dueDate);
  if (req.body.reminderAt !== undefined) {
    const nextReminderAt = parseOptionalDate(req.body.reminderAt);
    if (!sameDateTime(previousReminderAt, nextReminderAt)) {
      ensureFutureReminder(nextReminderAt);
      task.reminderAt = nextReminderAt;
      task.reminderLeadSentAt = null;
      task.reminderSentAt = null;
    }
  }

  await task.save();

  const activityJobs = [];
  const notificationJobs = [];
  const nextAssignedTo = assignedUserIdList(task.assignedTo);

  if (!sameAssignedUsers(previousAssignedTo, nextAssignedTo)) {
    const [fromLabel, toLabel] = await Promise.all([
      labelForUserIds(previousAssignedTo),
      labelForUserIds(nextAssignedTo),
    ]);

    activityJobs.push(
      createTaskActivity({
        task,
        actor: req.user,
        type: "assignee_changed",
        message: `${userLabel(req.user)} changed assignee from ${fromLabel} to ${toLabel}`,
        from: fromLabel,
        to: toLabel,
      }),
    );

    const newlyAssigned = nextAssignedTo.filter(
      (userId) => !previousAssignedTo.includes(userId),
    );
    notificationJobs.push(
      notifyTaskAssigned({
        task,
        project: taskProject,
        actor: req.user,
        assignedUserIds: newlyAssigned,
      }),
    );
  }

  if (previousStatus !== task.status) {
    activityJobs.push(
      createTaskActivity({
        task,
        actor: req.user,
        type: "status_changed",
        message: `${userLabel(req.user)} changed status from ${readableValue(previousStatus)} to ${readableValue(task.status)}`,
        from: previousStatus,
        to: task.status,
      }),
    );
    notificationJobs.push(
      notifyTaskStatusChanged({
        task,
        project: taskProject,
        actor: req.user,
        previousStatus,
        nextStatus: task.status,
      }),
    );
  }

  if (activityJobs.length > 0 || notificationJobs.length > 0) {
    await Promise.all([...activityJobs, ...notificationJobs]);
  }

  const updatedTask = await populateTask(Task.findById(task._id));
  res.json({ task: await enrichTaskWithStatusInfo(updatedTask) });
};

const updateTaskStatus = async (req, res) => {
  assertObjectId(req.params.id, "task id");

  const { status } = req.body;
  const statusKey = await resolveTaskStatusKey(status);

  const task = await Task.findById(req.params.id).populate("project");

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  if (!canUpdateTaskStatus(req.user, task)) {
    throw new ApiError(403, "You cannot update this task status");
  }

  await ensureUserCanSetTaskStatus(req.user, statusKey, task.status);
  if (statusKey === "published" && task.status !== statusKey) {
    await ensureTaskHasPublishedAsset(task._id);
  }

  const previousStatus = task.status;
  task.status = statusKey;
  await task.save();

  if (previousStatus !== task.status) {
    await Promise.all([
      createTaskActivity({
        task,
        actor: req.user,
        type: "status_changed",
        message: `${userLabel(req.user)} changed status from ${readableValue(previousStatus)} to ${readableValue(task.status)}`,
        from: previousStatus,
        to: task.status,
      }),
      notifyTaskStatusChanged({
        task,
        project: task.project,
        actor: req.user,
        previousStatus,
        nextStatus: task.status,
      }),
    ]);
  }

  const updatedTask = await populateTask(Task.findById(task._id));
  res.json({ task: await enrichTaskWithStatusInfo(updatedTask) });
};

const requestTaskCancellation = async (req, res) => {
  assertObjectId(req.params.id, "task id");

  const task = await Task.findById(req.params.id).populate("project");

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  if (!isManager(req.user) && !isEmployee(req.user)) {
    throw new ApiError(
      403,
      "Only managers and employees can request task cancellation",
    );
  }

  if (!canUpdateTaskStatus(req.user, task)) {
    throw new ApiError(
      403,
      "You cannot request cancellation for this task",
    );
  }

  const canceledStatusKeys = await getTaskStatusKeysByCategory("canceled");
  if (canceledStatusKeys.includes(task.status)) {
    throw new ApiError(400, "Task is already canceled");
  }

  const admins = await User.find({ role: "admin", status: "active" }).select(
    "_id",
  );

  if (admins.length === 0) {
    throw new ApiError(
      400,
      "No active admin users found to receive the cancellation request",
    );
  }

  const projectTitle = task.project?.title ? ` in ${task.project.title}` : "";
  const actorName = userLabel(req.user);

  await Promise.all([
    createUserNotifications({
      recipients: admins,
      actor: req.user,
      task,
      project: task.project?._id || task.project || null,
      type: "cancellation_request",
      title: "Task cancellation requested",
      message: `${actorName} requested cancellation for "${task.title}"${projectTitle}.`,
      command: "Review this task and set its status to Canceled if approved.",
      data: { event: "cancellation_request" },
    }),
    createTaskActivity({
      task,
      actor: req.user,
      type: "cancellation_requested",
      message: `${actorName} requested cancellation from an admin`,
      to: "Admin approval",
    }),
  ]);

  res.json({
    message: "Cancellation request sent to admin",
    notifiedAdmins: admins.length,
  });
};

const deleteTask = async (req, res) => {
  assertObjectId(req.params.id, "task id");

  const task = await Task.findById(req.params.id).populate("project");

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  if (!canManageProjectWork(req.user, task.project)) {
    throw new ApiError(403, "You cannot delete this task");
  }

  await Promise.all([deleteTaskCollaboration(task._id), task.deleteOne()]);
  res.json({ message: "Task deleted" });
};

const listCalendarTasks = async (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiError(400, "month must be a number from 1 to 12");
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new ApiError(400, "year must be a valid four-digit year");
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const visibilityQuery = await getTaskQueryForUser(req.user);
  const filters = {
    startDate: { $gte: start, $lt: end },
  };

  if (req.query.status) {
    filters.status = await resolveTaskStatusKey(req.query.status);
  }

  if (req.query.project) {
    assertObjectId(req.query.project, "project id");
    filters.project = req.query.project;
  }

  const tasks = await populateTask(
    Task.find(combineQuery(visibilityQuery, filters)),
  ).sort({ startDate: 1 });

  const enrichedTasks = await enrichTasksWithStatusInfo(tasks);

  res.json({
    month,
    year,
    project: req.query.project || null,
    status: req.query.status || null,
    tasks: enrichedTasks.map((task) => {
      const startDate = task.startDate ? new Date(task.startDate) : null;
      return {
        ...task,
        dateKey:
          startDate && !Number.isNaN(startDate.getTime())
            ? startDate.toISOString().slice(0, 10)
            : null,
      };
    }),
  });
};

module.exports = {
  createTask,
  listTasks,
  getTaskById,
  listTasksByProject,
  listMyTasks,
  updateTask,
  updateTaskStatus,
  requestTaskCancellation,
  deleteTask,
  listCalendarTasks,
};
