import {
  type LinkWithTag,
  type NoteWithTags,
  type Profile,
  type SelfMessage,
  type TaskWithTags,
  getHostname,
  stripMarkdown,
} from '@memex/core';

/*
 * The Journal's model (ROADMAP.md Phase 1, decisions 11 and 13): every jot,
 * link, note and task as one chronological list of entries, shaped into feed
 * parts (day separators, runs of saves from one platform), plus the filing
 * suggester. Plain TS with no React, so it can move to packages/core as is.
 */

export type JournalSpace = { id: string; name: string; color: string };

export type SourceKey = 'x' | 'pinterest' | 'youtube' | 'web';
export type Source = { key: SourceKey; label: string; one: string; many: string };

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

export type Suggestion = { space: JournalSpace; reason: string };

const SOURCES: Record<Exclude<SourceKey, 'web'>, Source> = {
  x: { key: 'x', label: 'X', one: 'post', many: 'posts' },
  pinterest: { key: 'pinterest', label: 'Pinterest', one: 'pin', many: 'pins' },
  youtube: { key: 'youtube', label: 'YouTube', one: 'video', many: 'videos' },
};

const hostOf = (url: string) => getHostname(url).replace(/^www\./, '');

/** Which platform a link came from: the capture tag when present, else its host. */
export const sourceOf = (link: Pick<LinkWithTag, 'url' | 'source'>): Source => {
  const host = hostOf(link.url);
  const tag = link.source ?? '';
  if (tag.startsWith('pinterest') || /(^|\.)pinterest\.|^pin\.it$/.test(host)) return SOURCES.pinterest;
  if (tag.startsWith('x:') || /^(x|twitter)\.com$/.test(host)) return SOURCES.x;
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return SOURCES.youtube;
  return { key: 'web', label: host, one: 'link', many: 'links' };
};

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

export const toJournalSpaces = (profiles: Profile[], colors: Map<string, string>): JournalSpace[] =>
  [...profiles]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((p) => ({ id: p.id, name: p.name, color: colors.get(p.id) ?? 'var(--color-1)' }));

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

/* ------------------------------------------------------------------ */
/* Filing suggestions (decision 13)                                    */
/* ------------------------------------------------------------------ */

/*
 * Five rules: unfiled is a finished state; suggest only when likely right,
 * always with a reason; the Inbox counts waiting suggestions only; "File to…"
 * everywhere; filing one save from a burst lights up its neighbours (falls
 * out of the time signal). Signals, strongest first: a space named in the
 * text, where links from that site usually go, what you filed within 20
 * minutes, similar title words. Measured on real data 2026-10-24: about 2 in
 * 3 filed links would have got a correct guess.
 */

const BURST_MS = 20 * 60_000;
/** Sites where the host says nothing about the topic. */
const AGGREGATOR_HOSTS = new Set(['x.com', 'twitter.com', 'youtube.com', 'youtu.be', 'pinterest.com', 'pin.it', 'reddit.com', 'github.com']);
const STOP = new Set(
  'the a an and or of to in on for with from by is are be at as it this that your you how what why new vs via com www http https html'.split(' '),
);

const words = (text: string) => [
  ...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  ),
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Filer {
  suggest: (entry: Entry) => Suggestion | undefined;
}

export const createFiler = (entries: Entry[], spaces: JournalSpace[]): Filer => {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const filed = entries.filter((e) => e.spaces.length > 0);

  // Same-site votes (links only, aggregators excluded)
  const hostVotes = new Map<string, Map<string, number>>();
  filed.forEach((e) => {
    if (e.kind !== 'link') return;
    const host = hostOf(e.link.url);
    if (AGGREGATOR_HOSTS.has(host)) return;
    const votes = hostVotes.get(host) ?? new Map<string, number>();
    e.spaces.forEach((s) => votes.set(s.id, (votes.get(s.id) ?? 0) + 1));
    hostVotes.set(host, votes);
  });

  // Filed entries by time, for the burst signal (jots written in a space count)
  const byTime = filed.map((e) => ({ t: new Date(e.at).getTime(), e })).sort((a, b) => a.t - b.t);
  /**
   * The space a save's burst belongs to: what you filed within 20 minutes
   * either side. Needs two neighbours agreeing (60%+ of the filed ones), or a
   * single neighbour within 5 minutes; one stray neighbour isn't enough.
   */
  const burstSpace = (entry: Entry) => {
    const t = new Date(entry.at).getTime();
    let lo = 0;
    let hi = byTime.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (byTime[mid].t < t - BURST_MS) lo = mid + 1;
      else hi = mid;
    }
    const tally = new Map<string, { n: number; closest: number; viaJot: boolean }>();
    let filedNear = 0;
    for (let i = lo; i < byTime.length && byTime[i].t <= t + BURST_MS; i++) {
      const c = byTime[i];
      if (c.e.id === entry.id) continue;
      filedNear += 1;
      const gap = Math.abs(c.t - t);
      c.e.spaces.forEach((sp) => {
        const cur = tally.get(sp.id) ?? { n: 0, closest: Infinity, viaJot: false };
        tally.set(sp.id, { n: cur.n + 1, closest: Math.min(cur.closest, gap), viaJot: cur.viaJot || c.e.kind === 'jot' });
      });
    }
    const top = [...tally].sort((a, b) => b[1].n - a[1].n || a[1].closest - b[1].closest)[0];
    if (!top) return undefined;
    const [spaceId, { n, closest, viaJot }] = top;
    const agreed = n >= 2 && n / filedNear >= 0.6;
    const tight = n === 1 && filedNear === 1 && closest <= 5 * 60_000;
    if (!agreed && !tight) return undefined;
    const space = byId.get(spaceId);
    return space && { space, n, viaJot };
  };

  // Title words: tf-idf vectors over filed items, nearest three vote
  const docs = filed
    .filter((e) => e.kind !== 'jot')
    .map((e) => ({ e, w: words(entryText(e)) }))
    .filter((d) => d.w.length > 0);
  const df = new Map<string, number>();
  docs.forEach((d) => d.w.forEach((w) => df.set(w, (df.get(w) ?? 0) + 1)));
  const idf = (w: string) => Math.log((docs.length + 1) / ((df.get(w) ?? 0) + 1));
  const vec = (ws: string[]) => new Map(ws.map((w) => [w, idf(w)]));
  const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((a, x) => a + x * x, 0));
  const vectors = docs.map((d) => {
    const v = vec(d.w);
    return { e: d.e, v, n: norm(v) };
  });
  const similar = (entry: Entry) => {
    const v = vec(words(entryText(entry)));
    const n = norm(v);
    if (!n) return undefined;
    const sims = vectors
      .filter((o) => o.e.id !== entry.id && o.n)
      .map((o) => {
        let dot = 0;
        v.forEach((x, k) => {
          const y = o.v.get(k);
          if (y) dot += x * y;
        });
        return { o, s: dot / (n * o.n) };
      })
      .filter((x) => x.s > 0.15)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
    const tally = new Map<string, number>();
    sims.forEach(({ o, s }) => o.e.spaces.forEach((sp) => tally.set(sp.id, (tally.get(sp.id) ?? 0) + s)));
    const top = [...tally].sort((a, b) => b[1] - a[1])[0];
    return top && top[1] > 0.5 ? byId.get(top[0]) : undefined;
  };

  const namePatterns = spaces
    .filter((s) => s.name.trim().length > 2)
    .map((s) => ({ s, re: new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(s.name.trim())}($|[^\\p{L}\\p{N}])`, 'iu') }));

  const cache = new Map<string, Suggestion | null>();

  const compute = (entry: Entry): Suggestion | undefined => {
    if (entry.kind === 'jot' || entry.spaces.length) return undefined;

    const named = namePatterns.find(({ re }) => re.test(entryText(entry)));
    if (named) return { space: named.s, reason: `Mentions “${named.s.name}”` };

    if (entry.kind === 'link') {
      const host = hostOf(entry.link.url);
      const votes = [...(hostVotes.get(host) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]);
      const total = votes.reduce((a, [, n]) => a + n, 0);
      const top = votes[0];
      const space = top && byId.get(top[0]);
      if (space && top[1] >= 2 && top[1] / total >= 0.6) {
        return { space, reason: `${top[1]} other links from ${host} are in ${space.name}` };
      }
    }

    const burst = burstSpace(entry);
    if (burst) {
      const { space, n, viaJot } = burst;
      const reason =
        n >= 2
          ? `Saved alongside ${n} things you put in ${space.name}`
          : viaJot
            ? `You were writing in ${space.name} just then`
            : `Saved right after something in ${space.name}`;
      return { space, reason };
    }

    const like = similar(entry);
    if (like) return { space: like, reason: `Similar to other things in ${like.name}` };
    return undefined;
  };

  return {
    suggest: (entry) => {
      const hit = cache.get(entry.id);
      if (hit !== undefined) return hit ?? undefined;
      const result = compute(entry);
      cache.set(entry.id, result ?? null);
      return result;
    },
  };
};

const INBOX_WINDOW_MS = 30 * 86_400_000;

/** The Inbox: recent unfiled items that have a suggestion waiting, newest first. */
export const inboxOf = (entries: Entry[], filer: Filer, now = Date.now()) =>
  entries
    .filter((e): e is FileableEntry => e.kind !== 'jot' && e.spaces.length === 0 && now - new Date(e.at).getTime() < INBOX_WINDOW_MS)
    .map((entry) => ({ entry, suggestion: filer.suggest(entry) }))
    .filter((x): x is { entry: FileableEntry; suggestion: Suggestion } => Boolean(x.suggestion))
    .reverse();
