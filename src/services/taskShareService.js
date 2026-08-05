const crypto = require('node:crypto');

const TaskComment = require('../models/TaskComment');
const { env } = require('../config/env');
const { taskLink } = require('./notificationService');

const cleanString = (value) => String(value || '').trim();

const escapeHtml = (value) =>
  cleanString(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const latestImageAttachment = (attachments) => {
  const values = Array.isArray(attachments) ? attachments : [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const attachment = values[index];
    const url = cleanString(attachment?.url);
    if (attachment?.type === 'image' && url) return attachment;
  }

  return null;
};

const findLatestTaskChatImage = async (taskId) => {
  const comment = await TaskComment.findOne({
    task: taskId,
    attachments: {
      $elemMatch: {
        type: 'image',
        url: { $type: 'string', $ne: '' },
      },
    },
  })
    .sort({ createdAt: -1, _id: -1 })
    .select('_id createdAt attachments')
    .lean();

  if (!comment) return null;
  const attachment = latestImageAttachment(comment.attachments);
  if (!attachment) return null;

  return {
    url: cleanString(attachment.url),
    source: 'chat',
    version: `${comment.createdAt?.getTime?.() || 0}-${comment._id}`,
  };
};

const findTaskBanner = async (task) => {
  const thumbnailUrl = cleanString(task?.thumbnailUrl);
  if (thumbnailUrl) {
    return {
      url: thumbnailUrl,
      source: 'uploaded',
      version: String(task.updatedAt?.getTime?.() || task._id || ''),
    };
  }

  const chatImage = await findLatestTaskChatImage(task?._id || task);
  if (chatImage) return chatImage;

  return {
    url: '',
    source: 'none',
    version: String(task?.updatedAt?.getTime?.() || task?._id || ''),
  };
};

const enrichTasksWithBanners = async (tasks) => {
  const entries = tasks.map((task) => {
    const data = typeof task?.toJSON === 'function' ? task.toJSON() : task;
    return {
      data,
      id: task?._id || data?._id || data?.id,
      thumbnailUrl: cleanString(data?.thumbnailUrl),
    };
  });
  const missingBannerEntries = entries.filter(
    (entry) => entry.id && !entry.thumbnailUrl,
  );
  const chatImagesByTaskId = new Map();

  if (missingBannerEntries.length > 0) {
    const comments = await TaskComment.aggregate([
      {
        $match: {
          task: { $in: missingBannerEntries.map((entry) => entry.id) },
          attachments: {
            $elemMatch: {
              type: 'image',
              url: { $type: 'string', $ne: '' },
            },
          },
        },
      },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: '$task', comment: { $first: '$$ROOT' } } },
    ]);

    for (const result of comments) {
      const attachment = latestImageAttachment(result.comment?.attachments);
      if (attachment) {
        chatImagesByTaskId.set(
          cleanString(result._id),
          cleanString(attachment.url),
        );
      }
    }
  }

  return entries.map((entry) => ({
    ...entry.data,
    bannerUrl:
      entry.thumbnailUrl || chatImagesByTaskId.get(cleanString(entry.id)) || '',
  }));
};

const taskShareSignature = (taskId) =>
  crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(cleanString(taskId))
    .digest('base64url');

const isValidTaskShareSignature = (taskId, signature) => {
  const expected = Buffer.from(taskShareSignature(taskId));
  const supplied = Buffer.from(cleanString(signature));
  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
};

const absoluteHttpUrl = (value, origin) => {
  const raw = cleanString(value);
  if (!raw) return '';

  try {
    const normalizedOrigin = `${cleanString(origin).replace(/\/+$/, '')}/`;
    const url = new URL(raw, normalizedOrigin);
    const originUrl = new URL(normalizedOrigin);
    const pointsAtLocalhost =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (
      url.pathname.startsWith('/uploads/') &&
      pointsAtLocalhost &&
      url.host !== originUrl.host
    ) {
      return new URL(`${url.pathname}${url.search}`, originUrl).toString();
    }
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : '';
  } catch (_error) {
    return '';
  }
};

const requestOrigin = (req) => `${req.protocol}://${req.get('host')}`;

const taskShareUrl = ({ taskId, origin, version }) => {
  const url = new URL(
    `/share/tasks/${encodeURIComponent(cleanString(taskId))}`,
    `${cleanString(origin).replace(/\/+$/, '')}/`,
  );
  url.searchParams.set('signature', taskShareSignature(taskId));
  if (cleanString(version)) url.searchParams.set('v', cleanString(version));
  return url.toString();
};

const renderTaskSharePage = ({ task, bannerUrl, canonicalUrl }) => {
  const taskId = cleanString(task?._id || task?.id);
  const rawTitle = cleanString(task?.title) || 'Untitled task';
  const rawDescription =
    cleanString(task?.description) || 'Open this task in Worqi.';
  const destinationUrl = taskLink(taskId);
  const title = escapeHtml(`${rawTitle} | Worqi`);
  const description = escapeHtml(rawDescription);
  const destination = escapeHtml(destinationUrl);
  const canonical = escapeHtml(canonicalUrl);
  const image = escapeHtml(bannerUrl);
  const imageMetadata = image
    ? `\n    <meta property="og:image" content="${image}">\n    <meta property="og:image:alt" content="${escapeHtml(rawTitle)}">\n    <meta name="twitter:image" content="${image}">`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Worqi">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonical}">${imageMetadata}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <link rel="canonical" href="${canonical}">
    <title>${title}</title>
    <script>window.location.replace(${JSON.stringify(destinationUrl).replaceAll('<', '\\u003c')});</script>
  </head>
  <body>
    <p>Opening <a href="${destination}">${escapeHtml(rawTitle)}</a>…</p>
  </body>
</html>`;
};

module.exports = {
  absoluteHttpUrl,
  enrichTasksWithBanners,
  findTaskBanner,
  isValidTaskShareSignature,
  latestImageAttachment,
  renderTaskSharePage,
  requestOrigin,
  taskShareSignature,
  taskShareUrl,
};
