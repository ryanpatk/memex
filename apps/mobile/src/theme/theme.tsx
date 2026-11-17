import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';
import { RADIUS, SPACE, TYPE_SCALE, type TypeSize } from '@memex/core';
import { alpha, buildPalette, type Palette } from './palette';
import { buildCardsPalette, buildCardsTheme, type CardsTheme } from './cards';
import { ENV_LOOK, LOOK_STORAGE_KEY, isLook, resolveLook, type Look } from './look';

/*
 * The theme: the palette for the system appearance (light or dark), the
 * Pastel Sky spacing / radius / type scale from core, and the two depth
 * treatments of Joyful Utility (DESIGN.md → Elevation & Material):
 * paper for what you read, raised objects for what you press.
 */

export const FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  heavy: 'Inter_600SemiBold',
  /** Inter's italic faces (iOS can't slant a custom font itself). */
  italic: 'Inter_400Regular_Italic',
  heavyItalic: 'Inter_600SemiBold_Italic',
  wordmark: 'Nunito_900Black',
} as const;

export type Weight = 'regular' | 'medium' | 'heavy';

/** A full type role: size, line height and tracking travel together. */
export const typeRole = (size: TypeSize, weight: Weight = 'regular'): TextStyle => {
  const role = TYPE_SCALE[size];
  return {
    fontFamily: FONTS[weight],
    fontSize: role.size,
    lineHeight: role.line,
    letterSpacing: role.letterSpacing * role.size,
  };
};

export interface Theme {
  /** 'classic' (Pastel Sky, the default) or 'cards' (Memory Cards, behind the look flag). */
  look: Look;
  /** What Memory Cards adds (type roles, radii, label strip, molded depth); null in the classic look. */
  cards: CardsTheme | null;
  palette: Palette;
  space: typeof SPACE;
  radius: typeof RADIUS;
  /** Paper: lit top edge + layered, hue-tinted shadow (`--shadow-s/m`). */
  paperShadow: (level?: 's' | 'm') => string;
  /** Raised object bevel (`--control-raised-bevel`) plus a small drop. */
  objectShadow: string;
  /** Primary / "on" objects glow in their own colour (`--control-glow`). */
  glow: (color: string) => string;
}

export const buildTheme = (palette: Palette, look: Look = 'classic'): Theme => {
  const ink = palette.shadowInk;
  const k = palette.dark ? 2.4 : 1;
  const ring = palette.dark ? alpha('#ffffff', 0.07) : alpha(ink, 0.06);
  return {
    look,
    cards: look === 'cards' ? buildCardsTheme(palette.dark) : null,
    palette,
    space: SPACE,
    radius: RADIUS,
    paperShadow: (level = 's') =>
      level === 's'
        ? `inset 0 1px 0 0 ${palette.lit}, 0 0 0 1px ${ring}, 0 1px 1px ${alpha(ink, 0.07 * k)}, 0 2px 5px -1px ${alpha(ink, 0.09 * k)}`
        : `inset 0 1px 0 0 ${palette.lit}, 0 0 0 1px ${ring}, 0 1px 2px ${alpha(ink, 0.07 * k)}, 0 4px 10px -2px ${alpha(ink, 0.1 * k)}, 0 12px 24px -8px ${alpha(ink, 0.12 * k)}`,
    objectShadow: palette.dark
      ? `inset 0 1px 0 0 #f9fafb3d, inset 0 -1px 0 0 #13171d3d, 0 1px 2px ${alpha('#000000', 0.35)}`
      : `inset 0 1px 0 0 #ffffffb3, inset 0 -1px 0 0 #1d212729, inset 0 0 0 1px #ffffff2d, 0 0 0 1px ${alpha(ink, 0.08)}, 0 1px 2px ${alpha(ink, 0.12)}`,
    glow: (color) => `0 1px 2px ${alpha(color, 0.3)}, 0 4px 12px -4px ${alpha(color, 0.55)}`,
  };
};

/** The theme for a look and appearance: Memory Cards swaps the palette and adds its tokens. */
export const themeFor = (look: Look, dark: boolean): Theme =>
  buildTheme(look === 'cards' ? buildCardsPalette(dark) : buildPalette(dark), look);

const ThemeContext = createContext<Theme | null>(null);

interface LookControl {
  look: Look;
  /** False until the remembered look has been read (the splash waits for it). */
  ready: boolean;
  setLook: (look: Look) => void;
}

const LookContext = createContext<LookControl>({ look: 'classic', ready: true, setLook: () => {} });

/** Where the look choice persists (AsyncStorage in the app). */
export interface LookStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Persists the in-app look switch; without it the choice lasts until the app restarts. */
  lookStorage?: LookStorage;
  /** Start in this look (tests); otherwise the env decides until storage answers. */
  initialLook?: Look;
}

export const ThemeProvider = ({ children, lookStorage, initialLook }: ThemeProviderProps) => {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const [look, setLookState] = useState<Look>(() => initialLook ?? resolveLook({ env: ENV_LOOK }));
  const [ready, setReady] = useState(!lookStorage || Boolean(initialLook));

  useEffect(() => {
    if (!lookStorage || initialLook) return;
    let live = true;
    lookStorage
      .getItem(LOOK_STORAGE_KEY)
      .then((stored) => {
        if (live) setLookState(resolveLook({ stored, env: ENV_LOOK }));
      })
      .catch(() => {})
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [initialLook, lookStorage]);

  const setLook = useCallback(
    (next: Look) => {
      if (!isLook(next)) return;
      setLookState(next);
      lookStorage?.setItem(LOOK_STORAGE_KEY, next).catch(() => {});
    },
    [lookStorage],
  );

  const theme = useMemo(() => themeFor(look, dark), [dark, look]);
  const control = useMemo(() => ({ look, ready, setLook }), [look, ready, setLook]);
  return (
    <LookContext.Provider value={control}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </LookContext.Provider>
  );
};

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme needs <ThemeProvider>');
  return theme;
};

/** The look, whether it has loaded, and the switch (account sheet → New look). */
export const useLook = () => useContext(LookContext);
