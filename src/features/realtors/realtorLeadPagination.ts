import type {
  RealtorLeadPage,
  RealtorLinkedLead,
} from './realtorLeadApi';

export type RealtorLeadPaginationState = {
  items: RealtorLinkedLead[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
};

type PageLoader = (
  realtorId: string,
  options: { cursor: string | null; signal: AbortSignal }
) => Promise<RealtorLeadPage>;

const EMPTY_STATE: RealtorLeadPaginationState = {
  items: [],
  nextCursor: null,
  hasMore: false,
  totalCount: 0,
  loading: false,
  refreshing: false,
  loadingMore: false,
  error: null,
};

function leadKey(lead: RealtorLinkedLead) {
  return `${lead.source}:${lead.id}`;
}

export function mergeRealtorLeadPages(
  current: RealtorLinkedLead[],
  incoming: RealtorLinkedLead[],
  replace = false
) {
  const merged = new Map<string, RealtorLinkedLead>();
  if (!replace) current.forEach((lead) => merged.set(leadKey(lead), lead));
  incoming.forEach((lead) => merged.set(leadKey(lead), lead));
  return Array.from(merged.values());
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Could not load this realtor’s leads.';
}

export class RealtorLeadPaginationController {
  private state: RealtorLeadPaginationState = { ...EMPTY_STATE };
  private realtorId: string;
  private generation = 0;
  private activeRequest: AbortController | null = null;
  private disposed = false;
  private failedMode: 'first' | 'refresh' | 'more' = 'first';
  private listeners = new Set<(state: RealtorLeadPaginationState) => void>();

  constructor(realtorId: string, private readonly loadPage: PageLoader) {
    this.realtorId = realtorId;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (state: RealtorLeadPaginationState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async setRealtor(realtorId: string) {
    if (realtorId === this.realtorId) return false;
    this.realtorId = realtorId;
    await this.loadFirst();
    return true;
  }

  loadFirst() {
    return this.run('first');
  }

  refresh() {
    return this.run('refresh');
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

  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.listeners.clear();
  }

  private setState(patch: Partial<RealtorLeadPaginationState>) {
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
          }
        : mode === 'refresh'
          ? { nextCursor: null, hasMore: false }
          : {}),
    });

    try {
      const page = await this.loadPage(this.realtorId, {
        cursor,
        signal: request.signal,
      });
      if (
        this.disposed ||
        request.signal.aborted ||
        generation !== this.generation
      ) {
        return;
      }
      this.setState({
        items: mergeRealtorLeadPages(
          this.state.items,
          page.items,
          mode !== 'more'
        ),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        totalCount: page.totalCount,
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
      this.failedMode = mode;
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
