// Short wording for the dashboard's latest-lead rows.

const MONTH = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const DATE_SEGMENT = new RegExp(`^(\\d{1,2}\\s*(${MONTH})|(${MONTH})\\s*\\d{1,2})[a-z]*$`, 'i');
// Account prefix and ad objective: the same on every campaign, so they say nothing.
const NOISE_SEGMENT = /^(cwm|lead gen|lead generation|leads)$/i;

/** "CWM | 15 Oct | Lead Gen | Florida | DPA" → "Florida DPA". */
export function shortCampaignName(name: string | null | undefined): string {
  const original = name?.trim() ?? '';
  const kept = original
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && !NOISE_SEGMENT.test(part) && !DATE_SEGMENT.test(part));
  return kept.join(' ') || original;
}

function metaPlatformName(platform: string | null | undefined): string {
  const value = platform?.trim().toLowerCase() ?? '';
  if (value === 'ig' || value.includes('insta')) return 'Instagram';
  if (value.includes('messenger')) return 'Messenger';
  if (value.includes('whatsapp')) return 'WhatsApp';
  return 'Facebook';
}

export function leadSourceLine(lead: {
  isMeta: boolean;
  platform?: string | null;
  campaignName?: string | null;
}): string {
  if (!lead.isMeta) return 'Website';
  return [metaPlatformName(lead.platform), shortCampaignName(lead.campaignName)]
    .filter(Boolean)
    .join(' · ');
}
