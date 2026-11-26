import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canToggleSuperAdmin,
  isSuperAdminModeOn,
  resetSuperAdminMode,
  setSuperAdminMode,
} from './superAdminMode';

test('only the super admin account can switch the mode on', () => {
  assert.equal(canToggleSuperAdmin(' MCerrato@loandepot.com '), true);
  assert.equal(canToggleSuperAdmin('brobles@loandepot.com'), false);
  setSuperAdminMode('brobles@loandepot.com', true);
  assert.equal(isSuperAdminModeOn('brobles@loandepot.com'), false);
});

test('the mode starts off, follows the switch and resets', () => {
  const email = 'mcerrato@loandepot.com';
  assert.equal(isSuperAdminModeOn(email), false);
  setSuperAdminMode(email, true);
  assert.equal(isSuperAdminModeOn(email), true);
  assert.equal(isSuperAdminModeOn('brobles@loandepot.com'), false);
  resetSuperAdminMode();
  assert.equal(isSuperAdminModeOn(email), false);
});
