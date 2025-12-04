// src/utils/outlookCalendar.ts
import { Alert, Linking } from 'react-native';

type LeadDetails = Record<string, any>;

type OpenOutlookEventParams = {
  start: Date;              // appointment start in local time
  durationMinutes?: number; // default 30
  title?: string;
  location?: string;
  notes?: string;
  leadDetails?: LeadDetails; // anything from the lead detail screen
};

/**
 * Formats a Date into an ISO-like string with timezone offset
 * Example: 2025-12-04T13:30:00-05:00
 * Uses the device's current timezone offset (handles EST/EDT automatically).
 */
function formatDateWithOffset(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  // getTimezoneOffset returns minutes behind UTC (e.g. 300 for UTC-5)
  const offsetMinutes = date.getTimezoneOffset();
  const sign = offsetMinutes > 0 ? '-' : '+';
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHoursPart = String(Math.floor(absMinutes / 60)).padStart(2, '0');
  const offsetMinutesPart = String(absMinutes % 60).padStart(2, '0');

  const offset = `${sign}${offsetHoursPart}:${offsetMinutesPart}`;

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}

/**
 * Build a nicely formatted "Lead Details" section from an arbitrary object.
 */
function buildLeadDetailsSection(leadDetails?: LeadDetails): string | null {
  if (!leadDetails) return null;

  const entries = Object.entries(leadDetails).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );

  if (entries.length === 0) return null;

  const lines: string[] = ['Lead Details:'];
  for (const [key, value] of entries) {
    if (key === 'Task History') {
      const historyStr = String(value);
      const historyLines = historyStr.split('\n').filter(Boolean);

      if (historyLines.length > 0) {
        lines.push('Task History:');
        for (const line of historyLines) {
          lines.push(`  ${line}`);
        }
      }
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Fallback: open default email app with prefilled subject/body.
 * This does NOT create a calendar event, but gives a reliable email reminder
 * with the appointment + lead details.
 */
async function openEmailFallback(
  start: Date,
  durationMinutes: number,
  title: string,
  location: string,
  notes: string,
  leadDetails?: LeadDetails
) {
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const startStr = start.toLocaleString();
  const endStr = end.toLocaleString();

  const subject = title || 'Call / Appointment';

  const bodyLines = [
    `Appointment: ${title}`,
    '',
    `Start: ${startStr}`,
    `End:   ${endStr}`,
  ];

  if (location) {
    bodyLines.push(`Location: ${location}`);
  }

  if (notes) {
    bodyLines.push('');
    bodyLines.push('Notes:');
    bodyLines.push(notes);
  }

  const leadSection = buildLeadDetailsSection(leadDetails);
  if (leadSection) {
    bodyLines.push('');
    bodyLines.push(leadSection);
  }

  const body = bodyLines.join('\n');

  const mailto = `mailto:?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  const canOpenMail = await Linking.canOpenURL(mailto);
  if (!canOpenMail) {
    Alert.alert(
      'No email app found',
      'Could not open an email app. Please create the reminder manually.'
    );
    return;
  }

  try {
    await Linking.openURL(mailto);
  } catch (err) {
    console.error('Failed to open email fallback', err);
    Alert.alert(
      'Error',
      'Could not open the email app. Please create the reminder manually.'
    );
  }
}

/**
 * Opens Outlook "New Event" with prefilled fields.
 * Uses ms-outlook://events/new URL scheme.
 * Falls back to default email app if Outlook is not available.
 * Includes lead details in the body where possible.
 */
export async function openOutlookEvent({
  start,
  durationMinutes = 30,
  title = 'Call / Appointment',
  location = '',
  notes = '',
  leadDetails,
}: OpenOutlookEventParams) {
  // Compute end time
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const startStr = formatDateWithOffset(start);
  const endStr = formatDateWithOffset(end);

  // Merge notes + lead details into a single "fullNotes" string
  let fullNotes = notes || '';
  const leadSection = buildLeadDetailsSection(leadDetails);

  if (leadSection) {
    if (fullNotes) {
      fullNotes += '\n\n';
    }
    fullNotes += leadSection;
  }

  // Manually build query string so spaces are encoded as %20 (not '+'),
  // since Outlook does not decode '+' to spaces in the description field.
  const queryParts: string[] = [];

  queryParts.push(`title=${encodeURIComponent(title)}`);
  queryParts.push(`start=${encodeURIComponent(startStr)}`);
  queryParts.push(`end=${encodeURIComponent(endStr)}`);

  if (location) {
    queryParts.push(`location=${encodeURIComponent(location)}`);
  }

  if (fullNotes) {
    queryParts.push(`description=${encodeURIComponent(fullNotes)}`);
  }

  const url = `ms-outlook://events/new?${queryParts.join('&')}`;

  const canOpenOutlook = await Linking.canOpenURL(url);

  if (!canOpenOutlook) {
    // Outlook not available -> fall back to email
    await openEmailFallback(
      start,
      durationMinutes,
      title,
      location,
      fullNotes,
      leadDetails
    );
    return;
  }

  try {
    await Linking.openURL(url);
  } catch (err) {
    console.log('Failed to open Outlook calendar event (non-fatal)', err);
    // If Outlook fails at this point, also fall back to email
    await openEmailFallback(
      start,
      durationMinutes,
      title,
      location,
      fullNotes,
      leadDetails
    );
  }
}
