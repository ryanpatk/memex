import { stripMarkdown } from '../markdown';
import { sourceOf, type Source } from '../sources';
import type { LinkWithTag, NoteWithTags, Profile, SelfMessage, TaskWithTags } from '../types';

/*
 * The Journal's model (ROADMAP.md Phase 1, decisions 11 and 13): every jot,
 * link, note and task as one chronological list of entries, shaped into feed
 * parts (day separators, runs of saves from one platform), plus the filing
 * suggester (journal/filer.ts). Plain TS with no React.
 */

export type JournalSpace = { id: string; name: string; color: string };

/** Entry ids are stream item keys (`link:<id>`), so filing reuses useAddToSpace. */
export type Entry =
  | { kind: 'jot'; id: string; at: string; jot: SelfMessage; spaces: JournalSpace[] }
  | { kind: 'link'; id: string; at: string; link: LinkWithTag; spaces: JournalSpace[]; source: Source }
  | { kind: 'note'; id: string; at: string; note: NoteWithTags; spaces: JournalSpace[] }
  | { kind: 'task'; id: string; at: string; task: TaskWithTags; spaces: JournalSpace[] };

export type FileableEntry = Exclude<Entry, { kind: 'jot' }>;

/** Back-to-back saves from one platform, folded into one gallery entry. */
export type Run = { kind: 'run'; id: string; at: string; source: Source; entries: Extract<Entry, { kind: 'link' }>[] };
export type DaySep = { kind: 'day'; id: string; label: string; at: string };
export type Part = Entry | Run | DaySep;

export const entryText = (entry: Entry): string => {
  switch (entry.kind) {
    case 'jot':
      return entry.jot.body;
    case 'link':
      return `${entry.link.title ?? ''} ${entry.link.description ?? ''}`;
    case 'note':
      return `${entry.note.title ?? ''} ${stripMarkdown(entry.note.body ?? '')}`;
    case 'task':
      return entry.task.title;
  }
};

interface MembershipRows {
  links: { link_id: string; profile_id: string }[];
  notes: { note_id: string; profile_id: string }[];
  tasks: { task_id: string; profile_id: string }[];
}

/**
 * Spaces in creation order with their colours. A space without one falls back
 * to `fallbackColor` (the web app's accent variable by default).
 */
export const toJournalSpaces = (
  profiles: Profile[],
  colors: Map<string, string>,
  fallbackColor = 'var(--color-1)',
): JournalSpace[] =>
  [...profiles]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((p) => ({ id: p.id, name: p.name, color: colors.get(p.id) ?? fallbackColor }));

/** Every jot, link, note and task as entries, oldest first. */
export const buildEntries = (input: {
  jots: SelfMessage[];
  links: LinkWithTag[];
  notes: NoteWithTags[];
  tasks: TaskWithTags[];
  spaces: JournalSpace[];
  membership: MembershipRows;
}): Entry[] => {
  const byId = new Map(input.spaces.map((s) => [s.id, s]));
  const index = <T extends { profile_id: string }>(rows: T[], idOf: (row: T) => string) => {
    const map = new Map<string, JournalSpace[]>();
    rows.forEach((row) => {
      const space = byId.get(row.profile_id);
      if (!space) return;
      const id = idOf(row);
      map.set(id, [...(map.get(id) ?? []), space]);
    });
    return map;
  };
  const linkSpaces = index(input.membership.links, (r) => r.link_id);
  const noteSpaces = index(input.membership.notes, (r) => r.note_id);
  const taskSpaces = index(input.membership.tasks, (r) => r.task_id);

  const entries: Entry[] = [
    ...input.jots.map((jot): Entry => {
      const space = jot.profile_id ? byId.get(jot.profile_id) : undefined;
      return { kind: 'jot', id: `jot:${jot.id}`, at: jot.created_at, jot, spaces: space ? [space] : [] };
    }),
    ...input.links.map(
      (link): Entry => ({
        kind: 'link',
        id: `link:${link.id}`,
        at: link.created_at,
        link,
        spaces: linkSpaces.get(link.id) ?? [],
        source: sourceOf(link),
      }),
    ),
    ...input.notes.map(
      (note): Entry => ({
        kind: 'note',
        id: `note:${note.id}`,
        at: note.created_at,
        note,
        spaces: noteSpaces.get(note.id) ?? [],
      }),
    ),
    ...input.tasks.map(
      (task): Entry => ({
        kind: 'task',
        id: `task:${task.id}`,
        at: task.created_at,
        task,
        spaces: taskSpaces.get(task.id) ?? [],
      }),
    ),
  ];
  return entries.sort((a, b) => a.at.localeCompare(b.at));
};

/** Entries that belong to one space (jots written there, items filed there). */
export const entriesInSpace = (entries: Entry[], spaceId: string) =>
  entries.filter((e) => e.spaces.some((s) => s.id === spaceId));

/* ------------------------------------------------------------------ */
/* Feed shaping                                                        */
/* ------------------------------------------------------------------ */

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const yearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const dayLabel = (iso: string, now = new Date()) => {
  const date = new Date(iso);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (date.getFullYear() !== now.getFullYear()) return yearFmt.format(date);
  return `${weekdayFmt.format(date)}, ${dateFmt.format(date)}`;
};

/**
 * Entries (oldest first) as feed parts: a day separator before each new day,
 * and back-to-back saves from one platform folded into a run.
 */
export const toParts = (entries: Entry[], now = new Date()): Part[] => {
  const parts: Part[] = [];
  let lastDay = '';
  entries.forEach((entry) => {
    const key = new Date(entry.at).toDateString();
    if (key !== lastDay) {
      parts.push({ kind: 'day', id: `day:${key}`, label: dayLabel(entry.at, now), at: entry.at });
      lastDay = key;
    }
    const prev = parts[parts.length - 1];
    if (entry.kind === 'link' && entry.source.key !== 'web') {
      if (prev.kind === 'run' && prev.source.key === entry.source.key) {
        prev.entries.push(entry);
        return;
      }
      if (prev.kind === 'link' && prev.source.key === entry.source.key) {
        parts[parts.length - 1] = { kind: 'run', id: `run:${prev.id}`, at: prev.at, source: entry.source, entries: [prev, entry] };
        return;
      }
    }
    parts.push(entry);
  });
  return parts;
};

/** 11D: platform saves with a picture render as a picture; plain links and notes go compact. */
export const isVisualLink = (entry: Extract<Entry, { kind: 'link' }>) =>
  entry.source.key !== 'web' && Boolean(entry.link.preview_image_url);
