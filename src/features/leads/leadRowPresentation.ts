// What a lead list row says: which day it sits under and what to do next.

export type NextStepKind = 'reply' | 'docs' | 'call' | 'attention' | 'first_call' | 'none';
export type NextStepTone = 'red' | 'amber' | 'blue' | 'quiet';

export type NextStep = {
  kind: NextStepKind;
  tone: NextStepTone;
  reason: string | null;
  /** Leads waiting on you are drawn as cards with Call and Text buttons. */
  card: boolean;
};

export function nextStep(lead: {
  status: string | null;
  unreadCount: number;
  attention: { needsAttention: boolean; priority: number; badge: string } | null;
  /** Rule-based reminder, used only when there is no AI verdict. */
  ruleLabel: string | null;
}): NextStep {
  if (lead.unreadCount > 0) {
    return {
      kind: 'reply',
      tone: 'red',
      reason: lead.unreadCount > 1 ? `${lead.unreadCount} unread messages` : 'Unread message',
      card: true,
    };
  }

  if (lead.attention?.needsAttention) {
    // Badges can arrive with a colored dot emoji in front; the row has its own color.
    const badge = lead.attention.badge.replace(/^[^A-Za-z0-9À-ÿ]+/, '').trim();
    const kind: NextStepKind = /reply|respond/i.test(badge)
      ? 'reply'
      : /doc/i.test(badge)
        ? 'docs'
        : /call/i.test(badge)
          ? 'call'
          : 'attention';
    return {
      kind,
      tone: lead.attention.priority <= 2 ? 'red' : 'amber',
      reason: badge || 'Needs attention',
      card: true,
    };
  }

  // A reminder from simple age rules is a hint, not a card: too many leads match.
  if (!lead.attention?.badge && lead.ruleLabel) {
    return { kind: 'call', tone: 'amber', reason: lead.ruleLabel, card: false };
  }

  if ((lead.status || 'new') === 'new') {
    return { kind: 'first_call', tone: 'blue', reason: null, card: false };
  }

  return { kind: 'none', tone: 'quiet', reason: null, card: false };
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "Today", "Yesterday", a weekday within the last week, then the date. */
export function dayLabel(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';

  // Rounded so a 23 or 25 hour daylight-saving day still counts as one.
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
