const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canEmployeeChangeTaskStatus,
  canManagerChangeTaskStatus,
  canUserChangeTaskStatus,
  taskStatusPolicyKey,
} = require('../src/utils/taskStatusCatalog');

test('employees can change ordinary statuses but not restricted statuses', () => {
  assert.equal(canEmployeeChangeTaskStatus('open', 'in_progress'), true);
  assert.equal(canEmployeeChangeTaskStatus('in_progress', 'review'), true);
  assert.equal(canEmployeeChangeTaskStatus('review', 'scheduled'), true);
  assert.equal(canEmployeeChangeTaskStatus('open', 'description_added'), true);
  assert.equal(
    canEmployeeChangeTaskStatus('approved', 'description_added'),
    true,
  );
  assert.equal(canEmployeeChangeTaskStatus('open', 'approved'), false);
  assert.equal(canEmployeeChangeTaskStatus('open', 'canceled'), false);
  assert.equal(canEmployeeChangeTaskStatus('open', 'cancelled'), false);
  assert.equal(canEmployeeChangeTaskStatus('open', 'delivered'), false);
  assert.equal(canEmployeeChangeTaskStatus('open', 'published'), false);
  assert.equal(canEmployeeChangeTaskStatus('published', 'open'), false);
  assert.equal(canEmployeeChangeTaskStatus('published', 'published'), true);
  assert.equal(canEmployeeChangeTaskStatus('delivered', 'open'), false);
  assert.equal(canEmployeeChangeTaskStatus('delivered', 'delivered'), true);
  assert.equal(canEmployeeChangeTaskStatus('canceled', 'open'), false);
});

test('only high-access employees can select published', () => {
  assert.equal(
    canEmployeeChangeTaskStatus('review', 'published', 'high'),
    true,
  );
  assert.equal(
    canEmployeeChangeTaskStatus('review', 'published', 'medium'),
    false,
  );
  assert.equal(
    canEmployeeChangeTaskStatus('review', 'published', 'low'),
    false,
  );
  assert.equal(
    canEmployeeChangeTaskStatus('review', 'delivered', 'high'),
    false,
  );
});

test('display names cannot disguise employee-restricted statuses', () => {
  assert.equal(
    taskStatusPolicyKey({
      key: 'client_signoff',
      name: 'Approved',
      category: 'open',
    }),
    'approved',
  );
  assert.equal(
    taskStatusPolicyKey({
      key: 'finished',
      name: 'Delivered',
      category: 'closed',
    }),
    'delivered',
  );
  assert.equal(
    taskStatusPolicyKey({
      key: 'stopped',
      name: 'Stopped',
      category: 'canceled',
    }),
    'canceled',
  );
});

test('renamed open status is not restricted by its legacy canceled key', () => {
  const policyKey = taskStatusPolicyKey({
    key: 'canceled',
    name: 'Description Added',
    category: 'open',
  });

  assert.equal(policyKey, 'description_added');
  assert.equal(
    canUserChangeTaskStatus(
      { role: 'employee', priorityAccess: 'medium' },
      'scheduled',
      policyKey,
    ),
    true,
  );
});

test('managers can select any non-canceled task status', () => {
  assert.equal(canManagerChangeTaskStatus('open', 'approved'), true);
  assert.equal(canManagerChangeTaskStatus('open', 'review'), true);
  assert.equal(canManagerChangeTaskStatus('open', 'published'), true);
  assert.equal(canManagerChangeTaskStatus('open', 'delivered'), true);
  assert.equal(canManagerChangeTaskStatus('approved', 'open'), true);
  assert.equal(canManagerChangeTaskStatus('approved', 'published'), true);
  assert.equal(canManagerChangeTaskStatus('approved', 'delivered'), true);
  assert.equal(canManagerChangeTaskStatus('published', 'open'), true);
  assert.equal(canManagerChangeTaskStatus('delivered', 'approved'), true);
  assert.equal(canManagerChangeTaskStatus('open', 'canceled'), false);
  assert.equal(canManagerChangeTaskStatus('open', 'cancelled'), false);
  assert.equal(canManagerChangeTaskStatus('canceled', 'open'), false);
  assert.equal(canManagerChangeTaskStatus('cancelled', 'open'), false);

  assert.equal(
    canUserChangeTaskStatus('admin', 'published', 'open'),
    true,
  );
  assert.equal(
    canUserChangeTaskStatus('admin', 'delivered', 'approved'),
    true,
  );
});

test('initial task status selection remains separate from transitions', () => {
  assert.equal(
    canUserChangeTaskStatus(
      { role: 'employee', priorityAccess: 'medium' },
      undefined,
      'open',
    ),
    true,
  );
  assert.equal(
    canUserChangeTaskStatus(
      { role: 'employee', priorityAccess: 'medium' },
      undefined,
      'approved',
    ),
    false,
  );
  assert.equal(canUserChangeTaskStatus('manager', null, 'review'), true);
});

test('user access level is enforced when selecting published', () => {
  assert.equal(
    canUserChangeTaskStatus(
      { role: 'employee', priorityAccess: 'high' },
      'review',
      'published',
    ),
    true,
  );
  assert.equal(
    canUserChangeTaskStatus(
      { role: 'employee', priorityAccess: 'medium' },
      'review',
      'published',
    ),
    false,
  );
});

test('social media handlers can schedule and deliver assigned work', () => {
  const handler = {
    role: 'social_media_handler',
    priorityAccess: 'medium',
  };

  assert.equal(
    canUserChangeTaskStatus(handler, 'open', 'in_progress'),
    true,
  );
  assert.equal(
    canUserChangeTaskStatus(handler, 'review', 'scheduled'),
    true,
  );
  assert.equal(
    canUserChangeTaskStatus(handler, 'scheduled', 'delivered'),
    true,
  );
  assert.equal(
    canUserChangeTaskStatus(handler, 'review', 'published'),
    true,
  );
  assert.equal(
    canUserChangeTaskStatus(handler, 'review', 'approved'),
    false,
  );
  assert.equal(canUserChangeTaskStatus(handler, 'review', 'delivered'), true);
  assert.equal(
    canUserChangeTaskStatus(handler, 'published', 'open'),
    false,
  );
});
