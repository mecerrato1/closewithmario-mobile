// Exact counts for the lead list tabs that are not currently open.
//
// The list response's per-source facets include unqualified leads and ignore the active
// filters, so they would not match what a tab shows when opened. Instead ask the list
// endpoint for the same query on each other tab and read its total.

import type { CrmLeadListQuery } from './crmLeadApi';
import type { LeadListTab } from './leadListPresentation';

const PLATFORM: Record<LeadListTab, 'all' | 'organic' | 'meta'> = {
  all: 'all',
  leads: 'organic',
  meta: 'meta',
};

export type LeadTabCounts = Partial<Record<LeadListTab, number>>;

type CountPage = (
  query: CrmLeadListQuery,
  options: { includeFacets: boolean; signal?: AbortSignal }
) => Promise<{ totalCount: number }>;

/** A tab whose count cannot be read is left out; the others are still returned. */
export async function fetchOtherTabCounts(
  query: CrmLeadListQuery,
  activeTab: LeadListTab,
  fetchPage: CountPage,
  signal?: AbortSignal
): Promise<LeadTabCounts> {
  const counts: LeadTabCounts = {};
  await Promise.all(
    (Object.keys(PLATFORM) as LeadListTab[])
      .filter((tab) => tab !== activeTab)
      .map(async (tab) => {
        try {
          const page = await fetchPage(
            { ...query, platform: PLATFORM[tab], limit: 1 },
            { includeFacets: false, signal }
          );
          counts[tab] = page.totalCount;
        } catch {
          // Shown as unknown rather than guessed.
        }
      })
  );
  return counts;
}
