import { useSyncExternalStore } from 'react';

/**
 * Memory Cards' heading font: 'rounded' (Nunito, the default — the toy feel)
 * or 'plex' (IBM Plex Sans, the Joyful Systems brand face). One token,
 * html[data-cards-font], switched in Settings → Font and remembered in this
 * browser.
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
