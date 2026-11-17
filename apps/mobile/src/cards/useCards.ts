import { useTheme } from '../theme/theme';
import type { CardsTheme } from '../theme/cards';

/** The Memory Cards tokens (type roles, radii, colours, molded depth). */
export const useCards = (): CardsTheme => useTheme().cards;
