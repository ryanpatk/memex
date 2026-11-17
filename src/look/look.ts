import { useSyncExternalStore } from 'react';

/**
 * Which look the app wears (Memory Cards, design/memory-cards/):
 * - 'classic' — Pastel Sky, the app as it ships today. The default.
 * - 'cards'   — Memory Cards, the redesign Ryan approved on 2026-11-16.
 *
 * The look is `html[data-look]`. Everything Memory Cards draws is scoped to
 * `html[data-look="cards"]` (src/styles/cards/), and components branch on
 * `useLook()`, so the classic look is untouched unless the flag is on.
 *
 * Turning it on, strongest first:
 * 1. `?look=cards` or `?look=classic` in the URL (remembered in this browser)
 * 2. The remembered choice (localStorage `memex.look`, written by 1 and by
 *    the “New look” switch in Settings, both looks)
 * 3. `VITE_MEMEX_LOOK=cards` at build/dev time
 * 4. 'classic'
 */
export type Look = 'classic' | 'cards';

export const LOOKS: readonly Look[] = ['classic', 'cards'];
export const DEFAULT_LOOK: Look = 'classic';
export const LOOK_STORAGE_KEY = 'memex.look';
export const LOOK_PARAM = 'look';
const EVENT = 'memex:look';

export const isLook = (value: unknown): value is Look => value === 'classic' || value === 'cards';

export interface LookInputs {
  /** The `?look=` value, if any. */
  query?: string | null;
  /** The remembered choice, if any. */
  stored?: string | null;
  /** `import.meta.env.VITE_MEMEX_LOOK`, if set. */
  env?: string | null;
}

/** Picks the look from the URL, the remembered choice and the env, in that order. */
export const resolveLook = ({ query, stored, env }: LookInputs): Look => {
  const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? null;
  for (const candidate of [normalize(query), normalize(stored), normalize(env)]) {
    if (isLook(candidate)) return candidate;
  }
  return DEFAULT_LOOK;
};

const readStored = (): string | null => {
  try {
    return window.localStorage.getItem(LOOK_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStored = (look: Look) => {
  try {
    window.localStorage.setItem(LOOK_STORAGE_KEY, look);
  } catch {
    /* storage unavailable: the look still applies for this page */
  }
};

let current: Look = DEFAULT_LOOK;
let cardsStylesLoaded: Promise<unknown> | null = null;

/** Loads the Memory Cards stylesheet and fonts once (a separate chunk, so the classic look never downloads them). */
export const loadCardsStyles = () => {
  cardsStylesLoaded ??= import('../styles/cards');
  return cardsStylesLoaded;
};

const apply = (look: Look) => {
  current = look;
  document.documentElement.dataset.look = look;
};

/**
 * Applies the look before the first render. A `?look=` value is remembered so
 * it survives navigation; the address bar is left alone.
 */
export const initLook = (): Look => {
  const query = new URLSearchParams(window.location.search).get(LOOK_PARAM);
  const look = resolveLook({ query, stored: readStored(), env: import.meta.env.VITE_MEMEX_LOOK });
  if (isLook(query?.trim().toLowerCase())) writeStored(look);
  if (look === 'cards') void loadCardsStyles();
  apply(look);
  return look;
};

export const getLook = (): Look => current;

/** Switches looks now and remembers the choice in this browser. */
export const setLook = async (look: Look) => {
  writeStored(look);
  if (look === 'cards') await loadCardsStyles();
  apply(look);
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
};

/** The current look; re-renders when it changes. */
export const useLook = (): Look => useSyncExternalStore(subscribe, getLook, () => DEFAULT_LOOK);

/** True in the Memory Cards look. */
export const useCardsLook = () => useLook() === 'cards';

/* ---------- Heading font (Memory Cards only) ---------- */

/**
 * Memory Cards' heading font: 'rounded' (Nunito, the default — the toy feel)
 * or 'plex' (IBM Plex Sans, the Joyful Systems brand face). One token,
 * html[data-cards-font], switched in Settings → Font.
 */
export type CardsFont = 'rounded' | 'plex';
const FONT_STORAGE_KEY = 'memex.cards-font';
const FONT_EVENT = 'memex:cards-font';

const readFont = (): CardsFont => {
  try {
    return window.localStorage.getItem(FONT_STORAGE_KEY) === 'plex' ? 'plex' : 'rounded';
  } catch {
    return 'rounded';
  }
};

const applyFont = (font: CardsFont) => {
  if (font === 'plex') document.documentElement.dataset.cardsFont = 'plex';
  else delete document.documentElement.dataset.cardsFont;
};

export const initCardsFont = () => applyFont(readFont());

export const setCardsFont = (font: CardsFont) => {
  try {
    window.localStorage.setItem(FONT_STORAGE_KEY, font);
  } catch {
    /* storage unavailable */
  }
  applyFont(font);
  window.dispatchEvent(new Event(FONT_EVENT));
};

const subscribeFont = (onChange: () => void) => {
  window.addEventListener(FONT_EVENT, onChange);
  return () => window.removeEventListener(FONT_EVENT, onChange);
};

export const useCardsFont = (): CardsFont => useSyncExternalStore(subscribeFont, readFont, () => 'rounded');
