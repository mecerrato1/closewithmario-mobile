// Mirrors the web CRM's two-step verification rule (marios-personal
// src/lib/mfaPolicy.ts / private.session_mfa_satisfied). A session counts as
// verified when its JWT is aal2 with a TOTP entry less than 30 days old.
// Keep REMEMBER_WINDOW_SECONDS and CLOCK_SKEW_SECONDS in step with the web app.

export const REMEMBER_WINDOW_SECONDS = 30 * 86400;
export const CLOCK_SKEW_SECONDS = 300;

type Claims = {
  aal?: unknown;
  amr?: unknown;
};

function decodeBase64Url(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decode = (globalThis as { atob?: (input: string) => string }).atob;
    if (typeof decode !== 'function') return null;
    return decode(padded);
  } catch {
    return null;
  }
}

export function readTokenClaims(token: string | null | undefined): Claims | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  const json = decodeBase64Url(payload);
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Claims) : null;
  } catch {
    return null;
  }
}

export function isSessionMfaVerified(
  token: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const claims = readTokenClaims(token);
  if (!claims || claims.aal !== 'aal2' || !Array.isArray(claims.amr)) {
    return false;
  }
  let verifiedAt: number | null = null;
  for (const entry of claims.amr as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (method === 'totp' && typeof timestamp === 'number') {
      verifiedAt = verifiedAt === null ? timestamp : Math.max(verifiedAt, timestamp);
    }
  }
  if (verifiedAt === null) return false;
  const nowSeconds = nowMs / 1000;
  return (
    verifiedAt <= nowSeconds + CLOCK_SKEW_SECONDS &&
    nowSeconds - verifiedAt < REMEMBER_WINDOW_SECONDS
  );
}
