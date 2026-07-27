import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRM_SUMMARY_ID_CHUNK_SIZE,
  LatestRequestGate,
  chunkValues,
  getOldestHistoryCursor,
  mergeChronologicalMessages,
  parseDescendingHistoryPage,
} from './messagePagination.ts';

test('summary ID chunks never exceed the server contract', () => {
  const values = Array.from({ length: 4_501 }, (_, index) => String(index));
  const chunks = chunkValues(values, CRM_SUMMARY_ID_CHUNK_SIZE);

  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [2_000, 2_000, 501]
  );
  assert.equal(chunks.flat().length, values.length);
});

test('descending history pages are bounded and returned chronologically', () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({
    id: String(100 - index).padStart(3, '0'),
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 100 - index)).toISOString(),
  }));

  const page = parseDescendingHistoryPage(rows, 50);
  assert.equal(page.hasOlder, true);
  assert.equal(page.items.length, 50);
  assert.ok(page.items[0].created_at < page.items.at(-1).created_at);
});

test('history merging deduplicates IDs and keeps chronological order', () => {
  const merged = mergeChronologicalMessages(
    [
      { id: 'b', created_at: '2026-01-02T00:00:00.000Z', value: 'old' },
      { id: 'c', created_at: '2026-01-03T00:00:00.000Z', value: 'three' },
    ],
    [
      { id: 'a', created_at: '2026-01-01T00:00:00.000Z', value: 'one' },
      { id: 'b', created_at: '2026-01-02T00:00:00.000Z', value: 'new' },
    ]
  );

  assert.deepEqual(
    merged.map((row) => row.id),
    ['a', 'b', 'c']
  );
  assert.equal(merged[1].value, 'new');
  assert.deepEqual(getOldestHistoryCursor(merged), {
    id: 'a',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
});

test('empty history has no continuation cursor', () => {
  assert.deepEqual(parseDescendingHistoryPage([], 50), {
    items: [],
    hasOlder: false,
  });
  assert.equal(getOldestHistoryCursor([]), null);
});

test('a newer request cancels and makes the older response stale', () => {
  const gate = new LatestRequestGate();
  const first = gate.begin();
  const second = gate.begin();

  assert.equal(first.signal.aborted, true);
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);

  gate.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(gate.isCurrent(second), false);
});
