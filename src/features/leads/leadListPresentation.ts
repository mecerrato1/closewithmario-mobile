import type { CrmLeadFacets } from './crmLeadApi';

export type LeadListTab = 'all' | 'leads' | 'meta';

export const DASHBOARD_LEAD_FILTERS = {
  activeTab: 'all',
  status: 'all',
  source: 'all',
  ownerLoId: null,
  needsAttention: false,
  unreadOnly: false,
  trackedOnly: false,
  search: '',
} as const;

export type LeadCountContext = {
  activeTab: LeadListTab;
  selectedStatus: string;
  selectedSource: string;
  selectedOwnerLoId: string | null;
  needsAttention: boolean;
  unreadOnly: boolean;
  trackedOnly: boolean;
  totalCount: number;
  facets: CrmLeadFacets | null;
};

export function shouldOpenNotificationLead(
  notificationLead: unknown,
  roleReady: boolean
) {
  return Boolean(notificationLead) && roleReady;
}

/**
 * The list endpoint's totalCount includes every active filter. Platform facets
 * intentionally do not; status facets can additionally provide the exact
 * prospective all-platform count when no other contextual filter is active.
 */
export function getLeadTabCount(
  tab: LeadListTab,
  context: LeadCountContext
): number | null {
  if (tab === context.activeTab) return context.totalCount;

  if (
    tab === 'all' &&
    context.facets &&
    context.selectedSource === 'all' &&
    context.selectedOwnerLoId === null &&
    !context.needsAttention &&
    !context.unreadOnly &&
    !context.trackedOnly
  ) {
    if (context.selectedStatus === 'all') {
      return Math.max(
        0,
        context.facets.total - (context.facets.statuses.unqualified ?? 0)
      );
    }
    return context.facets.statuses[context.selectedStatus] ?? 0;
  }

  return null;
}

function canUseStatusFacets(context: LeadCountContext) {
  return (
    context.activeTab === 'all' &&
    context.selectedSource === 'all' &&
    context.selectedOwnerLoId === null &&
    !context.needsAttention &&
    !context.unreadOnly &&
    !context.trackedOnly
  );
}

/**
 * Status facets are search/scope scoped and can describe a prospective status
 * selection only when no other contextual filter is active. The selected
 * status always uses totalCount because that is the exact current query.
 */
export function getStatusOptionCount(
  status: string,
  context: LeadCountContext
): number | null {
  if (status === context.selectedStatus) return context.totalCount;
  if (!context.facets || !canUseStatusFacets(context)) return null;

  if (status === 'all') {
    return Math.max(
      0,
      context.facets.total - (context.facets.statuses.unqualified ?? 0)
    );
  }

  return context.facets.statuses[status] ?? 0;
}

/**
 * Source facets are search/scope scoped and do not include the active status,
 * owner, platform, or quick filters. Only the currently selected source (or
 * All Sources) has an exact contextual count through totalCount.
 */
export function getSourceOptionCount(
  source: string,
  context: LeadCountContext
): number | null {
  return source === context.selectedSource ? context.totalCount : null;
}
