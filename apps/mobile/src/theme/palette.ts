import {
  DEFAULT_CANVAS_COLOR_ID,
  PASTEL_SKY_COLORS,
  buildThemeSurfaceColors,
  getCanvasColorOption,
  getCanvasGradientStops,
  oklchToHex,
  parseOklch,
  type CanvasColorId,
} from '@memex/core';

/*
 * The native palette: Pastel Sky neutrals and status colours from
 * @memex/core, plus the accent roles the web derives from the canvas swatch
 * (web: src/utils/canvasColor.ts). Same maths, converted to hex because
 * React Native has no OKLCH. Plain TS so it's unit-tested.
 */

export interface Palette {
  dark: boolean;
  /** Canvas gradient, top → base (the page behind paper). */
  canvasTop: string;
  canvas: string;
  /** Paper: what you read (cards, rows, bubbles sit on it). */
  paper: string;
  /** Recessed wells: text fields, pressed-in tracks. */
  well: string;
  ink: string;
  inkSoft: string;
  muted: string;
  faint: string;
  hairline: string;
  /** Primary fill (the canvas swatch's colour-1) and the label on it. */
  accent: string;
  onAccent: string;
  /** Accent used as text on paper (contrast-safe). */
  accentText: string;
  /** Same-hue tint pair: soft fill + deep ink. */
  tint: string;
  tintInk: string;
  /** Jot bubble fill and ring (accent mixed into paper, like the web). */
  bubble: string;
  bubbleRing: string;
  /** Hue-tinted shadow colour (rgb hex, apply alpha per layer). */
  shadowInk: string;
  /** The lit top edge on paper and objects. */
  lit: string;
  success: string;
  warning: string;
  error: string;
  /** Fallback colour for a space without one. */
  spaceFallback: string;
}

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

/** `amount` of colour `a` mixed into `b` (sRGB; close enough for tints). */
export const mix = (a: string, b: string, amount: number): string => {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `#${ca
    .map((v, i) => Math.round(v * amount + cb[i] * (1 - amount)).toString(16).padStart(2, '0'))
    .join('')}`;
};

/** A hex colour at an alpha (`#rrggbbaa`). */
export const alpha = (hex: string, a: number): string =>
  `${hex.slice(0, 7)}${Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, '0')}`;

const hex = (oklch: string, fallback: string) => oklchToHex(oklch)?.slice(0, 7) ?? fallback;

export const buildPalette = (dark: boolean, canvasId: CanvasColorId = DEFAULT_CANVAS_COLOR_ID): Palette => {
  const theme = PASTEL_SKY_COLORS[dark ? 'dark' : 'light'];
  const option = getCanvasColorOption(canvasId);
  const base = dark ? option.dark : option.light;
  const surfaces = buildThemeSurfaceColors(base, dark, option.source);
  const stops = getCanvasGradientStops(base, dark);
  const hue = parseOklch(base)?.h ?? 264;

  const accent = hex(surfaces.activeBg, theme.color1);
  const paper = dark ? theme.neutral3 : theme.neutral1;
  return {
    dark,
    canvasTop: hex(stops.top, theme.neutral2),
    canvas: hex(stops.base, theme.neutral2),
    paper,
    well: dark ? theme.neutral2 : theme.neutral3,
    ink: theme.neutral10,
    inkSoft: theme.neutral8,
    muted: theme.neutral7,
    faint: theme.neutral6,
    hairline: theme.neutral4,
    accent,
    onAccent: hex(surfaces.activeFg, theme.accentText),
    accentText: hex(surfaces.prominentText, theme.color1),
    tint: hex(surfaces.tintBg, theme.color2),
    tintInk: hex(surfaces.tintInk, theme.neutral9),
    bubble: mix(accent, dark ? theme.neutral2 : theme.neutral1, dark ? 0.16 : 0.13),
    bubbleRing: alpha(accent, dark ? 0.28 : 0.18),
    shadowInk: hex(`oklch(${dark ? 0.1 : 0.28} 0.02 ${hue})`, '#1d2127'),
    lit: dark ? '#ffffff0f' : '#ffffffd9',
    success: theme.success,
    warning: theme.warning,
    error: theme.error,
    spaceFallback: accent,
  };
};
