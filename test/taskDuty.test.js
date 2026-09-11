const test = require("node:test");
const assert = require("node:assert/strict");

const Task = require("../src/models/Task");
const TaskActivity = require("../src/models/TaskActivity");
const TaskComment = require("../src/models/TaskComment");
const TaskStatus = require("../src/models/TaskStatus");
const {
  hasCompletedDuty,
  syncTaskDutyCompletion,
} = require("../src/utils/taskDuty");
const {
  mergeDutyCompletionHistory,
  progressForUser,
} = require("../src/controllers/dashboardController");
const { updateTaskStatus } = require("../src/controllers/taskController");

const employeeId = "64b7f0f0f0f0f0f0f0f0f101";
const otherEmployeeId = "64b7f0f0f0f0f0f0f0f0f102";
const projectId = "64b7f0f0f0f0f0f0f0f0f103";

const stubMethod = (object, name, replacement, restores) => {
  const original = object[name];
  object[name] = replacement;
  restores.push(() => {
    object[name] = original;
  });
};

test("task schema stores assignees who completed their duty", () => {
  assert.ok(Task.schema.path("dutyCompletedBy"));
});

test("a real status change credits only the assignee who made it", () => {
  const task = {
    assignedTo: [employeeId, otherEmployeeId],
    dutyCompletedBy: [],
  };

  syncTaskDutyCompletion(task, { _id: employeeId }, true);

  assert.equal(hasCompletedDuty(task, employeeId), true);
  assert.equal(hasCompletedDuty(task, otherEmployeeId), false);
});

test("unchanged status does not complete a duty", () => {
  const task = { assignedTo: [employeeId], dutyCompletedBy: [] };

  syncTaskDutyCompletion(task, { _id: employeeId }, false);

  assert.equal(hasCompletedDuty(task, employeeId), false);
});

test("removing an assignee clears that user's duty completion", () => {
  const task = {
    assignedTo: [otherEmployeeId],
    dutyCompletedBy: [employeeId, otherEmployeeId],
  };

  syncTaskDutyCompletion(task, { _id: otherEmployeeId }, false);

  assert.deepEqual(task.dutyCompletedBy, [otherEmployeeId]);
});

test("dashboard progress lists total tasks and assignee duty completion", () => {
  const user = {
    _id: employeeId,
    name: "Employee",
    role: "employee",
  };
  const progress = progressForUser(user, [
    {
      assignedTo: [user],
      dutyCompletedBy: [employeeId],
      status: "in_progress",
      statusLabel: "In progress",
      isOverdue: false,
    },
    {
      assignedTo: [user],
      dutyCompletedBy: [],
      status: "completed",
      statusLabel: "Completed",
      isOverdue: true,
    },
  ]);

  assert.equal(progress.totalTasks, 2);
  assert.equal(progress.completedTasks, 1);
  assert.equal(progress.pendingTasks, 1);
  assert.equal(progress.overdueTasks, 1);
  assert.equal(progress.completionPercent, 50);
});

test("dashboard progress matches serialized assignees that use id", () => {
  const user = {
    _id: employeeId,
    name: "Employee",
    role: "employee",
  };
  const progress = progressForUser(user, [
    {
      assignedTo: [{ id: employeeId, name: "Employee", role: "employee" }],
      dutyCompletedBy: [],
      status: "open",
      statusLabel: "Open",
      isOverdue: false,
    },
    {
      assignedTo: [{ id: employeeId, name: "Employee", role: "employee" }],
      dutyCompletedBy: [{ id: employeeId }],
      status: "completed",
      statusLabel: "Completed",
      isOverdue: false,
    },
  ]);

  assert.equal(progress.totalTasks, 2);
  assert.equal(progress.completedTasks, 1);
  assert.equal(progress.pendingTasks, 1);
  assert.equal(progress.completionPercent, 50);
});

test("dashboard recovers existing duty completion from status history", () => {
  const tasks = mergeDutyCompletionHistory(
    [
      {
        id: "task-1",
        assignedTo: [employeeId],
        dutyCompletedBy: [],
        assignedAt: new Date("2026-09-01T09:00:00.000Z"),
      },
    ],
    [
      {
        task: "task-1",
        actor: employeeId,
        createdAt: new Date("2026-09-02T09:00:00.000Z"),
      },
      {
        task: "task-1",
        actor: otherEmployeeId,
        createdAt: new Date("2026-09-03T09:00:00.000Z"),
      },
    ],
  );

  assert.equal(hasCompletedDuty(tasks[0], employeeId), true);
  assert.equal(hasCompletedDuty(tasks[0], otherEmployeeId), false);
});

test("dashboard ignores status history from before the latest assignment", () => {
  const tasks = mergeDutyCompletionHistory(
    [
      {
        id: "task-1",
        assignedTo: [employeeId],
        dutyCompletedBy: [],
        assignedAt: new Date("2026-09-05T09:00:00.000Z"),
      },
    ],
    [
      {
        task: "task-1",
        actor: employeeId,
        createdAt: new Date("2026-09-04T09:00:00.000Z"),
      },
    ],
  );

  assert.equal(hasCompletedDuty(tasks[0], employeeId), false);
});

test("status endpoint persists duty completion for the acting assignee", async () => {
  const restores = [];
  const task = {
    _id: employeeId,
    title: "Assigned task",
    project: { _id: projectId, owner: otherEmployeeId, members: [] },
    assignedTo: [employeeId],
    dutyCompletedBy: [],
    status: "open",
    save: async () => {},
  };
  let findByIdCalls = 0;

  stubMethod(
    Task,
    "findById",
    () => {
      findByIdCalls += 1;
      if (findByIdCalls === 1) {
        return { populate: async () => task };
      }
      const query = {
        select: () => query,
        populate: () => query,
        then: (resolve) => resolve(task),
      };
      return query;
    },
    restores,
  );
  stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
  stubMethod(
    TaskStatus,
    "findOne",
    async ({ key }) => ({
      key,
      name: key === "open" ? "Open" : "In Progress",
      category: "open",
    }),
    restores,
  );
  stubMethod(
    TaskStatus,
    "find",
    () => ({
      sort: async () => [
        { key: "open", name: "Open", category: "open", color: "#22C55E" },
        {
          key: "in_progress",
          name: "In Progress",
          category: "open",
          color: "#61C5F0",
        },
      ],
    }),
    restores,
  );
  stubMethod(TaskActivity, "create", async () => ({}), restores);
  stubMethod(TaskComment, "aggregate", async () => [], restores);

  const response = {
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    await updateTaskStatus(
      {
        params: { id: employeeId },
        body: { status: "in_progress" },
        user: {
          _id: employeeId,
          name: "Employee",
          role: "employee",
          priorityAccess: "medium",
        },
      },
      response,
    );

    assert.equal(task.status, "in_progress");
    assert.equal(hasCompletedDuty(task, employeeId), true);
    assert.equal(response.body.task.status, "in_progress");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
