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
  // Only a recorded assignment date should override the end date in Calendar.
  // Do not manufacture one from createdAt for older assigned tasks.
  const assignedAt = cleanDate(data?.assignedAt);
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
  },
) => {
  const start = cleanDate(rangeStart);
  const end = cleanDate(rangeEnd);
  const assignedDate = cleanDate(task?.assignedAt);
  const currentEndDate = cleanDate(task?.dueDate);
  // Older Worqi tasks stored their intended end date in startDate. Keep that
  // date as an end-date fallback only when the task has no real due date.
  const legacyEndDate = cleanDate(task?.startDate);
  const value = assignedDate || currentEndDate || legacyEndDate;

  if (!value || (start && value < start) || (end && value >= end)) return [];

  const usesAssignedDate = Boolean(assignedDate);
  return [{
    date: value,
    dateKey: dateKey(value),
    type: usesAssignedDate ? "assigned" : "end",
    label: usesAssignedDate ? "Assigned date" : "End date",
  }];
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
