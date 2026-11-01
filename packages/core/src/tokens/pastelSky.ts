/*
 * Pastel Sky design tokens as TS constants (ROADMAP.md §3.1), for clients
 * that can't read CSS variables — the Expo app, OG images, MCP renders. The
 * web app's source of truth stays src/styles/pastel-sky.css; a unit test
 * (src/styles/pastelSky.test.ts) fails if these drift from it. Only literal
 * values live here; derived roles (shadows, gloss, color-mix) stay in CSS.
 *
 * color1 is the theme's own primary; memex replaces it at runtime with the
 * user's canvas swatch (tokens/color.ts → buildThemeSurfaceColors).
 */

export interface PastelSkyColors {
  color1: string;
  color2: string;
  color3: string;
  color4: string;
  neutral1: string;
  neutral2: string;
  neutral3: string;
  neutral4: string;
  neutral5: string;
  neutral6: string;
  neutral7: string;
  neutral8: string;
  neutral9: string;
  neutral10: string;
  success: string;
  warning: string;
  error: string;
  /** Label on a color1 fill. */
  accentText: string;
}

export const PASTEL_SKY_COLORS: Readonly<Record<'light' | 'dark', PastelSkyColors>> = {
  light: {
    color1: '#247474',
    color2: '#bce0d9',
    color3: '#c0c9df',
    color4: '#dfcbb6',
    neutral1: '#ffffff',
    neutral2: '#f9fafb',
    neutral3: '#f1f2f4',
    neutral4: '#dde0e5',
    neutral5: '#c0c6cd',
    neutral6: '#8f959c',
    neutral7: '#6a6f75',
    neutral8: '#4c5157',
    neutral9: '#30353a',
    neutral10: '#1d2127',
    success: '#247348',
    warning: '#94651e',
    error: '#bd3d42',
    accentText: '#f9fafb',
  },
  dark: {
    color1: '#8ed6cd',
    color2: '#659b94',
    color3: '#9aa8c7',
    color4: '#bfaa91',
    neutral1: '#13171d',
    neutral2: '#1d2127',
    neutral3: '#272b31',
    neutral4: '#373c41',
    neutral5: '#51565c',
    neutral6: '#7c8288',
    neutral7: '#a7adb4',
    neutral8: '#c8ced5',
    neutral9: '#e6e8ec',
    neutral10: '#f9fafb',
    success: '#8fd5ad',
    warning: '#e5c279',
    error: '#f49fa5',
    accentText: '#1d2127',
  },
};

export type TypeSize = 'xxs' | 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl';

/** A full type role: size, line height and letter spacing travel together (px, px, em). */
export interface TypeRole {
  size: number;
  line: number;
  letterSpacing: number;
}

export const TYPE_SCALE: Readonly<Record<TypeSize, TypeRole>> = {
  xxs: { size: 10, line: 14, letterSpacing: 0.02 },
  xs: { size: 12, line: 16, letterSpacing: 0.01 },
  s: { size: 14, line: 20, letterSpacing: 0.01 },
  m: { size: 16, line: 24, letterSpacing: 0 },
  l: { size: 24, line: 32, letterSpacing: -0.01 },
  xl: { size: 37, line: 41, letterSpacing: -0.01 },
  xxl: { size: 49, line: 53, letterSpacing: -0.02 },
};

export const FONT_WEIGHTS = { regular: 400, medium: 500, heavy: 600 } as const;

/** Every text role uses Inter; the wordmark alone uses Nunito Black in WORDMARK_INK. */
export const FONT_FAMILY = { ui: 'Inter', wordmark: 'Nunito' } as const;

/** Spacing in px. */
export const SPACE = { zero: 0, xxs: 4, xs: 8, s: 12, m: 17, l: 25, xl: 33, xxl: 50 } as const;

/** Corner radius in px. */
export const RADIUS = { zero: 0, xs: 4, s: 8, m: 12, l: 19, xl: 29, full: 9999 } as const;

/** Motion durations in ms (the theme's springs are CSS linear() curves). */
export const MOTION = { duration: 400, largeDuration: 600, pressDistance: 1, popupScale: 0.98 } as const;

/** Joyful Utility depth: hover swell / press settle scales and the card lift (px). */
export const DEPTH = { hoverSwell: 1.03, hoverSwellIcon: 1.08, hoverLift: -2, pressSettle: 0.97 } as const;

/** The memex wordmark's ink: Joyful Systems blue, darkened for text. */
export const WORDMARK_INK = '#2f55d6';
