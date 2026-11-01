import {
  CANVAS_COLOR_STORAGE_KEY,
  DEFAULT_CANVAS_COLOR_ID,
  buildCanvasGradient,
  buildThemeSurfaceColors,
  getCanvasColorOption,
  getCanvasGradientStops,
  isCanvasColorId,
  type CanvasColorId,
  type ThemeSurfaceColors,
} from '@memex/core';
import { updateThemeColorMeta, updateThemedFavicon } from './favicon';

/* Applies the canvas swatch to the page; the colour maths lives in @memex/core (tokens/color.ts). */

export function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

export function getStoredCanvasColorId(): CanvasColorId {
  const saved = localStorage.getItem(CANVAS_COLOR_STORAGE_KEY);
  if (saved && isCanvasColorId(saved)) {
    return saved;
  }
  return DEFAULT_CANVAS_COLOR_ID;
}

/**
 * The swatch drives Pastel Sky's accent roles: color-1 (primary fill), its
 * label color, and a text-safe ink for accent text on neutral surfaces.
 * Neutrals, surfaces, and everything else stay on the theme's values.
 */
function applyThemeSurfaceColors(surfaces: ThemeSurfaceColors): void {
  const root = document.documentElement.style;

  root.setProperty('--color-1', surfaces.activeBg);
  root.setProperty('--cte-accent-text', surfaces.activeFg);
  root.setProperty('--color-1-ink', surfaces.prominentText);
}

export function applyCanvasColor(colorId: CanvasColorId): void {
  const option = getCanvasColorOption(colorId);
  const dark = isDarkTheme();
  const baseColor = dark ? option.dark : option.light;
  const surfaces = buildThemeSurfaceColors(baseColor, dark, option.source);
  const root = document.documentElement.style;

  root.setProperty('--bookmark-experiment-bg', buildCanvasGradient(baseColor, dark));
  root.setProperty('--bookmark-canvas-base', baseColor);
  applyThemeSurfaceColors(surfaces);

  const stops = getCanvasGradientStops(baseColor, dark);
  updateThemedFavicon(stops.top, stops.base, dark);
  updateThemeColorMeta(baseColor);
}

let themeObserver: MutationObserver | null = null;

export function initCanvasColor(): void {
  applyCanvasColor(getStoredCanvasColorId());

  // Neutrals and fills differ per theme; re-derive whenever data-theme flips
  if (typeof MutationObserver !== 'undefined' && !themeObserver) {
    themeObserver = new MutationObserver(() => {
      applyCanvasColor(getStoredCanvasColorId());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }
}

export function persistCanvasColor(colorId: CanvasColorId): void {
  localStorage.setItem(CANVAS_COLOR_STORAGE_KEY, colorId);
}
