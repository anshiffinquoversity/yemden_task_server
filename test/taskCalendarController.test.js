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

const findCondition = (value, predicate) => {
  if (!value || typeof value !== "object") return null;
  if (predicate(value)) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findCondition(child, predicate);
    if (found) return found;
  }
  return null;
};

const dateRangeCondition = (filter, field) =>
  findCondition(filter, (value) =>
    Boolean(value[field]?.$gte && value[field]?.$lt),
  );

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

    for (const field of ["assignedAt", "dueDate", "startDate"]) {
      assert.deepEqual(dateRangeCondition(taskFilter, field)?.[field], {
        $gte: new Date("2026-07-01T00:00:00.000Z"),
        $lt: new Date("2026-08-01T00:00:00.000Z"),
      });
    }
    assert.equal(dateRangeCondition(taskFilter, "originalDueDate"), null);
    assert.deepEqual(response.body.tasks, []);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("calendar filters tasks by multiple projects", async () => {
  const restores = [];
  let taskFilter;
  const projectIds = [
    "507f1f77bcf86cd799439011",
    "507f191e810c19729de860ea",
  ];

  stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
  stubMethod(TaskStatus, "find", () => ({ sort: async () => [] }), restores);
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

  try {
    await listCalendarTasks(
      {
        query: {
          month: "7",
          year: "2026",
          projects: projectIds.join(","),
        },
        user: { role: "admin" },
      },
      responseRecorder(),
    );

    const projectCondition = findCondition(
      taskFilter,
      (value) => value.project?.$in,
    );
    assert.deepEqual(projectCondition.project, { $in: projectIds });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("calendar filters tasks by assigned employee", async () => {
  const restores = [];
  let taskFilter;
  const employeeId = "507f1f77bcf86cd799439011";

  stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
  stubMethod(TaskStatus, "find", () => ({ sort: async () => [] }), restores);
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

  try {
    const response = responseRecorder();
    await listCalendarTasks(
      {
        query: { month: "9", year: "2026", assignedTo: employeeId },
        user: { role: "admin" },
      },
      response,
    );

    assert.ok(
      findCondition(taskFilter, (value) => value.assignedTo === employeeId),
    );
    assert.equal(response.body.assignedTo, employeeId);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("employee calendar queries the recorded assignment date", async () => {
  const restores = [];
  let taskFilter;
  const employeeId = "507f1f77bcf86cd799439011";

  stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
  stubMethod(TaskStatus, "find", () => ({ sort: async () => [] }), restores);
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

  try {
    await listCalendarTasks(
      {
        query: { month: "9", year: "2026" },
        user: {
          _id: employeeId,
          role: "employee",
          priorityAccess: "medium",
        },
      },
      responseRecorder(),
    );

    assert.ok(
      findCondition(taskFilter, (value) => value.assignedTo === employeeId),
    );
    assert.deepEqual(dateRangeCondition(taskFilter, "assignedAt")?.assignedAt, {
      $gte: new Date("2026-09-01T00:00:00.000Z"),
      $lt: new Date("2026-10-01T00:00:00.000Z"),
    });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("employee-like calendars stay assigned-only with a broader saved role scope", async () => {
  for (const role of ["employee", "social_media_handler"]) {
    const restores = [];
    let taskFilter;
    const userId =
      role === "employee"
        ? "507f1f77bcf86cd799439011"
        : "507f191e810c19729de860ea";

    stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
    stubMethod(TaskStatus, "find", () => ({ sort: async () => [] }), restores);
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

    try {
      await listCalendarTasks(
        {
          query: { month: "9", year: "2026" },
          user: {
            _id: userId,
            role,
            roleDefinition: {
              taskScope: "all",
              statusVisibility: { mode: "all", statusKeys: [] },
            },
          },
        },
        responseRecorder(),
      );

      assert.ok(
        findCondition(taskFilter, (value) => value.assignedTo === userId),
        `${role} calendar must filter by the signed-in user`,
      );
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  }
});

test("calendar separates normal tasks from ad tasks", async () => {
  for (const [taskType, expectedMetaAdStatus] of [
    ["normal", { $in: ["none", null] }],
    ["ad", { $nin: ["none", null] }],
  ]) {
    const restores = [];
    let taskFilter;
    stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
    stubMethod(TaskStatus, "find", () => ({ sort: async () => [] }), restores);
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

    try {
      await listCalendarTasks(
        {
          query: { month: "7", year: "2026", taskType },
          user: { role: "admin" },
        },
        responseRecorder(),
      );
      const metaCondition = findCondition(
        taskFilter,
        (value) => value.metaAdStatus,
      );
      assert.deepEqual(metaCondition.metaAdStatus, expectedMetaAdStatus);
      if (taskType === "normal") {
        assert.ok(dateRangeCondition(taskFilter, "startDate"));
        assert.ok(dateRangeCondition(taskFilter, "assignedAt"));
        assert.ok(dateRangeCondition(taskFilter, "dueDate"));
      } else {
        assert.equal(dateRangeCondition(taskFilter, "startDate"), null);
      }
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  }
});

test("calendar applies the status filter to Meta ad status for ad tasks", async () => {
  for (const [query, expectedMetaAdStatus] of [
    [
      { status: "ad_started" },
      { $in: ["ad_started", "ad_posted"] },
    ],
    [{ metaAdStatus: "ad_paused" }, "ad_paused"],
    [{ status: "ad_stopped" }, "ad_stopped"],
  ]) {
    const restores = [];
    let taskFilter;
    stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
    stubMethod(TaskStatus, "find", () => ({ sort: async () => [] }), restores);
    stubMethod(
      Task,
      "find",
      (filter) => {
        taskFilter = filter;
        const taskQuery = {
          select: () => taskQuery,
          populate: () => taskQuery,
          sort: async () => [],
        };
        return taskQuery;
      },
      restores,
    );

    try {
      const response = responseRecorder();
      await listCalendarTasks(
        {
          query: {
            month: "7",
            year: "2026",
            taskType: "ad",
            ...query,
          },
          user: { role: "admin" },
        },
        response,
      );

      assert.deepEqual(taskFilter, { metaAdStatus: expectedMetaAdStatus });
      assert.equal(response.body.metaAdStatus, Object.values(query)[0]);
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  }
});

test("calendar rejects an unknown Meta ad status filter", async () => {
  await assert.rejects(
    listCalendarTasks(
      {
        query: {
          month: "7",
          year: "2026",
          taskType: "ad",
          status: "running",
        },
        user: { role: "admin" },
      },
      responseRecorder(),
    ),
    (error) =>
      error.statusCode === 400 &&
      error.message.includes("Meta ad status must be one of"),
  );
});
