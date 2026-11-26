export type CrmLeadScopeResolution =
  | 'all'
  | 'loan_officer'
  | 'realtor'
  | 'assistant';

export type CrmLeadScopeRole =
  | 'super_admin'
  | 'admin'
  | 'loan_officer'
  | 'assistant'
  | 'realtor'
  | 'buyer';

export function resolveCrmLeadScopeForRole(
  role: CrmLeadScopeRole
): CrmLeadScopeResolution {
  if (role === 'super_admin' || role === 'admin') {
    return 'all';
  }
  if (role === 'realtor' || role === 'assistant') {
    return role;
  }

  // A loan officer's own leads; assisting is chosen in the workspace switch.
  // Buyers should never reach the CRM lead list, but keep the fallback stable.
  return 'loan_officer';
}
