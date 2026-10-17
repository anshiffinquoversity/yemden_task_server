const test = require('node:test');
const assert = require('node:assert/strict');

const Task = require('../src/models/Task');
const TaskActivity = require('../src/models/TaskActivity');
const TaskComment = require('../src/models/TaskComment');
const {
  createTaskComment,
} = require('../src/controllers/taskCollaborationController');

const taskId = '64b7f0f0f0f0f0f0f0f0f101';
const replyId = '64b7f0f0f0f0f0f0f0f0f102';
const createdId = '64b7f0f0f0f0f0f0f0f0f103';
const authorId = '64b7f0f0f0f0f0f0f0f0f104';

const stubMethod = (object, name, replacement, restores) => {
  const original = object[name];
  object[name] = replacement;
  restores.push(() => {
    object[name] = original;
  });
};

const populatedQuery = (value) => {
  const query = {
    populate: () => query,
    select: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const responseRecorder = () => {
  const response = { body: null, statusCode: 200 };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  return response;
};

const requestFor = () => ({
  params: { id: taskId },
  body: {
    body: 'I will handle this.',
    replyToId: replyId,
    attachments: [],
    mentionIds: [],
  },
  files: [],
  user: {
    _id: authorId,
    name: 'Reply author',
    role: 'employee',
  },
});

test('comment replies store a reference to a comment in the same task', async () => {
  const restores = [];
  const task = {
    _id: taskId,
    title: 'Task',
    assignedTo: [],
  };
  const original = { _id: replyId, task: taskId };
  const createdComment = {
    _id: createdId,
    body: 'I will handle this.',
    replyTo: original,
  };
  let createPayload;

  stubMethod(Task, 'findOne', () => populatedQuery(task), restores);
  stubMethod(
    TaskComment,
    'findOne',
    () => populatedQuery(original),
    restores
  );
  stubMethod(
    TaskComment,
    'create',
    async (payload) => {
      createPayload = payload;
      return { _id: createdId };
    },
    restores
  );
  stubMethod(
    TaskComment,
    'findById',
    () => populatedQuery(createdComment),
    restores
  );
  stubMethod(TaskActivity, 'create', async () => ({}), restores);

  const response = responseRecorder();
  try {
    await createTaskComment(requestFor(), response);

    assert.equal(response.statusCode, 201);
    assert.equal(createPayload.replyTo.toString(), replyId);
    assert.equal(response.body.comment, createdComment);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('comment replies reject an original comment from another task', async () => {
  const restores = [];
  let createCalled = false;

  stubMethod(
    Task,
    'findOne',
    () => populatedQuery({ _id: taskId, title: 'Task', assignedTo: [] }),
    restores
  );
  stubMethod(TaskComment, 'findOne', () => populatedQuery(null), restores);
  stubMethod(
    TaskComment,
    'create',
    async () => {
      createCalled = true;
    },
    restores
  );

  try {
    await assert.rejects(
      createTaskComment(requestFor(), responseRecorder()),
      (error) =>
        error.statusCode === 404 &&
        error.message === 'Original comment not found'
    );
    assert.equal(createCalled, false);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
