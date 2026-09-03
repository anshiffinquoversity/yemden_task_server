const test = require('node:test');
const assert = require('node:assert/strict');

const Task = require('../src/models/Task');
const TaskActivity = require('../src/models/TaskActivity');
const TaskStatus = require('../src/models/TaskStatus');
const {
  updateTaskMetaAdStatus,
} = require('../src/controllers/taskController');

const taskId = '64b7f0f0f0f0f0f0f0f0f101';
const userId = '64b7f0f0f0f0f0f0f0f0f102';

const stubMethod = (object, name, replacement, restores) => {
  const original = object[name];
  object[name] = replacement;
  restores.push(() => {
    object[name] = original;
  });
};

const validTask = (metaAdStatus) =>
  new Task({
    title: 'Meta campaign task',
    project: taskId,
    metaAdStatus,
  });

test('task Meta ad status supports start, pause, stop, and legacy posted values', async () => {
  for (const metaAdStatus of [
    'none',
    'ad_posted',
    'ad_started',
    'ad_paused',
    'ad_stopped',
  ]) {
    await assert.doesNotReject(validTask(metaAdStatus).validate());
  }
});

test('task Meta ad status rejects unknown values', async () => {
  await assert.rejects(
    validTask('running').validate(),
    (error) =>
      error.name === 'ValidationError' &&
      /not a valid enum value/.test(error.errors.metaAdStatus.message),
  );
});

test('task Meta ad status defaults to none', () => {
  assert.equal(validTask().metaAdStatus, 'none');
});

test('Meta ad status changes are valid task activity history entries', async () => {
  const activity = new TaskActivity({
    task: taskId,
    actor: userId,
    type: 'meta_ad_status_changed',
    message: 'Meta ad status changed from None to Ad Started',
    from: 'none',
    to: 'ad_started',
  });

  await assert.doesNotReject(activity.validate());
});

test('Meta ad status endpoint rejects unknown values before updating', async () => {
  await assert.rejects(
    updateTaskMetaAdStatus(
      {
        params: { id: taskId },
        body: { metaAdStatus: 'running' },
        user: { _id: userId, role: 'admin' },
      },
      {},
    ),
    (error) =>
      error.statusCode === 400 &&
      error.message.includes('Meta ad status must be one of'),
  );
});

test('Meta ad status endpoint requires a published task', async () => {
  const restores = [];
  let saved = false;
  const task = {
    _id: taskId,
    status: 'open',
    metaAdStatus: 'none',
    project: { owner: userId, members: [] },
    assignedTo: [],
    save: async () => {
      saved = true;
    },
  };

  stubMethod(
    Task,
    'findById',
    () => ({ populate: async () => task }),
    restores,
  );
  stubMethod(TaskStatus, 'updateOne', async () => ({}), restores);
  stubMethod(
    TaskStatus,
    'findOne',
    async () => ({ key: 'open', name: 'Open', category: 'open' }),
    restores,
  );

  try {
    await assert.rejects(
      updateTaskMetaAdStatus(
        {
          params: { id: taskId },
          body: { metaAdStatus: 'ad_started' },
          user: { _id: userId, role: 'admin' },
        },
        {},
      ),
      (error) =>
        error.statusCode === 400 &&
        error.message.includes('only be set after the task is published'),
    );
    assert.equal(saved, false);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
