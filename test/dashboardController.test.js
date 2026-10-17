const test = require("node:test");
const assert = require("node:assert/strict");

const Project = require("../src/models/Project");
const Task = require("../src/models/Task");
const TaskActivity = require("../src/models/TaskActivity");
const TaskStatus = require("../src/models/TaskStatus");
const User = require("../src/models/User");
const {
  dashboardTaskCounts,
  getDashboardSummary,
} = require("../src/controllers/dashboardController");

const adminId = "64b7f0f0f0f0f0f0f0f0f001";
const employeeId = "64b7f0f0f0f0f0f0f0f0f002";
const inactiveUserId = "64b7f0f0f0f0f0f0f0f0f003";
const projectId = "64b7f0f0f0f0f0f0f0f0f004";
const taskId = "64b7f0f0f0f0f0f0f0f0f005";

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

test("dashboard approval totals include approved and published tasks", () => {
  const counts = dashboardTaskCounts([
    {
      status: "open",
      statusCategory: "open",
      statusInfo: { key: "open", name: "Open", category: "open" },
      isPending: true,
      isOverdue: false,
    },
    {
      status: "client_signoff",
      statusCategory: "open",
      statusInfo: {
        key: "client_signoff",
        name: "Approved",
        category: "open",
      },
      isPending: true,
      isOverdue: false,
    },
    {
      status: "published",
      statusCategory: "open",
      statusInfo: {
        key: "published",
        name: "Published",
        category: "open",
      },
      isPending: true,
      isOverdue: false,
    },
    {
      status: "completed",
      statusCategory: "closed",
      statusInfo: {
        key: "completed",
        name: "Completed",
        category: "closed",
      },
      isPending: false,
      isOverdue: false,
    },
  ]);

  assert.equal(counts.approvedTasks, 2);
  assert.equal(counts.pendingTasks, 1);
  assert.equal(counts.completedTasks, 1);
});

test("only admins can request another user's dashboard details", async () => {
  await assert.rejects(
    getDashboardSummary(
      {
        query: { userId: employeeId },
        user: { _id: adminId, role: "manager" },
      },
      responseRecorder(),
    ),
    (error) => error.statusCode === 403,
  );
});

test("admin selection returns that user's completed and pending task details", async () => {
  const restores = [];
  const admin = {
    _id: adminId,
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
    status: "active",
  };
  const employee = {
    _id: employeeId,
    name: "Employee",
    email: "employee@example.com",
    role: "employee",
    status: "active",
  };
  const inactiveUser = {
    _id: inactiveUserId,
    name: "Inactive user",
    email: "inactive@example.com",
    role: "employee",
    status: "inactive",
  };
  const task = {
    _id: taskId,
    title: "Finished campaign",
    project: { _id: projectId, title: "Campaign", status: "active" },
    assignedTo: [employee],
    dutyCompletedBy: [employeeId],
    status: "completed",
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    dueDate: new Date("2026-09-10T00:00:00.000Z"),
    assignedAt: new Date("2026-09-01T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
  };

  stubMethod(TaskStatus, "updateOne", async () => ({}), restores);
  stubMethod(
    TaskStatus,
    "find",
    () => ({
      sort: async () => [
        {
          key: "completed",
          name: "Completed",
          category: "closed",
          color: "#94A3B8",
        },
      ],
    }),
    restores,
  );
  stubMethod(
    Task,
    "find",
    () => {
      const query = {
        select: () => query,
        populate: () => query,
        then: (resolve, reject) => Promise.resolve([task]).then(resolve, reject),
      };
      return query;
    },
    restores,
  );
  stubMethod(
    TaskActivity,
    "find",
    () => {
      const query = {
        select: () => query,
        lean: async () => [],
      };
      return query;
    },
    restores,
  );
  stubMethod(
    User,
    "find",
    () => {
      const query = {
        select: () => query,
        sort: async () => [admin, employee, inactiveUser],
      };
      return query;
    },
    restores,
  );
  stubMethod(Project, "countDocuments", async () => 1, restores);

  const response = responseRecorder();
  try {
    await getDashboardSummary(
      {
        query: {
          fromDate: "2026-09-01",
          toDate: "2026-09-30",
          userId: employeeId,
        },
        user: admin,
      },
      response,
    );

    assert.equal(response.body.summary.userProgress.length, 3);
    assert.equal(
      response.body.summary.userProgress.find(
        (progress) => progress.user.id === inactiveUserId,
      ).user.status,
      "inactive",
    );
    assert.equal(response.body.summary.taskDetails.length, 1);
    assert.equal(response.body.summary.taskDetails[0].title, "Finished campaign");
    assert.equal(response.body.summary.taskDetails[0].dutyCompleted, true);
    assert.equal(response.body.summary.taskDetails[0].isPending, false);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
