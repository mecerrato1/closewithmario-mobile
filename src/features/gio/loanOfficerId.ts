import { supabase } from '../../lib/supabase';
import { getUserTeamMemberId } from '../../lib/roles';

/** The signed-in person's own loan officer record, or null. */
export async function fetchLoanOfficerId(userId: string, email: string): Promise<string | null> {
  try {
    const own = await getUserTeamMemberId(userId, 'loan_officer');
    if (own) return own;
    const { data } = await supabase
      .from('loan_officers')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('active', true)
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}
