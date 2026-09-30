// src/lib/roles.ts
// Role detection and permission management
import { supabase } from './supabase';
import {
  resolveCrmLeadScopeForRole,
  type CrmLeadScopeResolution,
} from './crmLeadScope';

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'loan_officer'
  | 'realtor'
  | 'buyer';

export type UserCrmLeadScope = CrmLeadScopeResolution;

const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry<T> = { value: T; expiresAt: number };
const roleCache = new Map<string, CacheEntry<UserRole>>();
const teamMemberCache = new Map<string, CacheEntry<string>>();
const crmLeadScopeCache = new Map<string, CacheEntry<UserCrmLeadScope>>();

function readSessionCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string
): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeSessionCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T
) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
}

function roleCacheKey(userId: string, email: string) {
  return `${userId}:${email.trim().toLowerCase()}`;
}

function assistantCacheKey(userId: string) {
  return `${userId}:assistant`;
}

// Super Admins have full access to everything
const SUPER_ADMIN_EMAILS = [
  'mario@closewithmario.com',
  'mario@regallending.com',
  'dhruv@loandock.com',
  'arnav@loandock.com',
];

// Admins have access to admin dashboard but not user/team management
const ADMIN_EMAILS = [
  'mecerrato16@gmail.com',
  'sofloandresre@gmail.com',
  'robles.barnaby@gmail.com',
  'courtneym007@gmail.com',
  'vinit@closewithmario.com',
];

/**
 * Determine user's role based on email and team membership
 */
export async function getUserRole(
  userId: string,
  email: string
): Promise<UserRole> {
  const emailLower = email.toLowerCase();
  const cacheKey = roleCacheKey(userId, emailLower);
  const cachedRole = readSessionCache(roleCache, cacheKey);
  if (cachedRole) return cachedRole;

  const remember = (role: UserRole) => {
    if (role !== 'buyer') writeSessionCache(roleCache, cacheKey, role);
    return role;
  };

  // Check super admin first (highest priority)
  if (SUPER_ADMIN_EMAILS.includes(emailLower)) {
    return remember('super_admin');
  }

  // Check admin
  if (ADMIN_EMAILS.includes(emailLower)) {
    return remember('admin');
  }

  // Check if user is a loan officer (by user_id)
  let { data: loData } = await supabase
    .from('loan_officers')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  if (loData) {
    writeSessionCache(teamMemberCache, `${userId}:loan_officer`, loData.id);
    return remember('loan_officer');
  }

  // Auto-link: Check if there's an unlinked loan officer with this email
  const { data: unlinkedLO } = await supabase
    .from('loan_officers')
    .select('id')
    .eq('email', emailLower)
    .is('user_id', null)
    .eq('active', true)
    .maybeSingle();

  if (unlinkedLO) {
    // Link this auth user to the loan officer record
    await supabase
      .from('loan_officers')
      .update({ user_id: userId })
      .eq('id', unlinkedLO.id);

    console.log(
      `✅ Auto-linked user ${userId} to loan officer ${unlinkedLO.id}`
    );
    writeSessionCache(teamMemberCache, `${userId}:loan_officer`, unlinkedLO.id);
    return remember('loan_officer');
  }

  // Check if user is a realtor (by user_id)
  let { data: realtorData } = await supabase
    .from('realtors')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  if (realtorData) {
    writeSessionCache(teamMemberCache, `${userId}:realtor`, realtorData.id);
    return remember('realtor');
  }

  // Auto-link: Check if there's an unlinked realtor with this email
  const { data: unlinkedRealtor } = await supabase
    .from('realtors')
    .select('id')
    .eq('email', emailLower)
    .is('user_id', null)
    .eq('active', true)
    .maybeSingle();

  if (unlinkedRealtor) {
    // Link this auth user to the realtor record
    await supabase
      .from('realtors')
      .update({ user_id: userId })
      .eq('id', unlinkedRealtor.id);

    console.log(
      `✅ Auto-linked user ${userId} to realtor ${unlinkedRealtor.id}`
    );
    writeSessionCache(teamMemberCache, `${userId}:realtor`, unlinkedRealtor.id);
    return remember('realtor');
  }

  // Default to buyer
  return remember('buyer');
}

async function hasAssistantAssignments(assistantId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('loan_officer_assistant_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('assistant_id', assistantId)
    .eq('active', true);

  if (error) {
    console.warn('Unable to load assistant assignments:', error.message);
    return false;
  }

  return (count || 0) > 0;
}

async function getAssistantProfileId(
  userId: string,
  emailLower: string
): Promise<string | null> {
  const cacheKey = assistantCacheKey(userId);
  const cachedAssistantId = readSessionCache(teamMemberCache, cacheKey);
  if (cachedAssistantId) return cachedAssistantId;

  const { data: assistantData, error: assistantError } = await supabase
    .from('crm_assistants')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  if (assistantError) {
    console.warn('Unable to load assistant profile:', assistantError.message);
  } else if (assistantData?.id) {
    writeSessionCache(teamMemberCache, cacheKey, assistantData.id);
    return assistantData.id;
  }

  const { data: unlinkedAssistant, error: unlinkedAssistantError } =
    await supabase
      .from('crm_assistants')
      .select('id')
      .eq('email', emailLower)
      .is('user_id', null)
      .eq('active', true)
      .maybeSingle();

  if (unlinkedAssistantError) {
    console.warn(
      'Unable to load unlinked assistant profile:',
      unlinkedAssistantError.message
    );
    return null;
  }

  if (!unlinkedAssistant?.id) {
    return null;
  }

  if (!(await hasAssistantAssignments(unlinkedAssistant.id))) {
    return null;
  }

  const { error: linkError } = await supabase
    .from('crm_assistants')
    .update({ user_id: userId })
    .eq('id', unlinkedAssistant.id);

  if (linkError) {
    console.error(
      `❌ Failed to auto-link assistant ${unlinkedAssistant.id}:`,
      linkError.message
    );
    return null;
  }

  console.log(
    `✅ Auto-linked user ${userId} to assistant ${unlinkedAssistant.id}`
  );
  writeSessionCache(teamMemberCache, cacheKey, unlinkedAssistant.id);
  return unlinkedAssistant.id;
}

export async function getUserCrmLeadScope(
  userId: string,
  email: string,
  role?: UserRole
): Promise<UserCrmLeadScope> {
  const emailLower = email.toLowerCase();
  const cacheKey = roleCacheKey(userId, emailLower);
  const cachedScope = readSessionCache(crmLeadScopeCache, cacheKey);
  if (cachedScope) return cachedScope;

  const resolvedRole = role ?? (await getUserRole(userId, emailLower));
  const remember = (scope: UserCrmLeadScope) => {
    writeSessionCache(crmLeadScopeCache, cacheKey, scope);
    return scope;
  };

  if (resolvedRole !== 'loan_officer') {
    return remember(resolveCrmLeadScopeForRole(resolvedRole));
  }

  const assistantId = await getAssistantProfileId(userId, emailLower);
  if (assistantId && (await hasAssistantAssignments(assistantId))) {
    return remember(resolveCrmLeadScopeForRole(resolvedRole, true));
  }

  return remember(resolveCrmLeadScopeForRole(resolvedRole));
}

/**
 * Get team member ID for LO or Realtor
 */
export async function getUserTeamMemberId(
  userId: string,
  role: 'loan_officer' | 'realtor'
): Promise<string | null> {
  const cacheKey = `${userId}:${role}`;
  const cachedMemberId = readSessionCache(teamMemberCache, cacheKey);
  if (cachedMemberId) return cachedMemberId;
  const table = role === 'loan_officer' ? 'loan_officers' : 'realtors';
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  const memberId = data?.id || null;
  if (memberId) writeSessionCache(teamMemberCache, cacheKey, memberId);
  return memberId;
}

/**
 * Permission check functions
 */

export function canAccessAdminDashboard(role: UserRole): boolean {
  return ['super_admin', 'admin'].includes(role);
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'super_admin';
}

export function canManageTeam(role: UserRole): boolean {
  return role === 'super_admin';
}

export function canViewAdsLibrary(role: UserRole): boolean {
  return role === 'super_admin';
}

export function canSeeAllLeads(role: UserRole): boolean {
  return ['super_admin', 'admin'].includes(role);
}

export function canDeleteLeads(role: UserRole): boolean {
  return ['super_admin', 'admin'].includes(role);
}

export function canAssignLeads(role: UserRole): boolean {
  return ['super_admin', 'admin'].includes(role);
}

export function canUpdateLeadStatus(role: UserRole): boolean {
  // Everyone can update status
  return ['super_admin', 'admin', 'loan_officer', 'realtor'].includes(role);
}

export function canAddLeadNotes(role: UserRole): boolean {
  // Everyone can add notes
  return ['super_admin', 'admin', 'loan_officer', 'realtor'].includes(role);
}
