const Task = require('../models/Task');
require('../models/Project');
require('../models/User');

const { createUserNotifications } = require('./notificationService');
const { getTaskStatusKeysByCategory } = require('../utils/taskStatusCatalog');

const DEFAULT_INTERVAL_MS = 30 * 1000;
const REMINDER_LEAD_MS = 60 * 1000;
const REMINDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 25;

let timer = null;
let running = false;

const normalizeIds = (values) =>
  (Array.isArray(values) ? values : [values])
    .map((value) => value?._id || value)
    .filter(Boolean);

const reminderMessage = (task, phase) => {
  const projectTitle = task.project?.title ? ` in ${task.project.title}` : '';
  if (phase === 'upcoming') {
    return `Reminder: "${task.title}"${projectTitle} is due in 1 minute.`;
  }
  return `Reminder: "${task.title}"${projectTitle} is due now.`;
};

const buildReminderQuery = (now, canceledStatusKeys, phase) => {
  const cutoff = new Date(now.getTime() - REMINDER_LOOKBACK_MS);
  const leadWindowEnd = new Date(now.getTime() + REMINDER_LEAD_MS);

  const query = {
    reminderSentAt: null,
    status: { $nin: canceledStatusKeys },
  };

  if (phase === 'upcoming') {
    return {
      ...query,
      reminderAt: { $ne: null, $gt: now, $lte: leadWindowEnd },
      reminderLeadSentAt: null,
    };
  }

  return {
    ...query,
    reminderAt: { $ne: null, $lte: now, $gte: cutoff },
  };
};

const claimReminder = async (taskId, phase, sentAt) => {
  const sentField =
    phase === 'upcoming' ? 'reminderLeadSentAt' : 'reminderSentAt';
  const result = await Task.updateOne(
    { _id: taskId, [sentField]: null, reminderSentAt: null },
    { $set: { [sentField]: sentAt } }
  );
  return result.modifiedCount === 1;
};

const sendTaskReminder = async (task, phase) => {
  const recipients = normalizeIds(
    task.assignedTo?.length ? task.assignedTo : task.createdBy
  );
  const sentAt = new Date();

  if (!(await claimReminder(task._id, phase, sentAt))) {
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
    title: phase === 'upcoming' ? 'Task reminder soon' : 'Task reminder',
    message: reminderMessage(task, phase),
    command: 'Open the task to review the details.',
    data: {
      event:
        phase === 'upcoming' ? 'task_reminder_upcoming' : 'task_reminder_due',
      reminderPhase: phase,
      reminderAt: task.reminderAt?.toISOString(),
    },
  });

  return true;
};

const checkDueTaskReminders = async () => {
  if (running) return { checked: 0, sent: 0, skipped: true };
  running = true;

  try {
    const checkedAt = new Date();
    const canceledStatusKeys = await getTaskStatusKeysByCategory('canceled');
    let sent = 0;
    let checked = 0;

    for (const phase of ['upcoming', 'due']) {
      const query = buildReminderQuery(checkedAt, canceledStatusKeys, phase);
      const tasks = await Task.find(query)
        .sort({ reminderAt: 1, createdAt: 1 })
        .limit(BATCH_SIZE)
        .populate('project', 'title')
        .lean();

      checked += tasks.length;
      for (const task of tasks) {
        try {
          if (await sendTaskReminder(task, phase)) sent += 1;
        } catch (error) {
          console.warn(
            `Task ${phase} reminder failed for ${task._id}: ${error.message}`
          );
        }
      }
    }

    if (sent > 0) {
      console.log(`Task reminder worker sent ${sent} reminder(s).`);
    }

    return { checked, sent, skipped: false };
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
