// src/lib/roles.ts
// Role detection and permission management
import { supabase } from './supabase';

export type UserRole = 'super_admin' | 'admin' | 'loan_officer' | 'realtor' | 'buyer';

// Super Admins have full access to everything
const SUPER_ADMIN_EMAILS = [
  'mario@closewithmario.com',
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
export async function getUserRole(userId: string, email: string): Promise<UserRole> {
  const emailLower = email.toLowerCase();
  
  // Check super admin first (highest priority)
  if (SUPER_ADMIN_EMAILS.includes(emailLower)) {
    return 'super_admin';
  }
  
  // Check admin
  if (ADMIN_EMAILS.includes(emailLower)) {
    return 'admin';
  }
  
  // Check if user is a loan officer (by user_id)
  let { data: loData } = await supabase
    .from('loan_officers')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  
  if (loData) {
    return 'loan_officer';
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
    
    console.log(`✅ Auto-linked user ${userId} to loan officer ${unlinkedLO.id}`);
    return 'loan_officer';
  }
  
  // Check if user is a realtor (by user_id)
  let { data: realtorData } = await supabase
    .from('realtors')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  
  if (realtorData) {
    return 'realtor';
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
    
    console.log(`✅ Auto-linked user ${userId} to realtor ${unlinkedRealtor.id}`);
    return 'realtor';
  }
  
  // Default to buyer
  return 'buyer';
}

/**
 * Get team member ID for LO or Realtor
 */
export async function getUserTeamMemberId(
  userId: string,
  role: 'loan_officer' | 'realtor'
): Promise<string | null> {
  const table = role === 'loan_officer' ? 'loan_officers' : 'realtors';
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  
  return data?.id || null;
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

