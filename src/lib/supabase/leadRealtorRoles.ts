import { supabase } from '../supabase';
import type {
  LeadRealtorRole,
  LeadRealtorRoleSource,
  LeadRealtorRoleType,
  LeadRoleRealtor,
} from '../types/leadRealtorRoles';

const ROLE_SELECT = `
  id,
  lead_id,
  lead_source,
  realtor_id,
  role,
  is_primary,
  cc_by_default,
  notes,
  created_at,
  updated_at,
  realtors (
    id,
    first_name,
    last_name,
    email,
    phone,
    brokerage,
    active
  )
`;

const REALTOR_SELECT = 'id, first_name, last_name, email, phone, brokerage, active';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : fallback;
  }
  return fallback;
}

function normalizeRole(row: any): LeadRealtorRole {
  return {
    ...row,
    realtor: row.realtors || row.realtor || null,
  } as LeadRealtorRole;
}

function sanitizeSearchTerm(value: string) {
  return value.trim().replace(/[%,]/g, ' ');
}

export async function fetchLeadRealtorRoles(params: {
  leadId: string;
  leadSource: LeadRealtorRoleSource;
}): Promise<{ data: LeadRealtorRole[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('lead_realtor_roles')
      .select(ROLE_SELECT)
      .eq('lead_id', params.leadId)
      .eq('lead_source', params.leadSource)
      .in('role', ['buyer_agent', 'listing_agent'])
      .order('role', { ascending: true })
      .order('is_primary', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) {
      return { data: [], error: new Error(getErrorMessage(error, 'Unable to load realtor roles')) };
    }

    return { data: (data || []).map(normalizeRole), error: null };
  } catch (error) {
    return { data: [], error: new Error(getErrorMessage(error, 'Unable to load realtor roles')) };
  }
}

export async function searchActiveRealtors(searchQuery: string): Promise<{
  data: LeadRoleRealtor[];
  error: Error | null;
}> {
  const cleaned = sanitizeSearchTerm(searchQuery);

  try {
    let query = supabase
      .from('realtors')
      .select(REALTOR_SELECT)
      .eq('active', true)
      .order('last_name', { ascending: true })
      .limit(25);

    if (cleaned.length >= 2) {
      const words = cleaned.split(/\s+/).filter(Boolean);
      const searchTerm = `%${cleaned}%`;

      if (words.length >= 2) {
        query = query.or(
          `first_name.ilike.%${words[0]}%,last_name.ilike.%${words.slice(1).join(' ')}%,first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},brokerage.ilike.${searchTerm},email.ilike.${searchTerm}`
        );
      } else {
        query = query.or(
          `first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},brokerage.ilike.${searchTerm},email.ilike.${searchTerm}`
        );
      }
    }

    const { data, error } = await query;

    if (error) {
      return { data: [], error: new Error(getErrorMessage(error, 'Unable to search realtors')) };
    }

    return { data: (data || []) as LeadRoleRealtor[], error: null };
  } catch (error) {
    return { data: [], error: new Error(getErrorMessage(error, 'Unable to search realtors')) };
  }
}

export async function clearPrimaryLeadRealtorRole(params: {
  leadId: string;
  leadSource: LeadRealtorRoleSource;
  role: LeadRealtorRoleType;
}): Promise<Error | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('lead_realtor_roles')
      .update({
        is_primary: false,
        updated_by: user?.id || null,
      })
      .eq('lead_id', params.leadId)
      .eq('lead_source', params.leadSource)
      .eq('role', params.role)
      .eq('is_primary', true);

    return error ? new Error(getErrorMessage(error, 'Unable to clear current realtor role')) : null;
  } catch (error) {
    return new Error(getErrorMessage(error, 'Unable to clear current realtor role'));
  }
}

export async function upsertLeadRealtorRole(params: {
  leadId: string;
  leadSource: LeadRealtorRoleSource;
  role: LeadRealtorRoleType;
  realtorId: string;
  ccByDefault: boolean;
}): Promise<Error | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('lead_realtor_roles')
      .upsert(
        {
          lead_id: params.leadId,
          lead_source: params.leadSource,
          realtor_id: params.realtorId,
          role: params.role,
          is_primary: true,
          cc_by_default: params.ccByDefault,
          created_by: user?.id || null,
          updated_by: user?.id || null,
        },
        { onConflict: 'lead_source,lead_id,realtor_id,role' }
      );

    return error ? new Error(getErrorMessage(error, 'Unable to assign realtor role')) : null;
  } catch (error) {
    return new Error(getErrorMessage(error, 'Unable to assign realtor role'));
  }
}

export async function deleteLeadRealtorRole(params: {
  roleId?: string | null;
  leadId: string;
  leadSource: LeadRealtorRoleSource;
  role: LeadRealtorRoleType;
}): Promise<Error | null> {
  try {
    let query = supabase
      .from('lead_realtor_roles')
      .delete()
      .eq('lead_id', params.leadId)
      .eq('lead_source', params.leadSource)
      .eq('role', params.role);

    query = params.roleId ? query.eq('id', params.roleId) : query.eq('is_primary', true);

    const { error } = await query;
    return error ? new Error(getErrorMessage(error, 'Unable to remove realtor role')) : null;
  } catch (error) {
    return new Error(getErrorMessage(error, 'Unable to remove realtor role'));
  }
}
