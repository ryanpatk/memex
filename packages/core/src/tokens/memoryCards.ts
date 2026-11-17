/*
 * Memory Cards design tokens as TS constants, for clients that can't read CSS
 * variables (the Expo app, OG images, MCP renders). The look Ryan approved on
 * 2026-11-16 (design/memory-cards/: README.md, REFINEMENT-NOTES.md; the token
 * source there is mc_css.ts). The web app's source of truth is
 * src/styles/cards/tokens.css (`html:root`); a unit test
 * (src/styles/memoryCards.test.ts) fails if these drift from it.
 *
 * Memory Cards is memex's only look since 2026-11-17 (the classic Pastel Sky
 * look is the tag `classic-design-final`).
 */

/** Type scale in px. Nothing smaller than `label` anywhere. */
export const MC_TYPE = {
  hero: 80,
  heroPhone: 52,
  h1: 44,
  h2: 32,
  h3: 26,
  body: 18,
  label: 16,
} as const;

/** Spacing scale in px (`--mc-s1`…`--mc-s9`). */
export const MC_SPACE = [4, 8, 12, 16, 24, 32, 40, 48, 64] as const;

export const MC_RADIUS = {
  chip: 12,
  picture: 16,
  card: 28,
  sheet: 40,
  pill: 999,
} as const;

export const MC_SIZE = {
  /** Smallest hit target. */
  hit: 44,
  /** Standard control height. */
  control: 60,
  /** Small control height. */
  controlSmall: 48,
  /** The label strip at the foot of every card. */
  label: 44,
} as const;

/** Motion durations in ms, and the one easing. */
export const MC_MOTION = {
  press: 120,
  base: 200,
  write: 280,
  ease: 'cubic-bezier(.2,.8,.2,1)',
} as const;

export interface MemoryCardsColors {
  ink: string;
  muted: string;
  faint: string;
  line: string;
  bg: string;
  paper: string;
  well: string;
  /** Unfiled notes' paper. */
  notePaper: string;
  primary: string;
  primaryInk: string;
  ring: string;
  ok: string;
  warn: string;
  error: string;
  errorBg: string;
  toast: string;
  agent: string;
  agentBg: string;
  /** Ink on every colour fill (label strips, jots, filled pills), both themes. */
  onColor: string;
  /** How much of a space's colour tints a note card, as a percentage. */
  noteTint: number;
}

export const MC_COLORS_LIGHT: MemoryCardsColors = {
  ink: '#1d2127',
  muted: '#62676e',
  faint: '#8d939b',
  line: '#dde0e5',
  bg: '#eef2f8',
  paper: '#ffffff',
  well: '#f1f4f9',
  notePaper: '#fff6cc',
  primary: '#5077ff',
  primaryInk: '#2f55d6',
  ring: '#3d63f0',
  ok: '#1f9d55',
  warn: '#b7791f',
  error: '#e5484d',
  errorBg: '#fdecec',
  toast: '#1d2127',
  agent: '#6a43d8',
  agentBg: '#ece5ff',
  onColor: '#1d2127',
  noteTint: 22,
};

export const MC_COLORS_DARK: MemoryCardsColors = {
  ...MC_COLORS_LIGHT,
  ink: '#eef1f6',
  muted: '#a9b0ba',
  faint: '#838a94',
  line: '#363c46',
  bg: '#14171d',
  paper: '#1f242c',
  well: '#2a3039',
  notePaper: '#3d3826',
  primaryInk: '#9db2ff',
  ring: '#9db2ff',
  errorBg: '#3a2224',
  toast: '#3a414d',
  agent: '#c9b8ff',
  agentBg: '#352c5c',
  noteTint: 30,
};

export interface MemoryCardsSpaceColor {
  key: string;
  label: string;
  value: string;
}

/**
 * The eight space colours, in the order automatic colours are handed out
 * (creation order) and the order the swatch picker shows them.
 */
export const MC_SPACE_COLORS: readonly MemoryCardsSpaceColor[] = [
  { key: 'coral', label: 'Coral', value: '#ff5a6f' },
  { key: 'cyan', label: 'Cyan', value: '#00b8f0' },
  { key: 'gold', label: 'Gold', value: '#ffc928' },
  { key: 'blue', label: 'Blue', value: '#5077ff' },
  { key: 'violet', label: 'Violet', value: '#b38cfd' },
  { key: 'green', label: 'Green', value: '#2fbf71' },
  { key: 'orange', label: 'Orange', value: '#ff9f2e' },
  { key: 'pink', label: 'Pink', value: '#ff8fc8' },
];

/** Font stacks for the two heading families (one token switches them). */
export const MC_FONTS = {
  rounded: { display: 'Nunito', ui: 'Inter' },
  plex: { display: 'IBM Plex Sans', ui: 'IBM Plex Sans' },
} as const;

export type MemoryCardsFont = keyof typeof MC_FONTS;
