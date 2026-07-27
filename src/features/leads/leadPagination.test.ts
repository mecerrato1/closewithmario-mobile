import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CrmLeadListPage,
  CrmLeadListQuery,
  CrmLeadSummary,
} from './crmLeadApi';
import { LeadPaginationController, mergeLeadPages } from './leadPagination';

const QUERY: CrmLeadListQuery = {
  scope: 'all',
  limit: 2,
  status: 'all',
  platform: 'all',
  sort: 'last_contact',
  direction: 'desc',
};

function lead(
  id: string,
  source: 'organic' | 'meta' = 'organic'
): CrmLeadSummary {
  return {
    id,
    source,
    created_at: '2026-01-01T00:00:00.000Z',
    first_name: 'Test',
    last_name: 'Lead',
    email: null,
    phone: null,
    status: 'new',
    last_contact_date: null,
  };
}

function page(
  items: CrmLeadSummary[],
  nextCursor: string | null = null
): CrmLeadListPage {
  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    totalCount: items.length,
    searchTotal: items.length,
    facets: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test('loads a first page and continues with the opaque cursor', async () => {
  const cursors: (string | null)[] = [];
  const controller = new LeadPaginationController(
    QUERY,
    async (_query, options) => {
      cursors.push(options.cursor);
      return options.cursor
        ? page([lead('00000000-0000-4000-8000-000000000002')])
        : page([lead('00000000-0000-4000-8000-000000000001')], 'next');
    }
  );

  await controller.loadFirst();
  assert.deepEqual(
    controller.getState().items.map((item) => item.id),
    ['00000000-0000-4000-8000-000000000001']
  );
  await controller.loadMore();
  assert.deepEqual(cursors, [null, 'next']);
  assert.equal(controller.getState().items.length, 2);
  assert.equal(controller.getState().hasMore, false);
});

test('refresh atomically resets pagination and replaces old pages', async () => {
  let firstLoads = 0;
  const refreshedPage = deferred<CrmLeadListPage>();
  const controller = new LeadPaginationController(
    QUERY,
    async (_query, options) => {
      if (options.cursor) {
        return page([lead('00000000-0000-4000-8000-000000000002')]);
      }
      firstLoads += 1;
      return firstLoads === 1
        ? page([lead('00000000-0000-4000-8000-000000000001')], 'next')
        : refreshedPage.promise;
    }
  );

  await controller.loadFirst();
  await controller.loadMore();
  const refresh = controller.refresh();
  assert.equal(controller.getState().nextCursor, null);
  assert.equal(controller.getState().hasMore, false);
  assert.equal(controller.getState().refreshing, true);
  refreshedPage.resolve(page([lead('00000000-0000-4000-8000-000000000003')]));
  await refresh;
  assert.deepEqual(
    controller.getState().items.map((item) => item.id),
    ['00000000-0000-4000-8000-000000000003']
  );
  assert.equal(controller.getState().nextCursor, null);
});

test('merges and deduplicates pages by source-qualified identity', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const merged = mergeLeadPages(
    [{ ...lead(id, 'organic'), first_name: 'Old' }, lead(id, 'meta')],
    [{ ...lead(id, 'organic'), first_name: 'Updated' }]
  );
  assert.equal(merged.length, 2);
  assert.equal(
    merged.find((item) => item.source === 'organic')?.first_name,
    'Updated'
  );
});

test('coalesces repeated onEndReached calls while loading more', async () => {
  const nextPage = deferred<CrmLeadListPage>();
  let nextCalls = 0;
  const controller = new LeadPaginationController(
    QUERY,
    async (_query, options) => {
      if (!options.cursor) {
        return page([lead('00000000-0000-4000-8000-000000000001')], 'next');
      }
      nextCalls += 1;
      return nextPage.promise;
    }
  );
  await controller.loadFirst();

  const calls = [
    controller.loadMore(),
    controller.loadMore(),
    controller.loadMore(),
  ];
  assert.equal(nextCalls, 1);
  nextPage.resolve(page([lead('00000000-0000-4000-8000-000000000002')]));
  await Promise.all(calls);
  assert.equal(nextCalls, 1);
});

test('ignores a stale response after search/filter query changes', async () => {
  const oldRequest = deferred<CrmLeadListPage>();
  const newRequest = deferred<CrmLeadListPage>();
  const oldRequestState: { signal: AbortSignal | null } = { signal: null };
  const controller = new LeadPaginationController(QUERY, (query, options) => {
    if (query.search === 'new') return newRequest.promise;
    oldRequestState.signal = options.signal;
    return oldRequest.promise;
  });

  const first = controller.loadFirst();
  const changed = controller.setQuery({
    ...QUERY,
    search: 'new',
    status: 'qualified',
  });
  assert.equal(oldRequestState.signal?.aborted, true);
  newRequest.resolve(page([lead('00000000-0000-4000-8000-000000000002')]));
  await changed;
  oldRequest.resolve(page([lead('00000000-0000-4000-8000-000000000001')]));
  await first;

  assert.deepEqual(
    controller.getState().items.map((item) => item.id),
    ['00000000-0000-4000-8000-000000000002']
  );
});

test('dispose cancels an active request without publishing late state', async () => {
  const request = deferred<CrmLeadListPage>();
  const captured: { signal: AbortSignal | null } = { signal: null };
  const controller = new LeadPaginationController(
    QUERY,
    async (_query, options) => {
      captured.signal = options.signal;
      return request.promise;
    }
  );
  const loading = controller.loadFirst();
  controller.dispose();
  assert.equal(captured.signal?.aborted, true);
  request.resolve(page([lead('00000000-0000-4000-8000-000000000001')]));
  await loading;
  assert.equal(controller.getState().items.length, 0);
});

test('exposes empty, error, and retry states', async () => {
  let attempts = 0;
  const controller = new LeadPaginationController(QUERY, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Temporary failure');
    return page([]);
  });

  await controller.loadFirst();
  assert.equal(controller.getState().error, 'Temporary failure');
  assert.equal(controller.getState().items.length, 0);
  await controller.retry();
  assert.equal(controller.getState().error, null);
  assert.equal(controller.getState().items.length, 0);
  assert.equal(attempts, 2);
});

test('retries a failed continuation without discarding the first page', async () => {
  let continuationAttempts = 0;
  const controller = new LeadPaginationController(
    QUERY,
    async (_query, options) => {
      if (!options.cursor) {
        return page([lead('00000000-0000-4000-8000-000000000001')], 'next');
      }
      continuationAttempts += 1;
      if (continuationAttempts === 1) throw new Error('Load more failed');
      return page([lead('00000000-0000-4000-8000-000000000002')]);
    }
  );
  await controller.loadFirst();
  await controller.loadMore();
  assert.equal(controller.getState().items.length, 1);
  await controller.retry();
  assert.equal(controller.getState().items.length, 2);
  assert.equal(continuationAttempts, 2);
});
