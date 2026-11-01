import { CANVAS_COLOR_OPTIONS } from '../constants/canvasColors';
import type { Profile } from '@memex/core';

/**
 * Each space gets an identity colour from the canvas-swatch palette (the hued
 * swatches' source colours), assigned in creation order so neighbours never
 * collide until the palette wraps. There is no stored colour yet; a per-space
 * picker would need a `profiles.color` column.
 */
const SPACE_COLORS = CANVAS_COLOR_OPTIONS.filter((option) => option.source).map(
  (option) => option.source as string,
);

export const buildSpaceColors = (spaces: Profile[] | undefined): Map<string, string> => {
  const ordered = [...(spaces ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return new Map(ordered.map((space, index) => [space.id, SPACE_COLORS[index % SPACE_COLORS.length]]));
};
