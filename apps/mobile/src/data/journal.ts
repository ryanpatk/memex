import {
  buildEntries,
  buildSpaceColors,
  createFiler,
  inboxOf,
  oklchToHex,
  toJournalSpaces,
  toParts,
  type Entry,
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

export const toJournal = (input: JournalInput, fallbackColor: string, now = new Date()) => {
  const colors = new Map(
    [...buildSpaceColors(input.spaces)].map(([id, color]) => [id, oklchToHex(color)?.slice(0, 7) ?? fallbackColor]),
  );
  const spaces = toJournalSpaces(input.spaces, colors, fallbackColor);
  const entries = buildEntries({ ...input, spaces });
  const filer = createFiler(entries, spaces);
  const inbox = inboxOf(entries, filer, now.getTime());
  /** Newest first, for an inverted (chat-style, newest at the bottom) list. */
  const feed: Part[] = toParts(entries, now).reverse();
  const counts = countKinds(entries);
  const perSpace = new Map(spaces.map((s) => [s.id, 0]));
  entries.forEach((e) => e.spaces.forEach((s) => perSpace.set(s.id, (perSpace.get(s.id) ?? 0) + 1)));
  return { spaces, entries, feed, filer, inbox, counts, perSpace };
};

export type Journal = ReturnType<typeof toJournal>;

export const countKinds = (entries: Entry[]) => {
  const counts = { jot: 0, link: 0, note: 0, task: 0 };
  entries.forEach((e) => {
    counts[e.kind] += 1;
  });
  return counts;
};
