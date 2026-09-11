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
