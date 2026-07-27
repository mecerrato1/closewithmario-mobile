// Hook for managing the caller-authorized, paginated realtor directory.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchRealtorDirectoryPage } from '../lib/supabase/realtors';
import {
  filterAndSortRealtors,
  mergeRealtorPages,
} from '../features/realtors/realtorDirectoryState';
import type { AssignedRealtor, RelationshipStage } from '../lib/types/realtors';
import type { UserRole } from '../lib/roles';

interface UseRealtorsOptions {
  userId: string | undefined;
  autoFetch?: boolean;
  userRole?: UserRole;
}

interface UseRealtorsResult {
  realtors: AssignedRealtor[];
  needsLoveRealtors: AssignedRealtor[];
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  hasMore: boolean;
  loadedCount: number;
  totalCount: number;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  stageFilter: RelationshipStage | 'all';
  setStageFilter: (stage: RelationshipStage | 'all') => void;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
  onRefresh: () => void;
}

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

function isCancelled(error: Error | null, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    error?.name === 'AbortError' ||
    error?.message === 'Request cancelled'
  );
}

export function useRealtors({
  userId,
  autoFetch = true,
  userRole,
}: UseRealtorsOptions): UseRealtorsResult {
  const [directoryRealtors, setDirectoryRealtors] = useState<AssignedRealtor[]>(
    []
  );
  const [loading, setLoading] = useState(autoFetch);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<RelationshipStage | 'all'>(
    'all'
  );
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const failedModeRef = useRef<'first' | 'more'>('first');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      abortRef.current?.abort();
      inFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(
      () => setDebouncedSearch(searchQuery),
      DEBOUNCE_MS
    );
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  const loadFirstPage = useCallback(
    async (isRefresh: boolean, clearExisting: boolean) => {
      generationRef.current += 1;
      const generation = generationRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;
      offsetRef.current = 0;
      hasMoreRef.current = false;
      setHasMore(false);
      setLoadingMore(false);
      setError(null);

      if (clearExisting) {
        setDirectoryRealtors([]);
        setTotalCount(0);
      }
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      if (!userId) {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const result = await fetchRealtorDirectoryPage({
        loUserId: userId,
        includeAll: userRole === 'super_admin' || userRole === 'admin',
        search: debouncedSearch || undefined,
        stage: stageFilter,
        offset: 0,
        pageSize: PAGE_SIZE,
        signal: controller.signal,
      });

      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        controller.signal.aborted
      ) {
        return;
      }

      if (result.error || !result.data) {
        if (!isCancelled(result.error, controller.signal)) {
          failedModeRef.current = 'first';
          setError(result.error?.message || 'Failed to load realtors');
        }
      } else {
        setDirectoryRealtors(result.data.data);
        offsetRef.current = result.data.nextOffset;
        hasMoreRef.current = result.data.hasMore;
        setHasMore(result.data.hasMore);
        setTotalCount(result.data.totalCount);
      }

      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    },
    [debouncedSearch, stageFilter, userId, userRole]
  );

  const loadMore = useCallback(async () => {
    if (!userId || inFlightRef.current || !hasMoreRef.current) return;

    const generation = generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    setLoadingMore(true);
    setError(null);

    const result = await fetchRealtorDirectoryPage({
      loUserId: userId,
      includeAll: userRole === 'super_admin' || userRole === 'admin',
      search: debouncedSearch || undefined,
      stage: stageFilter,
      offset: offsetRef.current,
      pageSize: PAGE_SIZE,
      signal: controller.signal,
    });

    if (
      !mountedRef.current ||
      generation !== generationRef.current ||
      controller.signal.aborted
    ) {
      return;
    }

    if (result.error || !result.data) {
      if (!isCancelled(result.error, controller.signal)) {
        failedModeRef.current = 'more';
        setError(result.error?.message || 'Failed to load more realtors');
      }
    } else {
      setDirectoryRealtors((current) =>
        mergeRealtorPages(current, result.data!.data)
      );
      offsetRef.current = result.data.nextOffset;
      hasMoreRef.current = result.data.hasMore;
      setHasMore(result.data.hasMore);
      setTotalCount(result.data.totalCount);
    }

    inFlightRef.current = false;
    setLoadingMore(false);
  }, [debouncedSearch, stageFilter, userId, userRole]);

  useEffect(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    inFlightRef.current = false;
    offsetRef.current = 0;
    hasMoreRef.current = false;
    setDirectoryRealtors([]);
    setHasMore(false);
    setTotalCount(0);
    setLoadingMore(false);
    setRefreshing(false);
    setError(null);

    if (autoFetch && userId) {
      void loadFirstPage(false, true);
    } else {
      setLoading(false);
    }
  }, [autoFetch, loadFirstPage, userId, userRole]);

  const realtors = directoryRealtors;

  const needsLoveRealtors = useMemo(
    () =>
      filterAndSortRealtors(directoryRealtors, { needsLove: true })
        .sort((a, b) => {
          const aTime = Date.parse(a.last_touched_at) || 0;
          const bTime = Date.parse(b.last_touched_at) || 0;
          return aTime - bTime;
        })
        .slice(0, 5),
    [directoryRealtors]
  );

  const refresh = useCallback(
    () => loadFirstPage(true, false),
    [loadFirstPage]
  );

  const retry = useCallback(
    () =>
      failedModeRef.current === 'more'
        ? loadMore()
        : loadFirstPage(directoryRealtors.length > 0, false),
    [directoryRealtors.length, loadFirstPage, loadMore]
  );

  const onRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  return {
    realtors,
    needsLoveRealtors,
    loading,
    loadingMore,
    refreshing,
    hasMore,
    loadedCount: directoryRealtors.length,
    totalCount,
    error,
    searchQuery,
    setSearchQuery,
    stageFilter,
    setStageFilter,
    loadMore,
    retry,
    refresh,
    onRefresh,
  };
}
