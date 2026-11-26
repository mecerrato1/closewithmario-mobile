import { supabase } from '../../lib/supabase';
import { unwrapLookup } from './lookup';
import type { AssistedLoanOfficer } from './workspace';

export type AssistantAccess = { assistantId: string; assisted: AssistedLoanOfficer[] };

/** The signed-in person's active assistant assignments, or null when they have none. */
export async function loadAssistantAccess(userId: string, email: string): Promise<AssistantAccess | null> {
  let assistant = unwrapLookup(
    await supabase.from('crm_assistants').select('id').eq('user_id', userId).eq('active', true).maybeSingle()
  ) as { id: string } | null;
  let needsLink = false;
  if (!assistant) {
    assistant = unwrapLookup(
      await supabase
        .from('crm_assistants')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .is('user_id', null)
        .eq('active', true)
        .maybeSingle()
    ) as { id: string } | null;
    needsLink = Boolean(assistant);
  }
  if (!assistant) return null;
  if (needsLink) {
    await supabase.from('crm_assistants').update({ user_id: userId }).eq('id', assistant.id).is('user_id', null);
  }

  const rows = (unwrapLookup(
    await supabase
      .from('loan_officer_assistant_assignments')
      .select('lo_id, can_create_leads, loan_officers:lo_id ( id, first_name, last_name, email )')
      .eq('assistant_id', assistant.id)
      .eq('active', true)
  ) ?? []) as unknown as Array<{
    can_create_leads: boolean | null;
    loan_officers:
      | { id: string; first_name: string | null; last_name: string | null; email: string | null }
      | null;
  }>;

  const assisted = rows
    .flatMap((row) =>
      row.loan_officers
        ? [{
            id: row.loan_officers.id,
            name:
              `${row.loan_officers.first_name || ''} ${row.loan_officers.last_name || ''}`.trim()
              || row.loan_officers.email
              || 'Loan officer',
            canCreateLeads: row.can_create_leads !== false,
          }]
        : []
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return assisted.length ? { assistantId: assistant.id, assisted } : null;
}
