import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_LOOKUP_ERROR_MESSAGE, unwrapLookup } from './lookup';

test('returns the row when the lookup succeeds', () => {
  assert.deepEqual(unwrapLookup({ data: { id: 'x' }, error: null }), { id: 'x' });
});

test('returns null for a genuine "no row" result', () => {
  assert.equal(unwrapLookup({ data: null, error: null }), null);
});

test('throws a generic message when the lookup failed, never leaking server detail', () => {
  assert.throws(
    () => unwrapLookup({ data: null, error: { message: 'relation "loan_officers" does not exist' } }),
    (error: Error) => error.message === ACCOUNT_LOOKUP_ERROR_MESSAGE,
  );
});

test('a lookup error wins even if partial data is present', () => {
  assert.throws(() => unwrapLookup({ data: { id: 'x' }, error: new Error('timeout') }));
});
