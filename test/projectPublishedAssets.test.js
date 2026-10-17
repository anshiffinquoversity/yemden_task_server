const test = require('node:test');
const assert = require('node:assert/strict');

const Project = require('../src/models/Project');
const Task = require('../src/models/Task');
const TaskActivity = require('../src/models/TaskActivity');
const TaskComment = require('../src/models/TaskComment');
const TaskDocument = require('../src/models/TaskDocument');
const {
  listPublishedProjectAssets,
} = require('../src/controllers/projectController');

const projectId = '64b7f0f0f0f0f0f0f0f0f101';
const taskId = '64b7f0f0f0f0f0f0f0f0f102';

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

test('published assets include ad-task dates, timeline, and task identity', async () => {
  const restores = [];
  const project = { _id: projectId, owner: null, members: [] };
  const taskStartDate = new Date('2026-09-01T00:00:00.000Z');
  const taskEndDate = new Date('2026-09-30T00:00:00.000Z');
  const firstStart = new Date('2026-09-02T09:00:00.000Z');
  const firstStop = new Date('2026-09-05T17:00:00.000Z');

  stubMethod(
    Project,
    'findById',
    () => {
      const query = {
        populate: () => query,
        then: (resolve, reject) => Promise.resolve(project).then(resolve, reject),
      };
      return query;
    },
    restores,
  );
  stubMethod(
    Task,
    'find',
    () => {
      const query = {
        select: () => query,
        lean: async () => [
          {
            _id: taskId,
            title: 'Campaign launch',
            category: 'posters',
            metaAdStatus: 'ad_stopped',
            startDate: taskStartDate,
            dueDate: taskEndDate,
          },
        ],
      };
      return query;
    },
    restores,
  );
  stubMethod(
    TaskDocument,
    'find',
    () => ({
      sort: async () => [
        {
          _id: '64b7f0f0f0f0f0f0f0f0f103',
          task: taskId,
          title: 'Campaign creative',
          url: 'https://example.com/campaign.png',
          type: 'image',
          publishedAt: firstStart,
        },
      ],
    }),
    restores,
  );
  stubMethod(
    TaskComment,
    'find',
    () => ({ sort: async () => [] }),
    restores,
  );
  stubMethod(
    TaskActivity,
    'find',
    () => {
      const query = {
        sort: () => query,
        lean: async () => [
          {
            task: taskId,
            from: 'none',
            to: 'ad_started',
            createdAt: firstStart,
          },
          {
            task: taskId,
            from: 'ad_started',
            to: 'ad_stopped',
            createdAt: firstStop,
          },
        ],
      };
      return query;
    },
    restores,
  );

  const response = responseRecorder();
  try {
    await listPublishedProjectAssets(
      {
        params: { id: projectId },
        user: { role: 'admin' },
      },
      response,
    );

    assert.equal(response.body.assets.length, 1);
    assert.deepEqual(response.body.assets[0], {
      id: 'document:64b7f0f0f0f0f0f0f0f0f103',
      title: 'Campaign creative',
      taskId,
      taskTitle: 'Campaign launch',
      taskCategory: 'posters',
      metaAdStatus: 'ad_stopped',
      taskStartDate,
      taskEndDate,
      metaAdTimeline: [
        {
          status: 'ad_started',
          previousStatus: 'none',
          changedAt: firstStart,
        },
        {
          status: 'ad_stopped',
          previousStatus: 'ad_started',
          changedAt: firstStop,
        },
      ],
      url: 'https://example.com/campaign.png',
      type: 'image',
      mimeType: '',
      publishedAt: firstStart,
    });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
