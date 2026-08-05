const Project = require('../models/Project');
const Task = require('../models/Task');
const {
  isEmployee,
  getProjectQueryForUser,
  getTaskQueryForUser,
  countVisibleEmployeeProjects,
} = require('../utils/accessControl');
const { taskScopeFor } = require('../utils/roleCatalog');
const { getTaskStatusKeysByCategory } = require('../utils/taskStatusCatalog');

const defaultDashboardTaskStatuses = {
  open: 'open',
  inProgress: 'in_progress',
  review: 'review',
  completed: 'completed',
};

const excludedOverdueStatusKeys = new Set(['canceled', 'cancelled', 'deleted']);

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDashboardSummary = async (req, res) => {
  const projectQuery = getProjectQueryForUser(req.user);
  const taskQuery = await getTaskQueryForUser(req.user);
  const openStatusKeys = (await getTaskStatusKeysByCategory('open')).filter(
    (statusKey) => !excludedOverdueStatusKeys.has(statusKey)
  );

  const totalProjectsPromise =
    isEmployee(req.user) || taskScopeFor(req.user) === 'assigned'
    ? countVisibleEmployeeProjects(req.user)
    : Project.countDocuments(projectQuery);

  const [totalProjects, taskCounts] = await Promise.all([
    totalProjectsPromise,
    Task.aggregate([
      { $match: taskQuery },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          openTasks: {
            $sum: {
              $cond: [{ $eq: ['$status', defaultDashboardTaskStatuses.open] }, 1, 0],
            },
          },
          inProgressTasks: {
            $sum: {
              $cond: [
                { $eq: ['$status', defaultDashboardTaskStatuses.inProgress] },
                1,
                0,
              ],
            },
          },
          reviewTasks: {
            $sum: {
              $cond: [{ $eq: ['$status', defaultDashboardTaskStatuses.review] }, 1, 0],
            },
          },
          completedTasks: {
            $sum: {
              $cond: [
                { $eq: ['$status', defaultDashboardTaskStatuses.completed] },
                1,
                0,
              ],
            },
          },
          overdueTasks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', openStatusKeys] },
                    { $eq: [{ $type: '$dueDate' }, 'date'] },
                    { $lt: ['$dueDate', startOfToday()] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          myTasks: {
            $sum: {
              $cond: [
                {
                  $in: [
                    req.user._id,
                    {
                      $cond: [
                        { $isArray: '$assignedTo' },
                        '$assignedTo',
                        {
                          $cond: [
                            {
                              $ne: [
                                { $ifNull: ['$assignedTo', null] },
                                null,
                              ],
                            },
                            ['$assignedTo'],
                            [],
                          ],
                        },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).then(([counts]) => counts || {}),
  ]);

  res.json({
    summary: {
      totalProjects,
      totalTasks: taskCounts.totalTasks || 0,
      openTasks: taskCounts.openTasks || 0,
      inProgressTasks: taskCounts.inProgressTasks || 0,
      reviewTasks: taskCounts.reviewTasks || 0,
      completedTasks: taskCounts.completedTasks || 0,
      overdueTasks: taskCounts.overdueTasks || 0,
      myTasks: taskCounts.myTasks || 0,
    },
  });
};

module.exports = { getDashboardSummary };
