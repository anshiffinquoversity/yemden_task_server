const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  parsePageSize,
  decodeCursor,
  descendingCursorFilter,
  pageFromResults,
} = require('../src/utils/pagination');

test('page size uses a safe default and rejects unbounded values', () => {
  assert.equal(parsePageSize(undefined), 25);
  assert.equal(parsePageSize('50'), 50);
  assert.throws(() => parsePageSize('0'), /limit must be an integer/);
  assert.throws(() => parsePageSize('101'), /limit must be an integer/);
});

test('cursor page returns an opaque seek cursor for the final visible item', () => {
  const results = [
    {
      _id: new mongoose.Types.ObjectId('64b7f0f0f0f0f0f0f0f0f001'),
      createdAt: new Date('2026-07-22T10:00:00.000Z'),
    },
    {
      _id: new mongoose.Types.ObjectId('64b7f0f0f0f0f0f0f0f0f002'),
      createdAt: new Date('2026-07-22T09:00:00.000Z'),
    },
    {
      _id: new mongoose.Types.ObjectId('64b7f0f0f0f0f0f0f0f0f003'),
      createdAt: new Date('2026-07-22T08:00:00.000Z'),
    },
  ];

  const page = pageFromResults(results, 2);
  const cursor = decodeCursor(page.pageInfo.nextCursor);

  assert.deepEqual(page.items, results.slice(0, 2));
  assert.equal(page.pageInfo.hasNext, true);
  assert.equal(cursor.createdAt.toISOString(), '2026-07-22T09:00:00.000Z');
  assert.equal(cursor.id.toString(), results[1]._id.toString());
  assert.deepEqual(descendingCursorFilter(cursor), {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  });
});

test('invalid cursors are rejected', () => {
  assert.throws(() => decodeCursor('not-a-cursor'), /cursor is invalid/);
});
