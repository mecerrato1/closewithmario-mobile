import assert from 'node:assert/strict';
import test from 'node:test';
import type { MessageInboxPage, MessageInboxQuery } from './messageInboxClient';
import type { ConversationSummary } from './messageTypes';
import {
  MessageInboxRealtimeReloadQueue,
  mergeConversationPages,
  MessageInboxPaginationController,
} from './messageInboxPagination';

const QUERY: MessageInboxQuery = {
  userId: 'user-1',
  search: '',
  unreadOnly: false,
};

function conversation(
  key: string,
  patch: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    key,
    channel: 'sms',
    conversationId: null,
    leadId: key.split(':').at(-1) || 'lead',
    source: 'lead',
    leadName: 'Test Lead',
    leadEmail: null,
    platform: null,
    phone: '+13055550100',
    preview: 'Hello',
    latestMessageAt: '2026-01-01T00:00:00.000Z',
    latestDirection: 'inbound',
    unreadCount: 0,
    isAutomated: false,
    smsOptIn: true,
    smsOptedOut: false,
    ...patch,
  };
}

function page(
  items: ConversationSummary[],
  nextCursor: string | null = null
): MessageInboxPage {
  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    totalCount: items.length,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test('loads a first conversation page and continues with its cursor', async () => {
  const cursors: Array<string | null> = [];
  const controller = new MessageInboxPaginationController(
    QUERY,
    async (_query, options) => {
      cursors.push(options.cursor);
      return options.cursor
        ? page([conversation('sms:organic:two')])
        : page([conversation('sms:organic:one')], 'next');
    }
  );

  await controller.loadFirst();
  await controller.loadMore();
  assert.deepEqual(cursors, [null, 'next']);
  assert.deepEqual(
    controller.getState().items.map((item) => item.key),
    ['sms:organic:one', 'sms:organic:two']
  );
});

test('refresh resets pagination immediately and atomically replaces old pages', async () => {
  let firstPageCalls = 0;
  const refreshed = deferred<MessageInboxPage>();
  const controller = new MessageInboxPaginationController(
    QUERY,
    async (_query, options) => {
      if (options.cursor) return page([conversation('sms:organic:two')]);
      firstPageCalls += 1;
      return firstPageCalls === 1
        ? page([conversation('sms:organic:one')], 'next')
        : refreshed.promise;
    }
  );
  await controller.loadFirst();
  await controller.loadMore();
  const refresh = controller.refresh();
  assert.equal(controller.getState().nextCursor, null);
  assert.equal(controller.getState().hasMore, false);
  assert.equal(controller.getState().refreshing, true);
  refreshed.resolve(page([conversation('sms:organic:three')]));
  await refresh;
  assert.deepEqual(
    controller.getState().items.map((item) => item.key),
    ['sms:organic:three']
  );
});

test('merges and deduplicates pages by stable conversation key', () => {
  const merged = mergeConversationPages(
    [
      conversation('sms:organic:one', { preview: 'Old' }),
      conversation('dm:two'),
    ],
    [conversation('sms:organic:one', { preview: 'Updated' })]
  );
  assert.equal(merged.length, 2);
  assert.equal(
    merged.find((item) => item.key === 'sms:organic:one')?.preview,
    'Updated'
  );
});

test('keeps scenario updates in a stable section ahead of paginated messages', async () => {
  const scenario = conversation('scenario_update:organic:one', {
    channel: 'scenario_update',
    latestMessageAt: '2025-01-01T00:00:00.000Z',
  });
  let calls = 0;
  const controller = new MessageInboxPaginationController(
    QUERY,
    async (_query, options) => {
      calls += 1;
      if (calls === 1) {
        return {
          ...page(
            [
              conversation('sms:organic:newer', {
                latestMessageAt: '2026-02-01T00:00:00.000Z',
              }),
              scenario,
            ],
            'next'
          ),
          totalCount: 3,
        };
      }
      assert.equal(options.includeScenarioUpdates, false);
      return {
        ...page([
          conversation('sms:organic:older', {
            latestMessageAt: '2026-01-01T00:00:00.000Z',
          }),
        ]),
        totalCount: 2,
      };
    }
  );

  await controller.loadFirst();
  await controller.loadMore();
  assert.deepEqual(
    controller.getState().items.map((item) => item.key),
    ['scenario_update:organic:one', 'sms:organic:newer', 'sms:organic:older']
  );
  assert.equal(controller.getState().totalCount, 3);
});

test('coalesces repeated end-reached calls while loading more', async () => {
  const continuation = deferred<MessageInboxPage>();
  let continuationCalls = 0;
  const controller = new MessageInboxPaginationController(
    QUERY,
    async (_query, options) => {
      if (!options.cursor) {
        return page([conversation('sms:organic:one')], 'next');
      }
      continuationCalls += 1;
      return continuation.promise;
    }
  );
  await controller.loadFirst();
  const calls = [
    controller.loadMore(),
    controller.loadMore(),
    controller.loadMore(),
  ];
  assert.equal(continuationCalls, 1);
  continuation.resolve(page([conversation('sms:organic:two')]));
  await Promise.all(calls);
  assert.equal(continuationCalls, 1);
});

test('query changes abort and ignore stale search/filter responses', async () => {
  const original = deferred<MessageInboxPage>();
  const changed = deferred<MessageInboxPage>();
  const originalSignal: { value: AbortSignal | null } = { value: null };
  const controller = new MessageInboxPaginationController(
    QUERY,
    (query, options) => {
      if (query.search === 'Ada') return changed.promise;
      originalSignal.value = options.signal;
      return original.promise;
    }
  );

  const first = controller.loadFirst();
  const queryChange = controller.setQuery({
    ...QUERY,
    search: 'Ada',
    unreadOnly: true,
  });
  assert.equal(originalSignal.value?.aborted, true);
  changed.resolve(page([conversation('sms:organic:new')]));
  await queryChange;
  original.resolve(page([conversation('sms:organic:stale')]));
  await first;
  assert.deepEqual(
    controller.getState().items.map((item) => item.key),
    ['sms:organic:new']
  );
});

test('dispose cancels active work and error/empty states can retry', async () => {
  const pending = deferred<MessageInboxPage>();
  const signal: { value: AbortSignal | null } = { value: null };
  const disposed = new MessageInboxPaginationController(
    QUERY,
    async (_query, options) => {
      signal.value = options.signal;
      return pending.promise;
    }
  );
  const loading = disposed.loadFirst();
  disposed.dispose();
  assert.equal(signal.value?.aborted, true);
  pending.resolve(page([conversation('sms:organic:late')]));
  await loading;
  assert.equal(disposed.getState().items.length, 0);

  let attempts = 0;
  const retrying = new MessageInboxPaginationController(QUERY, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Temporary failure');
    return page([]);
  });
  await retrying.loadFirst();
  assert.equal(retrying.getState().error, 'Temporary failure');
  await retrying.retry();
  assert.equal(retrying.getState().error, null);
  assert.equal(retrying.getState().items.length, 0);
});

test('realtime bursts run one reload plus at most one queued follow-up', async () => {
  const first = deferred<void>();
  const calls: boolean[] = [];
  const queue = new MessageInboxRealtimeReloadQueue(
    async (includeScenarioUpdates) => {
      calls.push(includeScenarioUpdates);
      if (calls.length === 1) await first.promise;
    },
    0
  );

  queue.schedule(false);
  queue.schedule(false);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(calls, [false]);

  queue.schedule(false);
  queue.schedule(true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(calls, [false]);

  first.resolve();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls, [false, true]);
  queue.dispose();
});
