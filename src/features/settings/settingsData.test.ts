import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { confirmedRecoveryPhone, countiesChanged, FLORIDA_COUNTIES, normalizeRecoveryPhone, readDpaLink } from './settingsData';

describe('settings rules', () => {
  it('knows all 67 Florida counties', () => {
    assert.equal(new Set(FLORIDA_COUNTIES).size, 67);
  });

  it('compares county choices regardless of order, and treats all counties as its own choice', () => {
    assert.equal(countiesChanged(['Broward', 'Lee'], ['Lee', 'Broward']), false);
    assert.equal(countiesChanged(null, null), false);
    assert.equal(countiesChanged(null, ['Lee']), true);
    assert.equal(countiesChanged(['Lee'], null), true);
  });

  it('accepts only issued personal page addresses', () => {
    assert.equal(readDpaLink({ path: '/dpa/ana-diaz', publicPath: '/anadiaz', slug: 'anadiaz' }).publicPath, '/anadiaz');
    assert.throws(() => readDpaLink({ path: 'https://elsewhere.test/dpa/x' }));
    assert.throws(() => readDpaLink({ path: '/dpa/ana', publicPath: '/other', slug: 'ana' }));
  });

  it('only trusts a confirmed US recovery number', () => {
    assert.equal(normalizeRecoveryPhone('(305) 555-0123'), '+13055550123');
    assert.throws(() => normalizeRecoveryPhone('12345'));
    assert.equal(confirmedRecoveryPhone({ phone: '13055550123', phone_confirmed_at: null }), null);
    assert.equal(confirmedRecoveryPhone({ phone: '13055550123', phone_confirmed_at: '2026-01-01' }), '+13055550123');
  });
});
