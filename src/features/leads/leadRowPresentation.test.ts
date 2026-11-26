import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dayLabel, nextStep } from './leadRowPresentation';

const base = { status: 'contacted', unreadCount: 0, attention: null, ruleLabel: null };

describe('nextStep', () => {
  it('puts an unread message first', () => {
    const step = nextStep({
      ...base,
      unreadCount: 2,
      attention: { needsAttention: true, priority: 4, badge: 'Follow up: docs' },
    });
    assert.deepEqual(step, { kind: 'reply', tone: 'red', reason: '2 unread messages', needsYou: true });
  });

  it('flags a lead that needs attention, using the badge', () => {
    const docs = nextStep({ ...base, attention: { needsAttention: true, priority: 3, badge: 'Follow up: docs' } });
    assert.deepEqual(docs, { kind: 'docs', tone: 'amber', reason: 'Follow up: docs', needsYou: true });
    const reply = nextStep({ ...base, attention: { needsAttention: true, priority: 1, badge: 'Reply: Pre-approval' } });
    assert.equal(reply.kind, 'reply');
    assert.equal(reply.tone, 'red');
  });

  it('drops the emoji dot in front of a badge', () => {
    const step = nextStep({ ...base, attention: { needsAttention: true, priority: 1, badge: '🔴 Reply: Docs needed' } });
    assert.equal(step.reason, 'Reply: Docs needed');
  });

  it('keeps a rule reminder unflagged', () => {
    const step = nextStep({ ...base, ruleLabel: 'No Activity 2+ days' });
    assert.equal(step.needsYou, false);
    assert.equal(step.reason, 'No Activity 2+ days');
  });

  it('ignores the rule when there is an AI verdict', () => {
    const step = nextStep({
      ...base,
      ruleLabel: 'No Activity 2+ days',
      attention: { needsAttention: false, priority: 5, badge: 'On Track' },
    });
    assert.equal(step.kind, 'none');
    assert.equal(step.reason, null);
  });

  it('marks a new lead for a first call', () => {
    assert.equal(nextStep({ ...base, status: 'new' }).kind, 'first_call');
    assert.equal(nextStep({ ...base, status: null }).kind, 'first_call');
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 10, 25, 22, 0);
  const at = (year: number, month: number, day: number, hour = 12) =>
    new Date(year, month, day, hour).toISOString();

  it('names recent days and dates older ones', () => {
    assert.equal(dayLabel(at(2026, 10, 25, 0), now), 'Today');
    assert.equal(dayLabel(at(2026, 10, 24, 23), now), 'Yesterday');
    assert.equal(dayLabel(at(2026, 10, 23), now), 'Monday');
    assert.equal(dayLabel(at(2026, 10, 12), now), 'Nov 12');
    assert.equal(dayLabel(at(2025, 10, 12), now), 'Nov 12, 2025');
    assert.equal(dayLabel('not a date', now), 'Earlier');
  });
});
