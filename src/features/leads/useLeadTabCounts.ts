import { useEffect, useState } from 'react';

import { fetchCrmLeadListPage, type CrmLeadListQuery } from './crmLeadApi';
import type { LeadListTab } from './leadListPresentation';
import { fetchOtherTabCounts, type LeadTabCounts } from './leadTabCounts';

/**
 * `totalCount` is the open tab's total: a change to it (refresh, a lead added or moved)
 * recounts the others.
 */
export function useLeadTabCounts(
  query: CrmLeadListQuery,
  activeTab: LeadListTab,
  totalCount: number,
  enabled: boolean
): LeadTabCounts {
  // Filters only: the platform is replaced per tab, so switching tabs keeps the key's filters.
  const filterKey = JSON.stringify({ ...query, platform: undefined });
  const [result, setResult] = useState<{ key: string; counts: LeadTabCounts }>({
    key: '',
    counts: {},
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetchOtherTabCounts(
      JSON.parse(filterKey) as CrmLeadListQuery,
      activeTab,
      fetchCrmLeadListPage,
      controller.signal
    ).then((counts) => {
      if (controller.signal.aborted) return;
      setResult((previous) => ({
        key: filterKey,
        counts: previous.key === filterKey ? { ...previous.counts, ...counts } : counts,
      }));
    });
    return () => controller.abort();
  }, [filterKey, activeTab, totalCount, enabled]);

  // Never show counts that belong to different filters.
  return result.key === filterKey ? result.counts : {};
}
