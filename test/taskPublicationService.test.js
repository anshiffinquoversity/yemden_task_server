const test = require('node:test');
const assert = require('node:assert/strict');

const TaskComment = require('../src/models/TaskComment');
const TaskDocument = require('../src/models/TaskDocument');
const {
  publishableTypes,
  publishedLinksFromCommentBody,
  commentLinkAssetId,
  syncPublishedTaskAssets,
  ensureTaskHasPublishedAsset,
} = require('../src/services/taskPublicationService');

const stubMethod = (object, name, replacement, restores) => {
  const original = object[name];
  object[name] = replacement;
  restores.push(() => {
    object[name] = original;
  });
};

test('task publication requires at least one published eligible attachment', async () => {
  const restores = [];
  stubMethod(TaskDocument, 'exists', async () => null, restores);
  stubMethod(TaskComment, 'exists', async () => null, restores);

  try {
    await assert.rejects(
      ensureTaskHasPublishedAsset('64b7f0f0f0f0f0f0f0f0f101'),
      (error) =>
        error.statusCode === 400 &&
        error.message.includes('Publish at least one image'),
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('a published document satisfies the task publication requirement', async () => {
  const restores = [];
  stubMethod(TaskDocument, 'exists', async () => ({ _id: 'document-1' }), restores);
  stubMethod(TaskComment, 'exists', async () => null, restores);

  try {
    await assert.doesNotReject(
      ensureTaskHasPublishedAsset('64b7f0f0f0f0f0f0f0f0f101'),
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('links are eligible publication assets', () => {
  assert.equal(publishableTypes.has('link'), true);
  assert.deepEqual(
    publishedLinksFromCommentBody(
      'Review www.example.org/reference, then https://example.com/demo! ' +
        'Duplicate: www.example.org/reference',
    ),
    [
      {
        url: 'https://www.example.org/reference',
        title: 'example.org',
      },
      {
        url: 'https://example.com/demo',
        title: 'example.com',
      },
    ],
  );
});

test('a selected comment link is persisted and returned as published', async () => {
  const restores = [];
  const comment = new TaskComment({
    _id: '64b7f0f0f0f0f0f0f0f0f202',
    task: '64b7f0f0f0f0f0f0f0f0f101',
    author: '64b7f0f0f0f0f0f0f0f0f303',
    body: 'Publish https://example.com/campaign.',
    attachments: [],
  });
  comment.save = async () => comment;

  const queryResult = (items) => ({
    sort: async () => items,
    then: (resolve, reject) => Promise.resolve(items).then(resolve, reject),
  });
  stubMethod(
    TaskDocument,
    'find',
    () => queryResult([]),
    restores,
  );
  stubMethod(
    TaskComment,
    'find',
    () => queryResult([comment]),
    restores,
  );

  try {
    const link = publishedLinksFromCommentBody(comment.body)[0];
    const assetId = commentLinkAssetId(comment, link);
    const assets = await syncPublishedTaskAssets({
      taskId: comment.task,
      assetIds: [assetId],
      actor: { _id: '64b7f0f0f0f0f0f0f0f0f303' },
    });

    assert.equal(comment.publicationLinks.length, 1);
    assert.equal(comment.publicationLinks[0].url, link.url);
    assert.equal(comment.publicationLinks[0].isPublished, true);
    assert.equal(assets.length, 1);
    assert.equal(assets[0].id, assetId);
    assert.equal(assets[0].type, 'link');
    assert.equal(assets[0].isPublished, true);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
