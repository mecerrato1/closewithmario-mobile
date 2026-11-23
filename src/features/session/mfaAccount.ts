// Asks the CRM server what two-step verification this account needs. The server
// owns the rule (who is required, and from when), so the app never guesses the
// deadline or the role list: GET /api/account/security returns
// { mfa: { decision, requiredRole } }.

export type MfaDecision = 'satisfied' | 'challenge_required' | 'enrollment_required';

export type AccountMfaStatus = {
  decision: MfaDecision;
  /** True when this role must have an authenticator once the requirement is in effect. */
  requiredRole: boolean;
};

type Requester = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchAccountMfaStatus(
  baseUrl: string,
  accessToken: string,
  request: Requester = fetch
): Promise<AccountMfaStatus | null> {
  try {
    const response = await request(`${baseUrl}/api/account/security`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      mfa?: { decision?: unknown; requiredRole?: unknown };
    };
    const decision = body.mfa?.decision;
    if (
      decision !== 'satisfied' &&
      decision !== 'challenge_required' &&
      decision !== 'enrollment_required'
    ) {
      return null;
    }
    return { decision, requiredRole: body.mfa?.requiredRole === true };
  } catch {
    return null;
  }
}

/** A name not used by another authenticator on this account, e.g. "iPhone 2". */
export function uniqueFactorName(base: string, taken: string[]): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now() % 10000}`;
}

/** Groups the setup key in fours so it is easier to read and type. */
export function formatSetupKey(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

export const REMINDER_SNOOZE_MS = 24 * 60 * 60 * 1000;

export function isReminderSnoozed(snoozedAtMs: number | null, nowMs: number = Date.now()): boolean {
  return snoozedAtMs !== null && nowMs - snoozedAtMs >= 0 && nowMs - snoozedAtMs < REMINDER_SNOOZE_MS;
}
