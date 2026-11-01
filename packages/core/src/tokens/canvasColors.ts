export type CanvasColorId =
  | 'grey'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'gold'
  | 'orange'
  | 'coral'
  | 'violet'
  | 'pink';

export interface CanvasColorOption {
  id: CanvasColorId;
  label: string;
  light: string;
  dark: string;
  shadowHue: number;
  /**
   * The JOYFUL_SYSTEMS palette color this swatch is keyed to, at full
   * strength. Interactive fills (primary buttons, active chips) derive from
   * it so they read as the palette hue rather than a darkened tint.
   * Omitted for neutral swatches, which fall back to a slate fill.
   */
  source?: string;
}

export const CANVAS_COLOR_STORAGE_KEY = 'canvasColor';

export const DEFAULT_CANVAS_COLOR_ID: CanvasColorId = 'grey';

// Paper-first canvas: swatches are a whisper of hue (chroma ≈ 0.02) so bold
// color lives in the interactive layer, per JOYFUL_SYSTEMS. Interactive fills
// derive from `source`, not from these tints.
// Swatch hues are anchored to the JOYFUL_SYSTEMS palette (see JOYFUL_SYSTEMS.md):
// blue #5077FF, cyan #00C4FF, green #00C500, gold #FFD700, orange #FFA422,
// coral #FF5A6F, violet #B38CFD, pink #FF98D0.
export const CANVAS_COLOR_OPTIONS: CanvasColorOption[] = [
  {
    id: 'grey',
    label: 'Soft grey',
    light: 'oklch(0.94 0.006 264)',
    dark: 'oklch(0.22 0.008 264)',
    shadowHue: 264,
  },
  {
    id: 'blue',
    label: 'Blue',
    light: 'oklch(0.938 0.022 268)',
    dark: 'oklch(0.23 0.018 268)',
    shadowHue: 268,
    source: 'oklch(0.62 0.21 268)',
  },
  {
    id: 'cyan',
    label: 'Cyan',
    light: 'oklch(0.942 0.022 229)',
    dark: 'oklch(0.23 0.018 229)',
    shadowHue: 229,
    source: 'oklch(0.77 0.15 229)',
  },
  {
    id: 'green',
    label: 'Green',
    light: 'oklch(0.942 0.022 143)',
    dark: 'oklch(0.23 0.018 143)',
    shadowHue: 143,
    source: 'oklch(0.71 0.24 143)',
  },
  {
    id: 'gold',
    label: 'Gold',
    light: 'oklch(0.95 0.022 95)',
    dark: 'oklch(0.24 0.018 95)',
    shadowHue: 95,
    source: 'oklch(0.89 0.18 95)',
  },
  {
    id: 'orange',
    label: 'Orange',
    light: 'oklch(0.944 0.022 68)',
    dark: 'oklch(0.24 0.018 68)',
    shadowHue: 68,
    source: 'oklch(0.79 0.17 68)',
  },
  {
    id: 'coral',
    label: 'Coral',
    light: 'oklch(0.936 0.022 17)',
    dark: 'oklch(0.24 0.018 17)',
    shadowHue: 17,
    source: 'oklch(0.69 0.20 17)',
  },
  {
    id: 'violet',
    label: 'Violet',
    light: 'oklch(0.94 0.022 298)',
    dark: 'oklch(0.23 0.018 298)',
    shadowHue: 298,
    source: 'oklch(0.72 0.16 298)',
  },
  {
    id: 'pink',
    label: 'Pink',
    light: 'oklch(0.938 0.022 347)',
    dark: 'oklch(0.24 0.018 347)',
    shadowHue: 347,
    source: 'oklch(0.80 0.14 347)',
  },
];

const canvasColorMap = new Map(
  CANVAS_COLOR_OPTIONS.map((option) => [option.id, option]),
);

export function getCanvasColorOption(id: string): CanvasColorOption {
  return (
    canvasColorMap.get(id as CanvasColorId) ??
    canvasColorMap.get(DEFAULT_CANVAS_COLOR_ID)!
  );
}

export function isCanvasColorId(value: string): value is CanvasColorId {
  return canvasColorMap.has(value as CanvasColorId);
}
