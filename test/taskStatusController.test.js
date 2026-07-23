const test = require('node:test');
const assert = require('node:assert/strict');

const TaskStatus = require('../src/models/TaskStatus');
const {
  reorderTaskStatuses,
} = require('../src/controllers/taskStatusController');

const firstId = '64b7f0f0f0f0f0f0f0f0f101';
const secondId = '64b7f0f0f0f0f0f0f0f0f102';

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

const statusDocument = ({ id, name, key, position }) => ({
  position,
  toJSON: () => ({
    id,
    name,
    key,
    category: 'open',
    color: '#38BDF8',
    position,
    isDefault: false,
  }),
});

test('task status reorder saves and returns the requested order', async () => {
  const restores = [];
  const statuses = [
    statusDocument({ id: firstId, name: 'First', key: 'first', position: 10 }),
    statusDocument({ id: secondId, name: 'Second', key: 'second', position: 20 }),
  ];
  let bulkOperations = null;

  stubMethod(TaskStatus, 'updateOne', async () => ({}), restores);
  stubMethod(
    TaskStatus,
    'find',
    () => ({ sort: async () => statuses }),
    restores
  );
  stubMethod(
    TaskStatus,
    'bulkWrite',
    async (operations) => {
      bulkOperations = operations;
    },
    restores
  );

  const response = responseRecorder();

  try {
    await reorderTaskStatuses(
      { body: { statusIds: [secondId, firstId] } },
      response
    );

    assert.deepEqual(
      bulkOperations.map((operation) => operation.updateOne),
      [
        {
          filter: { _id: secondId },
          update: { $set: { position: 10 } },
        },
        {
          filter: { _id: firstId },
          update: { $set: { position: 20 } },
        },
      ]
    );
    assert.deepEqual(
      response.body.taskStatuses.map((status) => ({
        id: status.id,
        position: status.position,
      })),
      [
        { id: secondId, position: 10 },
        { id: firstId, position: 20 },
      ]
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('task status reorder requires every current status exactly once', async () => {
  const restores = [];
  const statuses = [
    statusDocument({ id: firstId, name: 'First', key: 'first', position: 10 }),
    statusDocument({ id: secondId, name: 'Second', key: 'second', position: 20 }),
  ];

  stubMethod(TaskStatus, 'updateOne', async () => ({}), restores);
  stubMethod(
    TaskStatus,
    'find',
    () => ({ sort: async () => statuses }),
    restores
  );

  try {
    await assert.rejects(
      reorderTaskStatuses(
        { body: { statusIds: [firstId] } },
        responseRecorder()
      ),
      (error) =>
        error.statusCode === 400 && error.message.includes('Status list changed')
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
