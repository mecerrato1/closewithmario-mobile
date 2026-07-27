import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssignedRealtor } from '../../lib/types/realtors';
import {
  filterAndSortRealtors,
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
