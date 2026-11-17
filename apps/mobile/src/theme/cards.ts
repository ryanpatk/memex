import {
  MC_COLORS_DARK,
  MC_COLORS_LIGHT,
  MC_MOTION,
  MC_RADIUS,
  MC_SIZE,
  MC_SPACE,
  MC_SPACE_COLORS,
  MC_TYPE,
  type MemoryCardsColors,
} from '@memex/core';
import { alpha, mix, type Palette } from './palette';

/*
 * The Memory Cards look for React Native, from @memex/core's tokens
 * (tokens/memoryCards.ts, mirrored from the web's src/styles/cards/tokens.css).
 * buildCardsPalette fills the existing Palette roles with Memory Cards
 * colours, so every screen picks the look up through useTheme(); CARDS holds
 * what the look adds (type roles, radii, the label strip, molded depth).
 * Plain TS so it's unit-tested.
 */

export const CARDS_FONTS = {
  display: 'Nunito_900Black',
  displayHeavy: 'Nunito_800ExtraBold',
  displayBold: 'Nunito_700Bold',
  ui: 'Inter_500Medium',
  uiHeavy: 'Inter_600SemiBold',
} as const;

export type CardsRole = 'hero' | 'h1' | 'h2' | 'h3' | 'title' | 'body' | 'label' | 'labelUi';

/** Phone type roles (m01–m09): hero 52, card titles 24, nothing under 16. */
export const CARDS_TYPE: Readonly<Record<CardsRole, { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }>> = {
  hero: { fontFamily: CARDS_FONTS.display, fontSize: MC_TYPE.heroPhone, lineHeight: MC_TYPE.heroPhone, letterSpacing: -0.025 * MC_TYPE.heroPhone },
  h1: { fontFamily: CARDS_FONTS.display, fontSize: 36, lineHeight: 40, letterSpacing: -0.015 * 36 },
  h2: { fontFamily: CARDS_FONTS.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.01 * 28 },
  h3: { fontFamily: CARDS_FONTS.displayHeavy, fontSize: 24, lineHeight: 29, letterSpacing: 0 },
  title: { fontFamily: CARDS_FONTS.displayHeavy, fontSize: 20, lineHeight: 25, letterSpacing: 0 },
  body: { fontFamily: CARDS_FONTS.ui, fontSize: MC_TYPE.body, lineHeight: 26, letterSpacing: 0 },
  label: { fontFamily: CARDS_FONTS.displayHeavy, fontSize: MC_TYPE.label, lineHeight: 20, letterSpacing: 0 },
  labelUi: { fontFamily: CARDS_FONTS.uiHeavy, fontSize: MC_TYPE.label, lineHeight: 21, letterSpacing: 0 },
};

export interface CardsTheme {
  colors: MemoryCardsColors;
  type: typeof CARDS_TYPE;
  space: typeof MC_SPACE;
  radius: typeof MC_RADIUS;
  size: typeof MC_SIZE;
  motion: typeof MC_MOTION;
  /** The eight space colours, in automatic order. */
  spaceColors: readonly string[];
  /** Molded plastic: lit top edge + darker lip (a pressed control drops the lip). */
  molded: (pressed?: boolean) => string;
  /** Card elevation (`--mc-sh2` with the lit edge). */
  cardShadow: string;
  /** Small elevation (`--mc-sh1`). */
  softShadow: string;
  /** Floating menus and toasts (`--mc-sh3`). */
  menuShadow: string;
  /** Colours mc_css.ts uses that core's token set doesn't carry (scrim, diff marks, the due chip). */
  extra: CardsExtraColors;
}

export interface CardsExtraColors {
  /** Behind sheets and menus (`.dim`). */
  scrim: string;
  /** A lighter scrim for menus over the page (m08). */
  scrimLight: string;
  /** Inserted / removed text in a proposal's diff (`.ins`, `.del`). */
  insBg: string;
  insInk: string;
  delBg: string;
  delInk: string;
  /** The due chip for today (`.due.today`). */
  todayBg: string;
  todayInk: string;
  /** “Not sent yet” (m06): the label strip of a save waiting on the phone. */
  waiting: string;
}

const EXTRA_LIGHT: CardsExtraColors = {
  scrim: '#1e24346b',
  scrimLight: '#1e243440',
  insBg: '#cdeedb',
  insInk: '#135d33',
  delBg: '#fbd5d7',
  delInk: '#8a1f25',
  todayBg: '#fff1c7',
  todayInk: '#7a5400',
  waiting: '#ff9f2e',
};

const EXTRA_DARK: CardsExtraColors = {
  ...EXTRA_LIGHT,
  scrim: '#000000a0',
  scrimLight: '#00000066',
  insBg: '#1f4a32',
  insInk: '#b7f0cf',
  delBg: '#5a2328',
  delInk: '#ffc2c6',
  todayBg: '#4a3d16',
  todayInk: '#ffd970',
};

export const buildCardsTheme = (dark: boolean): CardsTheme => {
  const colors = dark ? MC_COLORS_DARK : MC_COLORS_LIGHT;
  const lit = dark ? 'inset 0 1px 0 0 #ffffff12' : 'inset 0 2px 0 0 #ffffffcc';
  return {
    colors,
    type: CARDS_TYPE,
    space: MC_SPACE,
    radius: MC_RADIUS,
    size: MC_SIZE,
    motion: MC_MOTION,
    spaceColors: MC_SPACE_COLORS.map((c) => c.value),
    molded: (pressed = false) =>
      pressed ? 'inset 0 3px 0 0 #00000038' : 'inset 0 -5px 0 0 #00000029, inset 0 2px 0 0 #ffffff59',
    cardShadow: dark
      ? `${lit}, 0 2px 0 0 #0000004d, 0 18px 36px -18px #000000b3`
      : `${lit}, 0 2px 0 0 #1d21270d, 0 18px 36px -18px #1d212752`,
    softShadow: dark ? '0 2px 0 0 #0000004d, 0 8px 18px -10px #00000099' : '0 2px 0 0 #1d21270d, 0 8px 18px -10px #1d212740',
    menuShadow: dark ? '0 0 0 1px #ffffff14, 0 40px 80px -30px #000000cc' : '0 2px 0 0 #1d21270d, 0 40px 80px -30px #00000080',
    extra: dark ? EXTRA_DARK : EXTRA_LIGHT,
  };
};

/**
 * The Palette roles in Memory Cards colours: a flat cool canvas (no swatch
 * gradient), white paper, the primary blue for actions, ink on every colour
 * fill.
 */
export const buildCardsPalette = (dark: boolean): Palette => {
  const c = dark ? MC_COLORS_DARK : MC_COLORS_LIGHT;
  return {
    dark,
    canvasTop: c.bg,
    canvas: c.bg,
    paper: c.paper,
    well: c.well,
    ink: c.ink,
    inkSoft: c.ink,
    muted: c.muted,
    faint: c.faint,
    hairline: c.line,
    accent: c.primary,
    onAccent: '#ffffff',
    accentText: c.primaryInk,
    tint: mix(c.primary, c.paper, dark ? 0.24 : 0.14),
    tintInk: c.primaryInk,
    bubble: c.paper,
    bubbleRing: alpha(c.line, 0.6),
    shadowInk: '#1d2127',
    lit: dark ? '#ffffff12' : '#ffffffcc',
    success: c.ok,
    warning: c.warn,
    error: c.error,
    spaceFallback: c.line,
  };
};

/** A note card's paper: the space's colour tinted into paper (`--mc-tint`). */
export const noteTint = (color: string | null | undefined, theme: CardsTheme) =>
  color ? mix(color, theme.colors.paper, theme.colors.noteTint / 100) : theme.colors.notePaper;

type Size = 'xxs' | 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl';

/**
 * The classic type sizes as Memory Cards roles, so existing screens follow
 * the look's rule (nothing under 16; headings in rounded Nunito):
 * xxs–s → 16 labels, m → 18 body, l → 24 h3, xl → 28 h2, xxl → 36 h1.
 * Heavy text uses Nunito; regular and medium stay Inter.
 */
export const cardsTextRole = (size: Size, weight: 'regular' | 'medium' | 'heavy' = 'regular') => {
  const heavy = weight === 'heavy';
  switch (size) {
    case 'xxs':
    case 'xs':
    case 's':
      return heavy ? CARDS_TYPE.label : { ...CARDS_TYPE.labelUi, fontFamily: weight === 'regular' ? 'Inter_400Regular' : CARDS_FONTS.ui };
    case 'm':
      return heavy
        ? { fontFamily: CARDS_FONTS.displayHeavy, fontSize: MC_TYPE.body, lineHeight: 24, letterSpacing: 0 }
        : { ...CARDS_TYPE.body, fontFamily: weight === 'regular' ? 'Inter_400Regular' : CARDS_FONTS.ui };
    case 'l':
      return heavy ? CARDS_TYPE.h3 : { ...CARDS_TYPE.body, fontSize: 22, lineHeight: 30 };
    case 'xl':
      return CARDS_TYPE.h2;
    case 'xxl':
      return CARDS_TYPE.h1;
  }
};
