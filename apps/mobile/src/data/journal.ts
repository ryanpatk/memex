import {
  buildEntries,
  buildSpaceColors,
  countOpenTasksBySpace,
  createFiler,
  entriesInSpace,
  inboxOf,
  oklchToHex,
  taskSpaceMap,
  toJournalSpaces,
  toParts,
  type Entry,
  type Filer,
  type JournalSpace,
  type LinkWithTag,
  type NoteWithTags,
  type Part,
  type Profile,
  type SelfMessage,
  type TaskWithTags,
} from '@memex/core';

/*
 * The Journal for the phone: core's model (entries, day separators, runs of
 * platform saves, the filing suggester, the Inbox) with space colours as hex
 * for React Native. Plain TS; useJournal wraps it in React Query.
 */

export interface JournalInput {
  jots: SelfMessage[];
  links: LinkWithTag[];
  notes: NoteWithTags[];
  tasks: TaskWithTags[];
  spaces: Profile[];
  membership: {
    links: { profile_id: string; link_id: string }[];
    notes: { profile_id: string; note_id: string }[];
    tasks: { profile_id: string; task_id: string }[];
  };
}

/** Core's filer, minus the suggestions dismissed on this phone (dismissals.ts). */
export const withoutDismissed = (filer: Filer, dismissed: ReadonlySet<string>): Filer =>
  dismissed.size ? { suggest: (entry) => (dismissed.has(entry.id) ? undefined : filer.suggest(entry)) } : filer;

export const toJournal = (
  input: JournalInput,
  fallbackColor: string,
  now = new Date(),
  dismissed: ReadonlySet<string> = new Set(),
) => {
  const colors = new Map(
    [...buildSpaceColors(input.spaces)].map(([id, color]) => [id, oklchToHex(color)?.slice(0, 7) ?? fallbackColor]),
  );
  const spaces = toJournalSpaces(input.spaces, colors, fallbackColor);
  const entries = buildEntries({ ...input, spaces });
  const filer = withoutDismissed(createFiler(entries, spaces), dismissed);
  const inbox = inboxOf(entries, filer, now.getTime());
  /** Newest first, for an inverted (chat-style, newest at the bottom) list. */
  const feed: Part[] = toParts(entries, now).reverse();
  const counts = countKinds(entries);
  const perSpace = new Map(spaces.map((s) => [s.id, 0]));
  entries.forEach((e) => e.spaces.forEach((s) => perSpace.set(s.id, (perSpace.get(s.id) ?? 0) + 1)));
  const openTasks = countOpenTasksBySpace(input.tasks, taskSpaceMap(input.membership.tasks));
  return { spaces, entries, feed, filer, inbox, counts, perSpace, openTasks, tasks: input.tasks, taskMembership: input.membership.tasks };
};

export type Journal = ReturnType<typeof toJournal>;

export const countKinds = (entries: Entry[]) => {
  const counts = { jot: 0, link: 0, note: 0, task: 0 };
  entries.forEach((e) => {
    counts[e.kind] += 1;
  });
  return counts;
};

export interface SpaceSummary {
  space: JournalSpace;
  /** Everything in the space: jots written there and items filed there. */
  count: number;
  openTasks: number;
  /** The newest few, newest first. */
  recent: Entry[];
  /** When something last landed there. */
  lastAt: string | null;
}

/** The Spaces tab: each space with its counts and newest entries, in the spaces' own order. */
export const summarizeSpaces = (journal: Journal, recentCount = 3): SpaceSummary[] =>
  journal.spaces.map((space) => {
    const inSpace = entriesInSpace(journal.entries, space.id);
    return {
      space,
      count: inSpace.length,
      openTasks: journal.openTasks.get(space.id) ?? 0,
      recent: inSpace.slice(-recentCount).reverse(),
      lastAt: inSpace.at(-1)?.at ?? null,
    };
  });

/** A space's own Journal (decision 14B): core's feed over just its entries, newest first like the main feed. */
export const spaceFeed = (journal: Journal, spaceId: string, now = new Date()) => {
  const entries = entriesInSpace(journal.entries, spaceId);
  return { entries, feed: toParts(entries, now).reverse() as Part[], counts: countKinds(entries) };
};
