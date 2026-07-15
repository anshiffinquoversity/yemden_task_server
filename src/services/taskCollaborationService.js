const Notification = require("../models/Notification");
const TaskActivity = require("../models/TaskActivity");
const TaskComment = require("../models/TaskComment");
const TaskDocument = require("../models/TaskDocument");
const User = require("../models/User");
const { createUserNotifications, taskLink } = require("./notificationService");
const { sameId } = require("../utils/http");

const userLabel = (user) => user?.name || user?.email || "System";

const readableValue = (value) =>
  String(value || "none")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const trimSnippet = (value, max = 180) => {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
};

const normalizeMentionKey = (value) =>
  String(value || "")
    .trim()
    .replace(/[.,;:!?)]*$/g, "")
    .toLowerCase();

const mentionKeysFromBody = (body) => {
  const text = String(body || "");
  const keys = new Set();
  const pattern = /@([A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)/g;
  let match = pattern.exec(text);

  while (match) {
    const key = normalizeMentionKey(match[1]);
    if (key) keys.add(key);
    match = pattern.exec(text);
  }

  return [...keys];
};

const userMentionKeys = (user) => {
  const name = String(user.name || "")
    .toLowerCase()
    .trim();
  const compactName = name.replace(/\s+/g, "");
  const firstName = name.split(/\s+/)[0] || "";

  return new Set(
    [user.email, name, compactName, firstName]
      .filter(Boolean)
      .map((value) => normalizeMentionKey(value)),
  );
};

const mentionableUsersForTask = async (task) => {
  const ids = [
    ...(Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo]),
  ]
    .filter(Boolean)
    .map((value) => (value._id || value).toString());

  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) return [];

  return User.find({ _id: { $in: uniqueIds }, status: "active" }).select(
    "name email role status",
  );
};

const resolveMentionedUsers = async (body, task, actor, mentionIds = []) => {
  const requestedIds = new Set(
    (Array.isArray(mentionIds) ? mentionIds : [])
      .filter(Boolean)
      .map((id) => id.toString()),
  );
  const mentionKeys = mentionKeysFromBody(body);

  if (mentionKeys.length === 0 && requestedIds.size === 0) return [];

  const mentionableUsers = await mentionableUsersForTask(task);

  if (requestedIds.size > 0) {
    return mentionableUsers.filter(
      (user) =>
        !(actor && sameId(user._id, actor._id)) &&
        requestedIds.has(user._id.toString()),
    );
  }

  const matchedUsers = [];

  for (const user of mentionableUsers) {
    if (actor && sameId(user._id, actor._id)) continue;

    const keys = userMentionKeys(user);
    if (mentionKeys.some((key) => keys.has(key))) {
      matchedUsers.push(user);
    }
  }

  return matchedUsers;
};

const createTaskActivity = async ({
  task,
  actor,
  type,
  message,
  from = "",
  to = "",
  metadata = {},
}) =>
  TaskActivity.create({
    task: task._id || task,
    actor: actor?._id || actor || null,
    type,
    message,
    from: String(from || ""),
    to: String(to || ""),
    metadata,
  });

const createMentionNotifications = async ({
  task,
  actor,
  commentBody,
  mentionedUsers,
}) => {
  const command = trimSnippet(commentBody);
  if (!command || mentionedUsers.length === 0) return [];

  const actorName = userLabel(actor);
  const taskTitle = task.title || "Untitled task";
  const projectId = task.project?._id || task.project || null;

  return createUserNotifications({
    recipients: mentionedUsers,
    actor,
    task,
    project: projectId,
    type: "mention",
    title: `${actorName} mentioned you in chat`,
    message: `On "${taskTitle}": ${command}`,
    command,
    link: taskLink(task._id || task, { tab: "comments" }),
    data: {
      event: "task_chat_mention",
      tab: "comments",
      taskTitle,
      actorName,
      commentPreview: command,
    },
  });
};

const labelForUserId = async (id) => {
  if (!id) return "Unassigned";
  const user = await User.findById(id).select("name email").lean();
  return user?.name || user?.email || "Unassigned";
};

const labelForUserIds = async (ids) => {
  const cleanIds = [
    ...new Set(
      (Array.isArray(ids) ? ids : [ids])
        .filter(Boolean)
        .map((id) => id.toString()),
    ),
  ];
  if (cleanIds.length === 0) return "Unassigned";

  const users = await User.find({ _id: { $in: cleanIds } })
    .select("name email")
    .lean();
  const labelsById = new Map(
    users.map((user) => [user._id.toString(), user.name || user.email]),
  );
  const labels = cleanIds.map((id) => labelsById.get(id)).filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : "Unassigned";
};

const deleteTaskCollaboration = async (taskIds) => {
  const ids = Array.isArray(taskIds) ? taskIds : [taskIds];
  const cleanIds = ids.filter(Boolean);
  if (cleanIds.length === 0) return;

  await Promise.all([
    TaskComment.deleteMany({ task: { $in: cleanIds } }),
    TaskDocument.deleteMany({ task: { $in: cleanIds } }),
    TaskActivity.deleteMany({ task: { $in: cleanIds } }),
    Notification.deleteMany({ task: { $in: cleanIds } }),
  ]);
};

module.exports = {
  userLabel,
  readableValue,
  mentionableUsersForTask,
  resolveMentionedUsers,
  createTaskActivity,
  createMentionNotifications,
  labelForUserId,
  labelForUserIds,
  deleteTaskCollaboration,
};
