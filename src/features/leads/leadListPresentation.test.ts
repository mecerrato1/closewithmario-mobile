import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrmLeadFacets } from './crmLeadApi';
import {
  DASHBOARD_LEAD_FILTERS,
  getLeadTabCount,
  getSourceOptionCount,
  getStatusOptionCount,
  shouldOpenNotificationLead,
  type LeadCountContext,
} from './leadListPresentation';

const FACETS: CrmLeadFacets = {
  total: 100,
  tracked: 5,
  organic: 60,
  meta: 40,
  facebook: 20,
  instagram: 20,
  loandock: 0,
  active: 90,
  archived: 10,
  unreadSms: 4,
  needsAttention: 6,
  newThisWeek: 7,
  ownerTotal: 100,
  unassignedOwner: 10,
  statuses: { new: 30, qualified: 20, unqualified: 10 },
  ads: {},
  sourceDetails: {},
  metaSourceKeys: {},
  organicSourceKeys: {},
  loanOfficers: {},
};

function context(patch: Partial<LeadCountContext> = {}): LeadCountContext {
  return {
    activeTab: 'all',
    selectedStatus: 'all',
    selectedSource: 'all',
    selectedOwnerLoId: null,
    needsAttention: false,
    unreadOnly: false,
    trackedOnly: false,
    totalCount: 90,
    facets: FACETS,
    ...patch,
  };
}

test('notification navigation waits for role readiness, not list pagination', () => {
  const notification = { id: 'lead-id' };
  assert.equal(shouldOpenNotificationLead(notification, false), false);
  assert.equal(shouldOpenNotificationLead(notification, true), true);
  assert.equal(shouldOpenNotificationLead(null, true), false);
});

test('dashboard reset restores the complete all-source lead query', () => {
  assert.deepEqual(DASHBOARD_LEAD_FILTERS, {
    activeTab: 'all',
    status: 'all',
    source: 'all',
    ownerLoId: null,
    needsAttention: false,
    unreadOnly: false,
    trackedOnly: false,
    search: '',
  });
});

test('tab counts use the exact total for the active platform query', () => {
  const filtered = context({
    activeTab: 'meta',
    selectedOwnerLoId: 'loan-officer-id',
    totalCount: 7,
  });
  assert.equal(getLeadTabCount('meta', filtered), 7);
  assert.equal(getLeadTabCount('all', filtered), null);
  assert.equal(getLeadTabCount('leads', filtered), null);
});

test('all-platform tab uses the exact prospective server status facet', () => {
  assert.equal(
    getLeadTabCount(
      'all',
      context({ activeTab: 'meta', selectedStatus: 'qualified' })
    ),
    20
  );
  assert.equal(getLeadTabCount('all', context({ activeTab: 'leads' })), 90);
});

test('selected status uses the exact filtered total instead of loaded items', () => {
  const filtered = context({
    selectedStatus: 'qualified',
    selectedOwnerLoId: 'loan-officer-id',
    totalCount: 73,
  });
  assert.equal(getStatusOptionCount('qualified', filtered), 73);
  assert.equal(getStatusOptionCount('new', filtered), null);
});

test('uncontextualized status options use server facets', () => {
  const unfiltered = context({ selectedStatus: 'new', totalCount: 30 });
  assert.equal(getStatusOptionCount('qualified', unfiltered), 20);
  assert.equal(getStatusOptionCount('all', unfiltered), 90);
});

test('alternate status counts are omitted when facets do not match context', () => {
  for (const filtered of [
    context({ activeTab: 'leads' }),
    context({ selectedSource: 'referral' }),
    context({ selectedOwnerLoId: 'loan-officer-id' }),
    context({ needsAttention: true }),
    context({ unreadOnly: true }),
    context({ trackedOnly: true }),
  ]) {
    assert.equal(getStatusOptionCount('new', filtered), null);
  }
});

test('source options never fall back to a loaded-page count', () => {
  const selected = context({ selectedSource: 'referral', totalCount: 12 });
  assert.equal(getSourceOptionCount('referral', selected), 12);
  assert.equal(getSourceOptionCount('facebook', selected), null);
});
