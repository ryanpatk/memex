import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, Inbox } from 'lucide-react';
import { useJournal } from '../../hooks/useJournal';
import { toParts, type Entry, type JournalSpace, type Part } from '../../utils/journalFeed';
import { getLinkTitle } from '@memex/core';
import { PartView, type JournalHandlers } from '../journal/JournalParts';
import JournalComposer from '../journal/JournalComposer';
import { InboxIcon, JournalIcon, LibraryIcon, PlusIcon, TasksIcon } from '../icons';
import Wordmark from '../ui/Wordmark';
import { Artboard, Section } from './primitives';
import '../../styles/journal.css';
import '../../styles/mocks-desk.css';

/*
 * Round 6, decision 17: the desktop Journal feels too open. Each option is
 * the real Journal (shell, header, feed parts, composer) over your data in a
 * 1440×860 desktop frame; only the layout around the entries changes.
 * Handlers are no-ops, so nothing here writes.
 */

type Variant = { page?: boolean; group?: boolean; gutter?: boolean; today?: boolean };

const NOOP: JournalHandlers = {
  onFile: () => {},
  onToggleTask: () => {},
  onOpenNote: () => {},
  onJotToNote: () => {},
  onJotToTask: () => {},
  onDeleteJot: () => {},
};

/** Quick jots written within this long of the one before read as one thought. */
const GROUP_MS = 5 * 60_000;

const FRAME_W = 1440;

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

type Row = { part: Part; cont: boolean; held: boolean };

const toRows = (parts: Part[], group: boolean): Row[] => {
  const rows = parts.map((part, i) => {
    const prev = parts[i - 1];
    const cont =
      group &&
      part.kind === 'jot' &&
      prev?.kind === 'jot' &&
      new Date(part.at).getTime() - new Date(prev.at).getTime() <= GROUP_MS;
    return { part, cont, held: false };
  });
  rows.forEach((row, i) => {
    if (rows[i + 1]?.cont) row.held = true;
  });
  return rows;
};

const hue = (space: JournalSpace) => ({ '--hue': space.color }) as CSSProperties;

const titleOf = (entry: Entry) => {
  switch (entry.kind) {
    case 'link':
      return getLinkTitle(entry.link);
    case 'note':
      return entry.note.title || 'Untitled';
    case 'task':
      return entry.task.title;
    case 'jot':
      return entry.jot.body;
  }
};

const Sidebar = ({ spaces, counts, inbox }: { spaces: JournalSpace[]; counts: Map<string, number>; inbox: number }) => (
  <nav className="memex-sidebar" aria-label="Navigation (mock)">
    <div className="memex-sidebar-brand">
      <div className="bookmark-toolbar-brand-shell">
        <Wordmark className="bookmark-toolbar-brand" />
      </div>
    </div>
    <div className="memex-sidebar-scroll">
      <div className="memex-sidebar-nav">
        {[
          { label: 'Journal', icon: <JournalIcon />, active: true },
          { label: 'Library', icon: <LibraryIcon /> },
          { label: 'Inbox', icon: <InboxIcon />, count: inbox },
          { label: 'Tasks', icon: <TasksIcon /> },
        ].map((row) => (
          <span key={row.label} className={`memex-sidebar-item${row.active ? ' is-active' : ''}`}>
            <span className="memex-sidebar-item-icon">{row.icon}</span>
            <span className="memex-sidebar-item-label">{row.label}</span>
            {row.count ? <span className="memex-sidebar-item-count">{row.count}</span> : null}
          </span>
        ))}
      </div>
      <div className="memex-sidebar-section">
        <div className="memex-sidebar-section-header">
          <span className="memex-sidebar-kicker">Spaces</span>
          <span className="memex-sidebar-new" aria-hidden="true">
            <PlusIcon />
          </span>
        </div>
        <div className="memex-sidebar-nav memex-sidebar-spaces">
          {spaces.slice(0, 10).map((space) => (
            <span key={space.id} className="memex-sidebar-item" style={{ '--space-hue': space.color } as CSSProperties}>
              <span className="memex-space-dot" style={{ background: 'var(--space-hue)' }} aria-hidden="true" />
              <span className="memex-sidebar-item-label">{space.name}</span>
              <span className="memex-sidebar-item-count">{counts.get(space.id) ?? 0}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  </nav>
);

const TodayColumn = ({ entries, inbox }: { entries: Entry[]; inbox: ReturnType<typeof useJournal>['inbox'] }) => {
  const openTasks = entries.flatMap((e) => (e.kind === 'task' && !e.task.is_done ? [e] : [])).slice(-5).reverse();
  const weekAgo = Date.now() - 7 * 86_400_000;
  const touched = new Map<string, { space: JournalSpace; n: number }>();
  entries.forEach((e) => {
    if (new Date(e.at).getTime() < weekAgo) return;
    e.spaces.forEach((s) => touched.set(s.id, { space: s, n: (touched.get(s.id)?.n ?? 0) + 1 }));
  });
  const week = [...touched.values()].sort((a, b) => b.n - a.n).slice(0, 5);

  return (
    <aside className="mdk-today" aria-label="Today (mock)">
      <section className="mdk-card">
        <header>
          <h3>Open tasks</h3>
          <span className="jr-count">{openTasks.length}</span>
        </header>
        {openTasks.length === 0 ? (
          <p className="mdk-faint">Nothing open</p>
        ) : (
          <ul>
            {openTasks.map((e) => (
              <li key={e.id} className="mdk-task">
                <span className="memex-task-check" aria-hidden="true">
                  <Check />
                </span>
                <span className="jr-ellipsis">{titleOf(e)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {inbox.length > 0 && (
        <section className="mdk-card">
          <header>
            <h3>Inbox</h3>
            <span className="jr-count">{inbox.length}</span>
          </header>
          <ul>
            {inbox.slice(0, 3).map(({ entry, suggestion }) => (
              <li key={entry.id} className="mdk-inbox">
                <span className="mdk-inbox-title">{titleOf(entry)}</span>
                <span className="jr-chip is-suggested" style={hue(suggestion.space)}>
                  <i className="jr-dot" aria-hidden="true" />
                  <span className="jr-ellipsis">{suggestion.space.name}</span>
                  <span className="jr-chip-accept" aria-hidden="true">
                    <Check />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {week.length > 0 && (
        <section className="mdk-card">
          <header>
            <h3>This week</h3>
          </header>
          <div className="mdk-spaces">
            {week.map(({ space, n }) => (
              <span key={space.id} className="jr-chip" style={hue(space)}>
                <i className="jr-dot" aria-hidden="true" />
                <span className="jr-ellipsis">{space.name}</span>
                <span className="mdk-n">{n}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
};

const Desk = ({ variant, journal }: { variant: Variant; journal: ReturnType<typeof useJournal> }) => {
  const { entries, filer, spaces, inbox } = journal;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);
  const parts = useMemo(() => toParts(entries.slice(-60)), [entries]);
  const rows = useMemo(() => toRows(parts, Boolean(variant.group)), [parts, variant.group]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => e.spaces.forEach((s) => map.set(s.id, (map.get(s.id) ?? 0) + 1)));
    return map;
  }, [entries]);
  const today = new Date().toDateString();
  const todayCount = entries.filter((e) => new Date(e.at).toDateString() === today).length;

  // Open at the newest entry, like the real page; again once pictures load
  useLayoutEffect(() => {
    const toBottom = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    toBottom();
    const timers = [300, 1200].map((ms) => window.setTimeout(toBottom, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [rows]);

  // Fit the 1440px desktop to the artboard's width
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const style = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setScale(Math.min(1, inner / FRAME_W));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const classes = ['mdk-desk', 'memex-shell'];
  if (variant.page) classes.push('is-page');
  if (variant.group) classes.push('is-grouped');
  if (variant.gutter) classes.push('is-gutter');
  if (variant.today) classes.push('has-today');

  return (
    <div className="mdk-stage" ref={stageRef}>
      <div className="mdk-frame" style={{ zoom: scale }}>
      <div className={classes.join(' ')}>
        <Sidebar spaces={spaces} counts={counts} inbox={inbox.length} />
        <div className="memex-shell-main">
          <div className="jr-page">
            <header className="memex-page-header jr-head">
              <div className="memex-page-header-row">
                <div className="memex-page-heading">
                  <h1 className="memex-page-title">
                    <span className="memex-page-title-text">Journal</span>
                  </h1>
                  <p className="memex-page-subtitle">{todayCount === 0 ? 'Nothing yet today' : `${todayCount} today`}</p>
                </div>
                {inbox.length > 0 && !variant.today && (
                  <div className="memex-page-actions">
                    <span className="btn-secondary btn-compact jr-inbox-toggle">
                      <Inbox aria-hidden="true" />
                      Inbox
                      <span className="jr-count">{inbox.length}</span>
                    </span>
                  </div>
                )}
              </div>
            </header>
            <div className="jr-body">
              <main className="jr-main" aria-label="Journal (mock)">
                <div className="jr-scroll" ref={scrollRef}>
                  <div className="jr-feed">
                    {rows.map(({ part, cont, held }) => (
                      <div
                        key={part.id}
                        className={`mdk-row mdk-row--${part.kind}${cont ? ' is-cont' : ''}${held ? ' is-held' : ''}`}
                      >
                        {variant.gutter && part.kind !== 'day' && (
                          <span className="mdk-gutter">
                            {cont ? '' : (
                              <time dateTime={part.at}>{timeFmt.format(new Date(part.at))}</time>
                            )}
                          </span>
                        )}
                        <PartView part={part} filer={filer} spaces={spaces} handlers={NOOP} />
                      </div>
                    ))}
                  </div>
                </div>
                <JournalComposer spaces={spaces} onSubmit={() => Promise.reject(new Error('mock'))} />
              </main>
              {variant.today && <TodayColumn entries={entries} inbox={inbox} />}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

const JournalDeskMocks = () => {
  const journal = useJournal();
  if (journal.isLoading || journal.entries.length === 0) return null;

  return (
    <>
      <header className="mk-page-head">
        <p className="mk-page-kicker">memex · design mocks · round 6</p>
        <h1 className="mk-page-title">The desktop Journal</h1>
        <p className="mk-page-lede">
          The Journal shipped (Phase 1, slice 1), but on a desktop it feels too open: a 680px column floating in a
          panel twice as wide, bubbles that stop at 520px, nothing to hold on to. Each option below is the real Journal
          over your data at 1440×860, with only the layout around the entries changed. Reply with an ID.
        </p>
      </header>

      <Section
        n={17}
        title="Desktop Journal layout"
        question="Keep the essence (one feed, newest at the bottom, the composer under it). What should frame it?"
      >
        <Artboard
          id="17B"
          recommended
          title="Notebook page + grouped jots"
          summary="The panel shrinks to the writing (760px) so the canvas shows around it, the Journal an object on a desk. Jots written within 5 minutes of each other stack into one thought with one time."
          pros={['Fixes the floating feel directly', 'Quiet: nothing new to read', 'Denser without getting busy', 'Cheap to build']}
          cons={['Wide screens are mostly canvas', 'Times move to the end of each thought']}
          fade={false}
        >
          <Desk variant={{ page: true, group: true }} journal={journal} />
        </Artboard>

        <Artboard
          id="17C"
          title="Notebook page + time gutter"
          summary="17B, plus the times in a left margin like a ruled notebook or a log, and days as headings with a rule instead of pills. The left edge lines up and carries information."
          pros={['Reads like a journal, less like chat', 'Scans by time at a glance', 'Day breaks feel like turning a page']}
          cons={['A personality change from chat', 'The gutter costs 76px of width', 'Times are further from the words']}
          fade={false}
        >
          <Desk variant={{ page: true, group: true, gutter: true }} journal={journal} />
        </Artboard>

        <Artboard
          id="17D"
          title="Notebook page + today column"
          summary="17B, plus a column on the right for what's live: open tasks, waiting Inbox suggestions and the spaces you've used this week. It replaces the header's Inbox button and folds away on narrower screens."
          pros={['Uses the empty side for real work', 'Inbox and tasks without leaving home', 'Sets up the 14B space board column']}
          cons={['Busier: two things to look at', 'Duplicates the sidebar Inbox and Tasks', 'More to build and keep in sync']}
          fade={false}
        >
          <Desk variant={{ page: true, group: true, today: true }} journal={journal} />
        </Artboard>

        <Artboard
          id="17A"
          title="Today's layout"
          summary="As shipped: the stack fills the window, the feed is a 680px centred column, every jot is its own bubble with its own time."
          pros={['Already built', 'Most room for galleries']}
          cons={['Feels open and unanchored', 'Gets emptier the wider the window']}
          fade={false}
        >
          <Desk variant={{}} journal={journal} />
        </Artboard>
      </Section>
    </>
  );
};

export default JournalDeskMocks;
