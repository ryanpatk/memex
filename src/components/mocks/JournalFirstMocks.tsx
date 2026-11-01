import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  CornerDownLeft,
  Ellipsis,
  FolderInput,
  Inbox,
  LayoutGrid,
  MessageSquare,
  Pin,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { useAllLinks } from '../../hooks/useLinks';
import { useAllNotes } from '../../hooks/useNotes';
import { useAllTasks } from '../../hooks/useTasks';
import { useProfiles } from '../../hooks/useProfiles';
import { useAllSelfMessages } from '../../hooks/useSelfMessages';
import { useProfileLinkMembership } from '../../hooks/useProfileLinks';
import { useProfileNoteMembership } from '../../hooks/useProfileNotes';
import { useProfileTaskMembership } from '../../hooks/useProfileTasks';
import { buildSpaceColors } from '../../utils/spaceColor';
import {
  getHostname,
  getLinkTitle,
  stripMarkdown,
  type LinkWithTag,
  type NoteWithTags,
  type SelfMessage,
  type TaskWithTags,
} from '@memex/core';
import { Artboard, Fav, Section, Thumb } from './primitives';
import Wordmark from '../ui/Wordmark';
import '../../styles/mocks-journal.css';

/*
 * Round 5 — the journal-first app (ROADMAP.md Phase 1). Static compositions
 * over real data: Journal entries (11), the home layout (12), filing (13),
 * a space as a working board (14), the Library (15) and the phone (16).
 * The feed reads like a chat: newest at the bottom, composer below (decided).
 * Read-only — nothing here writes.
 */

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

type Space = { id: string; name: string; color: string };

type SourceKey = 'x' | 'pinterest' | 'youtube' | 'web';
type Source = { key: SourceKey; label: string; one: string; many: string };

type Entry =
  | { kind: 'jot'; id: string; at: string; jot: SelfMessage; spaces: Space[] }
  | { kind: 'link'; id: string; at: string; link: LinkWithTag; spaces: Space[]; source: Source }
  | { kind: 'note'; id: string; at: string; note: NoteWithTags; spaces: Space[] }
  | { kind: 'task'; id: string; at: string; task: TaskWithTags; spaces: Space[] };

type Run = { kind: 'run'; id: string; at: string; source: Source; links: LinkWithTag[] };
type DaySep = { kind: 'day'; id: string; label: string };
type Part = Entry | Run | DaySep;

type Suggestion = { space: Space; reason: string };

interface World {
  spaces: Space[];
  entries: Entry[];
  links: LinkWithTag[];
  notes: NoteWithTags[];
  openTasks: TaskWithTags[];
  inbox: Entry[];
  focus: Space | undefined;
  spaceCount: Map<string, number>;
  suggest: (entry: Entry) => Suggestion | undefined;
}

const SOURCES: Record<Exclude<SourceKey, 'web'>, Source> = {
  x: { key: 'x', label: 'X', one: 'post', many: 'posts' },
  pinterest: { key: 'pinterest', label: 'Pinterest', one: 'pin', many: 'pins' },
  youtube: { key: 'youtube', label: 'YouTube', one: 'video', many: 'videos' },
};

/** Which platform a link came from: the capture tag when present, else its host. */
const sourceOf = (link: LinkWithTag): Source => {
  const host = getHostname(link.url).replace(/^www\./, '');
  const tag = link.source ?? '';
  if (tag.startsWith('pinterest') || /(^|\.)pinterest\.|^pin\.it$/.test(host)) return SOURCES.pinterest;
  if (tag.startsWith('x:') || /^(x|twitter)\.com$/.test(host)) return SOURCES.x;
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return SOURCES.youtube;
  return { key: 'web', label: host, one: 'link', many: 'links' };
};

const textOf = (entry: Entry) => {
  switch (entry.kind) {
    case 'jot':
      return entry.jot.body;
    case 'link':
      return `${entry.link.title ?? ''} ${entry.link.url} ${entry.link.description ?? ''}`;
    case 'note':
      return `${entry.note.title ?? ''} ${entry.note.body}`;
    case 'task':
      return entry.task.title;
  }
};

const titleOf = (entry: Entry) => {
  switch (entry.kind) {
    case 'jot':
      return entry.jot.body;
    case 'link':
      return getLinkTitle(entry.link);
    case 'note':
      return entry.note.title || 'Untitled';
    case 'task':
      return entry.task.title;
  }
};

const DAY_MS = 86_400_000;

const useWorld = (): World | null => {
  const { data: links = [] } = useAllLinks();
  const { data: notes = [] } = useAllNotes();
  const { data: tasks = [] } = useAllTasks();
  const { data: profiles = [] } = useProfiles();
  const { data: jots = [] } = useAllSelfMessages();
  const { data: linkRows = [] } = useProfileLinkMembership();
  const { data: noteRows = [] } = useProfileNoteMembership();
  const { data: taskRows = [] } = useProfileTaskMembership();

  return useMemo(() => {
    if (!links.length) return null;
    const colors = buildSpaceColors(profiles);
    const spaces: Space[] = [...profiles]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((p) => ({ id: p.id, name: p.name, color: colors.get(p.id) ?? 'var(--color-1)' }));
    const byId = new Map(spaces.map((s) => [s.id, s]));

    const indexBy = <T extends { profile_id: string }>(rows: T[], idOf: (row: T) => string) => {
      const map = new Map<string, Space[]>();
      rows.forEach((row) => {
        const space = byId.get(row.profile_id);
        if (!space) return;
        const id = idOf(row);
        map.set(id, [...(map.get(id) ?? []), space]);
      });
      return map;
    };
    const linkSpaces = indexBy(linkRows, (r) => r.link_id);
    const noteSpaces = indexBy(noteRows, (r) => r.note_id);
    const taskSpaces = indexBy(taskRows, (r) => r.task_id);

    const entries: Entry[] = [
      ...jots.map((jot) => {
        const space = jot.profile_id ? byId.get(jot.profile_id) : undefined;
        return { kind: 'jot' as const, id: `j-${jot.id}`, at: jot.created_at, jot, spaces: space ? [space] : [] };
      }),
      ...links.map((link) => ({
        kind: 'link' as const,
        id: `l-${link.id}`,
        at: link.created_at,
        link,
        spaces: linkSpaces.get(link.id) ?? [],
        source: sourceOf(link),
      })),
      ...notes.map((note) => ({
        kind: 'note' as const,
        id: `n-${note.id}`,
        at: note.created_at,
        note,
        spaces: noteSpaces.get(note.id) ?? [],
      })),
      ...tasks.map((task) => ({
        kind: 'task' as const,
        id: `t-${task.id}`,
        at: task.created_at,
        task,
        spaces: taskSpaces.get(task.id) ?? [],
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));

    const spaceCount = new Map<string, number>();
    entries.forEach((e) => e.spaces.forEach((s) => spaceCount.set(s.id, (spaceCount.get(s.id) ?? 0) + 1)));
    // The board mocks read best on a space that holds a mix of saves, notes and tasks
    const mixScore = new Map<string, number>();
    entries.forEach((e) =>
      e.spaces.forEach((s) => mixScore.set(s.id, (mixScore.get(s.id) ?? 0) + (e.kind === 'link' ? 1 : e.kind === 'jot' ? 2 : 4))),
    );
    const focus = [...spaces].sort((a, b) => (mixScore.get(b.id) ?? 0) - (mixScore.get(a.id) ?? 0))[0];

    // Filing suggestions: a host's links usually live together; else a space named in the text.
    const hostVotes = new Map<string, Map<string, number>>();
    entries.forEach((e) => {
      if (e.kind !== 'link' || !e.spaces.length) return;
      const host = getHostname(e.link.url);
      const votes = hostVotes.get(host) ?? new Map<string, number>();
      e.spaces.forEach((s) => votes.set(s.id, (votes.get(s.id) ?? 0) + 1));
      hostVotes.set(host, votes);
    });
    const suggest = (entry: Entry): Suggestion | undefined => {
      if (entry.spaces.length) return undefined;
      if (entry.kind === 'link') {
        const host = getHostname(entry.link.url);
        const top = [...(hostVotes.get(host) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];
        const space = top && byId.get(top[0]);
        if (space && top) {
          const n = top[1];
          return { space, reason: `${n} other ${n === 1 ? 'link' : 'links'} from ${host} ${n === 1 ? 'is' : 'are'} in ${space.name}` };
        }
      }
      const text = textOf(entry).toLowerCase();
      const named = spaces.find((s) => s.name.length > 2 && text.includes(s.name.toLowerCase()));
      return named ? { space: named, reason: `Mentions “${named.name}”` } : undefined;
    };

    const unfiled = entries
      .filter((e) => (e.kind === 'link' || e.kind === 'note') && !e.spaces.length)
      .reverse();
    const recentUnfiled = unfiled.filter((e) => Date.now() - new Date(e.at).getTime() < 14 * DAY_MS);
    const inbox = recentUnfiled.length >= 3 ? recentUnfiled : unfiled.slice(0, 12);

    return {
      spaces,
      entries,
      links: [...links].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      notes: [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      openTasks: tasks.filter((t) => !t.is_done),
      inbox,
      focus,
      spaceCount,
      suggest,
    };
  }, [links, notes, tasks, profiles, jots, linkRows, noteRows, taskRows]);
};

/* ------------------------------------------------------------------ */
/* Time + feed shaping                                                 */
/* ------------------------------------------------------------------ */

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const numFmt = new Intl.NumberFormat();

const time = (iso: string) => timeFmt.format(new Date(iso));

const dayLabel = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return `${weekdayFmt.format(date)}, ${dateFmt.format(date)}`;
};

const excerpt = (body: string, max = 220) => {
  const text = stripMarkdown(body ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/** The last `limit` entries, oldest first, with day separators; back-to-back saves from one platform fold into a run. */
const toParts = (entries: Entry[], { limit = 60, group = true }: { limit?: number; group?: boolean } = {}): Part[] => {
  const parts: Part[] = [];
  let lastDay = '';
  entries.slice(-limit).forEach((entry) => {
    const key = new Date(entry.at).toDateString();
    if (key !== lastDay) {
      parts.push({ kind: 'day', id: `d-${key}`, label: dayLabel(entry.at) });
      lastDay = key;
    }
    const prev = parts[parts.length - 1];
    if (group && entry.kind === 'link' && entry.source.key !== 'web') {
      if (prev.kind === 'run' && prev.source.key === entry.source.key) {
        prev.links.push(entry.link);
        return;
      }
      if (prev.kind === 'link' && prev.source.key === entry.source.key) {
        parts[parts.length - 1] = { kind: 'run', id: `r-${prev.id}`, at: prev.at, source: entry.source, links: [prev.link, entry.link] };
        return;
      }
    }
    parts.push(entry);
  });
  return parts;
};

const hue = (space: Space) => ({ '--hue': space.color }) as CSSProperties;

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

const SpaceChip = ({ space, ghost }: { space: Space; ghost?: boolean }) => (
  <span className={`mj-chip${ghost ? ' is-ghost' : ''}`} style={hue(space)}>
    <i className="mj-dot" aria-hidden="true" />
    <span className="mj-ellipsis">{space.name}</span>
    {ghost && (
      <span className="mj-chip-accept">
        <Check aria-hidden="true" />
      </span>
    )}
  </span>
);

const Tile = ({ link }: { link: LinkWithTag }) => {
  const [failed, setFailed] = useState(false);
  return link.preview_image_url && !failed ? (
    <span className="mj-tile">
      <img src={link.preview_image_url} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  ) : (
    <span className="mj-tile mj-tile--text">
      <Fav link={link} size="s" />
      <span>{getLinkTitle(link)}</span>
    </span>
  );
};

const runLabel = (run: Run) => (
  <>
    <strong>
      {run.links.length} {run.links.length === 1 ? run.source.one : run.source.many} saved
    </strong>{' '}
    on {run.source.label}
  </>
);

type Filing = 'chips' | 'suggest' | 'none';

const FilingRow = ({ entry, filing, world }: { entry: Entry; filing: Filing; world: World }) => {
  if (filing === 'none') return null;
  const suggestion = filing === 'suggest' ? world.suggest(entry) : undefined;
  if (!entry.spaces.length && !suggestion) return null;
  return (
    <span className="mj-filing">
      {entry.spaces.map((s) => (
        <SpaceChip key={s.id} space={s} />
      ))}
      {suggestion && <SpaceChip space={suggestion.space} ghost />}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Entry renderers — three looks for decision 11                       */
/* ------------------------------------------------------------------ */

type Look = 'rich' | 'quiet' | 'mixed' | 'tuned';

const PartView = ({ part, look, filing, world }: { part: Part; look: Look; filing: Filing; world: World }) => {
  if (part.kind === 'day') {
    return (
      <div className="mj-day">
        <span>{part.label}</span>
      </div>
    );
  }
  if (look === 'rich') return <RichPart part={part} filing={filing} world={world} />;
  if (look === 'quiet') return <QuietPart part={part} filing={filing} world={world} />;
  if (look === 'tuned') return <TunedPart part={part} filing={filing} world={world} />;
  return <MixedPart part={part} filing={filing} world={world} />;
};

/* 11A — every entry is a message; links unfurl, platform saves arrive as one gallery message */
const RichPart = ({ part, filing, world }: { part: Entry | Run; filing: Filing; world: World }) => {
  if (part.kind === 'run') {
    return (
      <div className="mj-msg mj-gallery">
        <div className="mj-run-head">
          <Fav link={part.links[0]} size="s" />
          <span className="mj-ellipsis">{runLabel(part)}</span>
          <time className="mj-time mj-push">{time(part.at)}</time>
        </div>
        <div className="mj-gallery-grid">
          {part.links.slice(0, 6).map((l) => (
            <Tile key={l.id} link={l} />
          ))}
        </div>
        {part.links.length > 6 && <span className="mj-more">+{part.links.length - 6} more</span>}
      </div>
    );
  }
  switch (part.kind) {
    case 'jot':
      return (
        <div className="mj-msg">
          <p className="mj-bubble">
            {part.jot.body}
            <time className="mj-time">{time(part.at)}</time>
          </p>
          <FilingRow entry={part} filing={filing} world={world} />
        </div>
      );
    case 'link':
      return (
        <div className="mj-msg">
          <div className="mj-unfurl">
            <Thumb src={part.link.preview_image_url} className="is-fixed" />
            <div className="mj-unfurl-body">
              <span className="mj-meta">
                <Fav link={part.link} size="s" />
                <span className="mj-ellipsis">{getHostname(part.link.url)}</span>
                <time className="mj-time mj-push">{time(part.at)}</time>
              </span>
              <p className="mj-unfurl-title">{getLinkTitle(part.link)}</p>
              {part.link.description && <p className="mj-unfurl-desc">{part.link.description}</p>}
            </div>
          </div>
          <FilingRow entry={part} filing={filing} world={world} />
        </div>
      );
    case 'note':
      return (
        <div className="mj-msg">
          <div className="mj-notecard">
            <span className="mj-meta">
              <StickyNote aria-hidden="true" className="mj-glyph" />
              Note
              <time className="mj-time mj-push">{time(part.at)}</time>
            </span>
            <p className="mj-notecard-title">{part.note.title || 'Untitled'}</p>
            <p className="mj-notecard-body">{excerpt(part.note.body)}</p>
          </div>
          <FilingRow entry={part} filing={filing} world={world} />
        </div>
      );
    case 'task':
      return (
        <div className="mj-msg">
          <div className="mj-taskline">
            <span className={`mj-check${part.task.is_done ? ' is-done' : ''}`} aria-hidden="true">
              {part.task.is_done && <Check />}
            </span>
            <span className="mj-ellipsis">{part.task.title}</span>
            <time className="mj-time mj-push">{time(part.at)}</time>
          </div>
          <FilingRow entry={part} filing={filing} world={world} />
        </div>
      );
  }
};

/* 11B — a quiet log: jots are the read, everything else is one line */
const QuietPart = ({ part, filing, world }: { part: Entry | Run; filing: Filing; world: World }) => {
  if (part.kind === 'run') {
    return (
      <div className="mj-log">
        <time className="mj-time">{time(part.at)}</time>
        <span className="mj-log-line">
          <Fav link={part.links[0]} size="s" />
          <span className="mj-ellipsis">{runLabel(part)}</span>
          <span className="mj-strip" aria-hidden="true">
            {part.links.slice(0, 5).map((l) => (
              <Tile key={l.id} link={l} />
            ))}
          </span>
          <ChevronDown aria-hidden="true" className="mj-glyph mj-faint" />
        </span>
      </div>
    );
  }
  if (part.kind === 'jot') {
    return (
      <div className="mj-log mj-log--jot">
        <time className="mj-time">{time(part.at)}</time>
        <div>
          <p className="mj-log-text">{part.jot.body}</p>
          <FilingRow entry={part} filing={filing} world={world} />
        </div>
      </div>
    );
  }
  const verb = part.kind === 'link' ? 'Saved' : part.kind === 'note' ? 'Wrote' : 'Task';
  return (
    <div className="mj-log">
      <time className="mj-time">{time(part.at)}</time>
      <span className="mj-log-line">
        {part.kind === 'link' ? (
          <Fav link={part.link} size="s" />
        ) : part.kind === 'note' ? (
          <StickyNote aria-hidden="true" className="mj-glyph" />
        ) : (
          <span className={`mj-check mj-check--s${part.task.is_done ? ' is-done' : ''}`} aria-hidden="true">
            {part.task.is_done && <Check />}
          </span>
        )}
        <span className="mj-log-verb">{verb}</span>
        <span className="mj-ellipsis">{titleOf(part)}</span>
        <FilingRow entry={part} filing={filing} world={world} />
      </span>
    </div>
  );
};

/* 11C — jots and things you chose are rich; automatic saves are a filmstrip */
const MixedPart = ({ part, filing, world }: { part: Entry | Run; filing: Filing; world: World }) => {
  if (part.kind === 'run') {
    return (
      <div className="mj-log">
        <time className="mj-time">{time(part.at)}</time>
        <div className="mj-film">
          <span className="mj-film-head">
            <Fav link={part.links[0]} size="s" />
            <span className="mj-ellipsis">{runLabel(part)}</span>
          </span>
          <span className="mj-film-strip">
            {part.links.slice(0, 7).map((l) => (
              <Tile key={l.id} link={l} />
            ))}
            {part.links.length > 7 && <span className="mj-tile mj-tile--more">+{part.links.length - 7}</span>}
          </span>
        </div>
      </div>
    );
  }
  switch (part.kind) {
    case 'jot':
      return (
        <div className="mj-log mj-log--jot">
          <time className="mj-time">{time(part.at)}</time>
          <div>
            <p className="mj-log-text mj-log-text--lg">{part.jot.body}</p>
            <FilingRow entry={part} filing={filing} world={world} />
          </div>
        </div>
      );
    case 'link':
      return (
        <div className="mj-log">
          <time className="mj-time">{time(part.at)}</time>
          <div className="mj-stack">
            <div className="mj-hcard">
              {part.link.preview_image_url ? <Tile link={part.link} /> : <Fav link={part.link} size="m" />}
              <span className="mj-hcard-body">
                <span className="mj-hcard-title">{getLinkTitle(part.link)}</span>
                <span className="mj-meta">
                  <Fav link={part.link} size="s" />
                  <span className="mj-ellipsis">{getHostname(part.link.url)}</span>
                </span>
              </span>
            </div>
            <FilingRow entry={part} filing={filing} world={world} />
          </div>
        </div>
      );
    case 'note':
      return (
        <div className="mj-log">
          <time className="mj-time">{time(part.at)}</time>
          <div className="mj-stack">
            <div className="mj-notecard mj-notecard--compact">
              <span className="mj-meta">
                <StickyNote aria-hidden="true" className="mj-glyph" /> Note
              </span>
              <p className="mj-notecard-title">{part.note.title || 'Untitled'}</p>
              <p className="mj-notecard-body">{excerpt(part.note.body, 140)}</p>
            </div>
            <FilingRow entry={part} filing={filing} world={world} />
          </div>
        </div>
      );
    case 'task':
      return (
        <div className="mj-log">
          <time className="mj-time">{time(part.at)}</time>
          <span className="mj-log-line">
            <span className={`mj-check${part.task.is_done ? ' is-done' : ''}`} aria-hidden="true">
              {part.task.is_done && <Check />}
            </span>
            <span className="mj-ellipsis">{part.task.title}</span>
            <FilingRow entry={part} filing={filing} world={world} />
          </span>
        </div>
      );
  }
};

/* 11D — 11A's messages, sized by how visual each thing is: pictures stay big, plain links and notes go compact */
const TunedPart = ({ part, filing, world }: { part: Entry | Run; filing: Filing; world: World }) => {
  if (part.kind === 'run' || part.kind === 'jot' || part.kind === 'task') return <RichPart part={part} filing={filing} world={world} />;
  if (part.kind === 'link' && part.source.key !== 'web' && part.link.preview_image_url) {
    return <RichPart part={part} filing={filing} world={world} />;
  }
  if (part.kind === 'link') {
    return (
      <div className="mj-msg mj-msg--wide">
        <div className="mj-hcard">
          {part.link.preview_image_url ? <Tile link={part.link} /> : <Fav link={part.link} size="m" />}
          <span className="mj-hcard-body">
            <span className="mj-hcard-title">{getLinkTitle(part.link)}</span>
            <span className="mj-meta">
              <Fav link={part.link} size="s" />
              <span className="mj-ellipsis">{getHostname(part.link.url)}</span>
              <time className="mj-time mj-push">{time(part.at)}</time>
            </span>
          </span>
        </div>
        <FilingRow entry={part} filing={filing} world={world} />
      </div>
    );
  }
  return (
    <div className="mj-msg mj-msg--wide">
      <div className="mj-notecard mj-notecard--compact">
        <span className="mj-meta">
          <StickyNote aria-hidden="true" className="mj-glyph" /> Note
          <time className="mj-time mj-push">{time(part.at)}</time>
        </span>
        <p className="mj-notecard-title">{part.note.title || 'Untitled'}</p>
        <p className="mj-notecard-body">{excerpt(part.note.body, 140)}</p>
      </div>
      <FilingRow entry={part} filing={filing} world={world} />
    </div>
  );
};

const Feed = ({
  parts,
  look,
  filing = 'chips',
  world,
  width,
}: {
  parts: Part[];
  look: Look;
  filing?: Filing;
  world: World;
  width?: number;
}) => (
  <div className="mj-feed">
    <div className={`mj-feed-inner mj-feed-inner--${look}`} style={width ? { maxWidth: width } : undefined}>
      {parts.map((p) => (
        <PartView key={p.id} part={p} look={look} filing={filing} world={world} />
      ))}
    </div>
  </div>
);

/** A top-aligned close-up of a few entries; `extra` decorates one entry (hover bar, menu, explanation). */
const FilingList = ({
  parts,
  world,
  filing = 'chips',
  extra,
}: {
  parts: Part[];
  world: World;
  filing?: Filing;
  extra: (id: string) => ReactNode;
}) => (
  <div className="mj-list">
    {parts.map((p) => {
      const decoration = extra(p.id);
      const view = <PartView key={p.id} part={p} look="tuned" filing={filing} world={world} />;
      return decoration ? (
        <div key={p.id} className="mj-focused">
          {view}
          {decoration}
        </div>
      ) : (
        view
      );
    })}
  </div>
);

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

const Composer = ({
  space,
  placeholder,
  hints = true,
  width,
}: {
  space?: Space;
  placeholder?: string;
  hints?: boolean;
  width?: number;
}) => (
  <div className="mj-composer" style={width ? { maxWidth: width } : undefined}>
    <div className="mj-composer-field">
      {placeholder ? (
        <span className="mj-placeholder">{placeholder}</span>
      ) : (
        <>
          <span>Look into this before the weekend </span>
          {space && (
            <span className="mj-token" style={hue(space)}>
              @{space.name}
            </span>
          )}
          <span className="mj-token mj-token--tag">#read</span>
          <span className="mj-caret" aria-hidden="true" />
        </>
      )}
      <span className="mj-send mj-push" aria-hidden="true">
        <CornerDownLeft />
      </span>
    </div>
    {hints && (
      <div className="mj-hints">
        <span>
          <kbd>@</kbd> space
        </span>
        <span>
          <kbd>#</kbd> tag
        </span>
        <span>Paste a link</span>
        <span>
          <kbd>[]</kbd> task
        </span>
        <span>
          <kbd>⌘↵</kbd> note
        </span>
      </div>
    )}
  </div>
);

const NavRow = ({ icon: Icon, label, active, count }: { icon: LucideIcon; label: string; active?: boolean; count?: number }) => (
  <div className={`mj-nav${active ? ' is-active' : ''}`}>
    <Icon aria-hidden="true" className="mj-glyph" />
    <span className="mj-ellipsis">{label}</span>
    {count !== undefined && count > 0 && <span className="mj-count mj-push">{numFmt.format(count)}</span>}
  </div>
);

const Side = ({
  world,
  active,
  counts,
  activeSpace,
  views,
}: {
  world: World;
  active: 'journal' | 'library' | 'space';
  counts?: boolean;
  activeSpace?: string;
  views?: ReactNode;
}) => (
  <aside className="mj-side">
    <Wordmark className="mj-brand" />
    <NavRow icon={MessageSquare} label="Journal" active={active === 'journal'} />
    <NavRow icon={LayoutGrid} label="Library" active={active === 'library'} count={counts ? world.links.length : undefined} />
    {views}
    <NavRow icon={Inbox} label="Inbox" count={world.inbox.length} />
    {counts && <NavRow icon={Check} label="Tasks" count={world.openTasks.length} />}
    <div className="mj-side-label">
      Spaces <Plus aria-hidden="true" className="mj-glyph" />
    </div>
    {world.spaces.slice(0, 9).map((s) => (
      <div key={s.id} className={`mj-nav mj-nav--space${activeSpace === s.id ? ' is-active' : ''}`} style={hue(s)}>
        <i className="mj-dot" aria-hidden="true" />
        <span className="mj-ellipsis">{s.name}</span>
        {counts && <span className="mj-count mj-push">{world.spaceCount.get(s.id) ?? 0}</span>}
      </div>
    ))}
    <div className="mj-side-foot">
      <Settings aria-hidden="true" className="mj-glyph" /> Settings
    </div>
  </aside>
);

const JournalHead = ({ scope = 'Home', space }: { scope?: string; space?: Space }) => (
  <header className="mj-head">
    <h3 className="mj-title">{space ? space.name : 'Journal'}</h3>
    {space ? (
      <span className="mj-scope" style={hue(space)}>
        <i className="mj-dot" aria-hidden="true" /> Space
      </span>
    ) : (
      <span className="mj-scope">{scope}</span>
    )}
    <span className="mj-tools mj-push">
      <Search aria-hidden="true" className="mj-glyph" />
      <CalendarDays aria-hidden="true" className="mj-glyph" />
    </span>
  </header>
);

const RailSection = ({ title, count, action, children }: { title: string; count?: number; action?: string; children: ReactNode }) => (
  <section className="mj-rail-section">
    <header>
      <span className="mj-label">{title}</span>
      {count !== undefined && <span className="mj-count">{numFmt.format(count)}</span>}
      {action && <span className="mj-link mj-push">{action}</span>}
    </header>
    {children}
  </section>
);

const TaskLine = ({ task }: { task: TaskWithTags }) => (
  <div className="mj-rail-task">
    <span className="mj-check mj-check--s" aria-hidden="true" />
    <span className="mj-ellipsis">{task.title}</span>
    {task.due_date && <span className="mj-count mj-push">{dateFmt.format(new Date(task.due_date))}</span>}
  </div>
);

const InboxLine = ({ entry, world }: { entry: Entry; world: World }) => {
  const s = world.suggest(entry);
  return (
    <div className="mj-rail-inbox">
      <span className="mj-rail-inbox-title">
        {entry.kind === 'link' ? <Fav link={entry.link} size="s" /> : <StickyNote aria-hidden="true" className="mj-glyph" />}
        <span className="mj-ellipsis">{titleOf(entry)}</span>
      </span>
      {s ? <SpaceChip space={s.space} ghost /> : <span className="mj-faint mj-xs">File to…</span>}
    </div>
  );
};

const filedThisWeek = (world: World) => {
  const counts = new Map<string, number>();
  world.entries.forEach((e) => {
    if (Date.now() - new Date(e.at).getTime() > 7 * DAY_MS) return;
    e.spaces.forEach((s) => counts.set(s.id, (counts.get(s.id) ?? 0) + 1));
  });
  return world.spaces
    .filter((s) => counts.has(s.id))
    .map((s) => ({ space: s, n: counts.get(s.id)! }))
    .sort((a, b) => b.n - a.n);
};

const Rail = ({ world }: { world: World }) => {
  const filed = filedThisWeek(world);
  return (
    <aside className="mj-rail">
      <RailSection title="Inbox" count={world.inbox.length} action="Review">
        {world.inbox.slice(0, 4).map((e) => (
          <InboxLine key={e.id} entry={e} world={world} />
        ))}
      </RailSection>
      <RailSection title="Open tasks" count={world.openTasks.length}>
        {world.openTasks.slice(0, 5).map((t) => (
          <TaskLine key={t.id} task={t} />
        ))}
      </RailSection>
      <RailSection title="Filed this week">
        {filed.length ? (
          filed.slice(0, 5).map(({ space, n }) => (
            <div key={space.id} className="mj-rail-row" style={hue(space)}>
              <i className="mj-dot" aria-hidden="true" />
              <span className="mj-ellipsis">{space.name}</span>
              <span className="mj-count mj-push">{n}</span>
            </div>
          ))
        ) : (
          <p className="mj-faint mj-xs">Nothing filed this week. Unfiled is fine — the Inbox keeps it.</p>
        )}
      </RailSection>
    </aside>
  );
};

/* ------------------------------------------------------------------ */
/* Library pieces                                                      */
/* ------------------------------------------------------------------ */

const savedViews = (world: World) => {
  const bySource = (key: SourceKey) => world.links.filter((l) => sourceOf(l).key === key).length;
  return [
    { id: 'all', label: 'Everything', n: world.links.length + world.notes.length },
    { id: 'unfiled', label: 'Unfiled', n: world.entries.filter((e) => (e.kind === 'link' || e.kind === 'note') && !e.spaces.length).length },
    { id: 'x', label: 'From X', n: bySource('x') },
    { id: 'pinterest', label: 'From Pinterest', n: bySource('pinterest') },
    { id: 'youtube', label: 'From YouTube', n: bySource('youtube') },
    { id: 'notes', label: 'Notes', n: world.notes.length },
    { id: 'tasks', label: 'Open tasks', n: world.openTasks.length },
  ];
};

const GalleryCard = ({ entry }: { entry: Entry }) => {
  if (entry.kind === 'link') {
    return (
      <div className="mj-gcard">
        <Thumb src={entry.link.preview_image_url} />
        <div className="mj-gcard-body">
          <span className="mj-meta">
            <Fav link={entry.link} size="s" />
            <span className="mj-ellipsis">{getHostname(entry.link.url)}</span>
          </span>
          <p className="mj-gcard-title">{getLinkTitle(entry.link)}</p>
          {entry.spaces[0] && <SpaceChip space={entry.spaces[0]} />}
        </div>
      </div>
    );
  }
  if (entry.kind === 'note') {
    return (
      <div className="mj-gcard">
        <div className="mj-gcard-body">
          <span className="mj-meta">
            <StickyNote aria-hidden="true" className="mj-glyph" /> Note
          </span>
          <p className="mj-gcard-title">{entry.note.title || 'Untitled'}</p>
          <p className="mj-notecard-body">{excerpt(entry.note.body, 160)}</p>
          {entry.spaces[0] && <SpaceChip space={entry.spaces[0]} />}
        </div>
      </div>
    );
  }
  return null;
};

const libraryEntries = (world: World, n: number) =>
  world.entries
    .filter((e) => e.kind === 'link' || e.kind === 'note')
    .slice(-n)
    .reverse();

const LibraryHead = ({ world, layout }: { world: World; layout: 'gallery' | 'table' }) => (
  <header className="mj-head">
    <h3 className="mj-title">Library</h3>
    <span className="mj-count">{numFmt.format(world.links.length + world.notes.length)} items</span>
    <span className="mj-seg mj-seg--s mj-push">
      <span className={layout === 'gallery' ? 'is-on' : ''}>
        <LayoutGrid aria-hidden="true" /> Gallery
      </span>
      <span className={layout === 'table' ? 'is-on' : ''}>
        <Table2 aria-hidden="true" /> Table
      </span>
    </span>
    <span className="mj-search">
      <Search aria-hidden="true" className="mj-glyph" /> Search…
    </span>
  </header>
);

const relDays = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return dateFmt.format(new Date(iso));
};

const LibraryTable = ({ rows }: { rows: Entry[] }) => (
  <table className="mj-table">
    <thead>
      <tr>
        <th scope="col">Title</th>
        <th scope="col">Type</th>
        <th scope="col">Source</th>
        <th scope="col">Spaces</th>
        <th scope="col">Tags</th>
        <th scope="col">
          Saved <ArrowUpDown aria-hidden="true" className="mj-glyph mj-faint" />
        </th>
      </tr>
    </thead>
    <tbody>
      {rows.map((e) => {
        const tags =
          e.kind === 'link'
            ? (e.link.link_tags ?? []).flatMap((t) => (t.tag ? [t.tag.name] : []))
            : e.kind === 'note'
              ? (e.note.note_tags ?? []).flatMap((t) => (t.tag ? [t.tag.name] : []))
              : [];
        return (
          <tr key={e.id}>
            <td>
              <span className="mj-cell-title">
                {e.kind === 'link' ? (
                  e.link.preview_image_url ? (
                    <Tile link={e.link} />
                  ) : (
                    <Fav link={e.link} size="m" />
                  )
                ) : (
                  <span className="mj-cell-glyph">
                    <StickyNote aria-hidden="true" className="mj-glyph" />
                  </span>
                )}
                <span className="mj-ellipsis">{titleOf(e)}</span>
              </span>
            </td>
            <td className="mj-faint">{e.kind === 'link' ? 'Link' : 'Note'}</td>
            <td className="mj-faint">{e.kind === 'link' ? (e.source.key === 'web' ? 'Web' : e.source.label) : '—'}</td>
            <td>
              <span className="mj-filing">
                {e.spaces.slice(0, 2).map((s) => (
                  <SpaceChip key={s.id} space={s} />
                ))}
                {!e.spaces.length && <span className="mj-faint mj-xs">Unfiled</span>}
              </span>
            </td>
            <td className="mj-faint mj-xs">{tags.slice(0, 2).map((t) => `#${t}`).join(' ')}</td>
            <td className="mj-count">{relDays(e.at)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

/* ------------------------------------------------------------------ */
/* Phone                                                               */
/* ------------------------------------------------------------------ */

const Phone = ({ label, children }: { label: string; children: ReactNode }) => (
  <figure className="mj-phone-wrap">
    <div className="mj-phone">
      <div className="mj-status" aria-hidden="true">
        <span>9:41</span>
        <span className="mj-island" />
        <span>100%</span>
      </div>
      {children}
    </div>
    <figcaption>{label}</figcaption>
  </figure>
);

/* ------------------------------------------------------------------ */
/* Open-decisions framing                                              */
/* ------------------------------------------------------------------ */

/**
 * The Nintendo lens: JOYFUL_SYSTEMS' “Honda/Nintendo standard” turned into five tests for each decision.
 * The reference era is GameCube, Wii and DS — not the Switch's flatter 2010s look.
 */
const LENS = [
  { n: 1, rule: 'Content is the hero, the system is quiet', eg: 'The Wii Menu is a wall of live channels — Forecast shows today’s weather on its tile — with two system buttons tucked below.' },
  { n: 2, rule: 'One focus per screen, everything else one press away', eg: 'The Wii’s HOME button opens over whatever you’re doing and drops you back exactly where you were.' },
  { n: 3, rule: 'Same shape everywhere — learn it once', eg: 'Every Wii channel is the same rounded tile that zooms open the same way; every DS menu answers to A and B.' },
  { n: 4, rule: 'No bookkeeping: offer the right default, confirm with one press', eg: 'WiiConnect24 brings news in overnight; DS Download Play just finds the other player.' },
  { n: 5, rule: 'Things have weight: they look pressable and answer back', eg: 'Glossy, rounded Wii buttons swell under the pointer with a soft tick; the GameCube cube tumbles when you move. Nothing is a flat outline.' },
];

const OpenHead = () => (
  <header className="mk-page-head">
    <p className="mk-page-kicker">memex · design mocks · round 5</p>
    <h1 className="mk-page-title">Journal-first decisions</h1>
    <p className="mk-page-lede">
      Decided 2026-10-25: 11D, 12B, 13B, 14B, 15A, 16A (ROADMAP.md §8). Kept for reference while Phase 1 builds them.
    </p>
    <div className="mj-lens">
      <p className="mj-lens-title">The Nintendo lens</p>
      <ol>
        {LENS.map((l) => (
          <li key={l.n}>
            <strong>{l.rule}.</strong> <span>{l.eg}</span>
          </li>
        ))}
      </ol>
    </div>
    <div className="mk-decided" aria-label="Decided so far">
      {[
        ['Feed', 'Newest at the bottom, composer below'],
        ['16A', 'Phone: tab bar'],
      ].map(([id, label]) => (
        <span key={id} className="mk-decided-chip">
          <Check aria-hidden="true" className="mj-glyph" />
          <strong>{id}</strong> {label}
        </span>
      ))}
      <a className="mk-decided-chip" href="/mocks?history=1">
        Past rounds 1–10 →
      </a>
    </div>
  </header>
);

const Rec = ({ id, children, rules }: { id: string; children: ReactNode; rules: number[] }) => (
  <div className="mj-rec">
    <span className="mj-rec-head">
      <Sparkles aria-hidden="true" className="mj-glyph" />
      Recommended: <a href={`#mock-${id}`}>{id}</a>
      <span className="mj-rec-rules mj-push">
        {rules.map((r) => (
          <span key={r} title={LENS[r - 1].rule}>
            Lens {r}
          </span>
        ))}
      </span>
    </span>
    <div className="mj-rec-body">{children}</div>
  </div>
);

const Others = ({ ids, children }: { ids: string[]; children: ReactNode }) => (
  <details className="mj-others">
    <summary>
      <ChevronDown aria-hidden="true" className="mj-glyph" />
      Compare the alternatives · {ids.join(', ')}
    </summary>
    <div className="mj-others-boards">{children}</div>
  </details>
);

/* ------------------------------------------------------------------ */
/* Round 5                                                             */
/* ------------------------------------------------------------------ */

const JournalFirstMocks = () => {
  const world = useWorld();
  const parts = useMemo(() => (world ? toParts(world.entries, { limit: 48 }) : []), [world]);
  if (!world) return null;

  const focus = world.focus;
  const spaceEntries = focus ? world.entries.filter((e) => e.spaces.some((s) => s.id === focus.id)) : [];
  const spaceParts = toParts(spaceEntries, { limit: 30 });
  const spaceLinks = spaceEntries.flatMap((e) => (e.kind === 'link' ? [e.link] : [])).reverse();
  const spaceNotes = spaceEntries.flatMap((e) => (e.kind === 'note' ? [e.note] : [])).reverse();
  const spaceTasks = spaceEntries.flatMap((e) => (e.kind === 'task' && !e.task.is_done ? [e.task] : []));
  const pinned = spaceLinks.filter((l) => l.is_super_favorite).concat(spaceLinks).slice(0, 5);

  // Filing close-ups: a couple of unfiled saves (with suggestions when the data has them), one filed save, a jot
  const recent = [...world.entries].reverse();
  const unfiledLinks = recent.filter((e) => e.kind === 'link' && !e.spaces.length);
  const suggested = unfiledLinks.filter((e) => world.suggest(e));
  const filingSet = [
    ...(suggested.length >= 2 ? suggested : unfiledLinks).slice(0, 2),
    recent.find((e) => e.kind === 'link' && e.spaces.length),
    recent.find((e) => e.kind === 'jot'),
  ]
    .filter((e): e is Entry => Boolean(e))
    .sort((a, b) => a.at.localeCompare(b.at));
  const filingParts = toParts(filingSet, { group: false });
  const reasonEntry = filingSet.find((e) => world.suggest(e));
  const reason = reasonEntry ? world.suggest(reasonEntry) : undefined;
  const hoverEntry = filingSet.find((e) => e.kind === 'link' && !e.spaces.length);
  const triage = world.inbox.find((e) => e.kind === 'link' && e.link.preview_image_url) ?? world.inbox[0];
  const views = savedViews(world);
  const gallery = libraryEntries(world, 24);
  const phoneParts = toParts(world.entries, { limit: 14 });

  return (
    <>
      <OpenHead />

      {/* 11 — Journal entries ------------------------------------------- */}
      <Section
        n={11}
        title="Journal entries"
        question="The Journal is home now, newest at the bottom like a chat (decided). Everything lands here: jots, saves from the extension, notes, tasks. How loud should each kind of entry be?"
      >
        <Rec id="11D" rules={[1, 3, 5]}>
          <p>
            A and B are each half right. <strong>A has the feel</strong>: the Journal is a conversation with yourself, and
            what you keep from Pinterest, X and YouTube shows up as pictures, not titles — content is the hero. <strong>B has
            the economy</strong>: a plain link or a note shouldn't take a screen-height card. 11D keeps A's bubbles and
            galleries and gives text-only things B's compact size. Size follows how visual a thing is, so one rule explains
            every entry.
          </p>
        </Rec>
        <Artboard
          id="11D"
          recommended
          title="Messages, tuned (A + B)"
          summary="11A's model — every entry a message in your own chat, Pinterest and X bursts arriving as one gallery — with B's economy: plain web links and notes shrink to compact cards. Pictures are big because they are pictures; everything else takes only the room it needs."
          pros={['Your inspiration shows as images', 'Jots read as yours (bubbles)', 'Twice as dense as 11A on link-heavy days']}
          cons={['Two link sizes to learn (image vs plain)', 'Less dense than 11B']}
          height={920}
          fade={false}
        >
          <div className="mj-shell">
            <Side world={world} active="journal" />
            <main className="mj-main">
              <JournalHead />
              <Feed parts={parts} look="tuned" world={world} width={620} />
              <Composer space={focus} width={620} />
            </main>
          </div>
        </Artboard>
        <Others ids={['11A', '11B', '11C']}>
        <Artboard
          id="11A"
          title="Messages"
          summary="Every entry is a message. Jots are bubbles, links unfurl with their image, and a burst of Pinterest or X saves arrives as one gallery message. Closest to Telegram's Saved Messages."
          pros={['Most visual — your inspiration is the feed', 'Instantly familiar', 'Saves feel like a delivery']}
          cons={['Few entries per screen', 'Jots get lost between big images']}
          height={680}
          fade={false}
        >
          <div className="mj-shell">
            <Side world={world} active="journal" />
            <main className="mj-main">
              <JournalHead />
              <Feed parts={parts} look="rich" world={world} width={620} />
              <Composer space={focus} width={620} />
            </main>
          </div>
        </Artboard>
        <Artboard
          id="11B"
          title="Quiet log"
          summary="Today's Journal turned upside down. Jots are the read; links, notes and tasks are single lines; a run of platform saves is one line with a small strip of thumbnails that opens in place."
          pros={['Densest — a week fits on a screen', 'Thoughts stay front and centre', 'Calm on heavy capture days']}
          cons={['Images barely show', 'The Library does the visual work instead']}
          height={680}
          fade={false}
        >
          <div className="mj-shell">
            <Side world={world} active="journal" />
            <main className="mj-main">
              <JournalHead />
              <Feed parts={parts} look="quiet" world={world} width={620} />
              <Composer space={focus} width={620} />
            </main>
          </div>
        </Artboard>
        <Artboard
          id="11C"
          title="Weighted by intent"
          summary="What you typed or chose is rich: jots read large, links you pasted show a small card, notes show their opening lines. What the extension caught on its own folds into a filmstrip — visual, but one row."
          pros={['Matches how much you meant it', 'Inspiration still visible as a strip', 'Scales when re-sync brings in 40 pins']}
          cons={['Two visual languages to learn', 'Strip thumbnails are small']}
          height={680}
          fade={false}
        >
          <div className="mj-shell">
            <Side world={world} active="journal" />
            <main className="mj-main">
              <JournalHead />
              <Feed parts={parts} look="mixed" world={world} width={620} />
              <Composer space={focus} width={620} />
            </main>
          </div>
        </Artboard>
        </Others>
</Section>

      {/* 12 — Home layout ----------------------------------------------- */}
      <Section
        n={12}
        title="Home layout"
        question="What sits around the feed? The Inbox (unfiled saves and suggestions) and open tasks need a home that doesn't compete with writing. Shown with 11D's entries."
      >
        <Rec id="12B" rules={[2, 3]}>
          <p>
            You chose the tab bar for the phone. On the desktop, <strong>the sidebar is that tab bar</strong> — Journal,
            Library, Inbox, Tasks, then your spaces — so both apps share one map. The feed gets the whole stage; the Inbox
            speaks up with a count, and with the tray only when it has something waiting. 12A's rail is three things to
            watch at once, and 12C (no sidebar) paired with the phone layout you didn't pick, so it's dropped.
          </p>
        </Rec>
        <Artboard
            recommended
          id="12B"
          title="Two columns, Inbox in the sidebar"
          summary="Inbox and Tasks are sidebar rows with counts. The feed gets the room. When unfiled saves pile up, a slim tray above the composer offers to review them."
          pros={['Calmest — one thing to read', 'Counts still nudge you', 'Works at any width']}
          cons={['Filing is a separate trip', 'Tasks out of sight while writing']}
          height={680}
          fade={false}
        >
          <div className="mj-shell">
            <Side world={world} active="journal" counts />
            <main className="mj-main">
              <JournalHead />
              <Feed parts={parts} look="tuned" world={world} width={680} />
              <div className="mj-tray" style={{ maxWidth: 680 }}>
                <Inbox aria-hidden="true" className="mj-glyph" />
                <span className="mj-fav-stack" aria-hidden="true">
                  {world.inbox.flatMap((e) => (e.kind === 'link' ? [e.link] : [])).slice(0, 4).map((l) => (
                    <Fav key={l.id} link={l} size="s" />
                  ))}
                </span>
                <span className="mj-ellipsis">
                  <strong>{world.inbox.length} unfiled</strong> from the last two weeks
                </span>
                <span className="mj-btn mj-push">Review</span>
              </div>
              <Composer space={focus} width={680} />
            </main>
          </div>
        </Artboard>
        <Others ids={['12A']}>
        <Artboard
          id="12A"
          title="Feed + back-office rail"
          summary="Sidebar, feed, and a right rail: Inbox with one-click suggestions, open tasks, and what got filed this week. The filing happens beside the writing, not in it."
          pros={['Inbox and tasks always in view', 'Filing without leaving the Journal', 'Uses wide screens well']}
          cons={['Three columns is busy', 'Rail collapses on laptops']}
          height={680}
          fade={false}
        >
          <div className="mj-shell">
            <Side world={world} active="journal" />
            <main className="mj-main">
              <JournalHead />
              <Feed parts={parts} look="tuned" world={world} />
              <Composer space={focus} />
            </main>
            <Rail world={world} />
          </div>
        </Artboard>
        </Others>
</Section>

      {/* 13 — Filing ---------------------------------------------------- */}
      <Section
        n={13}
        title="Filing"
        question="Unfiled is a normal state, but saves should find their space with as little effort as possible. Besides @space while typing, how do you file what's already in the feed?"
      >
        <Rec id="13B" rules={[4]}>
          <p>
            Filing is bookkeeping, so <strong>the system should do it and ask for one press</strong>. Your own history
            already produces good guesses — links from a site go where that site's links usually go. Keep 13A's “File to…”
            on every entry as the fallback (it's the same menu), and let 13C's one-at-a-time triage arrive later as the
            Inbox's batch mode, for the day re-sync brings in forty pins.
          </p>
        </Rec>
        <Artboard
            recommended
          id="13B"
          title="Suggestions inline"
          summary="Unfiled entries carry a dashed suggestion chip — one click files it. Suggestions come from rules, not AI: where links from that site usually go, a Pinterest board's mapped space, or a space named in the text."
          pros={['Most saves file in one click', 'Rules are explainable', 'Gets better as you file']}
          cons={['Wrong guesses are noise', 'Needs enough filing history to start']}
          height={520}
          fade={false}
        >
          <div className="mj-closeup">
            <FilingList
              parts={filingParts}
              world={world}
              filing="suggest"
              extra={(id) =>
                reason &&
                id === reasonEntry?.id && (
                  <div className="mj-why">
                    <Sparkles aria-hidden="true" className="mj-glyph" />
                    <span>
                      <strong>Why {reason.space.name}?</strong> {reason.reason}. Click the chip to file it, or ignore it.
                    </span>
                  </div>
                )
              }
            />
          </div>
        </Artboard>
        <Others ids={['13A', '13C']}>
        <Artboard
          id="13A"
          title="Chips + File to… menu"
          summary="Filed entries show their spaces as chips. Hover any entry for File to…, a searchable menu of spaces (also F on the keyboard). Explicit, nothing guessed."
          pros={['Predictable', 'Works for jots, notes, tasks and saves alike', 'Keyboard friendly']}
          cons={['Every save is a manual step', 'Pinterest bursts mean many clicks']}
          height={520}
          fade={false}
        >
          <div className="mj-closeup">
            <FilingList
              parts={filingParts}
              world={world}
              extra={(id) =>
                id === hoverEntry?.id && (
                  <>
                    <div className="mj-hover-bar" aria-hidden="true">
                      <span className="mj-mini">
                        <FolderInput /> File to… <kbd>F</kbd>
                      </span>
                      <span className="mj-mini">
                        <StickyNote /> Note
                      </span>
                      <span className="mj-mini">
                        <Ellipsis />
                      </span>
                    </div>
                    <div className="mj-menu">
                      <div className="mj-menu-search">
                        <Search aria-hidden="true" className="mj-glyph" /> File to…
                      </div>
                      {world.spaces.slice(0, 6).map((s, i) => (
                        <div key={s.id} className={`mj-menu-row${i === 0 ? ' is-active' : ''}`} style={hue(s)}>
                          <i className="mj-dot" aria-hidden="true" />
                          <span className="mj-ellipsis">{s.name}</span>
                          <kbd className="mj-push">{i + 1}</kbd>
                        </div>
                      ))}
                      <div className="mj-menu-row mj-faint">
                        <Plus aria-hidden="true" className="mj-glyph" /> New space…
                      </div>
                    </div>
                  </>
                )
              }
            />
          </div>
        </Artboard>
        <Artboard
          id="13C"
          title="Inbox triage"
          summary="Filing is a short session, not a constant chore: open the Inbox, see one save at a time, press a number to file it, E to leave it unfiled. Pairs with either A or B in the feed."
          pros={['Fast for big batches', 'Clears re-sync dumps in a minute', 'Feed stays clean']}
          cons={['A separate mode to remember', 'Context of the moment is lost']}
          height={520}
        >
          {triage && (
            <div className="mj-triage">
              <div className="mj-triage-head">
                <Inbox aria-hidden="true" className="mj-glyph" />
                <strong>Inbox</strong>
                <span className="mj-count">1 of {world.inbox.length}</span>
                <span className="mj-progress mj-push" aria-hidden="true">
                  <span style={{ width: `${100 / Math.max(world.inbox.length, 1)}%` }} />
                </span>
              </div>
              <div className="mj-triage-card">{<GalleryCard entry={triage} />}</div>
              <div className="mj-triage-keys">
                {world.spaces.slice(0, 6).map((s, i) => (
                  <span key={s.id} className={`mj-key${world.suggest(triage)?.space.id === s.id ? ' is-suggested' : ''}`} style={hue(s)}>
                    <kbd>{i + 1}</kbd>
                    <i className="mj-dot" aria-hidden="true" />
                    <span className="mj-ellipsis">{s.name}</span>
                  </span>
                ))}
              </div>
              <p className="mj-triage-foot">
                <kbd>E</kbd> leave unfiled · <kbd>#</kbd> tag · <kbd>⌫</kbd> delete · <kbd>Z</kbd> undo
              </p>
            </div>
          )}
        </Artboard>
        </Others>
</Section>

      {/* 14 — Space as a working board ---------------------------------- */}
      {focus && (
        <Section
          n={14}
          title="A space as a working board"
          question={`Spaces stop being a filtered grid and become boards you work from. Shown with ${focus.name}. Which leads: the board or the space's own Journal?${
            spaceNotes.length || spaceTasks.length
              ? ''
              : ' (None of your spaces hold notes or tasks yet — your notes were migrated into Home — so those columns show their empty state.)'
          }`}
        >
          <Rec id="14B" rules={[3, 1]}>
            <p>
              <strong>A space is the same Journal, scoped</strong> — nothing new to learn, and the composer works the same
              everywhere. Your spaces today hold saves and jots, not notes or tasks, so 14A's columns would mostly sit empty;
              14B's board column summarises what's there and grows as the space does.
            </p>
          </Rec>
          <Artboard
            recommended
            id="14B"
            title="Journal-led"
            summary="The space opens to its own Journal — everything ever filed here, in time order — with the board as a right column: pinned sites, open tasks, recent saves, notes."
            pros={['Same shape as home — one thing to learn', 'History of the project reads like a story', 'Board stays glanceable']}
            cons={['Less of a workspace feel', 'Tasks and notes get a summary, not a canvas']}
            height={660}
            fade={false}
          >
            <div className="mj-shell">
              <Side world={world} active="space" activeSpace={focus.id} />
              <main className="mj-main">
                <JournalHead space={focus} />
                <Feed parts={spaceParts} look="tuned" filing="none" world={world} />
                <Composer placeholder={`Jot in ${focus.name}… (@ and # still work)`} />
              </main>
              <aside className="mj-rail">
                <RailSection title="Pinned">
                  <div className="mj-pins mj-pins--wrap">
                    {pinned.slice(0, 4).map((l) => (
                      <span key={l.id} className="mj-pinchip">
                        <Fav link={l} size="s" />
                        <span className="mj-ellipsis">{getHostname(l.url)}</span>
                      </span>
                    ))}
                  </div>
                </RailSection>
                <RailSection title="Open tasks" count={spaceTasks.length}>
                  {spaceTasks.slice(0, 4).map((t) => (
                    <TaskLine key={t.id} task={t} />
                  ))}
                  {!spaceTasks.length && <p className="mj-faint mj-xs">None open.</p>}
                </RailSection>
                <RailSection title="Saves" count={spaceLinks.length} action="Open in Library">
                  <div className="mj-tile-grid">
                    {spaceLinks.slice(0, 6).map((l) => (
                      <Tile key={l.id} link={l} />
                    ))}
                  </div>
                </RailSection>
                <RailSection title="Notes" count={spaceNotes.length}>
                  {spaceNotes.slice(0, 3).map((n) => (
                    <div key={n.id} className="mj-rail-task">
                      <StickyNote aria-hidden="true" className="mj-glyph" />
                      <span className="mj-ellipsis">{n.title || 'Untitled'}</span>
                    </div>
                  ))}
                  {!spaceNotes.length && <p className="mj-faint mj-xs">None yet.</p>}
                </RailSection>
              </aside>
            </div>
          </Artboard>
          <Others ids={['14A']}>
          <Artboard
            id="14A"
            title="Board-led"
            summary="Pinned sites on top, then columns: open tasks, notes, saves. The space's Journal is a narrow column on the right for quick jots in context."
            pros={['Everything for the project at a glance', 'Feels like a workspace', 'Tasks get real estate']}
            cons={['Empty columns in young spaces', 'Journal is cramped']}
            height={660}
            fade={false}
          >
            <div className="mj-shell">
              <Side world={world} active="space" activeSpace={focus.id} />
              <main className="mj-main">
                <header className="mj-head">
                  <h3 className="mj-title">
                    <i className="mj-dot mj-dot--l" style={hue(focus)} aria-hidden="true" /> {focus.name}
                  </h3>
                  <span className="mj-count">{world.spaceCount.get(focus.id) ?? 0} items</span>
                  <span className="mj-btn mj-btn--ghost mj-push">Edit space</span>
                </header>
                <div className="mj-pins">
                  {pinned.map((l) => (
                    <span key={l.id} className="mj-pinchip">
                      <Fav link={l} size="s" />
                      <span className="mj-ellipsis">{getLinkTitle(l).split(/[|·—–-]/)[0].trim()}</span>
                    </span>
                  ))}
                  <span className="mj-pinchip mj-faint">
                    <Pin aria-hidden="true" className="mj-glyph" /> Pin a site
                  </span>
                </div>
                <div className="mj-board">
                  <div className="mj-col">
                    <span className="mj-label">Tasks · {spaceTasks.length} open</span>
                    {spaceTasks.length ? (
                      spaceTasks.slice(0, 7).map((t) => <TaskLine key={t.id} task={t} />)
                    ) : (
                      <p className="mj-faint mj-xs">No tasks yet. Type “[] ” in this space's Journal.</p>
                    )}
                    <span className="mj-add">
                      <Plus aria-hidden="true" className="mj-glyph" /> Add a task
                    </span>
                  </div>
                  <div className="mj-col">
                    <span className="mj-label">Notes · {spaceNotes.length}</span>
                    {spaceNotes.slice(0, 4).map((n) => (
                      <div key={n.id} className="mj-notecard mj-notecard--compact">
                        <p className="mj-notecard-title">{n.title || 'Untitled'}</p>
                        <p className="mj-notecard-body">{excerpt(n.body, 90)}</p>
                      </div>
                    ))}
                    {!spaceNotes.length && <p className="mj-faint mj-xs">No notes yet.</p>}
                  </div>
                  <div className="mj-col mj-col--wide">
                    <span className="mj-label">Saves · {spaceLinks.length}</span>
                    <div className="mj-mini-masonry">
                      {spaceLinks.slice(0, 10).map((l) => (
                        <Tile key={l.id} link={l} />
                      ))}
                    </div>
                  </div>
                </div>
              </main>
              <aside className="mj-rail mj-rail--journal">
                <JournalHead space={focus} />
                <Feed parts={spaceParts} look="quiet" filing="none" world={world} />
                <Composer placeholder={`Jot in ${focus.name}…`} hints={false} />
              </aside>
            </div>
          </Artboard>
          </Others>
</Section>
      )}

      {/* 15 — Library --------------------------------------------------- */}
      <Section
        n={15}
        title="Library"
        question="The second view: every item ever captured. Gallery and Table both ship, behind one switch. Where do saved views live — as tabs over the content, or nested under Library in the sidebar?"
      >
        <Rec id="15A" rules={[2, 3]}>
          <p>
            <strong>Views live with the content they filter</strong>, like tabs across the top of a game's menu, and the
            phone's Library tab already uses the same row of chips. The sidebar stays a short map: Journal, Library, Inbox,
            spaces. The Table from 15B still ships — it's the switch in the corner of either option.
          </p>
        </Rec>
        <Artboard
            recommended
          id="15A"
          title="Saved views as tabs (Gallery)"
          summary="Saved views sit above the content as a tab row with counts; filters below them; “Save view” turns the current filters into a new tab. Gallery is today's masonry with space chips added."
          pros={['Views are one glance away', 'Sidebar stays about spaces', 'Familiar from Notion']}
          cons={['Tab row overflows past ~8 views', 'Views only visible inside the Library']}
          height={640}
        >
          <div className="mj-shell">
            <Side world={world} active="library" />
            <main className="mj-main">
              <LibraryHead world={world} layout="gallery" />
              <div className="mj-tabs">
                {views.map((v, i) => (
                  <span key={v.id} className={`mj-tab${i === 0 ? ' is-on' : ''}`}>
                    {v.label} <span className="mj-count">{numFmt.format(v.n)}</span>
                  </span>
                ))}
                <span className="mj-tab mj-faint">
                  <Plus aria-hidden="true" className="mj-glyph" /> Save view
                </span>
              </div>
              <div className="mj-filters">
                <span className="mj-filter">
                  <SlidersHorizontal aria-hidden="true" className="mj-glyph" /> Type
                </span>
                <span className="mj-filter">Source</span>
                <span className="mj-filter">Space</span>
                <span className="mj-filter">Tag</span>
                <span className="mj-filter mj-push">
                  <ArrowUpDown aria-hidden="true" className="mj-glyph" /> Newest
                </span>
              </div>
              <div className="mj-masonry">
                {gallery.map((e) => (
                  <GalleryCard key={e.id} entry={e} />
                ))}
              </div>
            </main>
          </div>
        </Artboard>
        <Others ids={['15B']}>
        <Artboard
          id="15B"
          title="Saved views in the sidebar (Table)"
          summary="Saved views nest under Library in the sidebar, like smart folders. The Table shows type, source, spaces, tags and date — the “visual database” in its most database form."
          pros={['Views reachable from anywhere', 'Scales to many views', 'Table makes cleanup fast']}
          cons={['Sidebar gets long with spaces below', 'Two lists of places to scan']}
          height={640}
        >
          <div className="mj-shell">
            <Side
              world={world}
              active="library"
              views={
                <div className="mj-subnav">
                  {views.map((v, i) => (
                    <div key={v.id} className={`mj-nav mj-nav--sub${i === 0 ? ' is-active' : ''}`}>
                      <span className="mj-ellipsis">{v.label}</span>
                      <span className="mj-count mj-push">{numFmt.format(v.n)}</span>
                    </div>
                  ))}
                  <div className="mj-nav mj-nav--sub mj-faint">
                    <Plus aria-hidden="true" className="mj-glyph" /> New view
                  </div>
                </div>
              }
            />
            <main className="mj-main">
              <LibraryHead world={world} layout="table" />
              <div className="mj-filters">
                <span className="mj-filter is-on">Everything</span>
                <span className="mj-filter">
                  <SlidersHorizontal aria-hidden="true" className="mj-glyph" /> Filter
                </span>
                <span className="mj-filter mj-push">Save changes</span>
              </div>
              <LibraryTable rows={libraryEntries(world, 14)} />
            </main>
          </div>
        </Artboard>
        </Others>
</Section>

      {/* 16 — Phone ----------------------------------------------------- */}
      <details className="mj-others mj-decided-section">
        <summary>
          <ChevronDown aria-hidden="true" className="mj-glyph" />
          Decided · 16A Phone: tab bar
        </summary>
      <Section
        n={16}
        title="Phone"
        question="The mobile web app gets the Journal-first layout now and becomes the Expo app later (Phase 6). Tab bar, or a Journal-only screen with everything else one gesture away?"
      >
        <Artboard
          id="16A"
          title="Tab bar"
          summary="Four tabs: Journal, Library, Spaces, Inbox. The composer sits above the tab bar. The share sheet drops saves straight into the Journal."
          pros={['Every place one tap away', 'Standard iOS pattern', 'Inbox badge visible']}
          cons={['Tab bar + composer eat the bottom', 'Spaces tab duplicates Library filtering']}
          height={760}
        >
          <div className="mj-phones">
            <Phone label="Journal">
              <div className="mj-phone-head">
                <strong>Journal</strong>
                <span className="mj-scope">
                  Home <ChevronDown aria-hidden="true" />
                </span>
                <Search aria-hidden="true" className="mj-glyph mj-push" />
              </div>
              <Feed parts={phoneParts} look="tuned" world={world} filing="none" />
              <Composer placeholder="Jot, paste a link, @space…" hints={false} />
              <div className="mj-tabbar">
                <span className="is-on">
                  <MessageSquare aria-hidden="true" />
                  Journal
                </span>
                <span>
                  <LayoutGrid aria-hidden="true" />
                  Library
                </span>
                <span>
                  <i className="mj-dot" style={focus ? hue(focus) : undefined} aria-hidden="true" />
                  Spaces
                </span>
                <span>
                  <Inbox aria-hidden="true" />
                  Inbox<b className="mj-badge">{world.inbox.length}</b>
                </span>
              </div>
            </Phone>
            <Phone label="Library">
              <div className="mj-phone-head">
                <strong>Library</strong>
                <Search aria-hidden="true" className="mj-glyph mj-push" />
              </div>
              <div className="mj-tabs mj-tabs--scroll">
                {views.slice(0, 5).map((v, i) => (
                  <span key={v.id} className={`mj-tab${i === 0 ? ' is-on' : ''}`}>
                    {v.label}
                  </span>
                ))}
              </div>
              <div className="mj-masonry mj-masonry--2">
                {gallery.slice(0, 10).map((e) => (
                  <GalleryCard key={e.id} entry={e} />
                ))}
              </div>
              <div className="mj-tabbar">
                <span>
                  <MessageSquare aria-hidden="true" />
                  Journal
                </span>
                <span className="is-on">
                  <LayoutGrid aria-hidden="true" />
                  Library
                </span>
                <span>
                  <i className="mj-dot" style={focus ? hue(focus) : undefined} aria-hidden="true" />
                  Spaces
                </span>
                <span>
                  <Inbox aria-hidden="true" />
                  Inbox<b className="mj-badge">{world.inbox.length}</b>
                </span>
              </div>
            </Phone>
          </div>
        </Artboard>

      </Section>
      </details>
    </>
  );
};

export default JournalFirstMocks;
