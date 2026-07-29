const test = require('node:test');
const assert = require('node:assert/strict');

const User = require('../src/models/User');
const {
  isEmployee,
  isSocialMediaHandler,
  canUpdateTaskStatus,
  getTaskQueryForUser,
} = require('../src/utils/accessControl');

const handler = {
  _id: '64b7f0f0f0f0f0f0f0f0f0f0',
  role: 'social_media_handler',
  priorityAccess: 'medium',
};

test('social media handler is a valid employee-like user role', () => {
  assert.ok(User.schema.path('role').enumValues.includes('social_media_handler'));
  assert.equal(isSocialMediaHandler(handler), true);
  assert.equal(isEmployee(handler), true);
});

test('social media handler keeps assigned-task employee access', async () => {
  assert.deepEqual(await getTaskQueryForUser(handler), {
    assignedTo: handler._id,
  });
  assert.equal(
    canUpdateTaskStatus(handler, { assignedTo: [handler._id] }),
    true,
  );
  assert.equal(
    canUpdateTaskStatus(handler, {
      assignedTo: ['64b7f0f0f0f0f0f0f0f0f0f1'],
    }),
    false,
  );
});
