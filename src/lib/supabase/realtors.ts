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
} from '../types/realtors';

// ============================================================================
// Fetch Assigned Realtors
// ============================================================================

interface FetchRealtorsOptions {
  search?: string;
  stage?: RelationshipStage | 'all';
  needsLove?: boolean;
}

export async function fetchAssignedRealtors(
  loUserId: string,
  options: FetchRealtorsOptions = {}
): Promise<{ data: AssignedRealtor[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('realtor_assignments')
      .select(`
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
          campaign_eligible,
          email_opt_out,
          preferred_language,
          secondary_language,
          created_at
        )
      `)
      .eq('lo_user_id', loUserId)
      .order('last_touched_at', { ascending: false, nullsFirst: false });

    // Apply stage filter at query level
    if (options.stage && options.stage !== 'all') {
      query = query.eq('relationship_stage', options.stage);
    }

    // Apply needs love filter (14+ days since last touch)
    if (options.needsLove) {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      query = query.lt('last_touched_at', fourteenDaysAgo.toISOString());
    }

    // Fetch all rows - Supabase defaults to 1000, so we need to paginate
    let allData: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: pageData, error: pageError } = await query.range(from, from + pageSize - 1);
      
      if (pageError) {
        console.error('[realtors] fetchAssignedRealtors error:', pageError.message);
        return { data: null, error: new Error(pageError.message) };
      }

      if (pageData && pageData.length > 0) {
        allData = [...allData, ...pageData];
        from += pageSize;
        hasMore = pageData.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    // Get all realtor IDs to fetch lead counts
    const realtorIds = (allData || [])
      .filter((row: any) => row.realtors)
      .map((row: any) => row.realtors.id);

    // Fetch lead counts for realtors - only counting leads that belong to THIS LO
    let leadCountMap: Record<string, number> = {};
    if (realtorIds.length > 0) {
      const { data: leadCounts, error: leadCountError } = await supabase
        .rpc('get_realtor_lead_counts_for_lo', { 
          realtor_ids: realtorIds,
          lo_user_id: loUserId 
        });
      
      if (leadCountError) {
        console.error('[realtors] Lead counts error:', leadCountError.message);
      }
      
      // Build map from function results
      (leadCounts || []).forEach((row: any) => {
        if (row.realtor_id) {
          leadCountMap[row.realtor_id] = row.lead_count || 0;
        }
      });
    }

    const realtors: AssignedRealtor[] = (allData || [])
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
        campaign_eligible: row.realtors.campaign_eligible ?? true,
        email_opt_out: row.realtors.email_opt_out ?? false,
        preferred_language: row.realtors.preferred_language || 'en',
        secondary_language: row.realtors.secondary_language || null,
        realtor_created_at: row.realtors.created_at,
        lead_count: leadCountMap[row.realtors.id] || 0,
      }))
      // Sort: realtors with leads first, then alphabetically by last name, first name
      .sort((a, b) => {
        const aHasLeads = (a.lead_count || 0) > 0 ? 1 : 0;
        const bHasLeads = (b.lead_count || 0) > 0 ? 1 : 0;
        // First sort by has leads (descending - with leads first)
        if (bHasLeads !== aHasLeads) {
          return bHasLeads - aHasLeads;
        }
        // Then sort alphabetically by last name, then first name
        const lastNameCompare = (a.last_name || '').localeCompare(b.last_name || '');
        if (lastNameCompare !== 0) return lastNameCompare;
        return (a.first_name || '').localeCompare(b.first_name || '');
      });

    // Apply search filter client-side
    let filtered = realtors;
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.first_name?.toLowerCase().includes(searchLower) ||
          r.last_name?.toLowerCase().includes(searchLower) ||
          r.brokerage?.toLowerCase().includes(searchLower) ||
          r.phone?.includes(options.search!) ||
          r.email?.toLowerCase().includes(searchLower)
      );
    }

    return { data: filtered, error: null };
  } catch (err: any) {
    console.error('[realtors] fetchAssignedRealtors exception:', err);
    return { data: null, error: err };
  }
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
      .select(`
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
          campaign_eligible,
          email_opt_out,
          preferred_language,
          secondary_language,
          created_at
        )
      `)
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
      campaign_eligible: row.realtors.campaign_eligible ?? true,
      email_opt_out: row.realtors.email_opt_out ?? false,
      preferred_language: row.realtors.preferred_language || 'en',
      secondary_language: row.realtors.secondary_language || null,
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
      campaign_eligible: newRealtor.campaign_eligible ?? true,
      email_opt_out: newRealtor.email_opt_out ?? false,
      preferred_language: newRealtor.preferred_language || 'en',
      secondary_language: newRealtor.secondary_language || null,
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
      console.error('[realtors] deleteRealtor assignment error:', assignError.message);
      return { error: new Error(assignError.message) };
    }

    // Check if any other assignments exist for this realtor
    const { data: otherAssignments, error: checkError } = await supabase
      .from('realtor_assignments')
      .select('id')
      .eq('realtor_id', realtorId)
      .limit(1);

    if (checkError) {
      console.error('[realtors] deleteRealtor check error:', checkError.message);
      return { error: new Error(checkError.message) };
    }

    // If no other assignments exist, delete the realtor record
    if (!otherAssignments || otherAssignments.length === 0) {
      const { error: realtorError } = await supabase
        .from('realtors')
        .delete()
        .eq('id', realtorId);

      if (realtorError) {
        console.error('[realtors] deleteRealtor realtor error:', realtorError.message);
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
// Fetch Leads by Realtor
// ============================================================================

export async function fetchLeadsByRealtor(
  realtorId: string
): Promise<{ data: any[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, status, created_at')
      .eq('realtor_id', realtorId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[realtors] fetchLeadsByRealtor error:', error.message);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data || [], error: null };
  } catch (err: any) {
    console.error('[realtors] fetchLeadsByRealtor exception:', err);
    return { data: null, error: err };
  }
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
      .select(`
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
          campaign_eligible,
          email_opt_out,
          preferred_language,
          secondary_language,
          created_at
        )
      `)
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
        campaign_eligible: row.realtors.campaign_eligible ?? true,
        email_opt_out: row.realtors.email_opt_out ?? false,
        preferred_language: row.realtors.preferred_language || 'en',
        secondary_language: row.realtors.secondary_language || null,
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

export async function fetchBrokerages(): Promise<{ data: string[] | null; error: Error | null }> {
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
