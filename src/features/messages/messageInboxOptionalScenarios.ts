export type OptionalScenarioLoadResult<T> = {
  items: T[];
  loaded: boolean;
};

export type BoundedScenarioPage<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type BoundedScenarioPages<T> = {
  items: T[];
  truncated: boolean;
};

type OptionalScenarioDeadlineOptions = {
  signal?: AbortSignal;
  timeoutMs: number;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

export async function collectBoundedScenarioPages<T>(
  loadPage: (cursor: string | null) => Promise<BoundedScenarioPage<T>>,
  getKey: (item: T) => string,
  maxPages: number
): Promise<BoundedScenarioPages<T>> {
  const itemsByKey = new Map<string, T>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await loadPage(cursor);
    page.items.forEach((item) => {
      const key = getKey(item);
      if (!itemsByKey.has(key)) itemsByKey.set(key, item);
    });
    if (!page.hasMore) {
      return { items: Array.from(itemsByKey.values()), truncated: false };
    }
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
      throw new Error('The scenario update pagination response was invalid.');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return { items: Array.from(itemsByKey.values()), truncated: true };
}

export async function settleOptionalScenarioLoad<T>(
  load: Promise<T[]>,
  signal?: AbortSignal
): Promise<OptionalScenarioLoadResult<T>> {
  try {
    return { items: await load, loaded: true };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    return { items: [], loaded: false };
  }
}

export async function loadOptionalScenariosWithDeadline<T>(
  load: (signal: AbortSignal) => Promise<T[]>,
  options: OptionalScenarioDeadlineOptions
): Promise<OptionalScenarioLoadResult<T>> {
  if (options.signal?.aborted) {
    const error = new Error('Request cancelled');
    error.name = 'AbortError';
    throw error;
  }

  const controller = new AbortController();
  let deadlineReached = false;
  const handleOuterAbort = () => controller.abort();
  options.signal?.addEventListener('abort', handleOuterAbort, { once: true });

  let timeout: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<OptionalScenarioLoadResult<T>>((resolve) => {
    timeout = setTimeout(() => {
      deadlineReached = true;
      controller.abort();
      resolve({ items: [], loaded: false });
    }, options.timeoutMs);
  });

  const settled = settleOptionalScenarioLoad(
    load(controller.signal),
    options.signal
  ).catch((error) => {
    if (deadlineReached && !options.signal?.aborted && isAbortError(error)) {
      return { items: [], loaded: false };
    }
    throw error;
  });

  try {
    return await Promise.race([settled, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener('abort', handleOuterAbort);
  }
}
