const Notification = require('../models/Notification');
const PushToken = require('../models/PushToken');
const { getFirebaseMessaging } = require('../config/firebase');
const { env } = require('../config/env');

const invalidTokenCodes = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

const normalizeId = (value) => {
  if (!value) return '';
  return (value._id || value).toString();
};

const normalizeRecipientIds = (recipients) => [
  ...new Set(
    (Array.isArray(recipients) ? recipients : [recipients])
      .map(normalizeId)
      .filter(Boolean)
  ),
];

const cleanData = (data) =>
  Object.fromEntries(
    Object.entries(data || {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );

const tokenPlatform = (value) =>
  String(value || 'web').trim().toLowerCase() || 'web';

const uniqueTokenDocs = (tokenDocs) => {
  const seen = new Set();
  return tokenDocs
    .map((item) => ({
      token: String(item.token || '').trim(),
      platform: tokenPlatform(item.platform),
    }))
    .filter((item) => {
      if (!item.token || seen.has(item.token)) return false;
      seen.add(item.token);
      return true;
    });
};

const frontendLink = (path) => {
  const configuredAppUrl = String(env.APP_URL || 'http://localhost:8080');
  const base = configuredAppUrl.split('#')[0].replace(/\/+$/, '');
  const usesHashRouting = configuredAppUrl.includes('#/');
  const cleanPath = String(path || '/').startsWith('/') ? path : `/${path}`;
  return usesHashRouting ? `${base}/#${cleanPath}` : `${base}${cleanPath}`;
};

const taskLink = (taskId, query = {}) => {
  const normalizedTaskId = normalizeId(taskId);
  if (!normalizedTaskId) return frontendLink('/tasks');

  const params = new URLSearchParams({ task: normalizedTaskId });
  Object.entries(query || {}).forEach(([key, value]) => {
    const cleanValue = String(value ?? '').trim();
    if (cleanValue) params.set(key, cleanValue);
  });

  return frontendLink(`/tasks?${params.toString()}`);
};

const markInvalidTokens = async (tokens) => {
  if (tokens.length === 0) return;
  await PushToken.updateMany(
    { token: { $in: tokens } },
    { $set: { isActive: false } }
  );
};

const sendPushToUsers = async ({
  recipients,
  title,
  body,
  link,
  data = {},
}) => {
  const recipientIds = normalizeRecipientIds(recipients);
  if (recipientIds.length === 0) return { sent: 0, failed: 0 };

  const messaging = getFirebaseMessaging();
  if (!messaging) return { sent: 0, failed: 0 };

  const tokenDocs = await PushToken.find({
    user: { $in: recipientIds },
    isActive: true,
  })
    .select('token platform')
    .lean();

  const tokens = uniqueTokenDocs(tokenDocs);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const invalidTokens = [];

  const sendTokenChunks = async (chunkTokens, includeNotificationPayload) => {
    for (let index = 0; index < chunkTokens.length; index += 500) {
      const chunk = chunkTokens.slice(index, index + 500);
      const payloadData = cleanData({
        ...data,
        title,
        body,
        link,
      });
      const message = {
        tokens: chunk,
        data: payloadData,
        webpush: {
          fcmOptions: {
            link,
          },
        },
      };
      const notification = cleanData({ title, body });

      if (includeNotificationPayload && Object.keys(notification).length > 0) {
        message.notification = notification;
      }

      try {
        const response = await messaging.sendEachForMulticast(message);

        sent += response.successCount;
        failed += response.failureCount;
        response.responses.forEach((result, resultIndex) => {
          const code = result.error?.code;
          if (!result.success && invalidTokenCodes.has(code)) {
            invalidTokens.push(chunk[resultIndex]);
          }
        });
      } catch (error) {
        failed += chunk.length;
        console.warn(`Push notification send failed: ${error.message}`);
      }
    }
  };

  const webTokens = tokens
    .filter((item) => item.platform === 'web')
    .map((item) => item.token);
  const nativeTokens = tokens
    .filter((item) => item.platform !== 'web')
    .map((item) => item.token);

  await sendTokenChunks(webTokens, false);
  await sendTokenChunks(nativeTokens, true);

  await markInvalidTokens(invalidTokens);
  return { sent, failed };
};

const createUserNotifications = async ({
  recipients,
  actor,
  task,
  project,
  type,
  title,
  message,
  command = '',
  link,
  data = {},
}) => {
  const recipientIds = normalizeRecipientIds(recipients);
  if (recipientIds.length === 0) return [];

  const actorId = normalizeId(actor) || null;
  const taskId = normalizeId(task) || null;
  const projectId = normalizeId(project) || null;
  const notificationLink = link || (taskId ? taskLink(taskId) : frontendLink('/'));

  const notifications = await Notification.insertMany(
    recipientIds.map((recipient) => ({
      recipient,
      actor: actorId,
      task: taskId,
      project: projectId,
      type,
      title,
      message,
      command,
    }))
  );

  try {
    await sendPushToUsers({
      recipients: recipientIds,
      title,
      body: message,
      link: notificationLink,
      data: {
        ...data,
        type,
        taskId,
        projectId,
      },
    });
  } catch (error) {
    console.warn(`Push notification delivery skipped: ${error.message}`);
  }

  return notifications;
};

module.exports = {
  createUserNotifications,
  sendPushToUsers,
  taskLink,
};
