import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================================
// Types
// ============================================================================

export interface AiLeadAttention {
  needsAttention: boolean;
  priority: number; // 1-5, 1 = highest
  badge: string; // Short display label like "High: Call Today"
  reason: string;
  suggestedAction: string;
}

export interface AiAttentionData extends AiLeadAttention {
  leadId: string;
  fromCache: boolean;
  loading: boolean;
  error?: string;
}

export interface UseAiLeadAttentionResult {
  /** Map of lead ID to attention data */
  attentionMap: Map<string, AiAttentionData>;
  /** Fetch attention for a single lead */
  fetchAttention: (leadId: string, force?: boolean) => Promise<AiAttentionData | null>;
  /** Fetch attention for multiple leads (batch). Set force=true to re-fetch and get fresh AI analysis. */
  fetchBatchAttention: (leadIds: string[], force?: boolean) => Promise<void>;
  /** Check if any leads are currently loading */
  isLoading: boolean;
  /** Get attention data for a specific lead */
  getAttention: (leadId: string) => AiAttentionData | null;
  /** Get count of leads needing attention */
  attentionCount: number;
  /** Invalidate cache for a lead and re-fetch fresh AI analysis. Call after logging activity. */
  invalidateAttention: (leadId: string) => Promise<void>;
}

// ============================================================================
// Supabase Direct Query - Read from lead_attention_cache table
// ============================================================================

interface CacheRow {
  lead_id: string;
  needs_attention: boolean;
  priority: number;
  badge: string;
  reason: string;
  suggested_action: string;
}

async function fetchAttentionFromSupabase(leadIds: string[]): Promise<Map<string, AiAttentionData>> {
  const results = new Map<string, AiAttentionData>();
  
  if (leadIds.length === 0) return results;

  console.log('[useAiLeadAttention] Querying Supabase for', leadIds.length, 'leads');

  try {
    const { data, error } = await supabase
      .from('lead_attention_cache')
      .select('lead_id, needs_attention, priority, badge, reason, suggested_action')
      .in('lead_id', leadIds);

    if (error) {
      console.error('[useAiLeadAttention] Supabase error:', error.message);
      return results;
    }

    if (data) {
      console.log('[useAiLeadAttention] Got', data.length, 'cached results from Supabase');
      for (const row of data as CacheRow[]) {
        results.set(row.lead_id, {
          leadId: row.lead_id,
          needsAttention: row.needs_attention,
          priority: row.priority,
          badge: row.badge || '',
          reason: row.reason || '',
          suggestedAction: row.suggested_action || '',
          fromCache: true,
          loading: false,
        });
      }
    }

    return results;
  } catch (error: any) {
    console.error('[useAiLeadAttention] Error querying Supabase:', error?.message || error);
    return results;
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useAiLeadAttention(): UseAiLeadAttentionResult {
  const [attentionMap, setAttentionMap] = useState<Map<string, AiAttentionData>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const pendingFetches = useRef<Set<string>>(new Set());

  // Fetch attention for a single lead from Supabase
  const fetchAttention = useCallback(async (leadId: string, _force = false): Promise<AiAttentionData | null> => {
    if (pendingFetches.current.has(leadId)) {
      return attentionMap.get(leadId) || null;
    }

    pendingFetches.current.add(leadId);

    try {
      const results = await fetchAttentionFromSupabase([leadId]);
      const result = results.get(leadId) || null;
      
      if (result) {
        setAttentionMap(prev => {
          const next = new Map(prev);
          next.set(leadId, result);
          return next;
        });
      }
      return result;
    } finally {
      pendingFetches.current.delete(leadId);
    }
  }, [attentionMap]);

  // Fetch attention for multiple leads from Supabase (fast!)
  const fetchBatchAttention = useCallback(async (leadIds: string[], _force = false): Promise<void> => {
    if (leadIds.length === 0) return;

    setIsLoading(true);

    try {
      // Query Supabase directly - much faster than API
      const results = await fetchAttentionFromSupabase(leadIds);

      console.log('[useAiLeadAttention] Got', results.size, 'results from Supabase for', leadIds.length, 'leads');
      
      if (results.size > 0) {
        setAttentionMap(prev => {
          const next = new Map(prev);
          results.forEach((value: AiAttentionData, key: string) => next.set(key, value));
          console.log('[useAiLeadAttention] Updated attentionMap, now has', next.size, 'entries');
          return next;
        });
      } else {
        console.log('[useAiLeadAttention] No cached results in lead_attention_cache table');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getAttention = useCallback((leadId: string): AiAttentionData | null => {
    return attentionMap.get(leadId) || null;
  }, [attentionMap]);

  // Invalidate just clears local state and re-fetches from Supabase
  const invalidateAttention = useCallback(async (leadId: string): Promise<void> => {
    setAttentionMap(prev => {
      const next = new Map(prev);
      next.delete(leadId);
      return next;
    });

    // Re-fetch from Supabase
    await fetchAttention(leadId, true);
  }, [fetchAttention]);

  const attentionCount = Array.from(attentionMap.values()).filter(a => a.needsAttention).length;

  return {
    attentionMap,
    fetchAttention,
    fetchBatchAttention,
    isLoading,
    getAttention,
    attentionCount,
    invalidateAttention,
  };
}
