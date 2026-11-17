import type { JournalSpace } from '@memex/core';
import type { CardLabel } from '../LabelStrip';

/**
 * A Journal entry's label strip (Memory Cards): its first space's name and
 * colour, plus how many more spaces hold it. On a space page the page's own
 * space leads when the entry is in it. No spaces → an Unfiled label.
 */
export const entryLabel = (spaces: readonly JournalSpace[], preferSpaceId?: string): CardLabel => {
  if (spaces.length === 0) return { name: null, color: null, extra: 0 };
  const first = (preferSpaceId && spaces.find((s) => s.id === preferSpaceId)) || spaces[0];
  return { name: first.name, color: first.color, extra: spaces.length - 1 };
};

/** Items skipped with “Not now” in the Inbox, for this browser session only. */
export const hideFromInbox = (hidden: ReadonlySet<string>, key: string): Set<string> => new Set(hidden).add(key);
