// src/lib/roles.ts
// Role detection and permission management
import { supabase } from './supabase';
import {
  resolveCrmLeadScopeForRole,
  type CrmLeadScopeResolution,
} from './crmLeadScope';
import { unwrapLookup } from '../features/session/lookup';
import { isSuperAdminModeOn, resetSuperAdminMode } from '../features/session/superAdminMode';
import { loadAssistantAccess } from '../features/session/assistantAccess';
import { resetWorkspace } from '../features/session/workspace';

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'loan_officer'
  | 'assistant'
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

/** Drop every account-scoped cache. Call on sign-out and when the signed-in user changes. */
export function clearRoleCaches() {
  roleCache.clear();
  teamMemberCache.clear();
  crmLeadScopeCache.clear();
  resetSuperAdminMode();
  resetWorkspace();
}

function roleCacheKey(userId: string, email: string) {
  return `${userId}:${email.trim().toLowerCase()}`;
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
  // Never cached, so switching it off returns the account's own role.
  if (isSuperAdminModeOn(emailLower)) return 'super_admin';

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
  const loData = unwrapLookup(
    await supabase
      .from('loan_officers')
      .select('id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
  );

  if (loData) {
    writeSessionCache(teamMemberCache, `${userId}:loan_officer`, loData.id);
    return remember('loan_officer');
  }

  // Auto-link: Check if there's an unlinked loan officer with this email
  const unlinkedLO = unwrapLookup(
    await supabase
      .from('loan_officers')
      .select('id')
      .eq('email', emailLower)
      .is('user_id', null)
      .eq('active', true)
      .maybeSingle()
  );

  if (unlinkedLO) {
    // Link this auth user to the loan officer record
    await supabase
      .from('loan_officers')
      .update({ user_id: userId })
      .eq('id', unlinkedLO.id);

    console.log('✅ Auto-linked account to loan officer record');
    writeSessionCache(teamMemberCache, `${userId}:loan_officer`, unlinkedLO.id);
    return remember('loan_officer');
  }

  // An assistant without a loan officer record of their own
  if (await loadAssistantAccess(userId, emailLower)) {
    return remember('assistant');
  }

  // Check if user is a realtor (by user_id)
  const realtorData = unwrapLookup(
    await supabase
      .from('realtors')
      .select('id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
  );

  if (realtorData) {
    writeSessionCache(teamMemberCache, `${userId}:realtor`, realtorData.id);
    return remember('realtor');
  }

  // Auto-link: Check if there's an unlinked realtor with this email
  const unlinkedRealtor = unwrapLookup(
    await supabase
      .from('realtors')
      .select('id')
      .eq('email', emailLower)
      .is('user_id', null)
      .eq('active', true)
      .maybeSingle()
  );

  if (unlinkedRealtor) {
    // Link this auth user to the realtor record
    await supabase
      .from('realtors')
      .update({ user_id: userId })
      .eq('id', unlinkedRealtor.id);

    console.log('✅ Auto-linked account to realtor record');
    writeSessionCache(teamMemberCache, `${userId}:realtor`, unlinkedRealtor.id);
    return remember('realtor');
  }

  // Default to buyer
  return remember('buyer');
}

export async function getUserCrmLeadScope(
  userId: string,
  email: string,
  role?: UserRole
): Promise<UserCrmLeadScope> {
  const emailLower = email.toLowerCase();
  if (isSuperAdminModeOn(emailLower)) return 'all';

  const cacheKey = roleCacheKey(userId, emailLower);
  const cachedScope = readSessionCache(crmLeadScopeCache, cacheKey);
  if (cachedScope) return cachedScope;

  const scope = resolveCrmLeadScopeForRole(role ?? (await getUserRole(userId, emailLower)));
  writeSessionCache(crmLeadScopeCache, cacheKey, scope);
  return scope;
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
