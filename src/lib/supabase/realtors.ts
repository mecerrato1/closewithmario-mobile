// src/lib/supabase/realtors.ts
// Data access layer for Realtor CRM features

import { supabase } from '../supabase';
import type {
  AssignedRealtor,
  CreateRealtorPayload,
  UpdateAssignmentPayload,
  RealtorActivity,
  RealtorActivityType,
  RelationshipStage,
  LanguageCode,
} from '../types/realtors';
import {
  filterAndSortRealtors,
  getRealtorDirectoryPageState,
} from '../../features/realtors/realtorDirectoryState';

// ============================================================================
// Fetch Assigned Realtors
// ============================================================================

export interface FetchRealtorsOptions {
  search?: string;
  stage?: RelationshipStage | 'all';
  needsLove?: boolean;
  offset?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

interface RealtorDirectoryRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  brokerage: string | null;
  profile_picture_url: string | null;
  active: boolean | null;
  lead_eligible: boolean | null;
  campaign_eligible: boolean | null;
  email_opt_out: boolean | null;
  ai_draft_access: boolean | null;
  preferred_language: string | null;
  secondary_language: string | null;
  county_filter: string[] | null;
  notes: string | null;
  realtor_created_at: string | null;
  assignment_id: string | null;
  assignment_lo_user_id: string | null;
  assignment_stage: string | null;
  assignment_notes: string | null;
  assignment_last_touched_at: string | null;
  assignment_created_at: string | null;
  lead_count: number | string | null;
  relationship_stage: string | null;
}

interface RealtorDirectoryResponse {
  items?: unknown;
  totalCount?: unknown;
}

export interface RealtorDirectoryPage {
  data: AssignedRealtor[];
  offset: number;
  nextOffset: number;
  hasMore: boolean;
  totalCount: number;
}

const DEFAULT_DIRECTORY_PAGE_SIZE = 50;
const VALID_LANGUAGES = new Set(['en', 'es', 'pt', 'fr', 'ht', 'zh']);

function getStageFromLeadCount(count: number): RelationshipStage {
  if (count >= 2) return 'hot';
  if (count === 1) return 'warm';
  return 'cold';
}

function normalizeRelationshipStage(
  value: string | null,
  leadCount: number
): RelationshipStage {
  return value === 'hot' || value === 'warm' || value === 'cold'
    ? value
    : getStageFromLeadCount(leadCount);
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function isRealtorDirectoryRow(value: unknown): value is RealtorDirectoryRow {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

function normalizeLanguage(
  value: string | null,
  fallback: LanguageCode | null
): LanguageCode | null {
  return value && VALID_LANGUAGES.has(value)
    ? (value as LanguageCode)
    : fallback;
}

/**
 * Fetch one caller-authorized directory page. The RPC applies search and stage
 * filters and returns assignment metadata, counts, and exact pagination totals.
 */
export async function fetchRealtorDirectoryPage({
  loUserId,
  includeAll,
  search,
  stage = 'all',
  offset = 0,
  pageSize = DEFAULT_DIRECTORY_PAGE_SIZE,
  signal,
}: {
  loUserId: string;
  includeAll: boolean;
  search?: string;
  stage?: RelationshipStage | 'all';
  offset?: number;
  pageSize?: number;
  signal?: AbortSignal;
}): Promise<{ data: RealtorDirectoryPage | null; error: Error | null }> {
  try {
    let directoryQuery = supabase.rpc('get_crm_realtor_directory_page', {
      p_include_all: includeAll,
      p_search: search?.trim() || null,
      p_stage: stage,
      p_active_only: includeAll,
      p_page_size: pageSize,
      p_offset: offset,
    });
    if (signal) directoryQuery = directoryQuery.abortSignal(signal);

    const { data: directoryData, error: directoryError } = await directoryQuery;
    if (directoryError) {
      return { data: null, error: new Error(directoryError.message) };
    }
    if (signal?.aborted) {
      return { data: null, error: new Error('Request cancelled') };
    }

    if (
      !directoryData ||
      typeof directoryData !== 'object' ||
      Array.isArray(directoryData)
    ) {
      return {
        data: null,
        error: new Error('Invalid realtor directory response'),
      };
    }

    const response = directoryData as RealtorDirectoryResponse;
    if (
      !Array.isArray(response.items) ||
      !response.items.every(isRealtorDirectoryRow)
    ) {
      return {
        data: null,
        error: new Error('Invalid realtor directory response'),
      };
    }

    const rows = response.items as RealtorDirectoryRow[];
    const mapped = rows.map((row): AssignedRealtor => {
      const leadCount = normalizeNonNegativeNumber(row.lead_count, 0);
      return {
        assignment_id: row.assignment_id || null,
        lo_user_id: row.assignment_lo_user_id || loUserId,
        relationship_stage: normalizeRelationshipStage(
          row.relationship_stage || row.assignment_stage,
          leadCount
        ),
        assignment_notes: row.assignment_notes || null,
        last_touched_at:
          row.assignment_last_touched_at || row.assignment_created_at || '',
        assigned_at: row.assignment_created_at || '',
        realtor_id: row.id,
        first_name: row.first_name || '',
        last_name: row.last_name || '',
        phone: row.phone,
        email: row.email,
        brokerage: row.brokerage,
        active: row.active ?? true,
        lead_eligible: row.lead_eligible ?? false,
        campaign_eligible: row.campaign_eligible ?? true,
        email_opt_out: row.email_opt_out ?? false,
        preferred_language:
          normalizeLanguage(row.preferred_language, 'en') || 'en',
        secondary_language: normalizeLanguage(row.secondary_language, null),
        county_filter: row.county_filter,
        profile_picture_url: row.profile_picture_url,
        ai_draft_access: row.ai_draft_access ?? false,
        notes: row.notes,
        realtor_created_at: row.realtor_created_at || '',
        lead_count: leadCount,
      };
    });
    const totalCount = normalizeNonNegativeNumber(
      response.totalCount,
      offset + mapped.length
    );
    const pageState = getRealtorDirectoryPageState(
      offset,
      mapped.length,
      totalCount
    );

    return {
      data: {
        data: mapped,
        offset,
        ...pageState,
      },
      error: null,
    };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export async function fetchAssignedRealtors(
  loUserId: string,
  options: FetchRealtorsOptions = {}
): Promise<{ data: AssignedRealtor[] | null; error: Error | null }> {
  const result = await fetchRealtorDirectoryPage({
    loUserId,
    includeAll: false,
    search: options.search,
    stage: options.stage,
    offset: options.offset,
    pageSize: options.pageSize,
    signal: options.signal,
  });
  return {
    data: result.data ? filterAndSortRealtors(result.data.data, options) : null,
    error: result.error,
  };
}

// ============================================================================
// Fetch All Realtors (for Super Admin)
// ============================================================================

export async function fetchAllRealtors(
  options: FetchRealtorsOptions & { loUserId?: string } = {}
): Promise<{ data: AssignedRealtor[] | null; error: Error | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const loUserId = options.loUserId || sessionData.session?.user.id;
  if (!loUserId)
    return { data: null, error: new Error('Authentication required') };

  const result = await fetchRealtorDirectoryPage({
    loUserId,
    includeAll: true,
    search: options.search,
    stage: options.stage,
    offset: options.offset,
    pageSize: options.pageSize,
    signal: options.signal,
  });
  return {
    data: result.data ? filterAndSortRealtors(result.data.data, options) : null,
    error: result.error,
  };
}

// ============================================================================
// Fetch Single Realtor by ID
// ============================================================================

export async function fetchRealtorById(
  realtorId: string,
  loUserId: string
): Promise<{ data: AssignedRealtor | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('realtor_assignments')
      .select(
        `
        id,
        lo_user_id,
        relationship_stage,
        notes,
        last_touched_at,
        created_at,
        realtors (
          id,
          first_name,
          last_name,
          phone,
          email,
          brokerage,
          active,
          lead_eligible,
          campaign_eligible,
          email_opt_out,
          preferred_language,
          secondary_language,
          county_filter,
          profile_picture_url,
          ai_draft_access,
          notes,
          created_at
        )
      `
      )
      .eq('realtor_id', realtorId)
      .eq('lo_user_id', loUserId)
      .single();

    if (error) {
      console.error('[realtors] fetchRealtorById error:', error.message);
      return { data: null, error: new Error(error.message) };
    }

    if (!data || !(data as any).realtors) {
      return { data: null, error: new Error('Realtor not found') };
    }

    const row = data as any;
    const realtor: AssignedRealtor = {
      assignment_id: row.id,
      lo_user_id: row.lo_user_id,
      relationship_stage: row.relationship_stage || 'warm',
      assignment_notes: row.notes,
      last_touched_at: row.last_touched_at || row.created_at,
      assigned_at: row.created_at,
      realtor_id: row.realtors.id,
      first_name: row.realtors.first_name,
      last_name: row.realtors.last_name,
      phone: row.realtors.phone,
      email: row.realtors.email,
      brokerage: row.realtors.brokerage,
      active: row.realtors.active,
      lead_eligible: row.realtors.lead_eligible ?? false,
      campaign_eligible: row.realtors.campaign_eligible ?? true,
      email_opt_out: row.realtors.email_opt_out ?? false,
      preferred_language: row.realtors.preferred_language || 'en',
      secondary_language: row.realtors.secondary_language || null,
      county_filter: row.realtors.county_filter || null,
      profile_picture_url: row.realtors.profile_picture_url || null,
      ai_draft_access: row.realtors.ai_draft_access ?? false,
      notes: row.realtors.notes || null,
      realtor_created_at: row.realtors.created_at,
    };

    return { data: realtor, error: null };
  } catch (err: any) {
    console.error('[realtors] fetchRealtorById exception:', err);
    return { data: null, error: err };
  }
}

// ============================================================================
// Create Realtor and Assign to LO
// ============================================================================

export async function createRealtorAndAssign(
  loUserId: string,
  payload: CreateRealtorPayload
): Promise<{ data: AssignedRealtor | null; error: Error | null }> {
  try {
    // 1. Insert into realtors table with all fields
    const { data: newRealtor, error: realtorError } = await supabase
      .from('realtors')
      .insert({
        first_name: payload.first_name,
        last_name: payload.last_name,
        phone: payload.phone || null,
        email: payload.email,
        brokerage: payload.brokerage || null,
        created_by_user_id: loUserId,
        active: payload.active ?? true,
        campaign_eligible: payload.campaign_eligible ?? true,
        email_opt_out: payload.email_opt_out ?? false,
        preferred_language: payload.preferred_language || 'en',
        secondary_language: payload.secondary_language || null,
      })
      .select()
      .single();

    if (realtorError) {
      console.error('[realtors] createRealtor error:', realtorError.message);
      return { data: null, error: new Error(realtorError.message) };
    }

    // 2. Insert into realtor_assignments table with all columns
    const { data: assignment, error: assignError } = await supabase
      .from('realtor_assignments')
      .insert({
        realtor_id: newRealtor.id,
        lo_user_id: loUserId,
        relationship_stage: payload.relationship_stage || 'warm',
        notes: payload.notes || null,
        last_touched_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (assignError) {
      console.error('[realtors] createAssignment error:', assignError.message);
      return { data: null, error: new Error(assignError.message) };
    }

    // Return combined data
    const result: AssignedRealtor = {
      assignment_id: assignment.id,
      lo_user_id: assignment.lo_user_id,
      relationship_stage: assignment.relationship_stage || 'warm',
      assignment_notes: assignment.notes,
      last_touched_at: assignment.last_touched_at || assignment.created_at,
      assigned_at: assignment.created_at,
      realtor_id: newRealtor.id,
      first_name: newRealtor.first_name,
      last_name: newRealtor.last_name,
      phone: newRealtor.phone,
      email: newRealtor.email,
      brokerage: newRealtor.brokerage,
      active: newRealtor.active,
      lead_eligible: newRealtor.lead_eligible ?? false,
      campaign_eligible: newRealtor.campaign_eligible ?? true,
      email_opt_out: newRealtor.email_opt_out ?? false,
      preferred_language: newRealtor.preferred_language || 'en',
      secondary_language: newRealtor.secondary_language || null,
      county_filter: newRealtor.county_filter || null,
      profile_picture_url: newRealtor.profile_picture_url || null,
      ai_draft_access: newRealtor.ai_draft_access ?? false,
      notes: newRealtor.notes || null,
      realtor_created_at: newRealtor.created_at,
    };

    return { data: result, error: null };
  } catch (err: any) {
    console.error('[realtors] createRealtorAndAssign exception:', err);
    return { data: null, error: err };
  }
}

// ============================================================================
// Update Realtor (settings fields)
// ============================================================================

export interface UpdateRealtorPayload {
  active?: boolean;
  campaign_eligible?: boolean;
  email_opt_out?: boolean;
  preferred_language?: string;
  secondary_language?: string | null;
  lead_eligible?: boolean;
  ai_draft_access?: boolean;
  county_filter?: string[] | null;
}

export async function updateRealtor(
  realtorId: string,
  patch: UpdateRealtorPayload
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('realtors')
      .update(patch)
      .eq('id', realtorId);

    if (error) {
      console.error('[realtors] updateRealtor error:', error.message);
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err: any) {
    console.error('[realtors] updateRealtor exception:', err);
    return { error: err };
  }
}

// ============================================================================
// Update Assignment (stage, notes)
// ============================================================================

export async function updateAssignment(
  assignmentId: string,
  patch: UpdateAssignmentPayload
): Promise<{ error: Error | null }> {
  try {
    const updateData: any = {};
    if (patch.relationship_stage !== undefined) {
      updateData.relationship_stage = patch.relationship_stage;
      // Mark as manually set so auto-demotion doesn't override LO's choice
      updateData.stage_manually_set = true;
    }
    if (patch.notes !== undefined) {
      updateData.notes = patch.notes;
    }
    // Always update last_touched_at when making changes
    updateData.last_touched_at = new Date().toISOString();

    const { error } = await supabase
      .from('realtor_assignments')
      .update(updateData)
      .eq('id', assignmentId);

    if (error) {
      console.error('[realtors] updateAssignment error:', error.message);
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err: any) {
    console.error('[realtors] updateAssignment exception:', err);
    return { error: err };
  }
}

// ============================================================================
// Delete Realtor and Assignment
// ============================================================================

export async function deleteRealtor(
  realtorId: string,
  loUserId: string
): Promise<{ error: Error | null }> {
  try {
    // First delete the assignment
    const { error: assignError } = await supabase
      .from('realtor_assignments')
      .delete()
      .eq('realtor_id', realtorId)
      .eq('lo_user_id', loUserId);

    if (assignError) {
      console.error(
        '[realtors] deleteRealtor assignment error:',
        assignError.message
      );
      return { error: new Error(assignError.message) };
    }

    // Check if any other assignments exist for this realtor
    const { data: otherAssignments, error: checkError } = await supabase
      .from('realtor_assignments')
      .select('id')
      .eq('realtor_id', realtorId)
      .limit(1);

    if (checkError) {
      console.error(
        '[realtors] deleteRealtor check error:',
        checkError.message
      );
      return { error: new Error(checkError.message) };
    }

    // If no other assignments exist, delete the realtor record
    if (!otherAssignments || otherAssignments.length === 0) {
      const { error: realtorError } = await supabase
        .from('realtors')
        .delete()
        .eq('id', realtorId);

      if (realtorError) {
        console.error(
          '[realtors] deleteRealtor realtor error:',
          realtorError.message
        );
        return { error: new Error(realtorError.message) };
      }
    }

    return { error: null };
  } catch (err: any) {
    console.error('[realtors] deleteRealtor exception:', err);
    return { error: err };
  }
}

// ============================================================================
// Log Realtor Activity
// ============================================================================

export async function logRealtorActivity(
  realtorId: string,
  loUserId: string,
  activityType: RealtorActivityType,
  content?: string
): Promise<{ data: RealtorActivity | null; error: Error | null }> {
  // NOTE: realtor_activity table doesn't exist yet
  // This is a no-op until the migration is run
  console.log('[realtors] logRealtorActivity: table not yet created, skipping');
  return { data: null, error: null };
}

// ============================================================================
// Fetch Realtor Activity
// ============================================================================

export async function fetchRealtorActivity(
  realtorId: string,
  loUserId: string,
  limit: number = 20
): Promise<{ data: RealtorActivity[] | null; error: Error | null }> {
  // NOTE: realtor_activity table doesn't exist yet
  // Return empty array until the migration is run
  return { data: [], error: null };
}

// ============================================================================
// Get "Needs Love" Realtors (oldest last_touched_at)
// ============================================================================

export async function fetchNeedsLoveRealtors(
  loUserId: string,
  limit: number = 5
): Promise<{ data: AssignedRealtor[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('realtor_assignments')
      .select(
        `
        id,
        lo_user_id,
        relationship_stage,
        notes,
        last_touched_at,
        created_at,
        realtors (
          id,
          first_name,
          last_name,
          phone,
          email,
          brokerage,
          active,
          lead_eligible,
          campaign_eligible,
          email_opt_out,
          preferred_language,
          secondary_language,
          county_filter,
          profile_picture_url,
          ai_draft_access,
          notes,
          created_at
        )
      `
      )
      .eq('lo_user_id', loUserId)
      .order('last_touched_at', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (error) {
      console.error('[realtors] fetchNeedsLoveRealtors error:', error.message);
      return { data: null, error: new Error(error.message) };
    }

    const realtors: AssignedRealtor[] = (data || [])
      .filter((row: any) => row.realtors)
      .map((row: any) => ({
        assignment_id: row.id,
        lo_user_id: row.lo_user_id,
        relationship_stage: row.relationship_stage || 'warm',
        assignment_notes: row.notes,
        last_touched_at: row.last_touched_at || row.created_at,
        assigned_at: row.created_at,
        realtor_id: row.realtors.id,
        first_name: row.realtors.first_name,
        last_name: row.realtors.last_name,
        phone: row.realtors.phone,
        email: row.realtors.email,
        brokerage: row.realtors.brokerage,
        active: row.realtors.active,
        lead_eligible: row.realtors.lead_eligible ?? false,
        campaign_eligible: row.realtors.campaign_eligible ?? true,
        email_opt_out: row.realtors.email_opt_out ?? false,
        preferred_language: row.realtors.preferred_language || 'en',
        secondary_language: row.realtors.secondary_language || null,
        county_filter: row.realtors.county_filter || null,
        profile_picture_url: row.realtors.profile_picture_url || null,
        ai_draft_access: row.realtors.ai_draft_access ?? false,
        notes: row.realtors.notes || null,
        realtor_created_at: row.realtors.created_at,
      }));

    return { data: realtors, error: null };
  } catch (err: any) {
    console.error('[realtors] fetchNeedsLoveRealtors exception:', err);
    return { data: null, error: err };
  }
}

// ============================================================================
// Touch Realtor (update last_touched_at)
// ============================================================================

export async function touchRealtor(
  assignmentId: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('realtor_assignments')
      .update({ last_touched_at: new Date().toISOString() })
      .eq('id', assignmentId);

    if (error) {
      console.error('[realtors] touchRealtor error:', error.message);
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err: any) {
    console.error('[realtors] touchRealtor exception:', err);
    return { error: err };
  }
}

// ============================================================================
// Fetch Distinct Brokerages for Autocomplete
// ============================================================================

export async function fetchBrokerages(): Promise<{
  data: string[] | null;
  error: Error | null;
}> {
  try {
    // Use database function to bypass RLS and get all brokerages
    const { data, error } = await supabase.rpc('get_all_brokerages');

    if (error) {
      console.error('[realtors] fetchBrokerages error:', error.message);
      return { data: null, error: new Error(error.message) };
    }

    // Extract brokerage strings from result
    const brokerages = (data || []).map((r: any) => r.brokerage as string);
    return { data: brokerages, error: null };
  } catch (err: any) {
    console.error('[realtors] fetchBrokerages exception:', err);
    return { data: null, error: err };
  }
}
