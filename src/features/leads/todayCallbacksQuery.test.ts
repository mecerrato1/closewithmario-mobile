import assert from 'node:assert/strict';
import test from 'node:test';
import {
  queryIncompleteTodayCallbacks,
  TODAY_CALLBACK_COLUMNS,
} from './todayCallbacksQuery';

test('today callback query consistently excludes completed callbacks', () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const result = { data: [], error: null };
  const builder: Record<string, (...args: unknown[]) => unknown> = {};

  for (const method of ['select', 'gte', 'lte', 'eq', 'is']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.order = (...args: unknown[]) => {
    calls.push(['order', ...args]);
    return result;
  };

  const client = {
    from(table: string) {
      calls.push(['from', table]);
      return builder;
    },
  };

  const queryResult = queryIncompleteTodayCallbacks(
    client,
    'user-id',
    new Date('2026-08-02T12:00:00-04:00')
  );

  assert.equal(queryResult, result);
  assert.deepEqual(calls[0], ['from', 'lead_callbacks']);
  assert.deepEqual(calls[1], ['select', TODAY_CALLBACK_COLUMNS]);
  assert.ok(
    calls.some(
      ([method, column, value]) =>
        method === 'eq' && column === 'created_by' && value === 'user-id'
    )
  );
  assert.ok(
    calls.some(
      ([method, column, value]) =>
        method === 'is' && column === 'completed_at' && value === null
    )
  );
  assert.deepEqual(calls.at(-1), [
    'order',
    'scheduled_for',
    { ascending: true },
  ]);
});
