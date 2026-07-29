const test = require("node:test");
const assert = require("node:assert/strict");

const Task = require("../src/models/Task");
const {
  taskThumbnailUrlForFile,
} = require("../src/utils/taskThumbnail");

test("task thumbnails are optional and default to an empty URL", () => {
  const task = new Task({
    title: "Thumbnail test",
    project: "507f1f77bcf86cd799439011",
  });

  assert.equal(task.thumbnailUrl, "");
});

test("uploaded task thumbnails use the public task thumbnail path", () => {
  assert.equal(
    taskThumbnailUrlForFile({ filename: "thumbnail.png" }),
    "/uploads/task-thumbnails/thumbnail.png",
  );
  assert.equal(taskThumbnailUrlForFile(null), "");
});
