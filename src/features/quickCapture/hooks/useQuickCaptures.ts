// src/features/quickCapture/hooks/useQuickCaptures.ts
// Hook for managing quick captures list state with search, filters, and refresh

import { useState, useEffect, useCallback, useRef } from 'react';
import { listQuickCaptures } from '../services/quickCaptureService';
import type { QuickCapture, QuickCaptureStatus } from '../types';

interface UseQuickCapturesOptions {
  autoFetch?: boolean;
}

interface UseQuickCapturesResult {
  captures: QuickCapture[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: QuickCaptureStatus | undefined;
  setStatusFilter: (s: QuickCaptureStatus | undefined) => void;
  refresh: () => Promise<void>;
  onRefresh: () => void;
}

const DEBOUNCE_MS = 300;

export function useQuickCaptures(
  options: UseQuickCapturesOptions = {}
): UseQuickCapturesResult {
  const { autoFetch = true } = options;

  const [captures, setCaptures] = useState<QuickCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuickCaptureStatus | undefined>('open');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Debounce search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const { data, error: fetchError } = await listQuickCaptures({
          status: statusFilter,
          query: debouncedSearch || undefined,
        });

        if (fetchError) {
          setError(fetchError.message);
          setCaptures([]);
        } else {
          setCaptures(data);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch quick captures');
        setCaptures([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch, statusFilter]
  );

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [fetchData, autoFetch]);

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  return {
    captures,
    loading,
    refreshing,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    refresh,
    onRefresh,
  };
}
