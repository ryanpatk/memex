import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { buildCardsPalette, buildCardsTheme, type CardsTheme } from './cards';
import { forgetLegacyLook, type LegacyStorage } from './legacyLook';
import type { Palette } from './palette';

/*
 * The theme: Memory Cards (design/memory-cards/; the look Ryan approved on
 * 2026-11-16 and the phone's only look since 2026-11-17) for the system
 * appearance, light or dark. `palette` holds the colour roles every screen
 * reads; `cards` what the look adds (type roles, radii, the label strip,
 * molded depth). Both come from @memex/core's tokens (theme/cards.ts).
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

export interface Theme {
  palette: Palette;
  cards: CardsTheme;
}

export const themeFor = (dark: boolean): Theme => ({ palette: buildCardsPalette(dark), cards: buildCardsTheme(dark) });

const ThemeContext = createContext<Theme | null>(null);

export const ThemeProvider = ({
  children,
  legacyStorage,
}: {
  children: ReactNode;
  /** Where the old look choice may linger (AsyncStorage in the app); it's removed once. */
  legacyStorage?: LegacyStorage;
}) => {
  const dark = useColorScheme() === 'dark';
  useEffect(() => forgetLegacyLook(legacyStorage), [legacyStorage]);
  const theme = useMemo(() => themeFor(dark), [dark]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme needs <ThemeProvider>');
  return theme;
};
