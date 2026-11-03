import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  CalendarDays,
  ChevronDown,
  CircleCheck,
  Link as LinkIcon,
  Search,
  Square,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useCreateSelfMessage, useSelfMessages } from '../../hooks/useSelfMessages';
import {
  type SelfMessage,
  getLinkTitle,
  noteDisplayTitle,
  dayKeyOf,
  shiftDay,
  toDayKey,
  type StreamItem,
} from '@memex/core';
import { cue } from '../../utils/sound';
import { HANDLES_ERRORS } from '../../utils/mutationErrors';

const MAX_COMPOSER_ROWS = 6;
const DAYS_PER_PAGE = 14;
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]!?])/gi;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dateYearFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

/** Plain text with bare URLs turned into links. */
const Linkified = ({ text }: { text: string }) => (
  <>
    {text.split(URL_PATTERN).map((part, index) => {
      if (index % 2 === 1) {
        const href = part.startsWith('www.') ? `https://${part}` : part;
        return (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    })}
  </>
);

type Activity = { kind: 'saved' | 'wrote' | 'added' | 'done'; at: string; item: StreamItem };

type JournalDay = {
  key: string;
  jots: SelfMessage[];
  activity: Activity[];
};

const createdAtOf = (item: StreamItem) => {
  if (item.type === 'link') return item.link.created_at;
  if (item.type === 'note') return item.note.created_at;
  return item.task.created_at;
};

const VERB: Record<Activity['kind'], string> = {
  saved: 'Saved',
  wrote: 'Wrote',
  added: 'Added',
  done: 'Done',
};

/** "4 links saved · 1 note · 2 done" */
const summarize = (activity: Activity[]) => {
  const n = { saved: 0, wrote: 0, added: 0, done: 0 };
  activity.forEach((a) => (n[a.kind] += 1));
  return [
    n.saved && `${n.saved} ${n.saved === 1 ? 'link' : 'links'} saved`,
    n.wrote && `${n.wrote} ${n.wrote === 1 ? 'note' : 'notes'}`,
    n.added && `${n.added} ${n.added === 1 ? 'task' : 'tasks'} added`,
    n.done && `${n.done} done`,
  ]
    .filter(Boolean)
    .join(' · ');
};

const dayHeading = (key: string, todayKey: string) => {
  if (key === todayKey) return 'Today';
  if (key === shiftDay(todayKey, -1)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === new Date().getFullYear() ? dateFormat.format(date) : dateYearFormat.format(date);
};

const dayWeekday = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return weekdayFormat.format(new Date(y, m - 1, d));
};

interface JournalPanelProps {
  /** Space id, or null for Home. */
  scopeId: string | null;
  scopeName: string;
  /** Stream items in the current scope — the source of each day's activity. */
  items: StreamItem[];
  /** Jot ids hidden while their delete can still be undone. */
  hiddenJotIds: Set<string>;
  onOpenItem: (item: StreamItem) => void;
  onConvertJot: (jot: SelfMessage, kind: 'note' | 'task') => void;
  onDeleteJot: (jot: SelfMessage) => void;
  onClose: () => void;
  /** The page's toast, for a jot that didn't save. */
  onFeedback: (message: string) => void;
}

/**
 * The Journal (10B): every jot in the current scope, newest first, under day
 * headers. Each day's jots come first; what else happened that day (links
 * saved, notes written, tasks added or finished) folds into one summary line
 * that opens in place. Search filters jots; the calendar jumps to a date.
 */
const JournalPanel = ({
  scopeId,
  scopeName,
  items,
  hiddenJotIds,
  onOpenItem,
  onConvertJot,
  onDeleteJot,
  onClose,
  onFeedback,
}: JournalPanelProps) => {
  const { messages, isLoading } = useSelfMessages(scopeId);
  // send() reports a failed jot itself
  const createMessage = useCreateSelfMessage(HANDLES_ERRORS);
  const [draft, setDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dayLimit, setDayLimit] = useState(DAYS_PER_PAGE);
  // Days whose activity fold differs from its default (today open, others closed)
  const [flippedFolds, setFlippedFolds] = useState<Set<string>>(() => new Set());
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const todayKey = toDayKey(new Date());
  const needle = query.trim().toLowerCase();

  const days = useMemo<JournalDay[]>(() => {
    const map = new Map<string, JournalDay>();
    const dayFor = (key: string) => {
      let day = map.get(key);
      if (!day) {
        day = { key, jots: [], activity: [] };
        map.set(key, day);
      }
      return day;
    };

    messages.forEach((jot) => {
      if (hiddenJotIds.has(jot.id)) return;
      if (needle && !jot.body.toLowerCase().includes(needle)) return;
      dayFor(dayKeyOf(jot.created_at)).jots.push(jot);
    });

    // While searching, only jots are listed
    if (!needle) {
      items.forEach((item) => {
        const at = createdAtOf(item);
        const kind = item.type === 'link' ? 'saved' : item.type === 'note' ? 'wrote' : 'added';
        dayFor(dayKeyOf(at)).activity.push({ kind, at, item });
        if (item.type === 'task' && item.task.is_done) {
          dayFor(dayKeyOf(item.task.updated_at)).activity.push({
            kind: 'done',
            at: item.task.updated_at,
            item,
          });
        }
      });
    }

    const list = Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
    list.forEach((day) => {
      day.jots.sort((a, b) => b.created_at.localeCompare(a.created_at));
      day.activity.sort((a, b) => b.at.localeCompare(a.at));
    });
    return list;
  }, [hiddenJotIds, items, messages, needle]);

  const visibleDays = days.slice(0, dayLimit);
  const hasMore = !isLoading && days.length > dayLimit;

  // Load further days as the bottom of the list scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setDayLimit((n) => n + DAYS_PER_PAGE);
      },
      { root: bodyRef.current, rootMargin: '400px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, visibleDays.length]);

  // Start from the top again when the scope or search changes
  useEffect(() => {
    setDayLimit(DAYS_PER_PAGE);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [scopeId, needle]);

  // Jump to a date: the nearest day on or before it with anything in it
  useEffect(() => {
    if (!jumpTarget) return;
    const index = days.findIndex((day) => day.key <= jumpTarget);
    if (index === -1) {
      setJumpTarget(null);
      return;
    }
    if (index >= dayLimit) {
      setDayLimit(index + DAYS_PER_PAGE);
      return;
    }
    const node = bodyRef.current?.querySelector(`[data-day="${days[index].key}"]`);
    node?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setJumpTarget(null);
  }, [dayLimit, days, jumpTarget]);

  // Focus the composer on open and when the scope changes
  useEffect(() => {
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [scopeId]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Auto-grow the composer
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const max = lineHeight * MAX_COMPOSER_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [draft]);

  const send = () => {
    const body = draft.trim();
    if (!body || createMessage.isPending) return;
    setDraft('');
    cue('confirm');
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    createMessage.mutate(
      { body, profile_id: scopeId },
      {
        onError: () => {
          cue('error');
          setDraft((current) => current || body);
          onFeedback('Couldn’t save that jot. Your text is back in the box.');
        },
      },
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    send();
  };

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
  };

  const isFoldOpen = (key: string) => (key === todayKey) !== flippedFolds.has(key);
  const toggleFold = (key: string) =>
    setFlippedFolds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const activityIcon = (activity: Activity) => {
    const { item } = activity;
    if (activity.kind === 'done') return <CircleCheck aria-hidden="true" />;
    if (item.type === 'link') {
      return item.link.favicon_url ? <img src={item.link.favicon_url} alt="" /> : <LinkIcon aria-hidden="true" />;
    }
    if (item.type === 'note') return <StickyNote aria-hidden="true" />;
    return <Square aria-hidden="true" />;
  };

  const activityTitle = ({ item }: Activity) =>
    item.type === 'link'
      ? getLinkTitle(item.link)
      : item.type === 'note'
        ? noteDisplayTitle(item.note)
        : item.task.title;

  const faviconsOf = (activity: Activity[]) =>
    activity
      .flatMap((a) => (a.item.type === 'link' && a.item.link.favicon_url ? [a.item.link.favicon_url] : []))
      .filter((src, i, all) => all.indexOf(src) === i)
      .slice(0, 4);

  return (
    <section className="memex-journal" aria-label={`Journal · ${scopeName}`}>
      <header className="memex-journal-head">
        {searchOpen ? (
          <div className="memex-journal-search">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && closeSearch()}
              placeholder="Search jots…"
              aria-label="Search jots"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="button" className="memex-icon-button is-compact" onClick={closeSearch} aria-label="Close search">
              <X aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <div className="memex-journal-title">
              <h2>Journal</h2>
              <span className="memex-journal-scope">{scopeName}</span>
            </div>
            <div className="memex-journal-tools">
              <button
                type="button"
                className="memex-icon-button is-compact"
                onClick={() => setSearchOpen(true)}
                aria-label="Search jots"
                title="Search jots"
              >
                <Search aria-hidden="true" />
              </button>
              <span className="memex-journal-date">
                <button
                  type="button"
                  className="memex-icon-button is-compact"
                  onClick={openDatePicker}
                  aria-label="Jump to a date"
                  title="Jump to a date"
                >
                  <CalendarDays aria-hidden="true" />
                </button>
                <input
                  ref={dateInputRef}
                  className="memex-journal-date-input"
                  type="date"
                  max={todayKey}
                  onChange={(event) => event.target.value && setJumpTarget(event.target.value)}
                  tabIndex={-1}
                  aria-label="Jump to date"
                />
              </span>
              <button type="button" className="memex-icon-button is-compact" onClick={onClose} aria-label="Close journal">
                <X aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </header>

      <div className="memex-journal-composer">
        <textarea
          ref={textareaRef}
          className="memex-self-notes-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={scopeId ? `Jot something about ${scopeName}…` : 'Jot something…'}
          rows={1}
          aria-label="Jot something"
        />
        <span className="memex-journal-composer-hint" aria-hidden="true">
          ↵ to jot · ⇧↵ new line
        </span>
      </div>

      <div className="memex-journal-body" ref={bodyRef}>
        {isLoading ? (
          <p className="memex-journal-empty">Loading…</p>
        ) : days.length === 0 ? (
          <p className="memex-journal-empty">
            {needle ? `No jots match “${query.trim()}”.` : 'Nothing here yet — jot your first thought above.'}
          </p>
        ) : (
          visibleDays.map((day) => {
            const open = isFoldOpen(day.key);
            const foldId = `journal-fold-${day.key}`;
            const favicons = faviconsOf(day.activity);
            return (
              <section key={day.key} className="memex-journal-day" data-day={day.key}>
                <h3 className="memex-journal-day-head">
                  <span>{dayHeading(day.key, todayKey)}</span>
                  <span className="memex-journal-weekday">{dayWeekday(day.key)}</span>
                </h3>

                {day.jots.length > 0 && (
                  <ul className="memex-jots">
                    {day.jots.map((jot) => (
                      <li key={jot.id} className={`memex-jot${jot.id.startsWith('temp-') ? ' is-new' : ''}`}>
                        <time className="memex-jot-time" dateTime={jot.created_at}>
                          {timeFormat.format(new Date(jot.created_at))}
                        </time>
                        <p className="memex-jot-body">
                          <Linkified text={jot.body} />
                        </p>
                        {!jot.id.startsWith('temp-') && (
                          <span className="memex-jot-actions">
                            <button
                              type="button"
                              className="memex-jot-action"
                              onClick={() => onConvertJot(jot, 'note')}
                              title="Turn into a note"
                            >
                              <StickyNote aria-hidden="true" /> Note
                            </button>
                            <button
                              type="button"
                              className="memex-jot-action"
                              onClick={() => onConvertJot(jot, 'task')}
                              title="Turn into a task"
                            >
                              <Square aria-hidden="true" /> Task
                            </button>
                            <button
                              type="button"
                              className="memex-jot-action is-icon"
                              onClick={() => onDeleteJot(jot)}
                              aria-label="Delete jot"
                              title="Delete"
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {day.activity.length > 0 && (
                  <>
                    <button
                      type="button"
                      className={`memex-journal-fold${open ? ' is-open' : ''}`}
                      onClick={() => toggleFold(day.key)}
                      aria-expanded={open}
                      aria-controls={foldId}
                    >
                      {favicons.length > 0 && (
                        <span className="memex-journal-favicons" aria-hidden="true">
                          {favicons.map((src) => (
                            <img key={src} src={src} alt="" />
                          ))}
                        </span>
                      )}
                      <span className="memex-journal-fold-label">{summarize(day.activity)}</span>
                      <ChevronDown aria-hidden="true" className="memex-journal-fold-chevron" />
                    </button>
                    {open && (
                      <ul className="memex-journal-activity" id={foldId}>
                        {day.activity.map((activity) => (
                          <li key={`${activity.kind}:${activity.item.key}`}>
                            <button
                              type="button"
                              className={`memex-journal-item is-${activity.kind}`}
                              onClick={() => onOpenItem(activity.item)}
                            >
                              <time className="memex-jot-time" dateTime={activity.at}>
                                {timeFormat.format(new Date(activity.at))}
                              </time>
                              <span className="memex-journal-item-icon">{activityIcon(activity)}</span>
                              <span className="memex-journal-item-verb">{VERB[activity.kind]}</span>
                              <span className="memex-journal-item-title">{activityTitle(activity)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
            );
          })
        )}
        {hasMore && (
          <div ref={sentinelRef} className="memex-journal-more">
            <button type="button" className="btn-secondary btn-compact" onClick={() => setDayLimit((n) => n + DAYS_PER_PAGE)}>
              Show earlier days
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default JournalPanel;
