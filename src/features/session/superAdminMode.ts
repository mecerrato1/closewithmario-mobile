// The website's "Super Admin" switch. It starts off on every launch and sign-in:
// off, the account works as the loan officer it is; on, it sees everyone's.

const TOGGLE_EMAILS = ['mcerrato@loandepot.com'];

let enabledFor: string | null = null;
const listeners = new Set<() => void>();

const normalize = (email?: string | null) => (email ?? '').trim().toLowerCase();

export function canToggleSuperAdmin(email?: string | null): boolean {
  return TOGGLE_EMAILS.includes(normalize(email));
}

export function isSuperAdminModeOn(email?: string | null): boolean {
  return enabledFor !== null && enabledFor === normalize(email);
}

export function setSuperAdminMode(email: string | null | undefined, on: boolean) {
  const next = on && canToggleSuperAdmin(email) ? normalize(email) : null;
  if (next === enabledFor) return;
  enabledFor = next;
  listeners.forEach((listener) => listener());
}

export function resetSuperAdminMode() {
  setSuperAdminMode(null, false);
}

export function subscribeSuperAdminMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
