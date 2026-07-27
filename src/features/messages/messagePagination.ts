export const MESSAGE_HISTORY_PAGE_SIZE = 50;

export type HistoryMessageIdentity = {
  id: string;
  created_at: string;
};

export type HistoryCursor = {
  id: string;
  createdAt: string;
};

export type HistoryPage<T> = {
  items: T[];
  hasOlder: boolean;
};

export function mergeChronologicalMessages<T extends HistoryMessageIdentity>(
  existing: T[],
  incoming: T[]
): T[] {
  const byId = new Map<string, T>();
  existing.forEach((message) => byId.set(message.id, message));
  incoming.forEach((message) => byId.set(message.id, message));

  return Array.from(byId.values()).sort((left, right) => {
    const timestampDifference =
      new Date(left.created_at).getTime() -
      new Date(right.created_at).getTime();
    return timestampDifference || left.id.localeCompare(right.id);
  });
}

export function parseDescendingHistoryPage<T extends HistoryMessageIdentity>(
  rows: T[],
  pageSize = MESSAGE_HISTORY_PAGE_SIZE
): HistoryPage<T> {
  const hasOlder = rows.length > pageSize;
  return {
    items: rows.slice(0, pageSize).reverse(),
    hasOlder,
  };
}

export function getOldestHistoryCursor<T extends HistoryMessageIdentity>(
  messages: T[]
): HistoryCursor | null {
  const oldest = messages[0];
  return oldest ? { id: oldest.id, createdAt: oldest.created_at } : null;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export class LatestRequestGate {
  private version = 0;
  private activeController: AbortController | null = null;

  begin(options: { cancelActive?: boolean } = {}) {
    if (options.cancelActive !== false) {
      this.activeController?.abort();
    }

    const controller = new AbortController();
    const version = ++this.version;
    this.activeController = controller;

    return {
      version,
      signal: controller.signal,
    };
  }

  isCurrent(request: { version: number; signal: AbortSignal }) {
    return request.version === this.version && !request.signal.aborted;
  }

  finish(request: { version: number }) {
    if (request.version === this.version) {
      this.activeController = null;
    }
  }

  cancel() {
    this.version += 1;
    this.activeController?.abort();
    this.activeController = null;
  }
}
