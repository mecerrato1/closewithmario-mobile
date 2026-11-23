import test from 'node:test';
import assert from 'node:assert/strict';

import { isSessionMfaVerified } from './mfaPolicy';

function token(claims: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`;
}

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0);
const nowSeconds = NOW / 1000;

test('aal1 session is not verified', () => {
  assert.equal(
    isSessionMfaVerified(token({ aal: 'aal1', amr: [{ method: 'password', timestamp: nowSeconds }] }), NOW),
    false
  );
});

test('aal2 session with a recent TOTP entry is verified', () => {
  assert.equal(
    isSessionMfaVerified(token({ aal: 'aal2', amr: [{ method: 'totp', timestamp: nowSeconds - 60 }] }), NOW),
    true
  );
});

test('aal2 session whose TOTP entry is older than 30 days is not verified', () => {
  assert.equal(
    isSessionMfaVerified(token({ aal: 'aal2', amr: [{ method: 'totp', timestamp: nowSeconds - 31 * 86400 }] }), NOW),
    false
  );
});

test('malformed or missing tokens are not verified', () => {
  assert.equal(isSessionMfaVerified(null, NOW), false);
  assert.equal(isSessionMfaVerified('not-a-jwt', NOW), false);
});
