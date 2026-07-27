import {
  crmLeadKey,
  type CrmLeadFacets,
  type CrmLeadListPage,
  type CrmLeadListQuery,
  type CrmLeadSummary,
} from './crmLeadApi';

export type LeadPaginationState = {
  items: CrmLeadSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  searchTotal: number;
  facets: CrmLeadFacets | null;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
};

type PageLoader = (
  query: CrmLeadListQuery,
  options: {
    cursor: string | null;
    includeFacets: boolean;
    signal: AbortSignal;
  }
) => Promise<CrmLeadListPage>;

const EMPTY_STATE: LeadPaginationState = {
  items: [],
  nextCursor: null,
  hasMore: false,
  totalCount: 0,
  searchTotal: 0,
  facets: null,
  loading: false,
  refreshing: false,
  loadingMore: false,
  error: null,
};

export function mergeLeadPages(
  current: CrmLeadSummary[],
  next: CrmLeadSummary[],
  replace = false
) {
  const merged = new Map<string, CrmLeadSummary>();
  if (!replace) current.forEach((lead) => merged.set(crmLeadKey(lead), lead));
  next.forEach((lead) => {
    const key = crmLeadKey(lead);
    merged.set(key, { ...(merged.get(key) ?? {}), ...lead });
  });
  return Array.from(merged.values());
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : 'Could not load leads.';
}

export class LeadPaginationController {
  private state: LeadPaginationState = { ...EMPTY_STATE };
  private query: CrmLeadListQuery;
  private generation = 0;
  private activeRequest: AbortController | null = null;
  private disposed = false;
  private failedMode: 'first' | 'refresh' | 'more' = 'first';
  private listeners = new Set<(state: LeadPaginationState) => void>();

  constructor(query: CrmLeadListQuery, private readonly loadPage: PageLoader) {
    this.query = query;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (state: LeadPaginationState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async setQuery(query: CrmLeadListQuery) {
    if (JSON.stringify(query) === JSON.stringify(this.query)) return false;
    this.query = query;
    await this.loadFirst();
    return true;
  }

  loadFirst() {
    return this.run('first');
  }

  refresh() {
    return this.run('refresh');
  }

  retry() {
    if (this.failedMode === 'more' && this.state.nextCursor) {
      return this.run('more');
    }
    return this.state.items.length > 0
      ? this.run('refresh')
      : this.run('first');
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

  updateItem(
    source: 'organic' | 'meta',
    id: string,
    patch: Record<string, unknown>
  ) {
    let unreadConversationDelta = 0;
    this.setState({
      items: this.state.items.map((item) => {
        if (item.source !== source || item.id !== id) return item;
        if ('unread_sms_count' in patch) {
          const wasUnread = (Number(item.unread_sms_count) || 0) > 0;
          const isUnread = (Number(patch.unread_sms_count) || 0) > 0;
          unreadConversationDelta += Number(isUnread) - Number(wasUnread);
        }
        return { ...item, ...patch };
      }),
      facets:
        this.state.facets && unreadConversationDelta !== 0
          ? {
              ...this.state.facets,
              unreadSms: Math.max(
                0,
                this.state.facets.unreadSms + unreadConversationDelta
              ),
            }
          : this.state.facets,
    });
  }

  upsertItem(item: CrmLeadSummary, prepend = true) {
    const without = this.state.items.filter(
      (existing) => crmLeadKey(existing) !== crmLeadKey(item)
    );
    this.setState({ items: prepend ? [item, ...without] : [...without, item] });
  }

  removeItem(source: 'organic' | 'meta', id: string) {
    this.setState({
      items: this.state.items.filter(
        (item) => item.source !== source || item.id !== id
      ),
      totalCount: Math.max(0, this.state.totalCount - 1),
    });
  }

  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.listeners.clear();
  }

  private setState(patch: Partial<LeadPaginationState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private async run(mode: 'first' | 'refresh' | 'more') {
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
            searchTotal: 0,
            facets: null,
          }
        : mode === 'refresh'
        ? { nextCursor: null, hasMore: false }
        : {}),
    });

    try {
      const page = await this.loadPage(this.query, {
        cursor,
        includeFacets: mode !== 'more',
        signal: request.signal,
      });
      if (
        this.disposed ||
        request.signal.aborted ||
        generation !== this.generation
      )
        return;
      this.setState({
        items: mergeLeadPages(this.state.items, page.items, mode !== 'more'),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        totalCount: page.totalCount,
        searchTotal: page.searchTotal,
        facets: page.facets ?? this.state.facets,
        loading: false,
        refreshing: false,
        loadingMore: false,
      });
    } catch (error) {
      if (
        this.disposed ||
        request.signal.aborted ||
        generation !== this.generation
      )
        return;
      this.failedMode = mode;
      this.setState({
        loading: false,
        refreshing: false,
        loadingMore: false,
        error: messageFromError(error),
      });
    } finally {
      if (this.activeRequest === request) this.activeRequest = null;
    }
  }
}
