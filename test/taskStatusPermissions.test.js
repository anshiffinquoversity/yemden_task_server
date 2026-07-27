const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canEmployeeChangeTaskStatus,
  canManagerChangeTaskStatus,
  canUserChangeTaskStatus,
} = require('../src/utils/taskStatusCatalog');

test('employees can only move approved tasks to published or delivered', () => {
  assert.equal(canEmployeeChangeTaskStatus('approved', 'published'), true);
  assert.equal(canEmployeeChangeTaskStatus('approved', 'delivered'), true);
  assert.equal(canEmployeeChangeTaskStatus('approved', 'open'), false);
  assert.equal(canEmployeeChangeTaskStatus('open', 'approved'), false);
  assert.equal(canEmployeeChangeTaskStatus('open', 'published'), false);
  assert.equal(canEmployeeChangeTaskStatus('published', 'open'), false);
  assert.equal(canEmployeeChangeTaskStatus('published', 'delivered'), false);
  assert.equal(canEmployeeChangeTaskStatus('published', 'published'), true);
  assert.equal(canEmployeeChangeTaskStatus('delivered', 'open'), false);
  assert.equal(canEmployeeChangeTaskStatus('delivered', 'delivered'), true);
});

test('managers use approved as the status transition gate', () => {
  assert.equal(canManagerChangeTaskStatus('open', 'approved'), true);
  assert.equal(canManagerChangeTaskStatus('open', 'review'), false);
  assert.equal(canManagerChangeTaskStatus('open', 'published'), false);
  assert.equal(canManagerChangeTaskStatus('approved', 'open'), true);
  assert.equal(canManagerChangeTaskStatus('approved', 'published'), true);
  assert.equal(canManagerChangeTaskStatus('approved', 'delivered'), true);
});

test('published and delivered are terminal for managers but not admins', () => {
  assert.equal(canManagerChangeTaskStatus('published', 'open'), false);
  assert.equal(canManagerChangeTaskStatus('delivered', 'approved'), false);
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
  assert.equal(canUserChangeTaskStatus('employee', undefined, 'open'), true);
  assert.equal(canUserChangeTaskStatus('manager', null, 'review'), true);
});
