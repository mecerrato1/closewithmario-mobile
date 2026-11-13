import test from 'node:test';
import assert from 'node:assert/strict';
import { createSendGuard } from './sendGuard';

test('only one send can start until it is released', () => {
  const guard = createSendGuard();
  assert.equal(guard.tryAcquire(), true);
  assert.equal(guard.tryAcquire(), false);
  assert.equal(guard.tryAcquire(), false);
  guard.release();
  assert.equal(guard.tryAcquire(), true);
});

test('two taps in the same tick start exactly one send', async () => {
  const guard = createSendGuard();
  let sends = 0;
  const tap = async () => {
    if (!guard.tryAcquire()) return;
    try {
      sends += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    } finally {
      guard.release();
    }
  };
  await Promise.all([tap(), tap(), tap()]);
  assert.equal(sends, 1);
  await tap();
  assert.equal(sends, 2);
});

test('the lock is released after a failed send so the user can retry', async () => {
  const guard = createSendGuard();
  const failing = async () => {
    if (!guard.tryAcquire()) return;
    try {
      throw new Error('network');
    } finally {
      guard.release();
    }
  };
  await assert.rejects(failing(), /network/);
  assert.equal(guard.tryAcquire(), true);
});

test('separate guards do not block each other', () => {
  const sms = createSendGuard();
  const dm = createSendGuard();
  assert.equal(sms.tryAcquire(), true);
  assert.equal(dm.tryAcquire(), true);
});
