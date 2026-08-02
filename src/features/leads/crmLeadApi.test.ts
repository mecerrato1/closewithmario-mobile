import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  fetchCrmLeadActivitiesPage,
  fetchCrmLeadActivityBody,
  fetchCrmLeadDetailBootstrap,
  fetchCrmLeadListPage,
  getCrmLeadSourceKey,
  parseCrmLeadListPage,
} from './crmLeadApi';

const LEAD_ID = 'd21da98c-7cf2-4204-9cc3-8ce2e007a123';

test('lead page parser preserves server source and unassigned facets', () => {
  const page = parseCrmLeadListPage({
    items: [{ id: LEAD_ID, source: 'organic' }],
    nextCursor: null,
    hasMore: false,
    totalCount: 1,
    searchTotal: 10,
    facets: {
      total: 10,
      tracked: 1,
      organic: 7,
      meta: 3,
      facebook: 2,
      instagram: 1,
      loandock: 0,
      active: 8,
      archived: 2,
      unread_sms: 1,
      needs_attention: 2,
      new_this_week: 3,
      owner_total: 9,
      unassigned_owner: 4,
      statuses: { new: 5 },
      ads: { Campaign: 2 },
      source_details: { Referral: 3 },
      meta_source_keys: {
        Campaign: 2,
        Shared: 1,
      },
      organic_source_keys: {
        Referral: 3,
        Shared: 2,
      },
      loan_officers: {},
    },
  });

  assert.equal(page.facets?.ownerTotal, 9);
  assert.equal(page.facets?.unassignedOwner, 4);
  assert.deepEqual(page.facets?.sourceDetails, { Referral: 3 });
  assert.deepEqual(page.facets?.metaSourceKeys, {
    Campaign: 2,
    Shared: 1,
  });
  assert.deepEqual(page.facets?.organicSourceKeys, {
    Referral: 3,
    Shared: 2,
  });
});

test('lead page request sends enhanced filters through the authenticated API contract', async () => {
  let requestedUrl = '';
  const page = await fetchCrmLeadListPage(
    {
      scope: 'all',
      search: 'x',
      status: 'all',
      platform: 'organic',
      ownerLoId: 'unassigned',
      sourceKey: 'Partner Referral',
      excludeUnqualified: true,
      needsAttention: true,
      unreadOnly: true,
      trackedOnly: true,
    },
    {
      request: async (url) => {
        requestedUrl = url;
        return new Response(
          JSON.stringify({
            items: [],
            nextCursor: null,
            hasMore: false,
            totalCount: 0,
            searchTotal: 0,
            facets: null,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    }
  );

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('ownerLoId'), 'unassigned');
  assert.equal(url.searchParams.has('search'), false);
  assert.equal(url.searchParams.get('sourceKey'), 'Partner Referral');
  assert.equal(url.searchParams.get('excludeUnqualified'), '1');
  assert.equal(url.searchParams.get('needsAttention'), '1');
  assert.equal(url.searchParams.get('unreadOnly'), '1');
  assert.equal(url.searchParams.get('trackedOnly'), '1');
  assert.equal(page.items.length, 0);
});

test('source keys use the same source-specific fallbacks as the server', () => {
  assert.equal(
    getCrmLeadSourceKey(
      {
        ad_name: ' ',
        source_detail: 'Meta Detail',
        campaign_name: 'Campaign',
      },
      'meta'
    ),
    'Meta Detail'
  );
  assert.equal(
    getCrmLeadSourceKey({ campaign_name: 'Campaign' }, 'meta'),
    'Campaign'
  );
  assert.equal(getCrmLeadSourceKey({}, 'meta'), 'meta');
  assert.equal(
    getCrmLeadSourceKey(
      { source_detail: ' ', db_source: 'Organic Import', source: 'ignored' },
      'organic'
    ),
    'Organic Import'
  );
  assert.equal(getCrmLeadSourceKey({}, 'organic'), 'organic');
});

test('mobile detail bootstrap requests the bounded profile and accepts the focused response', async () => {
  let requestedUrl = '';
  const bootstrap = await fetchCrmLeadDetailBootstrap(LEAD_ID, 'organic', {
    request: async (url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({
        leadId: LEAD_ID,
        leadSource: 'organic',
        lead: {
          id: LEAD_ID,
          source: 'organic',
          db_source: 'My Lead',
          created_at: '2026-01-01T00:00:00.000Z',
          first_name: 'Mobile',
          last_name: 'Lead',
          email: null,
          phone: null,
          status: 'new',
        },
        activities: [],
        activitiesNextCursor: null,
        contacts: [],
        realtorRoles: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('profile'), 'mobile');
  assert.equal(url.searchParams.get('activityBodyMode'), 'summary');
  assert.equal(bootstrap.activitiesNextCursor, null);
  assert.equal(Object.hasOwn(bootstrap, 'documentRequests'), false);
});

test('mobile activity continuation stays on the summary API contract', async () => {
  let requestedUrl = '';
  const page = await fetchCrmLeadActivitiesPage(LEAD_ID, 'organic', {
    cursor: 'opaque-cursor',
    request: async (url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({
        activities: [{
          id: 'activity-1',
          activity_type: 'email',
          notes: 'Email received',
          created_at: '2026-01-02T00:00:00.000Z',
          has_audio: false,
          has_body: true,
          subject: 'Hello',
          body: '<p>Unexpected eager body</p>',
        }],
        nextCursor: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('profile'), 'mobile');
  assert.equal(url.searchParams.get('activityBodyMode'), 'summary');
  assert.equal(url.searchParams.get('cursor'), 'opaque-cursor');
  assert.equal(page.activities[0].has_body, true);
  assert.equal(Object.hasOwn(page.activities[0], 'body'), false);
});

test('email bodies use the focused authenticated endpoint only when requested', async () => {
  let requestedUrl = '';
  const result = await fetchCrmLeadActivityBody(
    LEAD_ID,
    'organic',
    'activity-1',
    {
      request: async (url) => {
        requestedUrl = url;
        return new Response(JSON.stringify({
          activityId: 'activity-1',
          body: '<p>Hello</p>',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    }
  );

  const url = new URL(requestedUrl);
  assert.equal(url.pathname, '/api/leads/activity-body');
  assert.equal(url.searchParams.get('profile'), 'mobile');
  assert.equal(result.body, '<p>Hello</p>');
});

test('lead detail activity history no longer selects full bodies directly', () => {
  const screen = readFileSync('src/screens/LeadDetailScreen.tsx', 'utf8');
  assert.match(screen, /fetchCrmLeadActivitiesPage/);
  assert.match(screen, /useLeadActivityBodies/);
  assert.doesNotMatch(screen, /const ACTIVITY_FIELDS/);
  assert.doesNotMatch(screen, /\.select\([^\n]*body[^\n]*\)/);
});
