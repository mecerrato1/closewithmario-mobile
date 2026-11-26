// The website's "Who should I call today?" list. The server decides who is on it and in
// what order (GET /api/crm/call-queue); this file only requests and words it, the same
// way the web TodayView does.

export type CallQueueBucket = 'overdue' | 'due_today' | 'new_lead' | 'reply_needed' | 'follow_up';
export type CallQueueFilter = 'all' | CallQueueBucket;
export type CallQueueScope = 'mine' | 'all' | 'own' | 'assisting';

export type CallQueueItem = {
  leadId: string;
  leadSource: 'organic' | 'meta';
  name: string;
  phone: string;
  status: string | null;
  reason: string;
  priority: number;
  bucket: CallQueueBucket;
  nextFollowUpAt: string | null;
  programFollowUp?: boolean;
  programCrmUpdate?: boolean;
  callWindowUntil?: string | null;
  callWindowFrom?: string | null;
  callWindowOpen?: boolean | null;
  callWindowTimeZone?: string | null;
};

export type CallQueuePage = {
  items: CallQueueItem[];
  /** Matches the chosen category. */
  total: number;
  /** Every category. */
  allTotal: number;
  counts: Record<CallQueueBucket, number>;
};

export const CALL_QUEUE_FILTERS: { key: CallQueueFilter; label: string }[] = [
  { key: 'all', label: 'All contacts' },
  { key: 'overdue', label: 'Overdue callbacks' },
  { key: 'due_today', label: 'Later today' },
  { key: 'new_lead', label: 'First contact / call windows' },
  { key: 'reply_needed', label: 'Awaiting reply' },
  { key: 'follow_up', label: 'Follow-ups' },
];

export function callQueuePath(options: {
  scope: CallQueueScope;
  bucket: CallQueueFilter;
  timeZone: string;
  limit: number;
  offset: number;
  loanOfficerId?: string | null;
}): string {
  const params = new URLSearchParams({
    scope: options.scope,
    bucket: options.bucket,
    timeZone: options.timeZone,
    limit: String(options.limit),
    offset: String(options.offset),
  });
  if (options.loanOfficerId) params.set('loId', options.loanOfficerId);
  return `/api/crm/call-queue?${params.toString()}`;
}

/** Null when the response is not a call list. */
export function parseCallQueuePage(body: unknown): CallQueuePage | null {
  const value = body as Partial<CallQueuePage> | null;
  if (!value || !Array.isArray(value.items) || typeof value.total !== 'number') return null;
  const counts = (value.counts ?? {}) as Partial<Record<CallQueueBucket, number>>;
  return {
    items: value.items,
    total: value.total,
    allTotal: typeof value.allTotal === 'number' ? value.allTotal : value.total,
    counts: {
      overdue: counts.overdue ?? 0,
      due_today: counts.due_today ?? 0,
      new_lead: counts.new_lead ?? 0,
      reply_needed: counts.reply_needed ?? 0,
      follow_up: counts.follow_up ?? 0,
    },
  };
}

export function callSection(item: CallQueueItem): string {
  if (item.callWindowUntil && item.callWindowOpen !== false) return 'Call window open';
  switch (item.bucket) {
    case 'overdue':
      return item.priority === 5 ? 'Older missed callbacks' : 'Missed callbacks';
    case 'due_today':
      return 'Later today';
    case 'reply_needed':
      return 'Call requests';
    case 'new_lead':
      return 'First contact';
    default:
      return 'Follow-up opportunities';
  }
}

/** The call window in the lead program's time zone, not the phone's. */
export function formatOpenCallWindow(item: CallQueueItem): string | null {
  if (!item.callWindowUntil || !item.callWindowTimeZone || !Number.isFinite(Date.parse(item.callWindowUntil))) {
    return null;
  }
  try {
    const timeZone = item.callWindowTimeZone;
    const end = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
      .format(new Date(item.callWindowUntil));
    if (item.callWindowOpen === false && item.callWindowFrom && Number.isFinite(Date.parse(item.callWindowFrom))) {
      const start = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
        .format(new Date(item.callWindowFrom));
      const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
        .format(new Date(item.callWindowFrom));
      return `Call window ${day} · ${start}–${end}`;
    }
    return `Call window open until ${end}`;
  } catch {
    return null;
  }
}

const PROGRAM_REASONS = [
  'Program follow-up due',
  'Add a note or schedule a follow-up',
  'Review contact details for program follow-up',
];

/** Why this person is on the list. */
export function callReason(item: CallQueueItem): string {
  if (PROGRAM_REASONS.includes(item.reason)) return item.reason;
  if (item.callWindowOpen === false && item.reason !== 'Call window later today') return item.reason;
  return formatOpenCallWindow(item) || item.reason;
}

/** "Callback Nov 3, 2:00 PM", or null when none is scheduled. */
export function callbackWhen(item: CallQueueItem): string | null {
  if (!item.nextFollowUpAt || !Number.isFinite(Date.parse(item.nextFollowUpAt))) return null;
  const when = new Date(item.nextFollowUpAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return `Callback ${when}`;
}
