const { sameId } = require("./http");

const idList = (value) => {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.filter(Boolean).map((item) => item?._id || item);
};

const hasCompletedDuty = (task, user) =>
  idList(task?.dutyCompletedBy).some((completedBy) =>
    sameId(completedBy, user),
  );

const syncTaskDutyCompletion = (task, actor, statusChanged = false) => {
  const assignees = idList(task?.assignedTo);
  const retainedCompletions = idList(task?.dutyCompletedBy).filter(
    (completedBy) =>
      assignees.some((assignee) => sameId(assignee, completedBy)),
  );

  if (
    statusChanged &&
    assignees.some((assignee) => sameId(assignee, actor)) &&
    !retainedCompletions.some((completedBy) => sameId(completedBy, actor))
  ) {
    retainedCompletions.push(actor?._id || actor);
  }

  task.dutyCompletedBy = retainedCompletions;
  return task;
};

module.exports = { hasCompletedDuty, syncTaskDutyCompletion };
