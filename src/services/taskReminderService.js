const Task = require('../models/Task');
require('../models/Project');
require('../models/User');

const { createUserNotifications } = require('./notificationService');
const { getTaskStatusKeysByCategory } = require('../utils/taskStatusCatalog');

const DEFAULT_INTERVAL_MS = 30 * 1000;
const REMINDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 25;

let timer = null;
let running = false;

const normalizeIds = (values) =>
  (Array.isArray(values) ? values : [values])
    .map((value) => value?._id || value)
    .filter(Boolean);

const reminderMessage = (task) => {
  const projectTitle = task.project?.title ? ` in ${task.project.title}` : '';
  return `Reminder: "${task.title}"${projectTitle} is due for your attention.`;
};

const buildReminderQuery = async (now) => {
  const cutoff = new Date(now.getTime() - REMINDER_LOOKBACK_MS);
  const canceledStatusKeys = await getTaskStatusKeysByCategory('canceled');

  return {
    reminderAt: { $ne: null, $lte: now, $gte: cutoff },
    reminderSentAt: null,
    status: { $nin: canceledStatusKeys },
  };
};

const claimReminder = async (taskId, sentAt) => {
  const result = await Task.updateOne(
    { _id: taskId, reminderSentAt: null },
    { $set: { reminderSentAt: sentAt } }
  );
  return result.modifiedCount === 1;
};

const sendTaskReminder = async (task) => {
  const recipients = normalizeIds(
    task.assignedTo?.length ? task.assignedTo : task.createdBy
  );
  const sentAt = new Date();

  if (!(await claimReminder(task._id, sentAt))) {
    return false;
  }

  if (recipients.length === 0) {
    return false;
  }

  await createUserNotifications({
    recipients,
    actor: null,
    task,
    project: task.project?._id || task.project || null,
    type: 'task_reminder',
    title: 'Task reminder',
    message: reminderMessage(task),
    command: 'Open the task to review the details.',
    data: {
      event: 'task_reminder',
      reminderAt: task.reminderAt?.toISOString(),
    },
  });

  return true;
};

const checkDueTaskReminders = async () => {
  if (running) return { checked: 0, sent: 0, skipped: true };
  running = true;

  try {
    const now = new Date();
    const query = await buildReminderQuery(now);
    const tasks = await Task.find(query)
      .sort({ reminderAt: 1, createdAt: 1 })
      .limit(BATCH_SIZE)
      .populate('project', 'title')
      .lean();

    let sent = 0;
    for (const task of tasks) {
      try {
        if (await sendTaskReminder(task)) sent += 1;
      } catch (error) {
        console.warn(`Task reminder failed for ${task._id}: ${error.message}`);
      }
    }

    if (sent > 0) {
      console.log(`Task reminder worker sent ${sent} reminder(s).`);
    }

    return { checked: tasks.length, sent, skipped: false };
  } finally {
    running = false;
  }
};

const startTaskReminderWorker = ({ intervalMs = DEFAULT_INTERVAL_MS } = {}) => {
  if (timer) return timer;

  setTimeout(() => {
    checkDueTaskReminders().catch((error) => {
      console.warn(`Task reminder worker failed: ${error.message}`);
    });
  }, 3000);

  timer = setInterval(() => {
    checkDueTaskReminders().catch((error) => {
      console.warn(`Task reminder worker failed: ${error.message}`);
    });
  }, intervalMs);

  if (typeof timer.unref === 'function') timer.unref();
  return timer;
};

const stopTaskReminderWorker = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

module.exports = {
  checkDueTaskReminders,
  startTaskReminderWorker,
  stopTaskReminderWorker,
};
