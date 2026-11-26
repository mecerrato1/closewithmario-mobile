// Mirrors the website's "My new leads" hours summary.

export type ProgramSchedule = Record<string, [string, string]>;

/** Only loan officers approved for the Meta Lead Program get the switch, administrators included. */
export function showsAvailabilitySwitch(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false;
  const { membership } = response as { membership?: { status?: unknown } | null };
  return membership?.status === 'approved';
}

function localTime(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '';
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(part('weekday')) + 1;
  // Some engines write midnight as 24:00.
  const hour = part('hour') === '24' ? '00' : part('hour');
  return { day, time: `${hour}:${part('minute')}` };
}

const clock = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour >= 12 ? 'PM' : 'AM'}`;
};

const valid = (hours?: [string, string]): hours is [string, string] =>
  hours?.length === 2 && hours.every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) && hours[0] !== hours[1];

/** Today's saved hours. Not a claim that every routing rule is met. */
export function hoursSummary(
  schedule: ProgramSchedule | null | undefined,
  timezone: string | null | undefined,
  at: Date = new Date()
): string {
  if (!timezone || !schedule) return 'Hours not set';
  try {
    const local = localTime(at, timezone);
    if (!local.day) return 'Hours unavailable';
    const today = schedule[String(local.day)];
    const yesterday = schedule[String(local.day === 1 ? 7 : local.day - 1)];
    const windows: string[] = [];
    if (valid(yesterday) && yesterday[0] > yesterday[1] && local.time < yesterday[1]) {
      windows.push(`until ${clock(yesterday[1])} (from yesterday)`);
    }
    if (valid(today)) {
      windows.push(`${clock(today[0])}–${clock(today[1])}${today[0] > today[1] ? ' (next day)' : ''}`);
    }
    return windows.length ? `Today: ${windows.join('; ')}` : 'No hours scheduled today';
  } catch {
    return 'Hours unavailable';
  }
}
