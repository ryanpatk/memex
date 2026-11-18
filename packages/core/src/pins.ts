import { getHostname } from './links';
import type { LinkWithTag, ProfileLinkMembership } from './types';

/*
 * Pinned sites (super favourites), 2026-11-18. Two scopes:
 *   global  — links.is_super_favorite, ordered by links.pin_position
 *   a space — profile_links.is_super_favorite, ordered by profile_links.pin_position
 * The web's top bar and launcher show the scope you're in (a space page, or
 * Cards filtered to one space) and the global pins everywhere else; a space's
 * board and the phone's space page show that space's pins; the phone's
 * Spaces tab shows the global ones. Order: numbered pins first (lowest
 * first), then any without a number by name. Moving a pin renumbers the
 * scope 1…n and writes only the rows whose number changed.
 */

/** How many pins sit in the web's top bar; the rest open from “+N”. */
export const PINS_IN_BAR = 5;

/** ⌥1…⌥9 open the first nine pins. */
export const PIN_SHORTCUTS = 9;

export type PinPosition = number | null | undefined;

/** The name pins sort by when they have no number: the trimmed title, else the URL. */
const nameKey = (link: LinkWithTag) => (link.title?.trim() || link.url).toLowerCase();

const comparePinned = (
  a: { link: LinkWithTag; position: PinPosition },
  b: { link: LinkWithTag; position: PinPosition },
) => {
  const pa = a.position ?? null;
  const pb = b.position ?? null;
  if (pa !== null && pb !== null && pa !== pb) return pa - pb;
  if (pa !== null && pb === null) return -1;
  if (pa === null && pb !== null) return 1;
  return nameKey(a.link).localeCompare(nameKey(b.link)) || a.link.id.localeCompare(b.link.id);
};

/** Optimistic rows (`temp-` ids) can't be pinned yet. */
const isSaved = (link: LinkWithTag) => !link.id.startsWith('temp-');

/** The global pins, in order. */
export const globalPins = (links: readonly LinkWithTag[]): LinkWithTag[] =>
  links
    .filter((link) => link.is_super_favorite && isSaved(link))
    .map((link) => ({ link, position: link.pin_position }))
    .sort(comparePinned)
    .map(({ link }) => link);

/** One space's pins, in order (links pinned there and filed there). */
export const spacePins = (
  links: readonly LinkWithTag[],
  membership: readonly ProfileLinkMembership[],
  spaceId: string,
): LinkWithTag[] => {
  const rows = new Map<string, PinPosition>();
  membership.forEach((row) => {
    if (row.profile_id === spaceId && row.is_super_favorite) rows.set(row.link_id, row.pin_position);
  });
  return links
    .filter((link) => rows.has(link.id) && isSaved(link))
    .map((link) => ({ link, position: rows.get(link.id) }))
    .sort(comparePinned)
    .map(({ link }) => link);
};

/** The pins for where you are: a space's when `spaceId` is set, the global ones otherwise. */
export const pinsFor = (
  links: readonly LinkWithTag[],
  membership: readonly ProfileLinkMembership[],
  spaceId: string | null | undefined,
): LinkWithTag[] => (spaceId ? spacePins(links, membership, spaceId) : globalPins(links));

/** The number a new pin gets: after every pin in its scope. */
export const nextPinPosition = (positions: readonly PinPosition[]): number =>
  positions.reduce<number>((max, p) => (typeof p === 'number' && p > max ? p : max), 0) + 1;

/** The ids with one moved from `from` to `to` (both clamped). */
export const movePin = (ids: readonly string[], from: number, to: number): string[] => {
  const next = [...ids];
  if (from < 0 || from >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
};

/**
 * The writes that make `orderedIds` the scope's order (1…n): only the ids
 * whose number changes, so a move between neighbours writes two rows.
 */
export const pinPositionUpdates = (
  orderedIds: readonly string[],
  current: ReadonlyMap<string, PinPosition>,
): { id: string; position: number }[] =>
  orderedIds
    .map((id, index) => ({ id, position: index + 1 }))
    .filter(({ id, position }) => (current.get(id) ?? null) !== position);

/** Short pin label: the site name before any “ | tagline” or “: subtitle”, else the host. */
export const pinLabel = (link: LinkWithTag): string => {
  const title = link.title?.trim();
  const host = getHostname(link.url);
  if (!title) return host;
  return title.split(/\s[|·—–-]\s|\s[|·—–]|[|·—–:]\s/)[0].trim() || host;
};

/**
 * Which pin a key press opens: ⌥1…⌥9 (Option on a Mac, Alt elsewhere) by the
 * physical digit key, since ⌥1 types “¡” on a Mac. Null for anything else.
 */
export const pinShortcutIndex = (event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  code: string;
}): number | null => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  return match ? Number(match[1]) - 1 : null;
};
