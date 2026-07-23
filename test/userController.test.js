const test = require('node:test');
const assert = require('node:assert/strict');

const Notification = require('../src/models/Notification');
const Project = require('../src/models/Project');
const PushToken = require('../src/models/PushToken');
const Task = require('../src/models/Task');
const TaskActivity = require('../src/models/TaskActivity');
const TaskComment = require('../src/models/TaskComment');
const TaskDocument = require('../src/models/TaskDocument');
const TaskStatus = require('../src/models/TaskStatus');
const User = require('../src/models/User');
const { permanentlyDeleteUser } = require('../src/controllers/userController');

const targetId = '64b7f0f0f0f0f0f0f0f0f0f0';
const adminId = '64b7f0f0f0f0f0f0f0f0f0f1';

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

test('permanent user deletion rejects deleting the signed-in admin', async () => {
  await assert.rejects(
    permanentlyDeleteUser(
      { params: { id: adminId }, user: { _id: adminId } },
      responseRecorder()
    ),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'You cannot permanently delete your own account'
  );
});

test('permanent user deletion requires owned projects to be reassigned', async () => {
  const restores = [];
  stubMethod(
    User,
    'findById',
    async () => ({ _id: targetId, name: 'Project Owner' }),
    restores
  );
  stubMethod(
    Project,
    'findOne',
    () => ({ select: async () => ({ title: 'Owned project' }) }),
    restores
  );

  try {
    await assert.rejects(
      permanentlyDeleteUser(
        { params: { id: targetId }, user: { _id: adminId } },
        responseRecorder()
      ),
      (error) =>
        error.statusCode === 409 &&
        error.message.includes('Reassign projects owned by Project Owner')
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('permanent user deletion cleans references before deleting the user', async () => {
  const restores = [];
  const cleanupCalls = [];
  const stubCleanup = (model, name) => {
    stubMethod(
      model,
      name,
      async (...args) => {
        cleanupCalls.push({ model: model.modelName, name, args });
      },
      restores
    );
  };

  stubMethod(
    User,
    'findById',
    async () => ({ _id: targetId, name: 'Employee' }),
    restores
  );
  stubMethod(
    Project,
    'findOne',
    () => ({ select: async () => null }),
    restores
  );

  for (const [model, methods] of [
    [Project, ['updateMany']],
    [Task, ['updateMany']],
    [TaskStatus, ['updateMany']],
    [TaskComment, ['updateMany']],
    [TaskDocument, ['updateMany']],
    [TaskActivity, ['updateMany']],
    [Notification, ['deleteMany', 'updateMany']],
    [PushToken, ['deleteMany']],
  ]) {
    methods.forEach((name) => stubCleanup(model, name));
  }
  stubMethod(
    User,
    'deleteOne',
    async (...args) => {
      cleanupCalls.push({ model: 'User', name: 'deleteOne', args });
    },
    restores
  );

  const response = responseRecorder();

  try {
    await permanentlyDeleteUser(
      { params: { id: targetId }, user: { _id: adminId } },
      response
    );

    assert.deepEqual(response.body, { message: 'User permanently deleted' });
    assert.equal(cleanupCalls.at(-1).model, 'User');
    assert.equal(cleanupCalls.at(-1).name, 'deleteOne');
    assert.ok(
      cleanupCalls.some(
        (call) => call.model === 'Project' && call.name === 'updateMany'
      )
    );
    assert.ok(
      cleanupCalls.some(
        (call) => call.model === 'Task' && call.name === 'updateMany'
      )
    );
    assert.ok(
      cleanupCalls.some(
        (call) => call.model === 'Notification' && call.name === 'deleteMany'
      )
    );
    assert.ok(
      cleanupCalls.some(
        (call) => call.model === 'PushToken' && call.name === 'deleteMany'
      )
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
