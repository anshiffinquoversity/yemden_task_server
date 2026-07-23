const test = require("node:test");
const assert = require("node:assert/strict");

const Task = require("../src/models/Task");
const TaskStatus = require("../src/models/TaskStatus");
const { listCalendarTasks } = require("../src/controllers/taskController");

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

test("calendar includes canceled tasks when no status filter is selected", async () => {
  const restores = [];
  let taskFilter;

  stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
  stubMethod(
    TaskStatus,
    "find",
    () => ({ sort: async () => [] }),
    restores,
  );
  stubMethod(
    Task,
    "find",
    (filter) => {
      taskFilter = filter;
      const query = {
        select: () => query,
        populate: () => query,
        sort: async () => [],
      };
      return query;
    },
    restores,
  );

  const response = responseRecorder();

  try {
    await listCalendarTasks(
      {
        query: { month: "7", year: "2026" },
        user: { role: "admin" },
      },
      response,
    );

    assert.deepEqual(taskFilter, {
      startDate: {
        $gte: new Date("2026-07-01T00:00:00.000Z"),
        $lt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    assert.deepEqual(response.body.tasks, []);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
