const test = require('node:test');
const assert = require('node:assert/strict');

const Task = require('../src/models/Task');
const TaskComment = require('../src/models/TaskComment');
const {
  deleteTaskComment,
} = require('../src/controllers/taskCollaborationController');

const taskId = '64b7f0f0f0f0f0f0f0f0f101';
const commentId = '64b7f0f0f0f0f0f0f0f0f102';
const authorId = '64b7f0f0f0f0f0f0f0f0f103';
const otherUserId = '64b7f0f0f0f0f0f0f0f0f104';

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
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const responseRecorder = () => {
  const response = { body: null };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  return response;
};

const requestFor = (user) => ({
  params: { id: taskId, commentId },
  user,
});

const taskRecord = { _id: taskId };

test('comment authors can delete their own comments', async () => {
  const restores = [];
  let deleted = false;

  stubMethod(
    Task,
    'findOne',
    () => populatedQuery(taskRecord),
    restores
  );
  stubMethod(
    TaskComment,
    'findOne',
    async () => ({
      author: authorId,
      attachments: [],
      deleteOne: async () => {
        deleted = true;
      },
    }),
    restores
  );

  const response = responseRecorder();
  try {
    await deleteTaskComment(
      requestFor({ _id: authorId, role: 'employee' }),
      response
    );

    assert.equal(deleted, true);
    assert.deepEqual(response.body, { message: 'Comment deleted' });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('admins can delete another user comment', async () => {
  const restores = [];
  let deleted = false;

  stubMethod(
    Task,
    'findOne',
    () => populatedQuery(taskRecord),
    restores
  );
  stubMethod(
    TaskComment,
    'findOne',
    async () => ({
      author: authorId,
      attachments: [],
      deleteOne: async () => {
        deleted = true;
      },
    }),
    restores
  );

  try {
    await deleteTaskComment(
      requestFor({ _id: otherUserId, role: 'admin' }),
      responseRecorder()
    );
    assert.equal(deleted, true);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('users cannot delete another user comment', async () => {
  const restores = [];
  let deleted = false;

  stubMethod(
    Task,
    'findOne',
    () => populatedQuery(taskRecord),
    restores
  );
  stubMethod(
    TaskComment,
    'findOne',
    async () => ({
      author: authorId,
      attachments: [],
      deleteOne: async () => {
        deleted = true;
      },
    }),
    restores
  );

  try {
    await assert.rejects(
      deleteTaskComment(
        requestFor({ _id: otherUserId, role: 'employee' }),
        responseRecorder()
      ),
      (error) =>
        error.statusCode === 403 &&
        error.message === 'You can only delete your own comments'
    );
    assert.equal(deleted, false);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
