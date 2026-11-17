import { useMemo } from 'react';
import { useTheme } from '../theme/theme';
import { buildCardsTheme, type CardsTheme } from '../theme/cards';

/** The Memory Cards tokens (shared pieces like the menu use them in either look). */
export const useCards = (): CardsTheme => {
  const { cards, palette } = useTheme();
  const fallback = useMemo(() => buildCardsTheme(palette.dark), [palette.dark]);
  return cards ?? fallback;
};
