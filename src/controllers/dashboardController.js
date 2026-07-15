const Project = require('../models/Project');
const Task = require('../models/Task');
const {
  isEmployee,
  getProjectQueryForUser,
  getTaskQueryForUser,
  combineQuery,
  countVisibleEmployeeProjects,
} = require('../utils/accessControl');
const { getTaskStatusKeysByCategory } = require('../utils/taskStatusCatalog');

const defaultDashboardTaskStatuses = {
  open: 'open',
  inProgress: 'in_progress',
  review: 'review',
  completed: 'completed',
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDashboardSummary = async (req, res) => {
  const projectQuery = getProjectQueryForUser(req.user);
  const taskQuery = await getTaskQueryForUser(req.user);
  const openStatusKeys = await getTaskStatusKeysByCategory('open');

  const totalProjectsPromise = isEmployee(req.user)
    ? countVisibleEmployeeProjects(req.user)
    : Project.countDocuments(projectQuery);

  const [
    totalProjects,
    totalTasks,
    openTasks,
    inProgressTasks,
    reviewTasks,
    completedTasks,
    overdueTasks,
    myTasks,
  ] = await Promise.all([
    totalProjectsPromise,
    Task.countDocuments(taskQuery),
    Task.countDocuments(
      combineQuery(taskQuery, { status: defaultDashboardTaskStatuses.open })
    ),
    Task.countDocuments(
      combineQuery(taskQuery, {
        status: defaultDashboardTaskStatuses.inProgress,
      })
    ),
    Task.countDocuments(
      combineQuery(taskQuery, { status: defaultDashboardTaskStatuses.review })
    ),
    Task.countDocuments(
      combineQuery(taskQuery, {
        status: defaultDashboardTaskStatuses.completed,
      })
    ),
    Task.countDocuments(
      combineQuery(taskQuery, {
        status: { $in: openStatusKeys },
        dueDate: { $lt: startOfToday() },
      })
    ),
    Task.countDocuments({ assignedTo: req.user._id }),
  ]);

  res.json({
    summary: {
      totalProjects,
      totalTasks,
      openTasks,
      inProgressTasks,
      reviewTasks,
      completedTasks,
      overdueTasks,
      myTasks,
    },
  });
};

module.exports = { getDashboardSummary };
