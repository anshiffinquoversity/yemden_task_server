const Notification = require('../models/Notification');
const PushToken = require('../models/PushToken');
const { ApiError, assertObjectId } = require('../utils/http');
const {
  parsePageSize,
  decodeCursor,
  descendingCursorFilter,
  pageFromResults,
} = require('../utils/pagination');

const populateNotification = (query) =>
  query
    .populate('actor', 'name email role status')
    .populate('task', 'title status dueDate approvedAt')
    .populate('project', 'title color');

const listNotifications = async (req, res) => {
  const limit = parsePageSize(req.query.limit, {
    defaultPageSize: 20,
    maxPageSize: 50,
  });
  const cursorFilter = descendingCursorFilter(decodeCursor(req.query.cursor));
  const query = Object.keys(cursorFilter).length
    ? { $and: [{ recipient: req.user._id }, cursorFilter] }
    : { recipient: req.user._id };

  const [results, unreadCount] = await Promise.all([
    populateNotification(
      Notification.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
    ),
    Notification.countDocuments({ recipient: req.user._id, readAt: null }),
  ]);
  const page = pageFromResults(results, limit);

  res.json({
    notifications: page.items,
    unreadCount,
    pageInfo: page.pageInfo,
  });
};

const markNotificationRead = async (req, res) => {
  assertObjectId(req.params.id, 'notification id');

  const notification = await Notification.findOne({
    _id: req.params.id,
    recipient: req.user._id,
  });

  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  res.json({ notification: await populateNotification(Notification.findById(notification._id)) });
};

const markAllNotificationsRead = async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );

  res.json({
    message: 'All notifications marked as read',
    updatedCount: result.modifiedCount,
  });
};

const registerPushToken = async (req, res) => {
  const token = String(req.body.token || '').trim();
  const platform = String(req.body.platform || 'web').trim().toLowerCase();

  if (!token) {
    throw new ApiError(400, 'Push token is required');
  }

  const pushToken = await PushToken.findOneAndUpdate(
    { token },
    {
      $set: {
        user: req.user._id,
        platform,
        isActive: true,
        lastSeenAt: new Date(),
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  // The desktop MVP keeps one active browser endpoint per user. This removes
  // tokens left behind by service-worker changes or other browser profiles,
  // preventing one reminder phase from producing several desktop popups.
  if (platform === 'web') {
    await PushToken.updateMany(
      {
        user: req.user._id,
        platform: 'web',
        token: { $ne: token },
        isActive: true,
      },
      { $set: { isActive: false } }
    );
  }

  res.status(201).json({ token: pushToken });
};

const deletePushToken = async (req, res) => {
  const token = String(req.body.token || '').trim();

  if (!token) {
    throw new ApiError(400, 'Push token is required');
  }

  await PushToken.updateOne(
    { user: req.user._id, token },
    { $set: { isActive: false } }
  );

  res.json({ message: 'Push token removed' });
};

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  registerPushToken,
  deletePushToken,
};
