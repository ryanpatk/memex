import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, MessageSquareText, Search } from 'lucide-react';
import { INBOX_PARAM, JOT_PARAM, JOURNAL_PATH, LIBRARY_PATH, TASKS_PATH, spacePath } from '../constants/modules';
import { useJournal } from '../hooks/useJournal';
import { useAllTasks } from '../hooks/useTasks';
import { useAllSelfMessages } from '../hooks/useSelfMessages';
import { jotSnippet, searchJots } from '@memex/core';
import { InboxIcon, JournalIcon, LibraryIcon, TasksIcon } from './icons';

/*
 * ⌘/Ctrl K, on every signed-in page: a small “Go to” palette over the
 * sidebar's destinations (Journal, Library, Tasks, the Inbox while something
 * waits, every space), plus your jots once you type two letters (core's
 * searchJots; Enter opens the Journal at that jot, `?jot=<id>`). Type to
 * narrow, ↑/↓ to move, Enter to go, Esc to close. The Library's own search
 * palette (“/”) stays where it is.
 */

interface Destination {
  key: string;
  label: string;
  to: string;
  icon: ReactNode;
  meta?: string;
  /** Extra words that should find it. */
  aliases?: string;
  /** A jot found by its words (listed under “Jots”). */
  jot?: boolean;
}

const jotDateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const jotYearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const jotTimeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** “3:04 PM” today, “Oct 20” this year, “Oct 20, 2025” before. */
const jotWhen = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return jotTimeFmt.format(date);
  return (date.getFullYear() === now.getFullYear() ? jotDateFmt : jotYearFmt).format(date);
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const GoToPalette = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'k' || !(isMac ? event.metaKey : event.ctrlKey)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return open ? <GoToDialog onClose={() => setOpen(false)} /> : null;
};

const GoToDialog = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<Element | null>(document.activeElement);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { spaces, inbox } = useJournal();
  const { data: tasks } = useAllTasks();
  const { data: jots } = useAllSelfMessages();
  const openTasks = (tasks ?? []).filter((task) => !task.is_done).length;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    inputRef.current?.focus();
    const back = returnFocus.current;
    return () => {
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  const destinations = useMemo<Destination[]>(
    () => [
      { key: 'journal', label: 'Journal', to: JOURNAL_PATH, icon: <JournalIcon />, aliases: 'home jots' },
      { key: 'library', label: 'Library', to: LIBRARY_PATH, icon: <LibraryIcon />, aliases: 'links notes everything' },
      {
        key: 'tasks',
        label: 'Tasks',
        to: TASKS_PATH,
        icon: <TasksIcon />,
        meta: `${openTasks} open`,
        aliases: 'todo to-do',
      },
      ...(inbox.length > 0
        ? [{ key: 'inbox', label: 'Inbox', to: `${JOURNAL_PATH}?${INBOX_PARAM}=1`, icon: <InboxIcon />, meta: `${inbox.length} waiting` }]
        : []),
      ...spaces.map((space) => ({
        key: `space-${space.id}`,
        label: space.name,
        to: spacePath(space.id),
        icon: <span className="memex-space-dot" style={{ background: space.color } as CSSProperties} aria-hidden="true" />,
        meta: 'Space',
      })),
    ],
    [inbox.length, openTasks, spaces],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    const starts = destinations.filter((d) => d.label.toLowerCase().startsWith(q));
    const contains = destinations.filter(
      (d) => !starts.includes(d) && `${d.label} ${d.aliases ?? ''}`.toLowerCase().includes(q),
    );
    const places = [...starts, ...contains];
    const spaceName = new Map(spaces.map((space) => [space.id, space.name]));
    const found = searchJots(jots ?? [], q).map(
      (jot): Destination => ({
        key: `jot-${jot.id}`,
        label: jotSnippet(jot.body, q, 72),
        to: `${JOURNAL_PATH}?${JOT_PARAM}=${encodeURIComponent(jot.id)}`,
        icon: <MessageSquareText />,
        meta: [jot.profile_id ? spaceName.get(jot.profile_id) : null, jotWhen(jot.created_at)].filter(Boolean).join(' · '),
        jot: true,
      }),
    );
    return [...places, ...found];
  }, [destinations, jots, query, spaces]);

  const current = Math.min(active, Math.max(results.length - 1, 0));

  const go = (destination: Destination | undefined) => {
    if (!destination) return;
    returnFocus.current = null; // the new page owns focus
    onClose();
    navigate(destination.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + delta + results.length) % results.length);
    } else if (event.key === 'Home' && results.length) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End' && results.length) {
      event.preventDefault();
      setActive(results.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[current]);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="app-modal memex-goto"
      aria-label="Go to"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        // A press on the backdrop (the dialog box itself, outside the panel) closes
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="memex-goto-panel">
        <div className="memex-goto-field">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            className="memex-goto-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Go to… or find a jot"
            aria-label="Go to"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${results[current].key}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="memex-kbd">esc</kbd>
        </div>
        <div className="memex-goto-list" role="listbox" id={listId} aria-label="Destinations and jots">
          {results.length === 0 ? (
            <p className="memex-palette-empty">Nothing matches “{query.trim()}”.</p>
          ) : (
            results.map((destination, index) => [
              destination.jot && !results[index - 1]?.jot && (
                <div key="jots-label" className="memex-palette-label" aria-hidden="true">
                  Jots
                </div>
              ),
              <div
                key={destination.key}
                id={`${listId}-${destination.key}`}
                role="option"
                aria-selected={index === current}
                aria-label={destination.jot ? `Jot: ${destination.label}${destination.meta ? `, ${destination.meta}` : ''}` : undefined}
                className={`memex-palette-row${index === current ? ' is-active' : ''}`}
                onMouseMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(destination)}
              >
                <span className="memex-palette-icon">{destination.icon}</span>
                <span className="memex-palette-text">{destination.label}</span>
                {destination.meta && <span className="memex-palette-meta">{destination.meta}</span>}
              </div>,
            ])
          )}
        </div>
        <div className="memex-palette-foot" aria-hidden="true">
          <span>
            <kbd className="memex-kbd">↑↓</kbd> move
          </span>
          <span>
            <CornerDownLeft /> go
          </span>
          <span>
            <kbd className="memex-kbd">{isMac ? '⌘' : 'Ctrl'}&nbsp;K</kbd> open or close
          </span>
        </div>
      </div>
    </dialog>
  );
};

export default GoToPalette;
