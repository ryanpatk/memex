/*
 * Space colours chosen while the database has no `profiles.color` column yet
 * (migration 20261116120000_add_space_color.sql, not applied to production).
 * The choice is kept in this browser only, so the Memory Cards colour picker
 * can be tried locally; once the column exists the database value wins and
 * this map is never read for that space again.
 */
import type { Profile } from '@memex/core';

const STORAGE_KEY = 'memex.space-colors.local';
const EVENT = 'memex:space-colors-local';

export const readLocalSpaceColors = (): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
};

export const writeLocalSpaceColor = (spaceId: string, color: string | null) => {
  const next = { ...readLocalSpaceColors() };
  if (color) next[spaceId] = color;
  else delete next[spaceId];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the colour lasts until reload */
  }
  window.dispatchEvent(new Event(EVENT));
};

export const subscribeLocalSpaceColors = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

/** True when the row came from a database that has the colour column. */
export const hasColorColumn = (space: Profile) => Object.prototype.hasOwnProperty.call(space, 'color');

/** Profiles with a locally kept colour filled in where the database has no column. */
export const withLocalColors = (spaces: Profile[] | undefined, local: Record<string, string>): Profile[] | undefined =>
  spaces?.map((space) => (!hasColorColumn(space) && local[space.id] ? { ...space, color: local[space.id] } : space));
