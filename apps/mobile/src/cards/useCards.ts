import { useTheme } from '../theme/theme';
import type { CardsTheme } from '../theme/cards';

/** The Memory Cards tokens; only call inside components that render in the cards look. */
export const useCards = (): CardsTheme => {
  const { cards } = useTheme();
  if (!cards) throw new Error('useCards outside the Memory Cards look');
  return cards;
};
