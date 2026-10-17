const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Task = require("../src/models/Task");
const User = require("../src/models/User");
const {
  createTask,
  updateTask,
} = require("../src/controllers/taskController");

const stubMethod = (object, name, replacement, restores) => {
  const original = object[name];
  object[name] = replacement;
  restores.push(() => {
    object[name] = original;
  });
};

test("creating a task without a start date is rejected", async () => {
  await assert.rejects(
    createTask(
      {
        body: { title: "Undated task" },
        user: { role: "admin" },
      },
      {},
    ),
    (error) =>
      error.statusCode === 400 &&
      error.message === "Task start date is required",
  );
});

test("assigning a new user updates assignedAt without changing startDate", async () => {
  const restores = [];
  const taskId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const previousUserId = new mongoose.Types.ObjectId();
  const newUserId = new mongoose.Types.ObjectId();
  const originalStartDate = new Date("2026-09-01T00:00:00.000Z");
  const selectedAssignedDate = new Date("2026-09-08T00:00:00.000Z");
  const stopAfterSave = new Error("stop after save");
  let saved = false;
  const task = {
    _id: taskId,
    title: "Task with a fixed start date",
    project: { _id: projectId, owner: previousUserId, members: [] },
    assignedTo: [previousUserId],
    status: "open",
    priority: "medium",
    startDate: originalStartDate,
    reminderAt: null,
    thumbnailUrl: "",
    save: async () => {
      saved = true;
      assert.equal(task.startDate, originalStartDate);
      assert.equal(task.assignedAt.getTime(), selectedAssignedDate.getTime());
      throw stopAfterSave;
    },
  };

  stubMethod(
    Task,
    "findById",
    () => ({ populate: async () => task }),
    restores,
  );
  stubMethod(
    User,
    "find",
    async () => [{ _id: newUserId, status: "active" }],
    restores,
  );

  try {
    await assert.rejects(
      updateTask(
        {
          params: { id: taskId.toString() },
          body: {
            assignedTo: [newUserId.toString()],
            assignedAt: selectedAssignedDate.toISOString(),
          },
          user: { _id: previousUserId, role: "admin" },
        },
        {},
      ),
      (error) => error === stopAfterSave,
    );
    assert.equal(saved, true);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("an existing assignment date can be moved without changing assignees", async () => {
  const restores = [];
  const taskId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const nextAssignedDate = new Date("2026-09-12T00:00:00.000Z");
  const stopAfterSave = new Error("stop after save");
  const task = {
    _id: taskId,
    title: "Task with a movable assignment date",
    project: { _id: projectId, owner: userId, members: [] },
    assignedTo: [userId],
    assignedAt: new Date("2026-09-08T00:00:00.000Z"),
    status: "open",
    priority: "medium",
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    dueDate: new Date("2026-09-20T00:00:00.000Z"),
    reminderAt: null,
    thumbnailUrl: "",
    save: async () => {
      assert.equal(task.assignedTo[0], userId);
      assert.equal(task.assignedAt.getTime(), nextAssignedDate.getTime());
      throw stopAfterSave;
    },
  };

  stubMethod(
    Task,
    "findById",
    () => ({ populate: async () => task }),
    restores,
  );

  try {
    await assert.rejects(
      updateTask(
        {
          params: { id: taskId.toString() },
          body: { assignedAt: nextAssignedDate.toISOString() },
          user: { _id: userId, role: "admin" },
        },
        {},
      ),
      (error) => error === stopAfterSave,
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("assigning a new user to an undated task is rejected", async () => {
  const restores = [];
  const taskId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const previousUserId = new mongoose.Types.ObjectId();
  const newUserId = new mongoose.Types.ObjectId();
  let saved = false;
  const task = {
    _id: taskId,
    title: "Legacy undated task",
    project: { _id: projectId, owner: previousUserId, members: [] },
    assignedTo: [previousUserId],
    status: "open",
    priority: "medium",
    startDate: null,
    reminderAt: null,
    thumbnailUrl: "",
    save: async () => {
      saved = true;
    },
  };

  stubMethod(
    Task,
    "findById",
    () => ({ populate: async () => task }),
    restores,
  );
  stubMethod(
    User,
    "find",
    async () => [{ _id: newUserId, status: "active" }],
    restores,
  );

  try {
    await assert.rejects(
      updateTask(
        {
          params: { id: taskId.toString() },
          body: { assignedTo: [newUserId.toString()] },
          user: { _id: previousUserId, role: "admin" },
        },
        {},
      ),
      (error) =>
        error.statusCode === 400 &&
        error.message ===
          "Task start date is required when assigning a new user",
    );
    assert.equal(saved, false);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
