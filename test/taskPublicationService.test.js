const test = require('node:test');
const assert = require('node:assert/strict');

const TaskComment = require('../src/models/TaskComment');
const TaskDocument = require('../src/models/TaskDocument');
const {
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
