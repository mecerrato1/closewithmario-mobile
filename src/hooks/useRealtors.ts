// src/hooks/useRealtors.ts
// Hook for managing realtor list state with search, filters, and refresh

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAssignedRealtors, fetchNeedsLoveRealtors } from '../lib/supabase/realtors';
import type { AssignedRealtor, RelationshipStage } from '../lib/types/realtors';

interface UseRealtorsOptions {
  userId: string | undefined;
  autoFetch?: boolean;
}

interface UseRealtorsResult {
  realtors: AssignedRealtor[];
  needsLoveRealtors: AssignedRealtor[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  stageFilter: RelationshipStage | 'all';
  setStageFilter: (stage: RelationshipStage | 'all') => void;
  refresh: () => Promise<void>;
  onRefresh: () => void;
}

const DEBOUNCE_MS = 300;

export function useRealtors({ userId, autoFetch = true }: UseRealtorsOptions): UseRealtorsResult {
  const [realtors, setRealtors] = useState<AssignedRealtor[]>([]);
  const [needsLoveRealtors, setNeedsLoveRealtors] = useState<AssignedRealtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<RelationshipStage | 'all'>('all');
  
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchQuery]);

  // Fetch realtors
  const fetchData = useCallback(async (isRefresh = false) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch main list
      const { data, error: fetchError } = await fetchAssignedRealtors(userId, {
        search: debouncedSearch || undefined,
        stage: stageFilter,
      });

      if (fetchError) {
        setError(fetchError.message);
        setRealtors([]);
      } else {
        setRealtors(data || []);
      }

      // Fetch "needs love" realtors (only if no search/filter active)
      if (!debouncedSearch && stageFilter === 'all') {
        const { data: needsLove } = await fetchNeedsLoveRealtors(userId, 5);
        setNeedsLoveRealtors(needsLove || []);
      } else {
        setNeedsLoveRealtors([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch realtors');
      setRealtors([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, debouncedSearch, stageFilter]);

  // Auto-fetch on mount and when filters change
  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [fetchData, autoFetch]);

  // Manual refresh
  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  return {
    realtors,
    needsLoveRealtors,
    loading,
    refreshing,
    error,
    searchQuery,
    setSearchQuery,
    stageFilter,
    setStageFilter,
    refresh,
    onRefresh,
  };
}
