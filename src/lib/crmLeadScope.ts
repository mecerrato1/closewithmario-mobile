export type CrmLeadScopeResolution =
  | 'all'
  | 'loan_officer'
  | 'realtor'
  | 'assistant';

export type CrmLeadScopeRole =
  | 'super_admin'
  | 'admin'
  | 'loan_officer'
  | 'realtor'
  | 'buyer';

export function resolveCrmLeadScopeForRole(
  role: CrmLeadScopeRole,
  hasAssistantAssignments = false
): CrmLeadScopeResolution {
  if (role === 'super_admin' || role === 'admin') {
    return 'all';
  }
  if (role === 'realtor') {
    return 'realtor';
  }
  if (role === 'loan_officer') {
    return hasAssistantAssignments ? 'assistant' : 'loan_officer';
  }

  // Buyers should never reach the CRM lead list, but keep the fallback stable.
  return 'loan_officer';
}
