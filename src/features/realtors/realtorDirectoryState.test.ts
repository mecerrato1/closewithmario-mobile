import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AssignedRealtor } from '../../lib/types/realtors';
import {
  filterAndSortRealtors,
  getRealtorDirectoryPageState,
  mergeRealtorPages,
} from './realtorDirectoryState';

function realtor(
  id: string,
  patch: Partial<AssignedRealtor> = {}
): AssignedRealtor {
  return {
    assignment_id: `assignment-${id}`,
    lo_user_id: 'lo-1',
    relationship_stage: 'warm',
    assignment_notes: null,
    last_touched_at: '2026-01-01T00:00:00.000Z',
    assigned_at: '2026-01-01T00:00:00.000Z',
    realtor_id: id,
    first_name: 'Realtor',
    last_name: id,
    phone: null,
    email: null,
    brokerage: null,
    active: true,
    lead_eligible: true,
    campaign_eligible: true,
    email_opt_out: false,
    preferred_language: 'en',
    secondary_language: null,
    county_filter: null,
    profile_picture_url: null,
    ai_draft_access: false,
    notes: null,
    realtor_created_at: '2026-01-01T00:00:00.000Z',
    lead_count: 0,
    ...patch,
  };
}

test('mergeRealtorPages deduplicates by realtor identity and keeps the newest row', () => {
  const merged = mergeRealtorPages(
    [realtor('one', { lead_count: 1 }), realtor('two')],
    [realtor('one', { lead_count: 3 }), realtor('three')]
  );

  assert.deepEqual(
    merged.map((item) => item.realtor_id),
    ['one', 'two', 'three']
  );
  assert.equal(merged[0].lead_count, 3);
});

test('filterAndSortRealtors preserves search and stage filters across loaded pages', () => {
  const filtered = filterAndSortRealtors(
    [
      realtor('one', {
        first_name: 'Ana',
        last_name: 'Torres',
        brokerage: 'Home Partners',
        relationship_stage: 'hot',
        lead_count: 4,
      }),
      realtor('two', {
        first_name: 'Ben',
        last_name: 'Smith',
        brokerage: 'Home Partners',
        relationship_stage: 'cold',
        lead_count: 8,
      }),
      realtor('three', {
        first_name: 'Cara',
        last_name: 'Jones',
        relationship_stage: 'hot',
        lead_count: 1,
      }),
    ],
    {
      search: 'home',
      stage: 'hot',
    }
  );

  assert.deepEqual(
    filtered.map((item) => item.realtor_id),
    ['one']
  );
});

test('filterAndSortRealtors orders loaded matches by count then name', () => {
  const sorted = filterAndSortRealtors([
    realtor('one', { first_name: 'Zoe', last_name: 'Able', lead_count: 2 }),
    realtor('two', { first_name: 'Amy', last_name: 'Baker', lead_count: 5 }),
    realtor('three', { first_name: 'Ana', last_name: 'Able', lead_count: 2 }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.realtor_id),
    ['two', 'three', 'one']
  );
});

test('directory continuation uses the exact server total', () => {
  assert.deepEqual(getRealtorDirectoryPageState(0, 50, 50), {
    nextOffset: 50,
    hasMore: false,
    totalCount: 50,
  });
  assert.deepEqual(getRealtorDirectoryPageState(50, 25, 90), {
    nextOffset: 75,
    hasMore: true,
    totalCount: 90,
  });
  assert.deepEqual(getRealtorDirectoryPageState(75, 15, 90), {
    nextOffset: 90,
    hasMore: false,
    totalCount: 90,
  });
});

test('directory client consolidates each page into one server-filtered RPC', () => {
  const source = readFileSync('src/lib/supabase/realtors.ts', 'utf8');
  const start = source.indexOf(
    'export async function fetchRealtorDirectoryPage'
  );
  const end = source.indexOf(
    'export async function fetchAssignedRealtors',
    start
  );
  const directoryClient = source.slice(start, end);

  assert.match(directoryClient, /get_crm_realtor_directory_page/);
  assert.match(directoryClient, /p_search: search\?\.trim\(\) \|\| null/);
  assert.match(directoryClient, /p_stage: stage/);
  assert.match(directoryClient, /p_active_only: includeAll/);
  assert.match(directoryClient, /response\.totalCount/);
  assert.doesNotMatch(directoryClient, /\.from\('realtor_assignments'\)/);
  assert.doesNotMatch(directoryClient, /get_realtor_lead_counts(?:_for_lo)?/);
});

test('directory query changes abort stale work and reset pagination', () => {
  const hook = readFileSync('src/hooks/useRealtors.ts', 'utf8');

  assert.match(
    hook,
    /abortRef\.current\?\.abort\(\)[\s\S]*offsetRef\.current = 0/
  );
  assert.match(
    hook,
    /search: debouncedSearch \|\| undefined[\s\S]*stage: stageFilter/
  );
  assert.match(hook, /\[debouncedSearch, stageFilter, userId, userRole\]/);
  assert.match(hook, /setTotalCount\(result\.data\.totalCount\)/);
});
