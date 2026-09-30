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

test('search keeps visible results and counts while resetting pagination', async () => {
  const searchPage = deferred<CrmLeadListPage>();
  const original = {
    ...page([lead('original')], 'old-cursor'),
    totalCount: 12,
    searchTotal: 15,
    facets: {
      total: 15,
      tracked: 0,
      organic: 15,
      meta: 0,
      facebook: 0,
      instagram: 0,
      loandock: 0,
      active: 12,
      archived: 3,
      unreadSms: 0,
      needsAttention: 0,
      newThisWeek: 0,
      ownerTotal: 15,
      unassignedOwner: 0,
      statuses: { new: 12 },
      ads: {},
      sourceDetails: {},
      metaSourceKeys: {},
      organicSourceKeys: {},
      loanOfficers: {},
    },
  };
  const requests: { search: string | undefined; cursor: string | null; includeFacets: boolean }[] = [];
  const controller = new LeadPaginationController(QUERY, (query, options) => {
    requests.push({
      search: query.search,
      cursor: options.cursor,
      includeFacets: options.includeFacets,
    });
    return query.search ? searchPage.promise : Promise.resolve(original);
  });
  await controller.loadFirst();

  const search = controller.setQuery({ ...QUERY, search: 'matching' });
  const pending = controller.getState();
  assert.deepEqual(pending.items, original.items);
  assert.equal(pending.totalCount, 12);
  assert.equal(pending.searchTotal, 15);
  assert.deepEqual(pending.facets, original.facets);
  assert.equal(pending.loading, false);
  assert.equal(pending.refreshing, false);
  assert.equal(pending.searching, true);
  assert.equal(pending.nextCursor, null);
  assert.equal(pending.hasMore, false);
  await controller.loadMore();
  assert.deepEqual(requests, [
    { search: undefined, cursor: null, includeFacets: true },
    { search: 'matching', cursor: null, includeFacets: true },
  ]);

  searchPage.resolve(page([lead('matching')], 'matching-cursor'));
  await search;
  assert.deepEqual(controller.getState().items.map((item) => item.id), ['matching']);
  assert.equal(controller.getState().totalCount, 1);
  assert.equal(controller.getState().nextCursor, 'matching-cursor');
  assert.equal(controller.getState().hasMore, true);
  assert.equal(controller.getState().searching, false);
});

test('an empty search replaces previous results and clearing it stays in the background', async () => {
  const emptySearch = deferred<CrmLeadListPage>();
  const clearedSearch = deferred<CrmLeadListPage>();
  let calls = 0;
  const controller = new LeadPaginationController(QUERY, () => {
    calls += 1;
    if (calls === 1) return Promise.resolve(page([lead('original')]));
    return calls === 2 ? emptySearch.promise : clearedSearch.promise;
  });
  await controller.loadFirst();

  const search = controller.setQuery({ ...QUERY, search: 'no matches' });
  emptySearch.resolve(page([]));
  await search;
  assert.deepEqual(controller.getState().items, []);
  assert.equal(controller.getState().totalCount, 0);
  assert.equal(controller.getState().searching, false);

  const clear = controller.setQuery({ ...QUERY, search: '' });
  assert.deepEqual(controller.getState().items, []);
  assert.equal(controller.getState().loading, false);
  assert.equal(controller.getState().refreshing, false);
  assert.equal(controller.getState().searching, true);
  clearedSearch.resolve(page([lead('restored')]));
  await clear;
  assert.deepEqual(controller.getState().items.map((item) => item.id), ['restored']);
});

test('failed searches preserve populated or empty results and retry in the background', async (t) => {
  for (const originalItems of [[lead('original')], []]) {
    await t.test(originalItems.length ? 'populated results' : 'empty results', async () => {
      const failedSearch = deferred<CrmLeadListPage>();
      const retriedSearch = deferred<CrmLeadListPage>();
      let searchCalls = 0;
      const controller = new LeadPaginationController(QUERY, (query) => {
        if (!query.search) return Promise.resolve(page(originalItems));
        searchCalls += 1;
        return searchCalls === 1 ? failedSearch.promise : retriedSearch.promise;
      });
      await controller.loadFirst();

      const search = controller.setQuery({ ...QUERY, search: 'matching' });
      failedSearch.reject(new Error('Search unavailable'));
      await search;
      assert.deepEqual(controller.getState().items, originalItems);
      assert.equal(controller.getState().error, 'Search unavailable');
      assert.equal(controller.getState().searching, false);

      const retry = controller.retry();
      assert.deepEqual(controller.getState().items, originalItems);
      assert.equal(controller.getState().error, null);
      assert.equal(controller.getState().loading, false);
      assert.equal(controller.getState().refreshing, false);
      assert.equal(controller.getState().searching, true);
      retriedSearch.resolve(page([lead('matching')]));
      await retry;
      assert.deepEqual(controller.getState().items.map((item) => item.id), ['matching']);
      assert.equal(controller.getState().searching, false);
      assert.equal(searchCalls, 2);
    });
  }
});

test('superseded searches cannot replace results or end the current search', async () => {
  const oldSearch = deferred<CrmLeadListPage>();
  const latestSearch = deferred<CrmLeadListPage>();
  const signals: AbortSignal[] = [];
  const controller = new LeadPaginationController(QUERY, (query, options) => {
    if (!query.search) return Promise.resolve(page([lead('original')]));
    signals.push(options.signal);
    return query.search === 'ma' ? oldSearch.promise : latestSearch.promise;
  });
  await controller.loadFirst();

  const old = controller.setQuery({ ...QUERY, search: 'ma' });
  const latest = controller.setQuery({ ...QUERY, search: 'mario' });
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  oldSearch.resolve(page([lead('stale')]));
  await old;
  assert.deepEqual(controller.getState().items.map((item) => item.id), ['original']);
  assert.equal(controller.getState().searching, true);
  latestSearch.resolve(page([lead('latest')]));
  await latest;
  assert.deepEqual(controller.getState().items.map((item) => item.id), ['latest']);
  assert.equal(controller.getState().searching, false);
});

test('scope and filter changes clear previous results and cancel an active search', async (t) => {
  for (const change of [{ scope: 'realtor' as const }, { status: 'qualified' }]) {
    await t.test('scope' in change ? 'scope change' : 'filter change', async () => {
      const searchPage = deferred<CrmLeadListPage>();
      const changedPage = deferred<CrmLeadListPage>();
      let searchSignal: AbortSignal | undefined;
      let calls = 0;
      const controller = new LeadPaginationController(QUERY, (_query, options) => {
        calls += 1;
        if (calls === 1) return Promise.resolve(page([lead('original')], 'old-cursor'));
        if (calls === 2) {
          searchSignal = options.signal;
          return searchPage.promise;
        }
        return changedPage.promise;
      });
      await controller.loadFirst();

      const search = controller.setQuery({ ...QUERY, search: 'matching' });
      const changeQuery = controller.setQuery({ ...QUERY, search: 'matching', ...change });
      assert.equal(searchSignal?.aborted, true);
      assert.deepEqual(controller.getState().items, []);
      assert.equal(controller.getState().totalCount, 0);
      assert.equal(controller.getState().facets, null);
      assert.equal(controller.getState().loading, true);
      assert.equal(controller.getState().searching, false);
      searchPage.resolve(page([lead('stale')]));
      await search;
      assert.deepEqual(controller.getState().items, []);
      assert.equal(controller.getState().loading, true);
      changedPage.resolve(page([lead('allowed')]));
      await changeQuery;
      assert.deepEqual(controller.getState().items.map((item) => item.id), ['allowed']);
      assert.equal(controller.getState().loading, false);
    });
  }
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
