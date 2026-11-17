/*
 * The colour roles every screen reads (theme/cards.ts fills them with
 * Memory Cards colours), and the two small colour helpers React Native
 * needs: mixing two hex colours and adding alpha. Plain TS, tested.
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
