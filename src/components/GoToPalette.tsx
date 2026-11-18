import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenLine, Search, Star } from 'lucide-react';
import { INBOX_PATH, JOT_PARAM, JOURNAL_PATH, LIBRARY_PATH, TASKS_PATH, spacePath } from '../constants/modules';
import { useJournal } from '../hooks/useJournal';
import { useAllTasks } from '../hooks/useTasks';
import { useAllSelfMessages } from '../hooks/useSelfMessages';
import { useAllLinks } from '../hooks/useLinks';
import { useProfileLinkMembership } from '../hooks/useProfileLinks';
import { useProfileNoteMembership } from '../hooks/useProfileNotes';
import { useProfileTaskMembership } from '../hooks/useProfileTasks';
import { getLinkTitle, globalPins, jotSnippet, searchJots } from '@memex/core';
import { openUrlInBackgroundTab } from '../utils/openUrlInBackgroundTab';

/*
 * ⌘/Ctrl K, on every signed-in page: a “Go to” palette over the app's
 * destinations (Journal, Cards, Tasks, the Inbox while something waits,
 * every space), pinned sites, and your jots once you type two letters
 * (core's searchJots; Enter opens the Journal at that jot, `?jot=<id>`).
 * Type to narrow, ↑/↓ to move, Enter to go, Esc to close. On Cards, “/”
 * focuses the page's own search field.
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
  /** Memory Cards groups the results: Spaces, Jots, Go to, Pinned (d33). */
  group?: 'space' | 'jot' | 'go' | 'pinned';
  /** Pinned sites open their URL instead of navigating. */
  href?: string;
}

const CARDS_GROUPS = [
  ['space', 'Spaces'],
  ['jot', 'Jots'],
  ['go', 'Go to'],
  ['pinned', 'Pinned'],
] as const;

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

  if (!open) return null;
  return <GoToDialog onClose={() => setOpen(false)} />;
};

/**
 * ⌘K (Memory Cards d33): a big field in a 40px sheet, then the
 * results in groups — Spaces (dot in their colour, with how many cards),
 * Jots, Go to (Journal, Cards, Tasks, Inbox) and Pinned sites (they moved
 * here and onto space pages from the Library header).
 */
const GoToDialog = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<Element | null>(document.activeElement);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { spaces, inboxCount } = useJournal();
  const { data: tasks } = useAllTasks();
  const { data: jots } = useAllSelfMessages();
  const { data: links } = useAllLinks();
  const { data: linkRows } = useProfileLinkMembership();
  const { data: noteRows } = useProfileNoteMembership();
  const { data: taskRows } = useProfileTaskMembership();
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

  const spaceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of [...(linkRows ?? []), ...(noteRows ?? []), ...(taskRows ?? [])]) {
      counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
    }
    return counts;
  }, [linkRows, noteRows, taskRows]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (d: Destination) => !q || `${d.label} ${d.aliases ?? ''}`.toLowerCase().includes(q);
    const rank = (list: Destination[]) =>
      q ? [...list.filter((d) => d.label.toLowerCase().startsWith(q)), ...list.filter((d) => !d.label.toLowerCase().startsWith(q))] : list;
    const spaceRows: Destination[] = spaces.map((space) => ({
      key: `space-${space.id}`,
      label: space.name,
      to: spacePath(space.id),
      icon: <span className="mc-goto-dot" style={{ '--c': space.color } as CSSProperties} aria-hidden="true" />,
      meta: String(spaceCounts.get(space.id) ?? 0),
      group: 'space',
    }));
    const go: Destination[] = [
      { key: 'journal', label: 'Journal', to: JOURNAL_PATH, icon: null, meta: 'J', aliases: 'home jots today', group: 'go' },
      { key: 'library', label: 'Cards', to: LIBRARY_PATH, icon: null, aliases: 'library links notes everything', group: 'go' },
      { key: 'tasks', label: 'Tasks', to: TASKS_PATH, icon: null, meta: `${openTasks} open`, aliases: 'todo to-do', group: 'go' },
      { key: 'inbox', label: 'Inbox', to: INBOX_PATH, icon: null, meta: inboxCount > 0 ? String(inboxCount) : undefined, aliases: 'agents proposals file', group: 'go' },
    ];
    const pinned: Destination[] = globalPins(links ?? []).map((link) => ({
      key: `pin-${link.id}`,
      label: getLinkTitle(link),
      to: link.url,
      href: link.url,
      icon: <Star />,
      aliases: link.url,
      group: 'pinned',
    }));
    const spaceName = new Map(spaces.map((space) => [space.id, space.name]));
    const found: Destination[] =
      q.length >= 2
        ? searchJots(jots ?? [], q).map((jot) => ({
            key: `jot-${jot.id}`,
            label: jotSnippet(jot.body, q, 72),
            to: `${JOURNAL_PATH}?${JOT_PARAM}=${encodeURIComponent(jot.id)}`,
            icon: <PenLine />,
            meta: jotWhen(jot.created_at),
            aliases: jot.profile_id ? spaceName.get(jot.profile_id) : undefined,
            jot: true,
            group: 'jot',
          }))
        : [];
    return [...rank(spaceRows.filter(matches)), ...found, ...rank(go.filter(matches)), ...rank(pinned.filter(matches))];
  }, [inboxCount, jots, links, openTasks, query, spaceCounts, spaces]);

  const current = Math.min(active, Math.max(results.length - 1, 0));

  const go = (destination: Destination | undefined) => {
    if (!destination) return;
    if (destination.href) {
      openUrlInBackgroundTab(destination.href);
      onClose();
      return;
    }
    returnFocus.current = null;
    onClose();
    navigate(destination.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      setActive((current + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
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
      className="mc-sheet mc-goto"
      aria-label="Go to"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mc-field is-flat mc-goto-field">
        <span className="mc-field-glyph" aria-hidden="true">
          <Search />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Go to a space, a page, a jot…"
          aria-label="Go to"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results.length ? `${listId}-${results[current].key}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="mc-kb">Esc</kbd>
      </div>
      <div className="mc-goto-list" role="listbox" id={listId} aria-label="Spaces, jots, pages and pinned sites">
        {results.length === 0 ? (
          <p className="mc-goto-empty mc-body">Nothing matches “{query.trim()}”.</p>
        ) : (
          results.map((destination, index) => {
            const label = CARDS_GROUPS.find(([group]) => group === destination.group)?.[1];
            const first = destination.group !== results[index - 1]?.group;
            return [
              first && label && (
                <div key={`label-${destination.group}`} className="mc-mhd" aria-hidden="true">
                  {label}
                </div>
              ),
              <div
                key={destination.key}
                id={`${listId}-${destination.key}`}
                role="option"
                aria-selected={index === current}
                aria-label={`${label ? `${label.replace(/s$/, '')}: ` : ''}${destination.label}${destination.meta ? `, ${destination.meta}` : ''}`}
                className={`mc-goto-row${index === current ? ' is-active' : ''}`}
                onMouseMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(destination)}
              >
                <span className="mc-goto-icon" aria-hidden="true">
                  {destination.icon}
                </span>
                <span className="mc-goto-text" translate={destination.group === 'space' ? 'no' : undefined}>
                  {destination.label}
                </span>
                {destination.meta && <span className="mc-goto-meta">{destination.meta}</span>}
              </div>,
            ];
          })
        )}
      </div>
    </dialog>
  );
};

export default GoToPalette;
