import type { Profile } from './types';

/*
 * Space order and the space pill row (2026-11-19, docs/spaces-row.md).
 * Spaces carry `position` (1 first; null sorts after the numbered ones, by
 * created_at, so a new space lands at the end) and `hidden` (out of the pill
 * rows, still everywhere else). Repositories return spaces in this order, so
 * every list follows it: the pill rows and More, Move to…, File to…, ⌘K, the
 * drop tray, the phone's Spaces tab and Cards pills. Colours do NOT follow
 * it: they stay tied to created_at (tokens/spaceColors.ts).
 * Moves reuse pins.ts' movePin and pinPositionUpdates (renumber 1…n, write
 * only what changed).
 */

type Orderable = Pick<Profile, 'id' | 'created_at'> & { position?: number | null };

/** Spaces in their order: numbered first (lowest first), then the rest by created_at, ties by id. */
export const orderSpaces = <T extends Orderable>(spaces: readonly T[]): T[] =>
  [...spaces].sort((a, b) => {
    const pa = a.position ?? null;
    const pb = b.position ?? null;
    if (pa !== null && pb !== null && pa !== pb) return pa - pb;
    if (pa !== null && pb === null) return -1;
    if (pa === null && pb !== null) return 1;
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });

/** Each space's current place, for pinPositionUpdates. */
export const spacePositions = (spaces: readonly Orderable[]) =>
  new Map(spaces.map((space) => [space.id, space.position ?? null] as const));

/**
 * How many pills fit in a row: `widths` are the candidates' widths in order,
 * `available` the row's width, `gap` the space between pills, `reserve` the
 * width kept for a trailing More pill whenever some don't fit. When not even
 * one fits beside More, none shows and every space is in More (a clipped More
 * would hide them all).
 */
export const fitPillCount = (widths: readonly number[], available: number, gap: number, reserve: number): number => {
  const total = widths.reduce((sum, w, i) => sum + w + (i ? gap : 0), 0);
  if (total <= available) return widths.length;
  let used = 0;
  let count = 0;
  for (const width of widths) {
    const next = used + (count ? gap : 0) + width;
    if (next + gap + reserve > available) break;
    used = next;
    count += 1;
  }
  return count;
};

/**
 * The pill row: the visible (not hidden) spaces that fit, in order; the rest
 * (overflow first, then hidden ones) go to More. The chosen space always
 * gets a pill: if it isn't among the ones that fit, it takes the last place.
 */
export const spaceRow = <T extends { id: string; hidden?: boolean }>(
  ordered: readonly T[],
  fit: number,
  selectedId: string | null,
): { shown: T[]; more: T[] } => {
  const visible = ordered.filter((space) => !space.hidden);
  let shown = visible.slice(0, Math.max(0, fit));
  const chosen = selectedId ? ordered.find((space) => space.id === selectedId) : undefined;
  if (chosen && !shown.includes(chosen)) {
    shown = [...shown.slice(0, Math.max(0, fit - 1)), chosen];
  }
  const more = ordered.filter((space) => !shown.includes(space));
  // More keeps the order: unhidden overflow first, then hidden spaces
  more.sort((a, b) => Number(Boolean(a.hidden)) - Number(Boolean(b.hidden)));
  return { shown, more };
};
