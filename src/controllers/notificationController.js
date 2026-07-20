const Notification = require('../models/Notification');
const PushToken = require('../models/PushToken');
const { ApiError, assertObjectId } = require('../utils/http');

const populateNotification = (query) =>
  query
    .populate('actor', 'name email role status')
    .populate('task', 'title status dueDate')
    .populate('project', 'title color');

const listNotifications = async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  const [notifications, unreadCount] = await Promise.all([
    populateNotification(
      Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(limit)
    ),
    Notification.countDocuments({ recipient: req.user._id, readAt: null }),
  ]);

  res.json({ notifications, unreadCount });
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
  registerPushToken,
  deletePushToken,
};
