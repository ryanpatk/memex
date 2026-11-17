/*
 * The Cards grid's order in the Memory Cards look: the Library's items, with
 * jots woven in by date so the grid has its rhythm of photo, white and
 * colour (d01). Jots only join while the grid shows everything in date order
 * (no type, source or tag filter); any other view is the Library's own.
 */

export interface DatedKey {
  key: string;
  /** ISO time the grid orders by. */
  at: string;
}

/** Merges two lists that are each already newest first into one, newest first. */
export const interleaveNewestFirst = (a: readonly DatedKey[], b: readonly DatedKey[]): string[] => {
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i].at >= b[j].at)) out.push(a[i++].key);
    else out.push(b[j++].key);
  }
  return out;
};

export interface JotFilterInput {
  types: readonly string[];
  sources: readonly string[];
  tagIds: readonly string[];
  untagged: boolean;
  sortField: string;
  sortDirection: 'asc' | 'desc';
}

/** Whether jots belong in the grid for these filters and this sort. */
export const gridShowsJots = (input: JotFilterInput) =>
  input.types.length === 0 &&
  input.sources.length === 0 &&
  input.tagIds.length === 0 &&
  !input.untagged &&
  (input.sortField === 'updated' || input.sortField === 'saved') &&
  input.sortDirection === 'desc';

/** Whether a jot passes the Space filter (`unfiled` = in no space) and the search. */
export const jotMatches = (
  jot: { body: string; profile_id: string | null },
  spaces: readonly string[],
  search: string,
  unfiledKey = 'unfiled',
) => {
  if (spaces.length > 0) {
    const inSpace = jot.profile_id ? spaces.includes(jot.profile_id) : spaces.includes(unfiledKey);
    if (!inSpace) return false;
  }
  const query = search.trim().toLowerCase();
  return !query || jot.body.toLowerCase().includes(query);
};

/**
 * The View panel's Show chips are checkboxes over every type: none chosen
 * means all are on. Unticking one from “all” leaves the others; ticking the
 * last one back (or unticking the only one) means all again.
 */
export const toggleShownType = <T extends string>(all: readonly T[], selected: readonly T[], type: T): T[] => {
  const on = selected.length === 0 ? [...all] : [...selected];
  const next = on.includes(type) ? on.filter((t) => t !== type) : [...on, type];
  return next.length === 0 || next.length === all.length ? [] : all.filter((t) => next.includes(t));
};
