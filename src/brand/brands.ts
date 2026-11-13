// Brand presentation only. A brand value never grants access to anything:
// authorization is enforced by the server from the signed-in user's token.

export type BrandId = 'close-with-mario' | 'agent-lo-connect';

export type BrandColors = {
  /** Dark brand surface: headers, hero areas. */
  primary: string;
  /** Brand colour for decoration and large elements. */
  accent: string;
  /** Fill for buttons that carry white text (meets 4.5:1 against white). */
  accentStrong: string;
  /** Link and small-text colour on light surfaces (meets 4.5:1). */
  accentText: string;
  /** Soft tinted fill for chips and selected rows. */
  tint: string;
  /** Border colour for tinted surfaces and inputs. */
  tintBorder: string;
  /** Screen background on light surfaces. */
  canvas: string;
  textPrimary: string;
  textSecondary: string;
};

export type BrandConfig = {
  id: BrandId;
  /** Full name as written in the brand's own reference document. */
  displayName: string;
  /** Approved tagline, or null where the brand defines none. */
  tagline: string | null;
  colors: BrandColors;
};

export const AGENT_LO_CONNECT: BrandConfig = {
  id: 'agent-lo-connect',
  displayName: 'Agent | LO | Connect',
  tagline: 'Built for Both Sides of the Close.',
  colors: {
    primary: '#0B1220',
    accent: '#3B82F6',
    accentStrong: '#2563EB',
    accentText: '#1D4ED8',
    tint: '#E8F0FE',
    tintBorder: '#BFD3FB',
    canvas: '#F6F7F9',
    textPrimary: '#0B1220',
    textSecondary: '#5B6472',
  },
};

export const CLOSE_WITH_MARIO: BrandConfig = {
  id: 'close-with-mario',
  displayName: 'Close With Mario',
  tagline: null,
  colors: {
    primary: '#4C1D95',
    accent: '#7C3AED',
    accentStrong: '#7C3AED',
    accentText: '#6D28D9',
    tint: '#F5F3FF',
    tintBorder: '#DDD6FE',
    canvas: '#F1F5F9',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
  },
};

/** Identity shown before sign-in and on any screen that does not know the account's brand. */
export const PUBLIC_BRAND: BrandConfig = AGENT_LO_CONNECT;

const BRANDS: Record<BrandId, BrandConfig> = {
  'agent-lo-connect': AGENT_LO_CONNECT,
  'close-with-mario': CLOSE_WITH_MARIO,
};

/** Accepts only the two exact server values. Anything else is not a brand. */
export function parseBrandId(value: unknown): BrandId | null {
  return value === 'close-with-mario' || value === 'agent-lo-connect' ? value : null;
}

export function getBrand(id: BrandId): BrandConfig {
  return BRANDS[id];
}
