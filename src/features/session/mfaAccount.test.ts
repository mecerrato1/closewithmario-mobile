import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchAccountMfaStatus,
  formatSetupKey,
  isReminderSnoozed,
  REMINDER_SNOOZE_MS,
  uniqueFactorName,
} from './mfaAccount';

function respond(body: unknown, ok = true) {
  return async () => ({ ok, json: async () => body }) as unknown as Response;
}

test('reads the decision and required role from the server', async () => {
  const status = await fetchAccountMfaStatus(
    'https://x.test',
    'token',
    respond({ mfa: { decision: 'enrollment_required', requiredRole: true } })
  );
  assert.deepEqual(status, { decision: 'enrollment_required', requiredRole: true });
});

test('sends the access token to the security endpoint', async () => {
  let seen: { url: string; auth: string | null } | null = null;
  await fetchAccountMfaStatus('https://x.test', 'abc', async (input, init) => {
    seen = {
      url: String(input),
      auth: new Headers(init?.headers).get('Authorization'),
    };
    return { ok: true, json: async () => ({ mfa: { decision: 'satisfied' } }) } as unknown as Response;
  });
  assert.deepEqual(seen, { url: 'https://x.test/api/account/security', auth: 'Bearer abc' });
});

test('treats a missing required role as false', async () => {
  const status = await fetchAccountMfaStatus(
    'https://x.test',
    't',
    respond({ mfa: { decision: 'satisfied' } })
  );
  assert.deepEqual(status, { decision: 'satisfied', requiredRole: false });
});

test('returns null for failures and unknown decisions so callers can retry', async () => {
  assert.equal(await fetchAccountMfaStatus('https://x.test', 't', respond({}, false)), null);
  assert.equal(
    await fetchAccountMfaStatus('https://x.test', 't', respond({ mfa: { decision: 'maybe' } })),
    null
  );
  assert.equal(
    await fetchAccountMfaStatus('https://x.test', 't', async () => {
      throw new Error('offline');
    }),
    null
  );
});

test('picks a name not already used by another authenticator', () => {
  assert.equal(uniqueFactorName('iPhone', []), 'iPhone');
  assert.equal(uniqueFactorName('iPhone', ['iPhone']), 'iPhone 2');
  assert.equal(uniqueFactorName('iPhone', ['iphone', 'iPhone 2']), 'iPhone 3');
});

test('groups the setup key in fours', () => {
  assert.equal(formatSetupKey('ABCDEFGHIJ'), 'ABCD EFGH IJ');
});

test('the setup reminder stays hidden for a day', () => {
  const now = 1_000_000_000;
  assert.equal(isReminderSnoozed(null, now), false);
  assert.equal(isReminderSnoozed(now - 1000, now), true);
  assert.equal(isReminderSnoozed(now - REMINDER_SNOOZE_MS - 1, now), false);
});
