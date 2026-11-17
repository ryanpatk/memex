import { CardsSpaces } from '../../cards/CardsSpaces';

/**
 * Spaces (decision 16A's third tab; m02): a Tasks tile, then every space as
 * a colour tile with its count. A space opens its board: that space's
 * Journal with the composer filing there (decision 14B).
 */
export default function SpacesScreen() {
  return <CardsSpaces />;
}
