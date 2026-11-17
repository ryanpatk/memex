import { CANVAS_COLOR_OPTIONS } from './canvasColors';
import { MC_SPACE_COLORS } from './memoryCards';
import type { Profile } from '../types';

/**
 * Each space gets an identity colour. A colour the user chose (the additive
 * `profiles.color` column, decision x11 B, 2026-11-16) wins; otherwise one is
 * assigned from a palette in creation order, so neighbours never collide until
 * the palette wraps. Databases without the column simply never return a
 * colour, and every space stays automatic.
 *
 * The default palette is the canvas swatches' source colours (Pastel Sky);
 * the Memory Cards look passes MC_SPACE_COLOR_VALUES.
 */
const SPACE_COLORS = CANVAS_COLOR_OPTIONS.filter((option) => option.source).map(
  (option) => option.source as string,
);

/** The Memory Cards space palette as plain values, for buildSpaceColors. */
export const MC_SPACE_COLOR_VALUES: readonly string[] = MC_SPACE_COLORS.map((color) => color.value);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** A stored space colour, or null when there is none or it isn't a #rrggbb value. */
export const chosenSpaceColor = (space: Pick<Profile, 'color'> | undefined | null): string | null => {
  const value = space?.color?.trim();
  return value && HEX_COLOR.test(value) ? value.toLowerCase() : null;
};

export const buildSpaceColors = (
  spaces: Profile[] | undefined,
  palette: readonly string[] = SPACE_COLORS,
): Map<string, string> => {
  const ordered = [...(spaces ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return new Map(
    ordered.map((space, index) => [space.id, chosenSpaceColor(space) ?? palette[index % palette.length]]),
  );
};
