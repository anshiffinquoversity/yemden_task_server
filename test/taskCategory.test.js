const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Task = require("../src/models/Task");

const taskData = (category) => ({
  title: "Category task",
  project: new mongoose.Types.ObjectId(),
  ...(category === undefined ? {} : { category }),
});

test("new tasks default to the Social Media Ads category", async () => {
  const task = new Task(taskData());

  assert.equal(task.category, "social_media_ads");
  await task.validate();
});

test("task category accepts the configured category values", async () => {
  for (const category of ["social_media_ads", "normal_ads", "posters"]) {
    const task = new Task(taskData(category));
    await task.validate();
  }
});

test("task category rejects unsupported values", async () => {
  const task = new Task(taskData("unsupported"));

  await assert.rejects(
    task.validate(),
    (error) => /not a valid enum value/.test(error.errors.category.message),
  );
});
