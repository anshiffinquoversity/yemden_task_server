const test = require("node:test");
const assert = require("node:assert/strict");

const Task = require("../src/models/Task");
const {
  automaticStartDateForEnd,
  calendarEntriesForTask,
  enrichTaskWithSchedule,
  recordTaskDueDateChange,
  taskOverlapsDateRange,
} = require("../src/utils/taskSchedule");

test("task schema stores assignment dates and original end-date history", () => {
  assert.ok(Task.schema.path("assignedAt"));
  assert.ok(Task.schema.path("originalDueDate"));
  assert.ok(Task.schema.path("dueDateHistory"));
});

test("social media end dates calculate an editable start date 30 days earlier", () => {
  assert.equal(
    automaticStartDateForEnd("2026-10-15T00:00:00.000Z").toISOString(),
    "2026-09-15T00:00:00.000Z",
  );
});

test("changing an end date preserves the original and records the change", () => {
  const original = new Date("2026-09-08T00:00:00.000Z");
  const updated = new Date("2026-09-12T00:00:00.000Z");
  const changedAt = new Date("2026-09-09T09:30:00.000Z");
  const task = { dueDate: original, dueDateHistory: [] };

  assert.equal(
    recordTaskDueDateChange(task, updated, "manager-1", changedAt),
    true,
  );
  assert.equal(task.originalDueDate.getTime(), original.getTime());
  assert.equal(task.dueDate.getTime(), updated.getTime());
  assert.deepEqual(task.dueDateHistory, [
    { dueDate: original, changedAt, changedBy: "manager-1" },
  ]);
});

test("unfinished rescheduled tasks keep original and updated end dates and carry forward", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const task = enrichTaskWithSchedule(
    {
      id: "task-1",
      status: "open",
      statusCategory: "open",
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      assignedAt: new Date("2026-08-01T09:00:00.000Z"),
      originalDueDate: new Date("2026-09-08T00:00:00.000Z"),
      dueDate: new Date("2026-09-09T00:00:00.000Z"),
      assignedTo: ["employee-1"],
    },
    now,
  );
  const entries = calendarEntriesForTask(task, {
    rangeStart: new Date("2026-09-01T00:00:00.000Z"),
    rangeEnd: new Date("2026-10-01T00:00:00.000Z"),
    includeAssignedDate: true,
    now,
  });

  assert.equal(task.isPending, true);
  assert.equal(task.isOverdue, true);
  assert.equal(task.carriedForwardDate.toISOString(), "2026-09-10T00:00:00.000Z");
  assert.deepEqual(
    entries.map((entry) => [entry.dateKey, entry.type]),
    [
      ["2026-09-08", "original_end"],
      ["2026-09-09", "updated_end"],
      ["2026-09-10", "carry_forward"],
    ],
  );
});

test("completed tasks are not pending or carried forward", () => {
  const task = enrichTaskWithSchedule(
    {
      status: "completed",
      statusCategory: "closed",
      dueDate: new Date("2026-09-01T00:00:00.000Z"),
    },
    new Date("2026-09-10T00:00:00.000Z"),
  );

  assert.equal(task.isPending, false);
  assert.equal(task.isOverdue, false);
  assert.equal(task.carriedForwardDate, null);
});

test("assignment date is exposed as an employee calendar event", () => {
  const entries = calendarEntriesForTask(
    {
      assignedAt: new Date("2026-09-04T10:30:00.000Z"),
      statusCategory: "open",
    },
    {
      rangeStart: new Date("2026-09-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-10-01T00:00:00.000Z"),
      includeAssignedDate: true,
      now: new Date("2026-09-01T00:00:00.000Z"),
    },
  );

  assert.deepEqual(
    entries.map((entry) => [entry.dateKey, entry.type, entry.label]),
    [["2026-09-04", "assigned", "Assigned date"]],
  );
});

test("dashboard date ranges include tasks active anywhere inside the range", () => {
  const task = {
    startDate: new Date("2026-09-05T00:00:00.000Z"),
    dueDate: new Date("2026-09-15T00:00:00.000Z"),
  };

  assert.equal(
    taskOverlapsDateRange(
      task,
      new Date("2026-09-10T00:00:00.000Z"),
      new Date("2026-09-12T00:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    taskOverlapsDateRange(
      task,
      new Date("2026-09-16T00:00:00.000Z"),
      new Date("2026-09-20T00:00:00.000Z"),
    ),
    false,
  );
});
