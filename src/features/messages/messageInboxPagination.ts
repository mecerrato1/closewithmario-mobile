import type { MessageInboxPage, MessageInboxQuery } from './messageInboxClient';
import type { ConversationSummary } from './messageTypes';

export type MessageInboxState = {
  items: ConversationSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
};

type PageLoader = (
  query: MessageInboxQuery,
  options: {
    cursor: string | null;
    includeScenarioUpdates: boolean;
    signal: AbortSignal;
  }
) => Promise<MessageInboxPage>;

const EMPTY_STATE: MessageInboxState = {
  items: [],
  nextCursor: null,
  hasMore: false,
  totalCount: 0,
  loading: true,
  refreshing: false,
  loadingMore: false,
  error: null,
};

function sortConversations(conversations: ConversationSummary[]) {
  return [...conversations].sort((left, right) => {
    const scenarioDifference =
      Number(right.channel === 'scenario_update') -
      Number(left.channel === 'scenario_update');
    if (scenarioDifference !== 0) return scenarioDifference;
    const unreadDifference =
      Number(right.unreadCount > 0) - Number(left.unreadCount > 0);
    if (unreadDifference !== 0) return unreadDifference;
    const timeDifference =
      new Date(right.latestMessageAt).getTime() -
      new Date(left.latestMessageAt).getTime();
    return timeDifference || left.key.localeCompare(right.key);
  });
}

export function mergeConversationPages(
  current: ConversationSummary[],
  incoming: ConversationSummary[],
  replace = false
) {
  const byKey = new Map<string, ConversationSummary>();
  if (!replace) {
    current.forEach((conversation) =>
      byKey.set(conversation.key, conversation)
    );
  }
  incoming.forEach((conversation) => {
    const existing = byKey.get(conversation.key);
    byKey.set(
      conversation.key,
      existing ? { ...existing, ...conversation } : conversation
    );
  });
  return sortConversations(Array.from(byKey.values()));
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Failed to load conversations';
}

export class MessageInboxPaginationController {
  private state: MessageInboxState = { ...EMPTY_STATE };
  private query: MessageInboxQuery;
  private generation = 0;
  private activeRequest: AbortController | null = null;
  private disposed = false;
  private failedMode: 'first' | 'refresh' | 'more' = 'first';
  private listeners = new Set<(state: MessageInboxState) => void>();

  constructor(query: MessageInboxQuery, private readonly loadPage: PageLoader) {
    this.query = query;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (state: MessageInboxState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async setQuery(query: MessageInboxQuery) {
    if (JSON.stringify(query) === JSON.stringify(this.query)) return false;
    this.query = query;
    await this.run('first');
    return true;
  }

  loadFirst() {
    return this.run('first');
  }

  refresh() {
    return this.run('refresh');
  }

  reload(includeScenarioUpdates = true) {
    return this.run('background', includeScenarioUpdates);
  }

  loadMore() {
    if (
      this.disposed ||
      this.state.loading ||
      this.state.refreshing ||
      this.state.loadingMore ||
      !this.state.hasMore ||
      !this.state.nextCursor
    ) {
      return Promise.resolve();
    }
    return this.run('more');
  }

  retry() {
    if (this.failedMode === 'more' && this.state.nextCursor) {
      return this.run('more');
    }
    return this.state.items.length > 0
      ? this.run('refresh')
      : this.run('first');
  }

  markRead(key: string) {
    this.setState({
      items: sortConversations(
        this.state.items.map((conversation) =>
          conversation.key === key
            ? { ...conversation, unreadCount: 0 }
            : conversation
        )
      ),
    });
  }

  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.listeners.clear();
  }

  private setState(patch: Partial<MessageInboxState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private async run(
    mode: 'first' | 'refresh' | 'background' | 'more',
    includeScenarioUpdates = mode !== 'more'
  ): Promise<void> {
    if (this.disposed) return;
    if (mode === 'more' && this.state.loadingMore) return;

    const generation = mode === 'more' ? this.generation : ++this.generation;
    if (mode !== 'more') this.activeRequest?.abort();
    const request = new AbortController();
    this.activeRequest = request;
    const cursor = mode === 'more' ? this.state.nextCursor : null;

    this.setState({
      loading: mode === 'first',
      refreshing: mode === 'refresh',
      loadingMore: mode === 'more',
      error: null,
      ...(mode === 'first'
        ? {
            items: [],
            nextCursor: null,
            hasMore: false,
            totalCount: 0,
          }
        : mode === 'refresh' || mode === 'background'
        ? { nextCursor: null, hasMore: false }
        : {}),
    });

    try {
      const page = await this.loadPage(this.query, {
        cursor,
        includeScenarioUpdates,
        signal: request.signal,
      });
      if (
        this.disposed ||
        request.signal.aborted ||
        generation !== this.generation
      ) {
        return;
      }
      const retainedScenarioItems =
        mode !== 'first' &&
        (!includeScenarioUpdates || page.scenarioUpdatesLoaded === false)
          ? this.state.items.filter(
              (conversation) => conversation.channel === 'scenario_update'
            )
          : [];
      const incomingItems =
        mode !== 'more' && retainedScenarioItems.length > 0
          ? [...retainedScenarioItems, ...page.items]
          : page.items;
      this.setState({
        items: mergeConversationPages(
          this.state.items,
          incomingItems,
          mode !== 'more'
        ),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        totalCount: page.totalCount + retainedScenarioItems.length,
        loading: false,
        refreshing: false,
        loadingMore: false,
      });
    } catch (error) {
      if (
        this.disposed ||
        request.signal.aborted ||
        generation !== this.generation
      ) {
        return;
      }
      this.failedMode =
        mode === 'more' ? 'more' : mode === 'first' ? 'first' : 'refresh';
      this.setState({
        loading: false,
        refreshing: false,
        loadingMore: false,
        error: errorMessage(error),
      });
    } finally {
      if (this.activeRequest === request) this.activeRequest = null;
    }
  }
}

export class MessageInboxRealtimeReloadQueue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private queued = false;
  private includeScenarioUpdates = false;
  private disposed = false;

  constructor(
    private readonly reload: (includeScenarioUpdates: boolean) => Promise<void>,
    private readonly debounceMs = 250
  ) {}

  schedule(includeScenarioUpdates = false) {
    if (this.disposed) return;
    this.includeScenarioUpdates =
      this.includeScenarioUpdates || includeScenarioUpdates;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, this.debounceMs);
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queued = false;
    this.includeScenarioUpdates = false;
  }

  private async drain() {
    if (this.disposed) return;
    if (this.running) {
      this.queued = true;
      return;
    }

    this.running = true;
    const includeScenarioUpdates = this.includeScenarioUpdates;
    this.includeScenarioUpdates = false;
    try {
      await this.reload(includeScenarioUpdates);
    } finally {
      this.running = false;
      if (!this.disposed && (this.queued || this.includeScenarioUpdates)) {
        this.queued = false;
        this.schedule(false);
      }
    }
  }
}
