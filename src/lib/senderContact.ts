// The signed-in person's contact details, used to sign messages to leads.

import { supabase } from './supabase';
import { getUserTeamMemberId } from './roles';

export type SenderContact = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  aiDraftAccess: boolean;
  company: string;
  isLicensedRealtor: boolean;
};

// Super-admin logins whose contact details differ from their account.
const SUPER_ADMIN_CONTACTS: Record<string, SenderContact> = {
  'mario@closewithmario.com': { firstName: 'Mario', lastName: 'Cerrato', phone: '3052192788', email: 'mcerrato@loandepot.com', aiDraftAccess: true, company: 'loanDepot', isLicensedRealtor: true },
  'mario@regallending.com': { firstName: 'Mario', lastName: 'Cerrato', phone: '3052192788', email: 'mario@regallending.com', aiDraftAccess: true, company: 'Regal Lending', isLicensedRealtor: true },
};

/** Loan officer record first, then realtor record; null when neither can be read. */
export async function fetchSenderContact(userId: string, email: string): Promise<SenderContact | null> {
  const emailLower = email.toLowerCase();
  if (SUPER_ADMIN_CONTACTS[emailLower]) return SUPER_ADMIN_CONTACTS[emailLower];

  try {
    let memberId = await getUserTeamMemberId(userId, 'loan_officer');
    if (!memberId) {
      const { data } = await supabase
        .from('loan_officers')
        .select('id')
        .eq('email', emailLower)
        .eq('active', true)
        .maybeSingle();
      memberId = data?.id || null;
    }

    if (memberId) {
      const { data, error } = await supabase
        .from('loan_officers')
        .select('first_name, last_name, phone, email, ai_draft_access, company, is_licensed_realtor')
        .eq('id', memberId)
        .single();
      if (error || !data) return null;
      const row = data as any;
      return {
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
        email: row.email || '',
        aiDraftAccess: !!row.ai_draft_access,
        company: row.company || '',
        isLicensedRealtor: !!row.is_licensed_realtor,
      };
    }

    const realtorId = await getUserTeamMemberId(userId, 'realtor');
    if (!realtorId) return null;
    const { data, error } = await supabase
      .from('realtors')
      .select('first_name, last_name, phone, email, brokerage')
      .eq('id', realtorId)
      .single();
    if (error || !data) return null;
    return {
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      phone: data.phone || '',
      email: data.email || '',
      aiDraftAccess: false,
      company: data.brokerage || '',
      isLicensedRealtor: false,
    };
  } catch (error) {
    console.error('Error loading sender contact:', error);
    return null;
  }
}
