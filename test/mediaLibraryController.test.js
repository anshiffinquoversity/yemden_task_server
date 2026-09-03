const test = require('node:test');
const assert = require('node:assert/strict');

const MediaLibraryItem = require('../src/models/MediaLibraryItem');
const {
  createMediaLibraryItem,
  listMediaLibraryItems,
  updateMediaLibraryItem,
} = require('../src/controllers/mediaLibraryController');

const itemId = '64b7f0f0f0f0f0f0f0f0f201';
const ownerId = '64b7f0f0f0f0f0f0f0f0f202';
const otherUserId = '64b7f0f0f0f0f0f0f0f0f203';

const stubMethod = (object, name, replacement, restores) => {
  const original = object[name];
  object[name] = replacement;
  restores.push(() => {
    object[name] = original;
  });
};

const responseRecorder = () => {
  const response = { body: null, statusCode: 200 };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  return response;
};

test('Media Library model accepts photos, videos, and links', async () => {
  for (const type of ['image', 'video', 'link']) {
    const item = new MediaLibraryItem({
      title: 'Campaign asset',
      type,
      url: type === 'link' ? 'https://drive.google.com/file/example' : '/uploads/media-library/example',
      uploadedBy: ownerId,
    });
    await assert.doesNotReject(item.validate());
  }
});

test('Media Library model rejects unsupported item types', async () => {
  const item = new MediaLibraryItem({
    title: 'Unsupported file',
    type: 'document',
    url: 'https://example.com/file.pdf',
    uploadedBy: ownerId,
  });

  await assert.rejects(
    item.validate(),
    (error) => error.name === 'ValidationError' && Boolean(error.errors.type),
  );
});

test('Media Library list filters items by their added-date range', async () => {
  const restores = [];
  let receivedFilters;
  stubMethod(
    MediaLibraryItem,
    'find',
    (filters) => {
      receivedFilters = filters;
      const query = {
        sort: () => query,
        limit: () => query,
        populate: async () => [],
      };
      return query;
    },
    restores,
  );

  try {
    await listMediaLibraryItems(
      {
        query: {
          createdFrom: '2026-09-01T00:00:00.000Z',
          createdBefore: '2026-09-04T00:00:00.000Z',
        },
      },
      responseRecorder(),
    );

    assert.deepEqual(receivedFilters, {
      createdAt: {
        $gte: new Date('2026-09-01T00:00:00.000Z'),
        $lt: new Date('2026-09-04T00:00:00.000Z'),
      },
    });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('Media Library list rejects an invalid added-date range', async () => {
  await assert.rejects(
    listMediaLibraryItems(
      {
        query: {
          createdFrom: '2026-09-04T00:00:00.000Z',
          createdBefore: '2026-09-01T00:00:00.000Z',
        },
      },
      responseRecorder(),
    ),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'createdFrom must be earlier than createdBefore',
  );
});

test('link creation stores a valid external share URL', async () => {
  const restores = [];
  let createdData;
  const createdItem = {
    populate: async () => createdItem,
  };
  stubMethod(
    MediaLibraryItem,
    'create',
    async (data) => {
      createdData = data;
      return createdItem;
    },
    restores,
  );
  const response = responseRecorder();

  try {
    await createMediaLibraryItem(
      {
        body: {
          title: 'Large launch video',
          type: 'link',
          url: 'https://drive.google.com/file/d/example/view',
        },
        user: { _id: ownerId, role: 'employee' },
      },
      response,
    );

    assert.equal(response.statusCode, 201);
    assert.equal(createdData.type, 'link');
    assert.equal(createdData.uploadedBy, ownerId);
    assert.equal(
      createdData.url,
      'https://drive.google.com/file/d/example/view',
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('link creation rejects non-web URLs', async () => {
  await assert.rejects(
    createMediaLibraryItem(
      {
        body: {
          title: 'Unsafe link',
          type: 'link',
          url: 'file:///private/video.mp4',
        },
        user: { _id: ownerId, role: 'employee' },
      },
      responseRecorder(),
    ),
    (error) =>
      error.statusCode === 400 &&
      error.message.includes('http:// or https://'),
  );
});

test('a non-admin cannot edit another user\'s media item', async () => {
  const restores = [];
  stubMethod(
    MediaLibraryItem,
    'findById',
    async () => ({
      _id: itemId,
      title: 'Team photo',
      type: 'image',
      uploadedBy: ownerId,
    }),
    restores,
  );

  try {
    await assert.rejects(
      updateMediaLibraryItem(
        {
          params: { id: itemId },
          body: { title: 'Changed title' },
          user: { _id: otherUserId, role: 'employee' },
        },
        responseRecorder(),
      ),
      (error) => error.statusCode === 403,
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
