import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Check,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  CircleUser,
  Copy,
  CornerDownLeft,
  Ellipsis,
  House,
  Link as LinkIcon,
  MessageSquare,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Square,
  StickyNote,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useAllLinks } from '../hooks/useLinks';
import { useAllNotes } from '../hooks/useNotes';
import { useAllTasks } from '../hooks/useTasks';
import { useProfiles } from '../hooks/useProfiles';
import { useSelfMessages } from '../hooks/useSelfMessages';
import {
  getHostname,
  getLinkTitle,
  stripMarkdown,
  type LinkWithTag,
  type NoteWithTags,
  type SelfMessage,
  type TaskWithTags,
} from '@memex/core';
import { Artboard, Fav, Section, Thumb } from '../components/mocks/primitives';
import JournalFirstMocks from '../components/mocks/JournalFirstMocks';
import JournalDeskMocks from '../components/mocks/JournalDeskMocks';
import Wordmark from '../components/ui/Wordmark';
import '../styles/mocks.css';

/*
 * Design mocks — static compositions over the user's real items, used to
 * choose a direction before building it into the stream. Not linked from the
 * app; lives at /mocks. Each option has an ID (1A, 2B…) to reply with.
 */

type Item =
  | { kind: 'link'; at: string; link: LinkWithTag }
  | { kind: 'note'; at: string; note: NoteWithTags }
  | { kind: 'task'; at: string; task: TaskWithTags };

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const relative = (iso: string) => {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return dateFmt.format(new Date(iso));
};

const bucket = (iso: string) => {
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (days < 1) return 'Today';
  if (days < 7) return 'This week';
  if (days < 31) return 'This month';
  return 'Earlier';
};

const groupByTime = (items: Item[]) => {
  const order = ['Today', 'This week', 'This month', 'Earlier'];
  const map = new Map<string, Item[]>();
  items.forEach((item) => {
    const key = bucket(item.at);
    map.set(key, [...(map.get(key) ?? []), item]);
  });
  return order.filter((k) => map.has(k)).map((k) => ({ label: k, items: map.get(k)! }));
};

const excerpt = (body: string, max = 280) => {
  const text = stripMarkdown(body ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/* ------------------------------------------------------------------ */
/* Cards used across stream mocks                                      */
/* ------------------------------------------------------------------ */

const PreviewCard = ({ link, fixedRatio }: { link: LinkWithTag; fixedRatio?: boolean }) => (
  <div className="mk-card mk-card--link">
    <Thumb src={link.preview_image_url} className={fixedRatio ? 'is-fixed' : ''} />
    <div className="mk-card-body">
      <div className="mk-meta">
        <Fav link={link} size="s" />
        <span>{getHostname(link.url)}</span>
      </div>
      <p className="mk-card-title">{getLinkTitle(link)}</p>
    </div>
  </div>
);

const CompactLinkCard = ({ link }: { link: LinkWithTag }) => (
  <div className="mk-card mk-card--compact">
    <div className="mk-card-body">
      <div className="mk-meta">
        <Fav link={link} size="s" />
        <span>{getHostname(link.url)}</span>
        <span className="mk-dot">·</span>
        <span>{relative(link.updated_at)}</span>
      </div>
      <p className="mk-card-title">{getLinkTitle(link)}</p>
    </div>
  </div>
);

const NoteCard = ({ note, lines = 7 }: { note: NoteWithTags; lines?: number }) => (
  <div className="mk-card mk-card--note">
    <div className="mk-card-body">
      <div className="mk-meta">
        <StickyNote aria-hidden="true" className="mk-glyph" />
        <span>Note</span>
        <span className="mk-dot">·</span>
        <span>{relative(note.updated_at)}</span>
      </div>
      <p className="mk-card-title">{note.title || 'Untitled'}</p>
      <p className="mk-card-excerpt" style={{ WebkitLineClamp: lines }}>
        {excerpt(note.body)}
      </p>
    </div>
  </div>
);

const TaskRow = ({ task }: { task: TaskWithTags }) => (
  <div className={`mk-task ${task.is_done ? 'is-done' : ''}`}>
    <span className="mk-check" aria-hidden="true">
      {task.is_done && <Check />}
    </span>
    <span className="mk-task-title">{task.title}</span>
    {task.due_date && <span className="mk-task-due">{dateFmt.format(new Date(task.due_date))}</span>}
  </div>
);

const TaskBand = ({ tasks }: { tasks: TaskWithTags[] }) => {
  const open = tasks.filter((t) => !t.is_done);
  return (
    <div className="mk-taskband">
      <div className="mk-taskband-head">
        <span className="mk-label">Tasks</span>
        <span className="mk-count">{open.length} open</span>
      </div>
      <div className="mk-taskband-list">
        {open.slice(0, 5).map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        <div className="mk-task mk-task--add">
          <Plus aria-hidden="true" className="mk-glyph" />
          <span>Add a task</span>
        </div>
      </div>
    </div>
  );
};

const renderCard = (item: Item, fixedRatio = false) => {
  if (item.kind === 'note') return <NoteCard key={item.note.id} note={item.note} />;
  if (item.kind === 'task') return <TaskRow key={item.task.id} task={item.task} />;
  return item.link.preview_image_url ? (
    <PreviewCard key={item.link.id} link={item.link} fixedRatio={fixedRatio} />
  ) : (
    <CompactLinkCard key={item.link.id} link={item.link} />
  );
};


/* ------------------------------------------------------------------ */
/* Round 2 — link preview card variants                                */
/* ------------------------------------------------------------------ */

type CardVariant = 'overlay' | 'plate' | 'hover' | 'fade' | 'inset';

const PreviewVariantCard = ({ link, variant, forceHover }: { link: LinkWithTag; variant: CardVariant; forceHover?: boolean }) => {
  const [failed, setFailed] = useState(false);
  const host = getHostname(link.url);
  const title = getLinkTitle(link);
  if (!link.preview_image_url || failed) return <CompactLinkCard link={link} />;

  const caption = (
    <div className="mk-pv-caption">
      <span className="mk-pv-host">
        <Fav link={link} size="s" />
        {host}
      </span>
      <span className="mk-pv-title">{title}</span>
    </div>
  );

  return (
    <div className={`mk-pv mk-pv--${variant} ${forceHover ? 'is-hover' : ''}`}>
      <div className="mk-pv-media">
        <img src={link.preview_image_url} alt="" loading="lazy" onError={() => setFailed(true)} />
        {(variant === 'overlay' || variant === 'plate' || variant === 'hover') && caption}
      </div>
      {(variant === 'fade' || variant === 'inset') && caption}
    </div>
  );
};

const VariantMasonry = ({
  links,
  notes,
  variant,
}: {
  links: LinkWithTag[];
  notes: NoteWithTags[];
  variant: CardVariant;
}) => {
  const previews = links.filter((l) => l.preview_image_url).slice(0, 11);
  const plain = links.filter((l) => !l.preview_image_url).slice(0, 1);
  const cells: ReactNode[] = previews.map((l, i) => (
    <PreviewVariantCard key={l.id} link={l} variant={variant} forceHover={variant === 'hover' && i === 1} />
  ));
  cells.splice(3, 0, <NoteCard key={`n-${notes[0]?.id}`} note={notes[0]} lines={5} />);
  if (plain[0]) cells.splice(6, 0, <CompactLinkCard key={`c-${plain[0].id}`} link={plain[0]} />);
  if (notes[2]) cells.splice(9, 0, <NoteCard key={`n2-${notes[2].id}`} note={notes[2]} lines={4} />);
  return (
    <div className="mk-stream">
      <div className="mk-masonry">{cells}</div>
    </div>
  );
};


/* ------------------------------------------------------------------ */
/* Round 3 — Notes to Self integration                                 */
/* ------------------------------------------------------------------ */

const timeOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

const dayLabel = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return dateFmt.format(date);
};

const byDay = (jots: SelfMessage[]) => {
  const groups: { label: string; jots: SelfMessage[] }[] = [];
  jots.forEach((jot) => {
    const label = dayLabel(jot.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.jots.push(jot);
    else groups.push({ label, jots: [jot] });
  });
  return groups;
};

const JotEntry = ({ jot, showActions }: { jot: SelfMessage; showActions?: boolean }) => (
  <div className={`mk-jot${showActions ? ' is-hover' : ''}`}>
    <span className="mk-jot-time">{timeOnly.format(new Date(jot.created_at))}</span>
    <p className="mk-jot-body">{jot.body}</p>
    {showActions && (
      <span className="mk-jot-actions">
        <span className="mk-mini-btn">
          <StickyNote aria-hidden="true" /> Note
        </span>
        <span className="mk-mini-btn">
          <Square aria-hidden="true" /> Task
        </span>
        <span className="mk-mini-btn">
          <X aria-hidden="true" />
        </span>
      </span>
    )}
  </div>
);

const JotComposer = ({ placeholder = 'Jot something…' }: { placeholder?: string }) => (
  <div className="mk-jot-composer">
    <Zap aria-hidden="true" className="mk-glyph" />
    <span className="mk-omni-text--placeholder">{placeholder}</span>
    <span className="mk-kbd mk-push">↵</span>
  </div>
);

const StreamBackdrop = ({ items }: { items: Item[] }) => (
  <div className="mk-masonry mk-masonry--3">{items.slice(0, 9).map((i) => renderCard(i))}</div>
);

const JotCard = ({ jot }: { jot: SelfMessage }) => (
  <div className="mk-card mk-card--jot">
    <div className="mk-card-body">
      <div className="mk-meta">
        <Zap aria-hidden="true" className="mk-glyph" />
        <span>Jot</span>
        <span className="mk-dot">·</span>
        <span>{relative(jot.created_at)}</span>
      </div>
      <p className="mk-jot-quote">{jot.body}</p>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Round 4 — Journal list with daily activity                          */
/* ------------------------------------------------------------------ */

type LogEntry =
  | { kind: 'jot'; at: string; jot: SelfMessage }
  | { kind: 'link'; at: string; link: LinkWithTag }
  | { kind: 'note'; at: string; note: NoteWithTags }
  | { kind: 'done'; at: string; task: TaskWithTags };

type LogDay = { key: string; label: string; weekday: string; entries: LogEntry[] };

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

const localDayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Every jot plus that day's captures and completions, grouped by day, newest first. */
const buildDayLog = (
  jots: SelfMessage[],
  links: LinkWithTag[],
  notes: NoteWithTags[],
  tasks: TaskWithTags[],
  maxDays = 8,
): LogDay[] => {
  const entries: LogEntry[] = [
    ...jots.map((jot) => ({ kind: 'jot' as const, at: jot.created_at, jot })),
    ...links.map((link) => ({ kind: 'link' as const, at: link.created_at, link })),
    ...notes.map((note) => ({ kind: 'note' as const, at: note.created_at, note })),
    ...tasks.filter((t) => t.is_done).map((task) => ({ kind: 'done' as const, at: task.updated_at, task })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const days: LogDay[] = [];
  for (const entry of entries) {
    const key = localDayKey(entry.at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      if (days.length === maxDays) break;
      day = { key, label: dayLabel(entry.at), weekday: weekdayFmt.format(new Date(entry.at)), entries: [] };
      days.push(day);
    }
    day.entries.push(entry);
  }
  return days;
};

const activityOf = (day: LogDay) => day.entries.filter((e) => e.kind !== 'jot');
const jotsOf = (day: LogDay) =>
  day.entries.filter((e): e is Extract<LogEntry, { kind: 'jot' }> => e.kind === 'jot');

const LogActivityRow = ({ entry, showTime = true }: { entry: LogEntry; showTime?: boolean }) => {
  if (entry.kind === 'jot') return null;
  const title =
    entry.kind === 'link' ? getLinkTitle(entry.link) : entry.kind === 'note' ? entry.note.title || 'Untitled' : entry.task.title;
  const verb = entry.kind === 'link' ? 'Saved' : entry.kind === 'note' ? 'Wrote' : 'Done';
  return (
    <div className={`mk-log-row mk-log-row--${entry.kind}`}>
      <span className="mk-jot-time">{showTime ? timeOnly.format(new Date(entry.at)) : ''}</span>
      <span className="mk-log-main">
        {entry.kind === 'link' ? (
          <Fav link={entry.link} size="s" />
        ) : entry.kind === 'note' ? (
          <StickyNote aria-hidden="true" className="mk-glyph" />
        ) : (
          <CircleCheck aria-hidden="true" className="mk-glyph" />
        )}
        <span className="mk-log-verb">{verb}</span>
        <span className="mk-ellipsis">{title}</span>
      </span>
    </div>
  );
};

const FavStack = ({ links }: { links: LinkWithTag[] }) => (
  <span className="mk-fav-stack" aria-hidden="true">
    {links.slice(0, 4).map((link) => (
      <Fav key={link.id} link={link} size="s" />
    ))}
  </span>
);

const activitySummary = (activity: LogEntry[]) => {
  const n = { link: 0, note: 0, done: 0 };
  activity.forEach((e) => {
    if (e.kind !== 'jot') n[e.kind] += 1;
  });
  return [
    n.link && `${n.link} ${n.link === 1 ? 'link' : 'links'} saved`,
    n.note && `${n.note} ${n.note === 1 ? 'note' : 'notes'}`,
    n.done && `${n.done} done`,
  ]
    .filter(Boolean)
    .join(' · ');
};

const LogSummaryRow = ({ activity, open }: { activity: LogEntry[]; open?: boolean }) => (
  <div className={`mk-log-summary${open ? ' is-open' : ''}`}>
    <FavStack links={activity.flatMap((e) => (e.kind === 'link' ? [e.link] : []))} />
    <span className="mk-ellipsis">{activitySummary(activity)}</span>
    <ChevronDown aria-hidden="true" className="mk-glyph mk-push" />
  </div>
);

const DayHead = ({ day, trailing }: { day: LogDay; trailing?: ReactNode }) => (
  <div className="mk-log-dayhead">
    <span className="mk-label">{day.label}</span>
    {day.label !== day.weekday && <span className="mk-meta">{day.weekday}</span>}
    {trailing && <span className="mk-push mk-log-dayhead-trail">{trailing}</span>}
  </div>
);

/** Consecutive non-jot entries collapse into one run (10C). */
const toRuns = (entries: LogEntry[]) => {
  const out: ({ kind: 'jot'; entry: LogEntry } | { kind: 'run'; entries: LogEntry[] })[] = [];
  entries.forEach((entry) => {
    const last = out[out.length - 1];
    if (entry.kind === 'jot') out.push({ kind: 'jot', entry });
    else if (last && last.kind === 'run') last.entries.push(entry);
    else out.push({ kind: 'run', entries: [entry] });
  });
  return out;
};

const JournalHead = () => (
  <div className="mk-journal-head">
    <span className="mk-journal-title">Journal</span>
    <span className="mk-meta">Home</span>
    <span className="mk-push mk-journal-tools">
      <Search aria-hidden="true" className="mk-glyph" />
      <CalendarDays aria-hidden="true" className="mk-glyph" />
    </span>
  </div>
);

const JournalFrame = ({
  spaces,
  items,
  children,
}: {
  spaces: string[];
  items: Item[];
  children: ReactNode;
}) => (
  <div className="mk-shell">
    <SidebarMini spaces={spaces} identity />
    <div className="mk-shell-main">
      <div className="mk-topbar">
        <h2 className="mk-heading">Home</h2>
        <span className="mk-toggle-label is-on">
          <BookOpen aria-hidden="true" className="mk-glyph" /> Journal
          <span className="mk-kbd">J</span>
        </span>
      </div>
      <div className="mk-split-main mk-split-main--wide">
        <div className="mk-stream mk-stream--flush">
          <StreamBackdrop items={items} />
        </div>
        <aside className="mk-journal">
          <JournalHead />
          <JotComposer />
          <div className="mk-journal-feed mk-journal-feed--log">{children}</div>
        </aside>
      </div>
    </div>
  </div>
);

/* Mini app frame for chrome mocks */
const SidebarMini = ({
  spaces,
  pinned,
  showPinned,
  identity,
}: {
  spaces: string[];
  pinned?: LinkWithTag[];
  showPinned?: boolean;
  identity?: boolean;
}) => (
  <aside className="mk-side">
    <Wordmark className="mk-brand" />
    <div className="mk-side-item is-active">
      <House aria-hidden="true" className="mk-glyph" />
      Home
    </div>
    {showPinned && pinned && (
      <>
        <div className="mk-side-label">Pinned</div>
        {pinned.slice(0, 5).map((l) => (
          <div key={l.id} className="mk-side-item">
            <Fav link={l} size="s" />
            <span className="mk-ellipsis">{getLinkTitle(l).split(/[|·—–-]/)[0].trim()}</span>
          </div>
        ))}
      </>
    )}
    <div className="mk-side-label">
      Spaces <Plus aria-hidden="true" className="mk-glyph" />
    </div>
    {spaces.slice(0, showPinned ? 4 : 7).map((s, i) => (
      <div key={s} className="mk-side-item">
        {identity && <span className={`mk-space-dot mk-hue-${i % 6}`} aria-hidden="true" />}
        <span className="mk-ellipsis">{s}</span>
      </div>
    ))}
    <div className="mk-side-foot">
      <CircleUser aria-hidden="true" className="mk-glyph" />
      <span className="mk-ellipsis">ryanatk@vt.edu</span>
      <Settings aria-hidden="true" className="mk-glyph mk-push" />
    </div>
  </aside>
);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const MocksPage = () => {
  const { data: links = [] } = useAllLinks();
  const { data: notes = [] } = useAllNotes();
  const { data: tasks = [] } = useAllTasks();
  const { data: profiles = [] } = useProfiles();
  const { messages: homeJots } = useSelfMessages(null);

  useEffect(() => {
    document.title = 'Mocks · memex';
    return () => {
      document.title = 'memex';
    };
  }, []);

  const sortedLinks = useMemo(
    () => [...links].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [links],
  );
  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...sortedLinks.slice(0, 40).map((link) => ({ kind: 'link' as const, at: link.updated_at, link })),
      ...notes.slice(0, 20).map((note) => ({ kind: 'note' as const, at: note.updated_at, note })),
    ];
    return all.sort((a, b) => b.at.localeCompare(a.at));
  }, [sortedLinks, notes]);

  const pinned = useMemo(() => links.filter((l) => l.is_super_favorite), [links]);
  const dayLog = useMemo(
    () => buildDayLog(homeJots, links, notes, tasks, 10),
    [homeJots, links, notes, tasks],
  );
  const spaces = profiles.map((p) => p.name);
  const featured = sortedLinks.find((l) => l.preview_image_url && l.description) ?? sortedLinks[0];
  const longNote = [...notes].sort((a, b) => (b.body?.length ?? 0) - (a.body?.length ?? 0))[3] ?? notes[0];
  const allMatchingNotes = notes.filter((n) => /design/i.test(`${n.title} ${n.body}`));
  const allMatchingLinks = sortedLinks.filter((l) => /design/i.test(`${l.title} ${l.url} ${l.description ?? ''}`));
  const matchingNotes = allMatchingNotes.slice(0, 3);
  const matchingLinks = allMatchingLinks.slice(0, 3);

  if (!links.length) {
    return <div className="mk-page mk-loading">Loading your items…</div>;
  }

  // Default view: only the decisions still open. Past rounds (1–10) live behind ?history=1.
  if (new URLSearchParams(window.location.search).get('history') !== '1') {
    return (
      <div className="mk-page">
        <JournalDeskMocks />
        <JournalFirstMocks />
      </div>
    );
  }

  // A representative mix: recent links plus a few notes, newest first
  const recentNotes = [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  const firstItems: Item[] = [
    ...sortedLinks.slice(0, 11).map((link) => ({ kind: 'link' as const, at: link.updated_at, link })),
    ...recentNotes.map((note) => ({ kind: 'note' as const, at: note.updated_at, note })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="mk-page">
      <header className="mk-page-head">
        <p className="mk-page-kicker">memex · design mocks</p>
        <h1 className="mk-page-title">Past rounds</h1>
        <p className="mk-page-lede">
          <a href="/mocks">← Back to the open decisions</a>
        </p>
        <p className="mk-page-lede">
          Rounds 1–4 (2026-10-15/16), kept for reference. Picks are marked; most of this stream surface becomes the
          Library in the journal-first app.
        </p>
        <div className="mk-decided" aria-label="Decided so far">
          {[
            ['1A + 1C', 'Masonry ⇄ list toggle'],
            ['2C', 'Launcher row'],
            ['3C', 'Expand in place'],
            ['4A', 'Command palette'],
            ['5A', 'Document column'],
            ['6A', 'Colour dot + heading'],
            ['7C', 'Caption on hover (7A fallback)'],
            ['9A', 'Labelled header button'],
            ['10B', 'Journal, activity folded'],
          ].map(([id, label]) => (
            <span key={id} className="mk-decided-chip">
              <Check aria-hidden="true" className="mk-glyph" />
              <strong>{id}</strong> {label}
            </span>
          ))}
        </div>
        <nav className="mk-toc" aria-label="Decisions">
          {['Stream layout', 'Header & pinned sites', 'Link details', 'Search & capture', 'Note editor', 'Space identity', 'Link preview cards', 'Notes to Self', 'Notes to Self toggle', 'Journal with activity'].map(
            (label, i) => (
              <a key={label} href={`#decision-${i + 1}`}>
                <span>{i + 1}</span>
                {label}
              </a>
            ),
          )}
        </nav>
      </header>



      {/* 10 — Journal list with daily activity (round 4) ---------------- */}
      <Section
        n={10}
        title="Journal with daily activity"
        question="8D's day log hid your jots behind one-day-at-a-time paging. Back to 8A's continuous list — every jot, newest first, under day headers — with each day also showing what you saved, wrote and finished. How loud should that activity be?"
      >
        <Artboard
          id="10A"
          title="One timeline"
          summary="Each day is a single chronological thread: jots read as writing, and captures sit between them as quieter one-line rows (favicon · Saved · title). You see what you were reading when you had the thought."
          pros={['Thoughts sit beside what sparked them', 'Nothing hidden', 'Simplest model — it is just time']}
          cons={['Busy capture days push jots apart', 'Long scroll on heavy days']}
          height={700}
        >
          <JournalFrame spaces={spaces} items={firstItems}>
            {dayLog.map((day) => (
              <div key={day.key} className="mk-journal-day">
                <DayHead day={day} />
                {(() => {
                  // Every jot shows; activity rows cap at 6 per day
                  const shownActivity = new Set(activityOf(day).slice(0, 6));
                  const hidden = activityOf(day).length - shownActivity.size;
                  return (
                    <>
                      {day.entries.map((entry) =>
                        entry.kind === 'jot' ? (
                          <JotEntry key={entry.jot.id} jot={entry.jot} />
                        ) : shownActivity.has(entry) ? (
                          <LogActivityRow key={`${entry.kind}-${entry.at}`} entry={entry} />
                        ) : null,
                      )}
                      {hidden > 0 && <span className="mk-log-more">{hidden} more saved…</span>}
                    </>
                  );
                })()}
              </div>
            ))}
          </JournalFrame>
        </Artboard>

        <Artboard
          id="10B"
          title="Jots first, activity folded"
          summary="Jots stay the main read. Under each day's jots, one folded line sums up the rest — favicons, “4 links saved · 1 note · 2 done” — that opens in place. Days with no jots shrink to just that line."
          pros={['Jots stay dense and scannable', 'Quiet days take one line', 'Activity is a click away']}
          cons={['Loses the “what was I reading” timing', 'One more click to see captures']}
          height={700}
        >
          <JournalFrame spaces={spaces} items={firstItems}>
            {dayLog.map((day, di) => {
              const activity = activityOf(day);
              const open = di === 0;
              return (
                <div key={day.key} className="mk-journal-day">
                  <DayHead day={day} />
                  {jotsOf(day).map((entry) => (
                    <JotEntry key={entry.jot.id} jot={entry.jot} />
                  ))}
                  {activity.length > 0 && <LogSummaryRow activity={activity} open={open} />}
                  {open &&
                    activity.slice(0, 5).map((entry) => (
                      <LogActivityRow key={`${entry.kind}-${entry.at}`} entry={entry} />
                    ))}
                </div>
              );
            })}
          </JournalFrame>
        </Artboard>

        <Artboard
          id="10C"
          title="Timeline with grouped runs"
          summary="Chronological like 10A, but back-to-back captures fold into one row (“Saved 3 links” + favicons) placed where they happened. Single captures stay as one line. Keeps the timing without the clutter."
          pros={['Keeps thought ↔ capture timing', 'Bursts of saving stay one line', 'Reads calmly on busy days']}
          cons={['Slightly more to learn than 10A', 'Runs need a click to see every item']}
          height={700}
        >
          <JournalFrame spaces={spaces} items={firstItems}>
            {dayLog.map((day) => (
              <div key={day.key} className="mk-journal-day">
                <DayHead day={day} />
                {toRuns(day.entries).map((part, pi) =>
                  part.kind === 'jot' ? (
                    part.entry.kind === 'jot' && <JotEntry key={part.entry.jot.id} jot={part.entry.jot} />
                  ) : part.entries.length === 1 ? (
                    <LogActivityRow key={`run-${pi}`} entry={part.entries[0]} />
                  ) : (
                    <div key={`run-${pi}`} className="mk-log-row">
                      <span className="mk-jot-time">{timeOnly.format(new Date(part.entries[0].at))}</span>
                      <LogSummaryRow activity={part.entries} />
                    </div>
                  ),
                )}
              </div>
            ))}
          </JournalFrame>
        </Artboard>
      </Section>

      {/* 8 — Notes to Self integration (round 3) ------------------------- */}
      <Section
        n={8}
        title="Notes to Self"
        question="Today it's a chat app docked beside the stream — bubbles talking to no one, a second capture box, and 335 jots you can't search or turn into anything. Where should quick jots live?"
      >
        <Artboard
          id="8A"
          title="Journal rail"
          summary="Keep the docked rail, but make it a journal instead of a chat: composer on top, entries as timestamped lines under day headers, newest first. Each jot can become a note or task, and jots show up in the command palette."
          pros={['Smallest change to how you use it today', 'Reads as writing, not messaging', 'Jots graduate into notes/tasks']}
          cons={['Still a separate column', 'Two capture inputs remain on screen']}
          height={620}
        >
          <div className="mk-shell">
            <SidebarMini spaces={spaces} identity />
            <div className="mk-shell-main">
              <div className="mk-topbar">
                <h2 className="mk-heading">Home</h2>
                <span className="mk-toggle-label is-on">
                  <BookOpen aria-hidden="true" className="mk-glyph" /> Journal
                  <span className="mk-count">{homeJots.filter((j) => dayLabel(j.created_at) === 'Today').length || 3} today</span>
                </span>
              </div>
              <div className="mk-split-main">
                <div className="mk-stream mk-stream--flush">
                  <StreamBackdrop items={firstItems} />
                </div>
                <aside className="mk-journal">
                  <div className="mk-journal-head">
                    <span className="mk-journal-title">Journal</span>
                    <span className="mk-meta">Home</span>
                  </div>
                  <JotComposer />
                  <div className="mk-journal-feed">
                    {byDay([...homeJots].reverse().slice(0, 14)).map((group, gi) => (
                      <div key={group.label} className="mk-journal-day">
                        <span className="mk-label">{group.label}</span>
                        {group.jots.map((jot, ji) => (
                          <JotEntry key={jot.id} jot={jot} showActions={gi === 0 && ji === 0} />
                        ))}
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="8B"
          title="Jots are part of the stream"
          summary="No panel at all. Jots become a fourth type beside Links, Notes, and Tasks: small quote cards in the masonry (and rows in the list), time-grouped with everything else. Capture from the command palette with “Jot” (⌥↵)."
          pros={['Fully cohesive — one stream, one capture box', 'Search, select, tag, move to spaces for free', 'Your thinking sits beside what inspired it']}
          cons={['335 short jots can crowd the grid (filterable)', 'Loses the “quick scratchpad on the side” feel']}
          height={620}
        >
          <div className="mk-stream">
            <div className="mk-omni">
              <Search aria-hidden="true" className="mk-glyph" />
              <span className="mk-omni-text--placeholder">Search 804 items or capture…</span>
            </div>
            <div className="mk-filters">
              <span className="mk-chip">Links <span className="mk-count">369</span></span>
              <span className="mk-chip">Notes <span className="mk-count">95</span></span>
              <span className="mk-chip">Tasks <span className="mk-count">5</span></span>
              <span className="mk-chip">Jots <span className="mk-count">{homeJots.length}</span></span>
            </div>
            <div className="mk-masonry mk-masonry--4">
              {firstItems.slice(0, 10).flatMap((item, index) => {
                const jot = [...homeJots].reverse()[index];
                const card = renderCard(item);
                return jot && index % 2 === 0 ? [<JotCard key={jot.id} jot={jot} />, card] : [card];
              })}
            </div>
          </div>
        </Artboard>

        <Artboard
          id="8C"
          title="Jot from the command palette"
          summary="The command bar becomes the only capture box. Focusing it with nothing typed shows your recent jots; typing offers “Jot” as a create row alongside Note and Task. Jots live in a Journal view (a sidebar entry) rather than a rail."
          pros={['One capture box for everything', 'Jots one keystroke away, never in the way', 'Journal gets a full page when you want to read back']}
          cons={['Jots are out of sight unless you look', 'Recent list is short by design']}
          height={620}
        >
          <div className="mk-shell">
            <aside className="mk-side">
              <Wordmark className="mk-brand" />
              <div className="mk-side-item">
                <House aria-hidden="true" className="mk-glyph" />
                Home
              </div>
              <div className="mk-side-item is-active">
                <BookOpen aria-hidden="true" className="mk-glyph" />
                Journal
                <span className="mk-count mk-push">{homeJots.length}</span>
              </div>
              <div className="mk-side-label">Spaces</div>
              {spaces.slice(0, 5).map((s, i) => (
                <div key={s} className="mk-side-item">
                  <span className={`mk-space-dot mk-hue-${i % 6}`} aria-hidden="true" />
                  <span className="mk-ellipsis">{s}</span>
                </div>
              ))}
            </aside>
            <div className="mk-shell-main">
              <div className="mk-topbar">
                <h2 className="mk-heading">Home</h2>
              </div>
              <div className="mk-omni is-focused">
                <Search aria-hidden="true" className="mk-glyph" />
                <span className="mk-omni-text">idea for the onboarding</span>
              </div>
              <div className="mk-palette">
                <div className="mk-palette-row is-highlighted">
                  <Zap aria-hidden="true" className="mk-glyph" />
                  <span>
                    Jot <strong>“idea for the onboarding”</strong>
                  </span>
                  <span className="mk-kbd mk-push">⌥ ↵</span>
                </div>
                <div className="mk-palette-row">
                  <Plus aria-hidden="true" className="mk-glyph" />
                  <span>
                    New note <strong>“idea for the onboarding”</strong>
                  </span>
                  <span className="mk-kbd mk-push">⌘ ↵</span>
                </div>
                <div className="mk-palette-label">Recent jots</div>
                {[...homeJots].reverse().slice(0, 5).map((jot) => (
                  <div key={jot.id} className="mk-palette-row">
                    <Zap aria-hidden="true" className="mk-glyph" />
                    <span className="mk-ellipsis">{jot.body}</span>
                    <span className="mk-meta mk-push">{relative(jot.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="8D"
          title="Today column"
          summary="The rail becomes “Today”: a daily log that combines today's jots with what you captured today and your open tasks. Jot at the top; yesterday's log is one click back. Notes to Self becomes the heart of a daily review."
          pros={['Gives the rail a reason to exist', 'Daily rhythm — capture, then review', 'Connects jots to the rest of your day']}
          cons={['Biggest concept shift', 'Duplicates some stream content']}
          height={620}
        >
          <div className="mk-shell">
            <SidebarMini spaces={spaces} identity />
            <div className="mk-shell-main">
              <div className="mk-topbar">
                <h2 className="mk-heading">Home</h2>
                <span className="mk-toggle-label is-on">
                  <CalendarDays aria-hidden="true" className="mk-glyph" /> Today
                </span>
              </div>
              <div className="mk-split-main">
                <div className="mk-stream mk-stream--flush">
                  <StreamBackdrop items={firstItems} />
                </div>
                <aside className="mk-journal">
                  <div className="mk-journal-head">
                    <span className="mk-journal-title">Today</span>
                    <span className="mk-meta">{dateFmt.format(new Date())}</span>
                  </div>
                  <JotComposer placeholder="What's on your mind?" />
                  <div className="mk-journal-feed">
                    <div className="mk-journal-day">
                      <span className="mk-label">Jots</span>
                      {[...homeJots].reverse().slice(0, 3).map((jot) => (
                        <JotEntry key={jot.id} jot={jot} />
                      ))}
                    </div>
                    <div className="mk-journal-day">
                      <span className="mk-label">Captured today</span>
                      {sortedLinks.slice(0, 3).map((link) => (
                        <div key={link.id} className="mk-today-row">
                          <Fav link={link} size="s" />
                          <span className="mk-ellipsis">{getLinkTitle(link)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mk-journal-day">
                      <span className="mk-label">Open tasks</span>
                      {tasks.filter((t) => !t.is_done).slice(0, 3).map((task) => (
                        <TaskRow key={task.id} task={task} />
                      ))}
                    </div>
                    <span className="mk-back">← Yesterday</span>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </Artboard>
      </Section>

      {/* 9 — Toggle (round 3) ------------------------------------------- */}
      <Section
        n={9}
        title="How you reach it"
        question="Replacing the unlabelled chat-bubble button. (Applies to 8A or 8D; 8B and 8C need no toggle.)"
      >
        <Artboard
          id="9A"
          title="Labelled header button"
          summary="A quiet labelled button in the heading row — name plus today's count — that stays pressed while the rail is open. Shortcut J."
          pros={['Says what it is', 'Count gives a reason to look', 'Same spot as today']}
          cons={['One more labelled control in the header']}
          height={220}
        >
          <div className="mk-shell-main mk-toggle-demo">
            <div className="mk-topbar">
              <h2 className="mk-heading">Home</h2>
              <div className="mk-toggle-row">
                <span className="mk-toggle-label">
                  <BookOpen aria-hidden="true" className="mk-glyph" /> Journal
                  <span className="mk-count">3 today</span>
                  <span className="mk-kbd">J</span>
                </span>
                <span className="mk-toggle-label is-on">
                  <BookOpen aria-hidden="true" className="mk-glyph" /> Journal
                  <span className="mk-count">3 today</span>
                  <span className="mk-kbd">J</span>
                </span>
              </div>
            </div>
            <p className="mk-hint">Closed (left) and open (right).</p>
          </div>
        </Artboard>

        <Artboard
          id="9B"
          title="Sidebar entry"
          summary="Journal sits under Home in the sidebar like a place you go. Clicking it opens the rail beside whatever you're viewing; the entry stays highlighted while open."
          pros={['Fits the navigation model', 'Header stays clean', 'Natural on mobile (bottom bar)']}
          cons={['Mixes a panel toggle with navigation']}
          height={300}
        >
          <div className="mk-shell">
            <aside className="mk-side">
              <Wordmark className="mk-brand" />
              <div className="mk-side-item is-active">
                <House aria-hidden="true" className="mk-glyph" />
                Home
              </div>
              <div className="mk-side-item is-open">
                <BookOpen aria-hidden="true" className="mk-glyph" />
                Journal
                <span className="mk-count mk-push">3</span>
              </div>
              <div className="mk-side-label">Spaces</div>
              {spaces.slice(0, 3).map((s, i) => (
                <div key={s} className="mk-side-item">
                  <span className={`mk-space-dot mk-hue-${i % 6}`} aria-hidden="true" />
                  <span className="mk-ellipsis">{s}</span>
                </div>
              ))}
            </aside>
            <div className="mk-shell-main">
              <p className="mk-hint">Rail opens to the right of the stream.</p>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="9C"
          title="Edge tab"
          summary="A slim vertical tab pinned to the right edge of the stream with the latest jot peeking out. Click or drag to open; it slides back to a tab when closed."
          pros={['Always present but almost invisible', 'Shows the latest thought at a glance', 'Feels physical, like a drawer']}
          cons={['Less discoverable than a label', 'Needs care on touch']}
          height={300}
        >
          <div className="mk-edge-demo">
            <div className="mk-stream mk-stream--flush">
              <StreamBackdrop items={firstItems} />
            </div>
            <div className="mk-edge-tab">
              <span className="mk-edge-tab-label">
                <BookOpen aria-hidden="true" className="mk-glyph" /> Journal
              </span>
              <span className="mk-edge-tab-peek">
                {[...homeJots].reverse()[0]?.body ?? 'Latest jot'}
              </span>
              <ArrowRight aria-hidden="true" className="mk-glyph" />
            </div>
          </div>
        </Artboard>
      </Section>

      {/* 7 — Link preview cards (round 2) -------------------------------- */}
      <Section
        n={7}
        title="Link preview cards"
        question="How should a link with a preview image present its title and source in the masonry grid?"
      >
        <Artboard
          id="7A"
          title="Frosted gradient overlay"
          summary="Title and host sit on the image. A blur fades in from the bottom third (masked gradient) under a soft dark scrim, so text stays readable on any image."
          pros={['Image runs edge to edge', 'No hard line between image and text', 'Compact — cards ~30% shorter']}
          cons={['Covers the bottom of the image', 'Text is always white-on-image']}
          height={760}
        >
          <VariantMasonry links={sortedLinks} notes={recentNotes} variant="overlay" />
        </Artboard>

        <Artboard
          id="7B"
          title="Floating glass plate"
          summary="A frosted panel inset from the card edges carries the title. It follows light/dark mode (pale glass in light, smoky in dark) rather than always going dark."
          pros={['Feels most like the Pastel Sky surfaces', 'Readable without a heavy scrim', 'Distinct, tactile look']}
          cons={['Hides more of the image', 'Glass over busy images can look noisy']}
          height={760}
        >
          <VariantMasonry links={sortedLinks} notes={recentNotes} variant="plate" />
        </Artboard>

        <Artboard
          id="7C"
          title="Image first, caption on hover"
          summary="At rest the card is just the image with a small host badge. Hover (or focus) slides up the frosted caption. The second card is shown hovered — try hovering others."
          pros={['Purest mood-board look', 'Images get full attention', 'Pairs well with the list view for scanning']}
          cons={['Titles hidden until hover', 'Touch needs the caption always on']}
          height={760}
        >
          <VariantMasonry links={sortedLinks} notes={recentNotes} variant="hover" />
        </Artboard>

        <Artboard
          id="7D"
          title="Soft fade into the card"
          summary="Text stays below the image, but the image fades into the card surface instead of ending on a hard edge. Text reads as part of the same object."
          pros={['Always-readable, mode-adaptive text', 'Whole image visible', 'Gentlest change from today']}
          cons={['Cards stay taller', 'Fade can muddy bright image bottoms']}
          height={760}
        >
          <VariantMasonry links={sortedLinks} notes={recentNotes} variant="fade" />
        </Artboard>

        <Artboard
          id="7E"
          title="Inset print"
          summary="The image sits inset inside the card with its own rounded corners, like a mounted print, with the caption beneath on the card surface."
          pros={['Crisp, gallery-like', 'Separation feels designed, not abrupt', 'Readable in both modes']}
          cons={['Slightly smaller images', 'More padding per card']}
          height={760}
        >
          <VariantMasonry links={sortedLinks} notes={recentNotes} variant="inset" />
        </Artboard>
      </Section>

      {/* 1 — Stream layout ------------------------------------------------ */}
      <Section
        n={1}
        title="Stream layout"
        question="How should links, notes, and tasks sit together in the stream?"
      >
        <Artboard
          id="1A"
          title="Masonry by type"
          summary="Cards take their content's natural height. Previews show the full image; links without one are compact; notes show 7 lines. Open tasks live in a checklist band above."
          pros={['Visual, mood-board feel', 'No dead space in cards', 'Notes readable at a glance']}
          cons={['Order reads top-to-bottom per column, not by row', 'Busier with many images']}
          height={760}
        >
          <div className="mk-stream">
            <TaskBand tasks={tasks} />
            <div className="mk-masonry">{firstItems.map((i) => renderCard(i))}</div>
          </div>
        </Artboard>

        <Artboard
          id="1B"
          title="Time sections, aligned grid"
          summary="Items grouped under Today / This week / This month / Earlier. Uniform 16:9 thumbnails keep rows tidy; cards without media collapse to their text height."
          pros={['Answers “when did I save this?”', 'Calm, orderly rows', 'Easy scanning left-to-right']}
          cons={['Images cropped to 16:9', 'Mixed-height rows leave some gaps']}
          height={760}
        >
          <div className="mk-stream">
            <TaskBand tasks={tasks} />
            {groupByTime(firstItems).map((g) => (
              <div key={g.label} className="mk-group">
                <h4 className="mk-group-label">
                  {g.label} <span className="mk-count">{g.items.length}</span>
                </h4>
                <div className="mk-grid">{g.items.map((i) => renderCard(i, true))}</div>
              </div>
            ))}
          </div>
        </Artboard>

        <Artboard
          id="1C"
          title="Reading list"
          summary="One dense column of rich rows: icon, title, source and time, with a small thumbnail on the right. Tasks sit inline with checkboxes. Time headers keep it navigable."
          pros={['Fastest to scan hundreds of items', 'Great for search results', 'Works the same on mobile']}
          cons={['Loses the visual browsing of previews', 'Less personality']}
          height={760}
        >
          <div className="mk-stream mk-stream--list">
            {groupByTime(items.slice(0, 22)).map((g) => (
              <div key={g.label} className="mk-group">
                <h4 className="mk-group-label">
                  {g.label} <span className="mk-count">{g.items.length}</span>
                </h4>
                <div className="mk-rows">
                  {g.items.map((item) =>
                    item.kind === 'link' ? (
                      <div key={item.link.id} className="mk-row">
                        <Fav link={item.link} />
                        <div className="mk-row-text">
                          <p className="mk-card-title">{getLinkTitle(item.link)}</p>
                          <p className="mk-meta">
                            {getHostname(item.link.url)} <span className="mk-dot">·</span> {relative(item.at)}
                          </p>
                        </div>
                        <Thumb src={item.link.preview_image_url} className="mk-row-thumb" />
                      </div>
                    ) : item.kind === 'note' ? (
                      <div key={item.note.id} className="mk-row">
                        <span className="mk-fav mk-fav--m mk-fav--glyph">
                          <StickyNote aria-hidden="true" />
                        </span>
                        <div className="mk-row-text">
                          <p className="mk-card-title">{item.note.title || 'Untitled'}</p>
                          <p className="mk-meta mk-ellipsis">{excerpt(item.note.body, 120)}</p>
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
        </Artboard>
      </Section>

      {/* 2 — Header & pinned --------------------------------------------- */}
      <Section
        n={2}
        title="Header, pinned sites & settings"
        question="Where do pinned sites and settings live, and how loud should they be? (All options drop the footer bar and move settings to the sidebar foot.)"
      >
        <Artboard
          id="2A"
          title="Quiet dock, top right"
          summary="A page heading anchors the left. Pinned sites shrink to a 28px greyscale dock on the right that colours on hover, with name tooltips."
          pros={['Content becomes the loudest thing', 'Pins stay one click away', 'Minimal change']}
          cons={['Greyscale icons are harder to tell apart', 'Limited room for many pins']}
          height={480}
        >
          <div className="mk-shell">
            <SidebarMini spaces={spaces} />
            <div className="mk-shell-main">
              <div className="mk-topbar">
                <div>
                  <h2 className="mk-heading">Home</h2>
                  <p className="mk-subheading">{links.length + notes.length + tasks.length} items</p>
                </div>
                <div className="mk-dock">
                  {pinned.slice(0, 10).map((l) => (
                    <span key={l.id} className="mk-dock-item" title={getLinkTitle(l)}>
                      <Fav link={l} size="s" />
                    </span>
                  ))}
                  <span className="mk-divider" />
                  <span className="mk-icon-btn">
                    <MessageSquare aria-hidden="true" />
                  </span>
                </div>
              </div>
              <div className="mk-ghost-omnibar">Search or capture…</div>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="2B"
          title="Pinned in the sidebar"
          summary="Pins become a labelled “Pinned” section above Spaces. The header is just the page heading and panel toggle."
          pros={['Names visible — no guessing', 'Header fully clean', 'Scales to more pins']}
          cons={['Sidebar gets longer', 'Pins hidden on mobile behind the menu']}
          height={480}
        >
          <div className="mk-shell">
            <SidebarMini spaces={spaces} pinned={pinned} showPinned />
            <div className="mk-shell-main">
              <div className="mk-topbar">
                <div>
                  <h2 className="mk-heading">Home</h2>
                  <p className="mk-subheading">{links.length + notes.length + tasks.length} items</p>
                </div>
                <span className="mk-icon-btn">
                  <MessageSquare aria-hidden="true" />
                </span>
              </div>
              <div className="mk-ghost-omnibar">Search or capture…</div>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="2C"
          title="Launcher row under the heading"
          summary="Pins become labelled chips (favicon + short name) in one scrollable row under the heading — a start-page feel without dominating."
          pros={['Recognisable and labelled', 'Feels like a personal start page', 'Easy to reorder later']}
          cons={['Uses a full row of vertical space', 'Competes slightly with filters']}
          height={480}
        >
          <div className="mk-shell">
            <SidebarMini spaces={spaces} />
            <div className="mk-shell-main">
              <div className="mk-topbar">
                <h2 className="mk-heading">Home</h2>
                <span className="mk-icon-btn">
                  <MessageSquare aria-hidden="true" />
                </span>
              </div>
              <div className="mk-launcher">
                {pinned.slice(0, 8).map((l) => (
                  <span key={l.id} className="mk-launch-chip">
                    <Fav link={l} size="s" />
                    <span className="mk-ellipsis">{getLinkTitle(l).split(/[|·—–-]/)[0].trim()}</span>
                  </span>
                ))}
              </div>
              <div className="mk-ghost-omnibar">Search or capture…</div>
            </div>
          </div>
        </Artboard>
      </Section>

      {/* 3 — Link details ------------------------------------------------- */}
      <Section
        n={3}
        title="Link details"
        question="What happens when you open a link's details? (All options lead with Open, move edit/refresh/delete into a ··· menu, and use Undo instead of a red bar.)"
      >
        <Artboard
          id="3A"
          title="Side panel over the stream"
          summary="A 400px panel slides in from the right; the grid stays visible behind. Preview, description, Open, spaces as chips, and a “why I saved this” note."
          pros={['Keeps your place in the stream', 'Arrow through items with the panel open', 'Matches Notes to Self docking']}
          cons={['Narrower preview image', 'Panel competes with Notes to Self for the right edge']}
          height={720}
        >
          <div className="mk-detail-stage">
            <div className="mk-detail-backdrop">
              <div className="mk-grid">{firstItems.slice(0, 9).map((i) => renderCard(i, true))}</div>
            </div>
            <aside className="mk-panel">
              <div className="mk-panel-head">
                <span className="mk-icon-btn">
                  <Ellipsis aria-hidden="true" />
                </span>
                <span className="mk-icon-btn">
                  <X aria-hidden="true" />
                </span>
              </div>
              <LinkDetailBody link={featured} spaces={spaces} />
            </aside>
          </div>
        </Artboard>

        <Artboard
          id="3B"
          title="Centered preview"
          summary="A large dialog: big preview on the left, details on the right. Feels like opening a saved thing rather than editing a record."
          pros={['Biggest, most visual preview', 'Focused, distraction-free', 'Simple on mobile (full screen)']}
          cons={['Covers the stream entirely', 'Heavier to open and close']}
          height={720}
        >
          <div className="mk-detail-stage mk-detail-stage--dim">
            <div className="mk-lightbox">
              <div className="mk-lightbox-media">
                <Thumb src={featured.preview_image_url} />
              </div>
              <div className="mk-lightbox-info">
                <div className="mk-panel-head">
                  <span className="mk-icon-btn">
                    <Ellipsis aria-hidden="true" />
                  </span>
                  <span className="mk-icon-btn">
                    <X aria-hidden="true" />
                  </span>
                </div>
                <LinkDetailBody link={featured} spaces={spaces} hideImage />
              </div>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="3C"
          title="Expand in place"
          summary="The card grows to span two columns inside the grid, showing details right where you clicked. Other cards reflow around it."
          pros={['Zero context switch', 'Lightweight — no overlay at all', 'Feels tactile']}
          cons={['Grid jumps on open', 'Less room for spaces and notes']}
          height={720}
        >
          <div className="mk-stream">
            <div className="mk-grid mk-grid--expand">
              {firstItems.slice(0, 2).map((i) => renderCard(i, true))}
              <div className="mk-card mk-card--expanded">
                <Thumb src={featured.preview_image_url} className="is-fixed" />
                <div className="mk-card-body">
                  <LinkDetailBody link={featured} spaces={spaces} hideImage compact />
                </div>
              </div>
              {firstItems.slice(2, 9).map((i) => renderCard(i, true))}
            </div>
          </div>
        </Artboard>
      </Section>

      {/* 4 — Search & capture --------------------------------------------- */}
      <Section
        n={4}
        title="Search & capture"
        question="The omnibar both searches and creates. How should it separate the two so Enter never makes something by accident?"
      >
        <Artboard
          id="4A"
          title="Command palette"
          summary="Typing opens a results dropdown: the top row offers to create (⌘↵), then matches grouped by type with “see all”. Enter opens the highlighted result."
          pros={['Search and create are explicit rows', 'Keyboard-first, very fast', 'Cross-type results by default']}
          cons={['Dropdown covers the grid while typing', 'More to build']}
          height={460}
        >
          <div className="mk-stream">
            <div className="mk-omni is-focused">
              <Search aria-hidden="true" className="mk-glyph" />
              <span className="mk-omni-text">design</span>
              <span className="mk-kbd">esc</span>
            </div>
            <div className="mk-palette">
              <div className="mk-palette-row is-highlighted">
                <Plus aria-hidden="true" className="mk-glyph" />
                <span>
                  New note <strong>“design”</strong>
                </span>
                <span className="mk-kbd mk-push">⌘ ↵</span>
              </div>
              <div className="mk-palette-row">
                <Square aria-hidden="true" className="mk-glyph" />
                <span>
                  New task <strong>“design”</strong>
                </span>
                <span className="mk-kbd mk-push">⇧ ⌘ ↵</span>
              </div>
              <div className="mk-palette-label">
                Notes <span className="mk-count">{allMatchingNotes.length}</span>
                <span className="mk-push mk-palette-more">See all</span>
              </div>
              {matchingNotes.map((n) => (
                <div key={n.id} className="mk-palette-row">
                  <StickyNote aria-hidden="true" className="mk-glyph" />
                  <span className="mk-ellipsis">{n.title || 'Untitled'}</span>
                  <span className="mk-meta mk-push">{relative(n.updated_at)}</span>
                </div>
              ))}
              <div className="mk-palette-label">
                Links <span className="mk-count">{allMatchingLinks.length}</span>
                <span className="mk-push mk-palette-more">See all</span>
              </div>
              {matchingLinks.map((l) => (
                <div key={l.id} className="mk-palette-row">
                  <Fav link={l} size="s" />
                  <span className="mk-ellipsis">{getLinkTitle(l)}</span>
                  <span className="mk-meta mk-push">{getHostname(l.url)}</span>
                </div>
              ))}
              <div className="mk-palette-foot">
                <span>
                  <CornerDownLeft aria-hidden="true" className="mk-glyph" /> open
                </span>
                <span>↑↓ move</span>
                <span>⌘↵ create</span>
              </div>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="4B"
          title="Search field + New button"
          summary="The field only searches and filters the stream live. Creating is a separate “New” button with a type menu. Empty filtered results fall through to other types."
          pros={['Zero ambiguity', 'Search results stay in the grid', 'Familiar pattern']}
          cons={['One more click to capture', 'Less “just type” magic']}
          height={460}
        >
          <div className="mk-stream">
            <div className="mk-omni-row">
              <div className="mk-omni is-focused">
                <Search aria-hidden="true" className="mk-glyph" />
                <span className="mk-omni-text">design</span>
              </div>
              <div className="mk-split">
                <span className="mk-btn mk-btn--primary">
                  <Plus aria-hidden="true" className="mk-glyph" /> New
                </span>
                <span className="mk-btn mk-btn--primary mk-split-caret">
                  <ChevronDown aria-hidden="true" className="mk-glyph" />
                </span>
                <div className="mk-menu">
                  <span>
                    <LinkIcon aria-hidden="true" className="mk-glyph" /> Link
                  </span>
                  <span>
                    <StickyNote aria-hidden="true" className="mk-glyph" /> Note
                  </span>
                  <span>
                    <Square aria-hidden="true" className="mk-glyph" /> Task
                  </span>
                </div>
              </div>
            </div>
            <div className="mk-filters">
              <span className="mk-chip">Links</span>
              <span className="mk-chip">Notes</span>
              <span className="mk-chip is-on">Tasks</span>
            </div>
            <div className="mk-fallthrough">
              <p>
                No tasks match <strong>“design”</strong>.
              </p>
              <p className="mk-meta">
                {allMatchingNotes.length} notes and {allMatchingLinks.length} links do.
              </p>
              <span className="mk-btn mk-btn--secondary">Show all types</span>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="4C"
          title="Mode switch inside the field"
          summary="A Search / Capture toggle at the start of the field (Tab switches). In Capture mode the field shows Link · Note · Task and Enter creates; in Search mode Enter never creates."
          pros={['One field, two clear modes', 'Pasting a URL auto-switches to Capture', 'Compact on mobile']}
          cons={['Mode is easy to forget', 'Needs strong visual state']}
          height={460}
        >
          <div className="mk-stream">
            <div className="mk-omni is-focused">
              <span className="mk-seg">
                <span>Search</span>
                <span className="is-on">Capture</span>
              </span>
              <span className="mk-omni-text">design</span>
              <span className="mk-seg mk-seg--quiet mk-push">
                <span>Link</span>
                <span className="is-on">Note</span>
                <span>Task</span>
              </span>
              <span className="mk-kbd">↵</span>
            </div>
            <p className="mk-hint">
              Enter saves a note titled “design”. Tab switches back to Search.
            </p>
            <div className="mk-omni">
              <span className="mk-seg">
                <span className="is-on">Search</span>
                <span>Capture</span>
              </span>
              <span className="mk-omni-text mk-omni-text--placeholder">Search 468 items…</span>
            </div>
          </div>
        </Artboard>
      </Section>

      {/* 5 — Note editor -------------------------------------------------- */}
      <Section n={5} title="Note editor" question="How should an open note read and edit?">
        <Artboard
          id="5A"
          title="Document column"
          summary="A centered ~68-character column with a large title, a quiet metadata line, and Saved status as text. Actions sit in a slim top bar."
          pros={['Comfortable reading length', 'Clear hierarchy', 'Feels like a real document']}
          cons={['Wide screens show empty margins']}
          height={720}
        >
          <div className="mk-doc">
            <div className="mk-doc-bar">
              <span className="mk-back">← Notes</span>
              <span className="mk-meta mk-push">Saved</span>
              <span className="mk-icon-btn">
                <Ellipsis aria-hidden="true" />
              </span>
            </div>
            <div className="mk-doc-col">
              <h2 className="mk-doc-title">{longNote?.title || 'Untitled'}</h2>
              <p className="mk-meta">
                Edited {longNote ? relative(longNote.updated_at) : ''} <span className="mk-dot">·</span> Home{' '}
                <span className="mk-dot">·</span> {(longNote?.body ?? '').split(/\s+/).length} words
              </p>
              <p className="mk-doc-body">{excerpt(longNote?.body ?? '', 1400)}</p>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="5B"
          title="Document + context rail"
          summary="Same column, plus a right rail with spaces, tags, backlinks (“mentioned in”), and created/edited dates. Rail collapses under 1100px."
          pros={['Organising without leaving the note', 'Room for future backlinks', 'Uses wide screens well']}
          cons={['More UI around the writing', 'Rail is empty for most notes today']}
          height={720}
        >
          <div className="mk-doc mk-doc--rail">
            <div className="mk-doc-bar">
              <span className="mk-back">← Notes</span>
              <span className="mk-meta mk-push">Saved</span>
              <span className="mk-icon-btn">
                <Ellipsis aria-hidden="true" />
              </span>
            </div>
            <div className="mk-doc-split">
              <div className="mk-doc-col">
                <h2 className="mk-doc-title">{longNote?.title || 'Untitled'}</h2>
                <p className="mk-doc-body">{excerpt(longNote?.body ?? '', 1100)}</p>
              </div>
              <aside className="mk-rail">
                <div>
                  <span className="mk-label">Spaces</span>
                  <div className="mk-chips">
                    <span className="mk-chip is-on">{spaces[1] ?? 'BUNKR'}</span>
                    <span className="mk-chip">
                      <Plus aria-hidden="true" className="mk-glyph" /> Add
                    </span>
                  </div>
                </div>
                <div>
                  <span className="mk-label">Dates</span>
                  <p className="mk-meta">Created {longNote ? dateFmt.format(new Date(longNote.created_at)) : ''}</p>
                  <p className="mk-meta">Edited {longNote ? relative(longNote.updated_at) : ''}</p>
                </div>
                <div>
                  <span className="mk-label">Mentioned in</span>
                  <p className="mk-meta">No other items yet</p>
                </div>
              </aside>
            </div>
          </div>
        </Artboard>
      </Section>

      {/* 6 — Space identity ------------------------------------------------ */}
      <Section n={6} title="Space identity" question="How should a space feel different from Home?">
        <Artboard
          id="6A"
          title="Colour dot + heading"
          summary="Each space gets a colour from the swatch palette (dot in the sidebar). Inside a space, a heading shows its name, count, and an optional one-line description."
          pros={['Instant recognition', 'Lightweight to set up', 'Colour reuses the swatch palette']}
          cons={['Colour alone needs the name beside it']}
          height={480}
        >
          <div className="mk-shell">
            <SidebarMini spaces={spaces} identity />
            <div className="mk-shell-main">
              <div className="mk-topbar">
                <div>
                  <h2 className="mk-heading">
                    <span className="mk-space-dot mk-hue-1" aria-hidden="true" /> {spaces[1] ?? 'BUNKR'}
                  </h2>
                  <p className="mk-subheading">13 items · Product work for BUNKR</p>
                </div>
                <span className="mk-btn mk-btn--secondary">
                  <Pencil aria-hidden="true" className="mk-glyph" /> Edit space
                </span>
              </div>
              <div className="mk-ghost-omnibar">Search or capture in {spaces[1] ?? 'BUNKR'}…</div>
            </div>
          </div>
        </Artboard>

        <Artboard
          id="6B"
          title="Space takes over the canvas"
          summary="Each space has its own swatch: entering it re-tints the canvas and accent, like walking into a different room. Home keeps your default swatch."
          pros={['Strongest sense of place', 'Makes the swatch system meaningful', 'Zero extra chrome']}
          cons={['Changing colour on every navigation can feel busy', 'Needs a per-space colour picker']}
          height={480}
        >
          <div className="mk-shell mk-shell--tinted">
            <SidebarMini spaces={spaces} identity />
            <div className="mk-shell-main">
              <div className="mk-topbar">
                <div>
                  <h2 className="mk-heading">{spaces[1] ?? 'BUNKR'}</h2>
                  <p className="mk-subheading">13 items</p>
                </div>
              </div>
              <div className="mk-ghost-omnibar">Search or capture in {spaces[1] ?? 'BUNKR'}…</div>
            </div>
          </div>
        </Artboard>
      </Section>
    </div>
  );
};

/* Shared body for the link-detail mocks */
const LinkDetailBody = ({
  link,
  spaces,
  hideImage,
  compact,
}: {
  link: LinkWithTag;
  spaces: string[];
  hideImage?: boolean;
  compact?: boolean;
}) => (
  <div className="mk-detail">
    {!hideImage && <Thumb src={link.preview_image_url} className="is-fixed" />}
    <div className="mk-meta">
      <Fav link={link} size="s" />
      <span>{getHostname(link.url)}</span>
      <span className="mk-dot">·</span>
      <span>Saved {relative(link.created_at)}</span>
    </div>
    <h3 className="mk-detail-title">{getLinkTitle(link)}</h3>
    {link.description && !compact && <p className="mk-detail-desc">{link.description}</p>}
    <div className="mk-actions">
      <span className="mk-btn mk-btn--primary">
        Open <ArrowUpRight aria-hidden="true" className="mk-glyph" />
      </span>
      <span className="mk-btn mk-btn--secondary">
        <Copy aria-hidden="true" className="mk-glyph" /> Copy link
      </span>
      <span className="mk-btn mk-btn--ghost">
        <Pin aria-hidden="true" className="mk-glyph" />
      </span>
    </div>
    <div>
      <span className="mk-label">Spaces</span>
      <div className="mk-chips">
        <span className="mk-chip is-on">{spaces[4] ?? 'Joyful Systems'}</span>
        <span className="mk-chip">
          <Plus aria-hidden="true" className="mk-glyph" /> Add
        </span>
      </div>
    </div>
    {!compact && (
      <div>
        <span className="mk-label">Why I saved this</span>
        <div className="mk-textarea">Add a note…</div>
      </div>
    )}
    {!compact && (
      <div className="mk-menu mk-menu--static">
        <span>
          <Pencil aria-hidden="true" className="mk-glyph" /> Edit URL
        </span>
        <span>
          <RefreshCw aria-hidden="true" className="mk-glyph" /> Refresh preview
        </span>
        <span className="is-danger">
          <Trash2 aria-hidden="true" className="mk-glyph" /> Delete
        </span>
        <span className="mk-menu-caption">The ··· menu (shown open for review)</span>
      </div>
    )}
  </div>
);

export default MocksPage;
