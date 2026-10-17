const test = require('node:test');
const assert = require('node:assert/strict');

const Notification = require('../src/models/Notification');
const {
  markAllNotificationsRead,
} = require('../src/controllers/notificationController');

const userId = '64b7f0f0f0f0f0f0f0f0f001';

test('mark all notifications read only updates unread notifications for the current user', async () => {
  const originalUpdateMany = Notification.updateMany;
  let updateCall;
  Notification.updateMany = async (filter, update) => {
    updateCall = { filter, update };
    return { modifiedCount: 3 };
  };

  const response = { body: null };
  response.json = (body) => {
    response.body = body;
    return response;
  };

  try {
    await markAllNotificationsRead(
      { user: { _id: userId } },
      response
    );

    assert.deepEqual(updateCall.filter, {
      recipient: userId,
      readAt: null,
    });
    assert.ok(updateCall.update.$set.readAt instanceof Date);
    assert.deepEqual(response.body, {
      message: 'All notifications marked as read',
      updatedCount: 3,
    });
  } finally {
    Notification.updateMany = originalUpdateMany;
  }
});
