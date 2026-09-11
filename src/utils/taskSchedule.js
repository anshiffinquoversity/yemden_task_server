const cleanDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfUtcDay = (value = new Date()) => {
  const date = cleanDate(value) || new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const dateKey = (value) => cleanDate(value)?.toISOString().slice(0, 10) || null;

const sameDate = (left, right) => dateKey(left) === dateKey(right);

const recordTaskDueDateChange = (
  task,
  nextDueDate,
  changedBy,
  changedAt = new Date(),
) => {
  const previousDueDate = cleanDate(task?.dueDate);
  const nextDate = cleanDate(nextDueDate);
  if (
    (!previousDueDate && !nextDate) ||
    (previousDueDate && nextDate && previousDueDate.getTime() === nextDate.getTime())
  ) {
    return false;
  }

  if (!task.originalDueDate && previousDueDate) {
    task.originalDueDate = previousDueDate;
  }
  if (previousDueDate) {
    task.dueDateHistory ||= [];
    task.dueDateHistory.push({
      dueDate: previousDueDate,
      changedAt,
      changedBy: changedBy || null,
    });
  }
  task.dueDate = nextDate;
  return true;
};

const automaticStartDateForEnd = (endDate) => {
  const date = cleanDate(endDate);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() - 30);
  return date;
};

const isFinishedTask = (task) =>
  task?.statusCategory === "closed" || task?.statusCategory === "canceled";

const scheduledDateForTask = (task) =>
  cleanDate(task?.dueDate) || cleanDate(task?.startDate) || cleanDate(task?.assignedAt);

const taskScheduleState = (task, now = new Date()) => {
  const scheduledDate = scheduledDateForTask(task);
  const today = startOfUtcDay(now);
  const isPending = !isFinishedTask(task);
  const isOverdue = Boolean(
    isPending && scheduledDate && startOfUtcDay(scheduledDate) < today,
  );

  return {
    isPending,
    isOverdue,
    pendingSince: isOverdue ? scheduledDate : null,
    carriedForwardDate: isOverdue ? today : null,
  };
};

const enrichTaskWithSchedule = (task, now = new Date()) => {
  const data = typeof task?.toJSON === "function" ? task.toJSON() : task;
  const originalDueDate = cleanDate(data?.originalDueDate) || cleanDate(data?.dueDate);
  const assignedAt =
    cleanDate(data?.assignedAt) ||
    ((data?.assignedTo || []).length > 0 ? cleanDate(data?.createdAt) : null);
  const scheduleData = { ...data, assignedAt };
  return {
    ...scheduleData,
    originalDueDate,
    ...taskScheduleState(scheduleData, now),
  };
};

const calendarEntriesForTask = (
  task,
  {
    rangeStart,
    rangeEnd,
    now = new Date(),
    includeAssignedDate = false,
  },
) => {
  const start = cleanDate(rangeStart);
  const end = cleanDate(rangeEnd);
  const entries = [];
  const originalDueDate = cleanDate(task?.originalDueDate);
  const currentDueDate = cleanDate(task?.dueDate);
  const today = startOfUtcDay(now);
  const missedOriginalDueDate = Boolean(
    originalDueDate &&
      !isFinishedTask(task) &&
      startOfUtcDay(originalDueDate) < today,
  );

  const add = (date, type, label) => {
    const value = cleanDate(date);
    if (!value) return;
    if (start && value < start) return;
    if (end && value >= end) return;
    const key = dateKey(value);
    if (entries.some((entry) => entry.dateKey === key && entry.type === type)) {
      return;
    }
    entries.push({ date: value, dateKey: key, type, label });
  };

  add(task?.startDate, "start", "Start date");
  if (includeAssignedDate) {
    add(task?.assignedAt || task?.createdAt, "assigned", "Assigned date");
  }

  if (
    originalDueDate &&
    currentDueDate &&
    !sameDate(originalDueDate, currentDueDate) &&
    missedOriginalDueDate
  ) {
    add(originalDueDate, "original_end", "Original end date");
    add(currentDueDate, "updated_end", "Updated end date");
  } else {
    add(currentDueDate || originalDueDate, "end", "End date");
  }

  const schedule = taskScheduleState(task, now);
  if (schedule.carriedForwardDate) {
    add(schedule.carriedForwardDate, "carry_forward", "Pending carry-forward");
  }

  return entries.sort((left, right) => {
    const dateComparison = left.date.getTime() - right.date.getTime();
    return dateComparison || left.type.localeCompare(right.type);
  });
};

const taskOverlapsDateRange = (task, fromDate, toDate) => {
  const from = cleanDate(fromDate);
  const to = cleanDate(toDate);
  if (!from && !to) return true;

  const taskStart =
    cleanDate(task?.startDate) || cleanDate(task?.assignedAt) || cleanDate(task?.createdAt);
  const taskEnd = cleanDate(task?.dueDate) || taskStart;
  if (!taskStart && !taskEnd) return false;
  if (from && taskEnd && startOfUtcDay(taskEnd) < startOfUtcDay(from)) return false;
  if (to && taskStart && startOfUtcDay(taskStart) > startOfUtcDay(to)) return false;
  return true;
};

module.exports = {
  automaticStartDateForEnd,
  calendarEntriesForTask,
  cleanDate,
  dateKey,
  enrichTaskWithSchedule,
  isFinishedTask,
  recordTaskDueDateChange,
  sameDate,
  scheduledDateForTask,
  startOfUtcDay,
  taskOverlapsDateRange,
  taskScheduleState,
};
