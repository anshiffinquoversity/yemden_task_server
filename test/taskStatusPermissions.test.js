const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canEmployeeChangeTaskStatus,
} = require('../src/utils/taskStatusCatalog');

test('published and delivered are terminal task statuses for employees', () => {
  assert.equal(canEmployeeChangeTaskStatus('published', 'open'), false);
  assert.equal(canEmployeeChangeTaskStatus('published', 'delivered'), false);
  assert.equal(canEmployeeChangeTaskStatus('published', 'published'), true);
  assert.equal(canEmployeeChangeTaskStatus('delivered', 'open'), false);
  assert.equal(canEmployeeChangeTaskStatus('delivered', 'delivered'), true);
  assert.equal(canEmployeeChangeTaskStatus('open', 'published'), true);
});
