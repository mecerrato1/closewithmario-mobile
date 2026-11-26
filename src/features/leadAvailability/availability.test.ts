import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hoursSummary, showsAvailabilitySwitch } from './availability';

describe('showsAvailabilitySwitch', () => {
  it('is for approved members and administrators', () => {
    assert.equal(showsAvailabilitySwitch({ isAdmin: false, membership: { status: 'approved' } }), true);
    assert.equal(showsAvailabilitySwitch({ isAdmin: true, membership: null }), true);
    for (const status of ['none', 'requested', 'declined', 'removed']) {
      assert.equal(showsAvailabilitySwitch({ isAdmin: false, membership: { status } }), false);
    }
    assert.equal(showsAvailabilitySwitch({ error: 'unavailable' }), false);
    assert.equal(showsAvailabilitySwitch(null), false);
  });
});

describe('hoursSummary', () => {
  const zone = 'America/New_York';
  // Wednesday 2026-11-25 at 10:00 in New York.
  const wednesday = new Date('2026-11-25T15:00:00Z');

  it("shows today's window in the officer's time zone", () => {
    assert.equal(hoursSummary({ '3': ['09:00', '18:30'] }, zone, wednesday), 'Today: 9 AM–6:30 PM');
    assert.equal(hoursSummary({ '1': ['09:00', '17:00'] }, zone, wednesday), 'No hours scheduled today');
  });

  it("includes an overnight window that began yesterday", () => {
    const early = new Date('2026-11-25T06:00:00Z');
    assert.equal(hoursSummary({ '2': ['20:00', '02:00'] }, zone, early), 'Today: until 2 AM (from yesterday)');
  });

  it('says when hours are missing or unusable', () => {
    assert.equal(hoursSummary(null, zone, wednesday), 'Hours not set');
    assert.equal(hoursSummary({}, null, wednesday), 'Hours not set');
    assert.equal(hoursSummary({ '3': ['09:00', '17:00'] }, 'Not/AZone', wednesday), 'Hours unavailable');
  });
});
