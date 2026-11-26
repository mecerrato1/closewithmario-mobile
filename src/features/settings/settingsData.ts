// Pure rules shared with the website's Profile settings.

export const FLORIDA_COUNTIES = ['Alachua', 'Baker', 'Bay', 'Bradford', 'Brevard', 'Broward', 'Calhoun', 'Charlotte', 'Citrus', 'Clay', 'Collier', 'Columbia', 'DeSoto', 'Dixie', 'Duval', 'Escambia', 'Flagler', 'Franklin', 'Gadsden', 'Gilchrist', 'Glades', 'Gulf', 'Hamilton', 'Hardee', 'Hendry', 'Hernando', 'Highlands', 'Hillsborough', 'Holmes', 'Indian River', 'Jackson', 'Jefferson', 'Lafayette', 'Lake', 'Lee', 'Leon', 'Levy', 'Liberty', 'Madison', 'Manatee', 'Marion', 'Martin', 'Miami-Dade', 'Monroe', 'Nassau', 'Okaloosa', 'Okeechobee', 'Orange', 'Osceola', 'Palm Beach', 'Pasco', 'Pinellas', 'Polk', 'Putnam', 'Santa Rosa', 'Sarasota', 'Seminole', 'St. Johns', 'St. Lucie', 'Sumter', 'Suwannee', 'Taylor', 'Union', 'Volusia', 'Wakulla', 'Walton', 'Washington'];

/** null means all counties; an array is the specific choice. */
export function countiesChanged(saved: string[] | null, next: string[] | null): boolean {
  if (saved === null || next === null) return saved !== next;
  return JSON.stringify([...saved].sort()) !== JSON.stringify([...next].sort());
}

export type DpaLink = { path: string; publicPath?: string; slug?: string };

/** Accepts only the two address shapes the website issues. */
export function readDpaLink(data: unknown): DpaLink {
  const link = data as DpaLink;
  if (typeof link?.path !== 'string' || !/^\/dpa(?:\?lo=[0-9a-f-]{36}|\/[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(link.path)) {
    throw new Error('Invalid link');
  }
  if (link.publicPath && (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.publicPath) || link.publicPath !== `/${link.slug}`)) {
    throw new Error('Invalid public link');
  }
  return link;
}

export function normalizeRecoveryPhone(value: string): string {
  if (value.length > 40 || /[^\d+().\s-]/.test(value)) throw new Error('Enter a valid US mobile number.');
  const digits = value.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) throw new Error('Enter a valid US mobile number.');
  return `+1${national}`;
}

type PhoneUser = { phone?: string | null; phone_confirmed_at?: string | null; is_sso_user?: boolean };

/** Only a number Auth has confirmed counts; profile contact numbers never do. */
export function confirmedRecoveryPhone(user: PhoneUser): string | null {
  if (!user.phone_confirmed_at || !user.phone || user.is_sso_user) return null;
  try {
    return normalizeRecoveryPhone(user.phone);
  } catch {
    return null;
  }
}

export const maskedPhone = (phone: string) => `••• ••• ${phone.slice(-4)}`;

/** "Nov 26, 2026", or empty when the server sent no usable date. */
export function shortDate(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
