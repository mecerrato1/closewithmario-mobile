import test from 'node:test';
import assert from 'node:assert/strict';
import { runSignOut } from './signOutCleanup';

function makeSteps(overrides: Partial<Parameters<typeof runSignOut>[0]> = {}) {
  const calls: string[] = [];
  const steps = {
    deactivatePushToken: async () => { calls.push('push'); },
    cancelScheduledNotifications: async () => { calls.push('reminders'); },
    signOut: async () => { calls.push('signOut'); },
    clearAccountCaches: () => { calls.push('caches'); },
    ...overrides,
  };
  return { steps, calls };
}

test('runs session-dependent cleanup before ending the session, then clears caches', async () => {
  const { steps, calls } = makeSteps();
  const result = await runSignOut(steps);
  assert.deepEqual(calls, ['push', 'reminders', 'signOut', 'caches']);
  assert.deepEqual(result.failedSteps, []);
});

test('a failing push deactivation does not block sign-out or cache clearing', async () => {
  const { steps, calls } = makeSteps({
    deactivatePushToken: async () => { calls.push('push'); throw new Error('offline'); },
  });
  const result = await runSignOut(steps);
  assert.deepEqual(calls, ['push', 'reminders', 'signOut', 'caches']);
  assert.deepEqual(result.failedSteps, ['deactivatePushToken']);
});

test('a failing sign-out call is reported and caches are still cleared', async () => {
  const { steps, calls } = makeSteps({
    signOut: async () => { calls.push('signOut'); throw new Error('network'); },
  });
  const result = await runSignOut(steps);
  assert.ok(calls.includes('caches'));
  assert.deepEqual(result.failedSteps, ['signOut']);
});

test('a throwing cache clear is reported without throwing', async () => {
  const { steps } = makeSteps({ clearAccountCaches: () => { throw new Error('x'); } });
  const result = await runSignOut(steps);
  assert.deepEqual(result.failedSteps, ['clearAccountCaches']);
});
