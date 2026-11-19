import type { ItemCounts } from '../types';

/*
 * The number next to the Cards hero (“Everything 1,023”), 2026-11-19.
 *
 * It counts what Cards holds, and nothing about it depends on the layout
 * (Grid, List or Table) or the window: links, notes and open tasks (done
 * tasks live on the Tasks page), plus jots whenever the filters let jots into
 * the grid. It used to be the length of whichever layout's array was on
 * screen, so a device left on List (no jots, done tasks included) showed 599
 * while a laptop on Grid showed 1,023 for the same account.
 *
 * With no filter at all it comes from exact database counts (count queries,
 * CountsRepository), so it stays right however many rows a list loaded.
 * With a space, a search or a filter it counts the loaded rows that match.
 */

/** Everything Cards holds: links, notes, open tasks and jots. */
export const cardsTotal = (counts: ItemCounts): number => counts.links + counts.notes + counts.openTasks + counts.jots;

export interface CardsCountInput {
  /** No space, search, type, source or tag filter, and jots are in (date order). */
  plain: boolean;
  /** Loaded links, notes and open tasks that match the filters. */
  openItems: number;
  /** Loaded jots the grid shows for these filters (0 when the filters keep jots out). */
  jots: number;
  /** Exact counts from the database, once they've loaded. */
  counts?: ItemCounts;
}

/** The hero's count: exact totals when nothing is filtered, the matching loaded items otherwise. */
export const cardsCount = ({ plain, openItems, jots, counts }: CardsCountInput): number =>
  plain && counts ? cardsTotal(counts) : openItems + jots;
