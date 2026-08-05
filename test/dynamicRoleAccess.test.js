const test = require('node:test');
const assert = require('node:assert/strict');

const User = require('../src/models/User');
const {
  canChangeToTaskStatus,
  canSeeTaskStatus,
  hasPermission,
  roleToJson,
  statusVisibilityQueryFor,
} = require('../src/utils/roleCatalog');

const dynamicUser = () => ({
  role: 'reviewer',
  $locals: {
    roleDefinition: {
      name: 'Reviewer',
      key: 'reviewer',
      priority: 450,
      taskScope: 'assigned',
      permissions: ['changeTaskStatus'],
      statusVisibility: {
        mode: 'selected',
        statusKeys: ['open', 'review'],
      },
      statusChange: { mode: 'selected', statusKeys: ['review'] },
    },
  },
});

test('custom role keys are valid user roles', async () => {
  const user = new User({
    name: 'Dynamic User',
    email: 'dynamic@example.com',
    password: 'Password@123',
    role: 'content_reviewer',
  });

  await assert.doesNotReject(user.validate());
});

test('selected task statuses control both visibility and changes', () => {
  const user = dynamicUser();

  assert.equal(hasPermission(user, 'changeTaskStatus'), true);
  assert.equal(hasPermission(user, 'manageTasks'), false);
  assert.equal(canSeeTaskStatus(user, 'open'), true);
  assert.equal(canSeeTaskStatus(user, 'completed'), false);
  assert.equal(canChangeToTaskStatus(user, 'review'), true);
  assert.equal(canChangeToTaskStatus(user, 'open'), false);
  assert.deepEqual(statusVisibilityQueryFor(user), {
    status: { $in: ['open', 'review'] },
  });
});

test('admin role cannot be stripped of administration or status access', () => {
  const role = roleToJson({
    id: 'admin-role',
    name: 'Admin',
    key: 'admin',
    priority: 1,
    taskScope: 'assigned',
    permissions: [],
    statusVisibility: { mode: 'selected', statusKeys: [] },
    statusChange: { mode: 'selected', statusKeys: [] },
  });

  assert.equal(role.taskScope, 'all');
  assert.equal(role.statusVisibility.mode, 'all');
  assert.equal(role.statusChange.mode, 'all');
  assert.ok(role.permissions.includes('manageUsers'));
  assert.ok(role.permissions.includes('changeTaskStatus'));
});
