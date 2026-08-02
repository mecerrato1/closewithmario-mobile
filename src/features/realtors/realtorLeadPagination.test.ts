import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  RealtorLeadPage,
  RealtorLinkedLead,
} from './realtorLeadApi';
import {
  mergeRealtorLeadPages,
  RealtorLeadPaginationController,
} from './realtorLeadPagination';

const REALTOR_ID = '50c5d2af-3018-4d6e-9432-7ffac2842afa';

function lead(id: string, source: 'lead' | 'meta' = 'lead'): RealtorLinkedLead {
  return {
    id,
    source,
    first_name: 'Test',
    last_name: 'Lead',
    status: 'new',
    created_at: '2030-01-02T00:00:00.000Z',
  };
}

function page(
  items: RealtorLinkedLead[],
  nextCursor: string | null = null,
  totalCount = items.length
): RealtorLeadPage {
  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    totalCount,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test('loads a first page and continues through the opaque cursor', async () => {
  const cursors: (string | null)[] = [];
  const controller = new RealtorLeadPaginationController(
    REALTOR_ID,
    async (_realtorId, options) => {
      cursors.push(options.cursor);
      return options.cursor
        ? page([lead('00000000-0000-4000-8000-000000000002')], null, 2)
        : page(
            [lead('00000000-0000-4000-8000-000000000001')],
            'next',
            2
          );
    }
  );

  await controller.loadFirst();
  await controller.loadMore();
  assert.deepEqual(cursors, [null, 'next']);
  assert.equal(controller.getState().items.length, 2);
  assert.equal(controller.getState().hasMore, false);
  assert.equal(controller.getState().totalCount, 2);
});

test('merges pages by source-qualified stable identity', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const merged = mergeRealtorLeadPages(
    [{ ...lead(id), first_name: 'Old' }, lead(id, 'meta')],
    [{ ...lead(id), first_name: 'Updated' }]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.source === 'lead')?.first_name, 'Updated');
});

test('coalesces repeated load-more calls', async () => {
  const continuation = deferred<RealtorLeadPage>();
  let continuationCalls = 0;
  const controller = new RealtorLeadPaginationController(
    REALTOR_ID,
    async (_realtorId, options) => {
      if (!options.cursor) return page([lead('00000000-0000-4000-8000-000000000001')], 'next', 2);
      continuationCalls += 1;
      return continuation.promise;
    }
  );
  await controller.loadFirst();

  const calls = [controller.loadMore(), controller.loadMore(), controller.loadMore()];
  assert.equal(continuationCalls, 1);
  continuation.resolve(page([lead('00000000-0000-4000-8000-000000000002')], null, 2));
  await Promise.all(calls);
  assert.equal(continuationCalls, 1);
});

test('refresh replaces old pages and stale realtor responses are ignored', async () => {
  const oldRequest = deferred<RealtorLeadPage>();
  const newRequest = deferred<RealtorLeadPage>();
  const captured: { signal: AbortSignal | null } = { signal: null };
  const nextRealtorId = '60c5d2af-3018-4d6e-9432-7ffac2842afa';
  const controller = new RealtorLeadPaginationController(
    REALTOR_ID,
    (realtorId, options) => {
      if (realtorId === nextRealtorId) return newRequest.promise;
      captured.signal = options.signal;
      return oldRequest.promise;
    }
  );

  const first = controller.loadFirst();
  const changed = controller.setRealtor(nextRealtorId);
  assert.equal(captured.signal?.aborted, true);
  newRequest.resolve(page([lead('00000000-0000-4000-8000-000000000002')]));
  await changed;
  oldRequest.resolve(page([lead('00000000-0000-4000-8000-000000000001')]));
  await first;
  assert.deepEqual(controller.getState().items.map((item) => item.id), [
    '00000000-0000-4000-8000-000000000002',
  ]);
});

test('exposes error, retry, cancellation, and empty states safely', async () => {
  let attempts = 0;
  const controller = new RealtorLeadPaginationController(REALTOR_ID, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Temporary failure');
    return page([]);
  });
  await controller.loadFirst();
  assert.equal(controller.getState().error, 'Temporary failure');
  await controller.retry();
  assert.equal(controller.getState().error, null);
  assert.deepEqual(controller.getState().items, []);

  const request = deferred<RealtorLeadPage>();
  const cancelling = new RealtorLeadPaginationController(
    REALTOR_ID,
    async () => request.promise
  );
  const loading = cancelling.loadFirst();
  cancelling.dispose();
  request.resolve(page([lead('00000000-0000-4000-8000-000000000001')]));
  await loading;
  assert.deepEqual(cancelling.getState().items, []);
});
