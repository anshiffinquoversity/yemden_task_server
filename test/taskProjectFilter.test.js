const test = require("node:test");
const assert = require("node:assert/strict");

const Task = require("../src/models/Task");
const TaskStatus = require("../src/models/TaskStatus");
const TaskComment = require("../src/models/TaskComment");
const { listTasks } = require("../src/controllers/taskController");

const projectOne = "64b7f0f0f0f0f0f0f0f0f101";
const projectTwo = "64b7f0f0f0f0f0f0f0f0f102";

const stubMethod = (object, name, replacement, restores) => {
  const original = object[name];
  object[name] = replacement;
  restores.push(() => {
    object[name] = original;
  });
};

const responseRecorder = () => {
  const response = { body: null };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  return response;
};

const captureTaskFilter = async (query) => {
  const restores = [];
  let taskFilter;

  stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
  stubMethod(TaskStatus, "find", () => ({ sort: async () => [] }), restores);
  stubMethod(TaskComment, "aggregate", async () => [], restores);
  stubMethod(
    Task,
    "find",
    (filter) => {
      taskFilter = filter;
      const taskQuery = {
        select: () => taskQuery,
        populate: () => taskQuery,
        sort: () => taskQuery,
        limit: async () => [],
      };
      return taskQuery;
    },
    restores,
  );

  try {
    await listTasks({ query, user: { role: "admin" } }, responseRecorder());
    return taskFilter;
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
};

test("task list filters by multiple comma-separated projects", async () => {
  const filter = await captureTaskFilter({
    projects: `${projectOne},${projectTwo},${projectOne}`,
  });

  assert.deepEqual(filter, {
    project: { $in: [projectOne, projectTwo] },
  });
});

test("task list keeps the existing single-project filter", async () => {
  const filter = await captureTaskFilter({ project: projectOne });

  assert.deepEqual(filter, { project: projectOne });
});

test("task list rejects an invalid project in a multi-project filter", async () => {
  await assert.rejects(
    captureTaskFilter({ projects: `${projectOne},not-an-id` }),
    (error) =>
      error.statusCode === 400 && error.message === "Invalid project id",
  );
});
