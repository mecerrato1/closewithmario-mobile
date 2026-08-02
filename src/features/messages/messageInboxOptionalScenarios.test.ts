import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectBoundedScenarioPages,
  loadOptionalScenariosWithDeadline,
  settleOptionalScenarioLoad,
} from './messageInboxOptionalScenarios';

test('returns four bounded pages even when another scenario page exists', async () => {
  const calls: Array<string | null> = [];
  const result = await collectBoundedScenarioPages(
    async (cursor) => {
      calls.push(cursor);
      const page = calls.length;
      return {
        items: [{ id: `scenario-${page}` }],
        hasMore: true,
        nextCursor: `cursor-${page}`,
      };
    },
    (item) => item.id,
    4
  );

  assert.deepEqual(calls, [null, 'cursor-1', 'cursor-2', 'cursor-3']);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ['scenario-1', 'scenario-2', 'scenario-3', 'scenario-4']
  );
  assert.equal(result.truncated, true);
});

test('scenario summary failure does not fail the primary message page', async () => {
  const result = await settleOptionalScenarioLoad(
    Promise.reject(new Error('Scenario service unavailable'))
  );
  assert.deepEqual(result, { items: [], loaded: false });
});

test('scenario summary success remains independently mergeable', async () => {
  const result = await settleOptionalScenarioLoad(
    Promise.resolve([{ key: 'scenario:one' }])
  );
  assert.deepEqual(result, {
    items: [{ key: 'scenario:one' }],
    loaded: true,
  });
});

test('scenario cancellation still propagates to stale-request handling', async () => {
  const controller = new AbortController();
  controller.abort();
  const error = new Error('cancelled');
  error.name = 'AbortError';
  await assert.rejects(
    settleOptionalScenarioLoad(Promise.reject(error), controller.signal),
    (value: unknown) => value === error
  );
});

test('scenario deadline aborts only the auxiliary request and returns unavailable', async () => {
  let auxiliaryWasAborted = false;
  const result = await loadOptionalScenariosWithDeadline(
    (signal) => {
      return new Promise<never[]>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          auxiliaryWasAborted = signal.aborted;
          const error = new Error('cancelled');
          error.name = 'AbortError';
          reject(error);
        });
      });
    },
    { timeoutMs: 5 }
  );

  assert.deepEqual(result, { items: [], loaded: false });
  assert.equal(auxiliaryWasAborted, true);
});

test('outer cancellation aborts the auxiliary request and still rejects', async () => {
  const outer = new AbortController();
  const loading = loadOptionalScenariosWithDeadline(
    (signal) =>
      new Promise<never[]>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('cancelled');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    { signal: outer.signal, timeoutMs: 1_000 }
  );
  outer.abort();

  await assert.rejects(loading, (error: unknown) => {
    return error instanceof Error && error.name === 'AbortError';
  });
});
