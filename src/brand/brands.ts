// The app's one identity. Presentation only: it never grants access to anything.

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
  /** Full name as written in the brand's own reference document. */
  displayName: string;
  tagline: string;
  colors: BrandColors;
};

export const AGENT_LO_CONNECT: BrandConfig = {
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

/** The identity shown on every screen. */
export const PUBLIC_BRAND: BrandConfig = AGENT_LO_CONNECT;
