const test = require('node:test');
const assert = require('node:assert/strict');

const {
  absoluteHttpUrl,
  enrichTasksWithBanners,
  findTaskBanner,
  isValidTaskShareSignature,
  latestImageAttachment,
  renderTaskSharePage,
  taskShareSignature,
  taskShareUrl,
} = require('../src/services/taskShareService');
const TaskComment = require('../src/models/TaskComment');

test('an uploaded task banner takes priority over chat images', async () => {
  const banner = await findTaskBanner({
    _id: '507f1f77bcf86cd799439011',
    thumbnailUrl: '/uploads/task-thumbnails/user-banner.png',
    updatedAt: new Date('2026-08-04T00:00:00.000Z'),
  });

  assert.equal(banner.url, '/uploads/task-thumbnails/user-banner.png');
  assert.equal(banner.source, 'uploaded');
});

test('legacy localhost uploads use the current public share origin', () => {
  assert.equal(
    absoluteHttpUrl(
      'http://localhost:5001/uploads/task-comments/latest.png?size=large',
      'https://app.example.com',
    ),
    'https://app.example.com/uploads/task-comments/latest.png?size=large',
  );
});

test('latest chat image is the last image in the newest matching comment', () => {
  const image = latestImageAttachment([
    { type: 'image', url: '/uploads/task-comments/first.png' },
    { type: 'document', url: '/uploads/task-comments/notes.pdf' },
    { type: 'image', url: '/uploads/task-comments/latest.png' },
  ]);

  assert.equal(image.url, '/uploads/task-comments/latest.png');
});

test('task responses fall back to the latest chat image without replacing the uploaded thumbnail', async () => {
  const originalAggregate = TaskComment.aggregate;
  TaskComment.aggregate = async () => [
    {
      _id: '507f1f77bcf86cd799439012',
      comment: {
        attachments: [
          { type: 'image', url: '/uploads/task-comments/chat-banner.png' },
        ],
      },
    },
  ];

  try {
    const tasks = await enrichTasksWithBanners([
      {
        id: '507f1f77bcf86cd799439011',
        thumbnailUrl: '/uploads/task-thumbnails/uploaded.png',
      },
      { id: '507f1f77bcf86cd799439012', thumbnailUrl: '' },
    ]);

    assert.equal(
      tasks[0].bannerUrl,
      '/uploads/task-thumbnails/uploaded.png',
    );
    assert.equal(
      tasks[1].bannerUrl,
      '/uploads/task-comments/chat-banner.png',
    );
    assert.equal(tasks[1].thumbnailUrl, '');
  } finally {
    TaskComment.aggregate = originalAggregate;
  }
});

test('task share signatures cannot be replaced with another value', () => {
  const signature = taskShareSignature('507f1f77bcf86cd799439011');

  assert.equal(
    isValidTaskShareSignature('507f1f77bcf86cd799439011', signature),
    true,
  );
  assert.equal(
    isValidTaskShareSignature('507f1f77bcf86cd799439011', `${signature}x`),
    false,
  );
});

test('share URLs include a signed cache-busting banner version', () => {
  const url = new URL(
    taskShareUrl({
      taskId: '507f1f77bcf86cd799439011',
      origin: 'https://api.example.com',
      version: 'banner-2',
    }),
  );

  assert.equal(url.pathname, '/share/tasks/507f1f77bcf86cd799439011');
  assert.ok(url.searchParams.get('signature'));
  assert.equal(url.searchParams.get('v'), 'banner-2');
});

test('share page uses the task banner for social previews', () => {
  const html = renderTaskSharePage({
    task: {
      _id: '507f1f77bcf86cd799439011',
      title: 'Launch <campaign>',
      description: 'Prepare & publish',
    },
    bannerUrl: 'https://api.example.com/uploads/task-comments/latest.png',
    canonicalUrl: 'https://api.example.com/share/tasks/task-id?signature=signed',
  });

  assert.match(
    html,
    /property="og:image" content="https:\/\/api\.example\.com\/uploads\/task-comments\/latest\.png"/,
  );
  assert.doesNotMatch(html, /worqi-logo|favicon\.png/);
  assert.match(html, /Launch &lt;campaign&gt;/);
  assert.match(html, /Prepare &amp; publish/);
});
