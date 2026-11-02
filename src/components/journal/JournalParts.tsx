import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Bot, Check, Ellipsis, FileText, FolderInput, ListTodo, StickyNote, Trash2 } from 'lucide-react';
import {
  type LinkWithTag,
  type SelfMessage,
  type TaskWithTags,
  getHostname,
  getLinkTitle,
  stripMarkdown,
  isVisualLink,
  type Entry,
  type FileableEntry,
  type Filer,
  type JournalSpace,
  type Part,
  type Run,
} from '@memex/core';
import { getInitials } from '../../utils/streamCardFormat';
import { dragAttrs } from '../../utils/itemDrag';

/*
 * Journal entry renderers, decision 11D: jots are bubbles, tasks are lines,
 * platform saves with pictures stay big (one gallery per run), plain links
 * and notes go compact. Filing (decision 13) sits under each entry: the
 * spaces it's in, a one-press suggestion when there's a likely one, and
 * “File to…” in the hover actions. Styles: styles/journal.css.
 */

export interface JournalHandlers {
  onFile: (keys: string[], spaceId: string) => void;
  onToggleTask: (task: TaskWithTags) => void;
  onOpenNote: (noteId: string) => void;
  onJotToNote: (jot: SelfMessage) => void;
  onJotToTask: (jot: SelfMessage) => void;
  onDeleteJot: (jot: SelfMessage) => void;
}

interface PartProps {
  part: Part;
  filer: Filer;
  spaces: JournalSpace[];
  handlers: JournalHandlers;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const Time = ({ at }: { at: string }) => (
  <time className="jr-time" dateTime={at} title={fullFmt.format(new Date(at))}>
    {timeFmt.format(new Date(at))}
  </time>
);

const hue = (space: JournalSpace) => ({ '--hue': space.color }) as CSSProperties;

const excerpt = (body: string, max: number) => {
  const text = stripMarkdown(body ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const Favicon = ({ link }: { link: LinkWithTag }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className="jr-fav" aria-hidden="true">
      {link.favicon_url && !failed ? (
        <img src={link.favicon_url} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{getInitials(getHostname(link.url))}</span>
      )}
    </span>
  );
};

/** What a drag of this entry is called (the drag ghost, utils/itemDrag.ts). */
const entryTitle = (entry: Entry) =>
  entry.kind === 'link'
    ? getLinkTitle(entry.link)
    : entry.kind === 'note'
      ? entry.note.title || 'Untitled'
      : entry.kind === 'task'
        ? entry.task.title
        : '';

const Picture = ({ link, className }: { link: LinkWithTag; className?: string }) => {
  const [failed, setFailed] = useState(false);
  if (!link.preview_image_url || failed) {
    return (
      <span className={`jr-tile jr-tile--text ${className ?? ''}`}>
        <Favicon link={link} />
        <span>{getLinkTitle(link)}</span>
      </span>
    );
  }
  return (
    <span className={`jr-tile ${className ?? ''}`}>
      <img src={link.preview_image_url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Menus                                                               */
/* ------------------------------------------------------------------ */

/** A small action menu: Escape or an outside click closes it, arrows move between items. */
const Menu = ({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: (close: () => void) => ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menu"] button:not([aria-disabled="true"])')?.focus();
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button') ?? []);
    if (!items.length) return;
    event.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  };

  return (
    <div className="jr-menu-root" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="memex-icon-button is-compact"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
      </button>
      {open && (
        <div className="memex-menu jr-menu" role="menu" aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
};

const FileMenu = ({ keys, inSpaces, spaces, onFile }: { keys: string[]; inSpaces: JournalSpace[]; spaces: JournalSpace[]; onFile: JournalHandlers['onFile'] }) => (
  <Menu label="File to…" icon={<FolderInput aria-hidden="true" />}>
    {(close) =>
      spaces.length === 0 ? (
        <p className="jr-menu-empty">No spaces yet</p>
      ) : (
        spaces.map((space) => {
          const already = inSpaces.some((s) => s.id === space.id);
          return (
            <button
              key={space.id}
              type="button"
              role="menuitem"
              aria-disabled={already}
              className={already ? 'is-in' : undefined}
              style={hue(space)}
              onClick={() => {
                if (already) return;
                onFile(keys, space.id);
                close();
              }}
            >
              <i className="jr-dot" aria-hidden="true" />
              <span className="jr-ellipsis">{space.name}</span>
              {already && <Check aria-hidden="true" className="jr-push" />}
            </button>
          );
        })
      )
    }
  </Menu>
);

const JotMenu = ({ jot, handlers }: { jot: SelfMessage; handlers: JournalHandlers }) => (
  <Menu label="Jot actions" icon={<Ellipsis aria-hidden="true" />}>
    {(close) => (
      <>
        <button type="button" role="menuitem" onClick={() => {
            close();
            handlers.onJotToNote(jot);
          }}>
          <FileText aria-hidden="true" /> Make a note
        </button>
        <button type="button" role="menuitem" onClick={() => {
            close();
            handlers.onJotToTask(jot);
          }}>
          <ListTodo aria-hidden="true" /> Make a task
        </button>
        <button type="button" role="menuitem" className="is-danger" onClick={() => {
            close();
            handlers.onDeleteJot(jot);
          }}>
          <Trash2 aria-hidden="true" /> Delete
        </button>
      </>
    )}
  </Menu>
);

/* ------------------------------------------------------------------ */
/* Filing row                                                          */
/* ------------------------------------------------------------------ */

const SpaceChip = ({ space }: { space: JournalSpace }) => (
  <span className="jr-chip" style={hue(space)}>
    <i className="jr-dot" aria-hidden="true" />
    <span className="jr-ellipsis">{space.name}</span>
  </span>
);

/** The agent client that wrote an entry (MCP write tools), or null when the user did. */
const agentClient = (entry: Entry): string | null => {
  const row = entry.kind === 'jot' ? entry.jot : entry.kind === 'link' ? entry.link : entry.kind === 'note' ? entry.note : entry.task;
  return row.captured_by === 'agent' ? row.captured_client || 'an agent' : null;
};

const Filing = ({ entry, filer, handlers }: { entry: Entry; filer: Filer; handlers: JournalHandlers }) => {
  const suggestion = filer.suggest(entry);
  const via = agentClient(entry);
  if (!entry.spaces.length && !suggestion && !via) return null;
  return (
    <div className="jr-filing">
      {via && (
        <span className="jr-via" title={`Written by ${via} through memex’s MCP server`}>
          <Bot aria-hidden="true" />
          <span className="jr-ellipsis" translate="no">
            via {via}
          </span>
        </span>
      )}
      {entry.spaces.map((s) => (
        <SpaceChip key={s.id} space={s} />
      ))}
      {suggestion && (
        <button
          type="button"
          className="jr-chip is-suggested"
          style={hue(suggestion.space)}
          title={suggestion.reason}
          aria-label={`File in ${suggestion.space.name}: ${suggestion.reason}`}
          onClick={() => handlers.onFile([entry.id], suggestion.space.id)}
        >
          <i className="jr-dot" aria-hidden="true" />
          <span className="jr-ellipsis">{suggestion.space.name}</span>
          <span className="jr-chip-accept" aria-hidden="true">
            <Check />
          </span>
        </button>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Entries                                                             */
/* ------------------------------------------------------------------ */

const EntryShell = ({
  entry,
  className,
  actions,
  children,
  filer,
  handlers,
}: {
  entry: Entry;
  className: string;
  actions: ReactNode;
  children: ReactNode;
  filer: Filer;
  handlers: JournalHandlers;
}) => (
  <article className={`jr-entry ${className}`} data-item-key={entry.id} {...dragAttrs(entry.id, entryTitle(entry))}>
    <div className="jr-entry-row">
      {children}
      <div className="jr-actions">{actions}</div>
    </div>
    <Filing entry={entry} filer={filer} handlers={handlers} />
  </article>
);

const RunView = ({ run, spaces, handlers }: { run: Run; spaces: JournalSpace[]; handlers: JournalHandlers }) => {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? run.entries : run.entries.slice(0, 6);
  const filedIn = spaces.filter((s) => run.entries.some((e) => e.spaces.some((x) => x.id === s.id)));
  const n = run.entries.length;
  return (
    <article
      className="jr-entry jr-entry--run"
      data-item-key={run.id}
      data-drag-keys={run.entries.map((e) => e.id).join(',')}
      draggable
      data-drag-label={`${n} ${n === 1 ? run.source.one : run.source.many} from ${run.source.label}`}
    >
      <div className="jr-entry-row">
        <div className="jr-gallery">
          <div className="jr-run-head">
            <Favicon link={run.entries[0].link} />
            <span className="jr-ellipsis">
              <strong>
                {n} {n === 1 ? run.source.one : run.source.many} saved
              </strong>{' '}
              on {run.source.label}
            </span>
            <span className="jr-push">
              <Time at={run.at} />
            </span>
          </div>
          <div className="jr-gallery-grid">
            {shown.map((e) => (
              <a
                key={e.id}
                className="jr-gallery-item"
                href={e.link.url}
                target="_blank"
                rel="noreferrer"
                title={getLinkTitle(e.link)}
                aria-label={getLinkTitle(e.link)}
              >
                <Picture link={e.link} />
              </a>
            ))}
          </div>
          {n > 6 && (
            <button type="button" className="jr-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show fewer' : `Show all ${n}`}
            </button>
          )}
        </div>
        <div className="jr-actions">
          <FileMenu keys={run.entries.map((e) => e.id)} inSpaces={[]} spaces={spaces} onFile={handlers.onFile} />
        </div>
      </div>
      {filedIn.length > 0 && (
        <div className="jr-filing">
          {filedIn.map((s) => (
            <SpaceChip key={s.id} space={s} />
          ))}
        </div>
      )}
    </article>
  );
};

const FileAction = ({ entry, spaces, handlers }: { entry: FileableEntry; spaces: JournalSpace[]; handlers: JournalHandlers }) => (
  <FileMenu keys={[entry.id]} inSpaces={entry.spaces} spaces={spaces} onFile={handlers.onFile} />
);

export const PartView = ({ part, filer, spaces, handlers }: PartProps) => {
  if (part.kind === 'day') {
    return (
      <h2 className="jr-day">
        <span>{part.label}</span>
      </h2>
    );
  }
  if (part.kind === 'run') return <RunView run={part} spaces={spaces} handlers={handlers} />;

  const shell = { entry: part, filer, handlers };
  switch (part.kind) {
    case 'jot':
      return (
        <EntryShell {...shell} className="jr-entry--jot" actions={<JotMenu jot={part.jot} handlers={handlers} />}>
          <p className="jr-bubble">
            {part.jot.body}
            <Time at={part.at} />
          </p>
        </EntryShell>
      );
    case 'task':
      return (
        <EntryShell {...shell} className="jr-entry--task" actions={<FileAction entry={part} spaces={spaces} handlers={handlers} />}>
          <div className={`jr-taskline${part.task.is_done ? ' is-done' : ''}`}>
            <button
              type="button"
              role="checkbox"
              className="memex-task-check"
              aria-checked={part.task.is_done}
              aria-label={`Mark “${part.task.title}” ${part.task.is_done ? 'not done' : 'done'}`}
              onClick={() => handlers.onToggleTask(part.task)}
            >
              <Check aria-hidden="true" />
            </button>
            <span className="jr-taskline-title">{part.task.title}</span>
            <Time at={part.at} />
          </div>
        </EntryShell>
      );
    case 'note':
      return (
        <EntryShell {...shell} className="jr-entry--note" actions={<FileAction entry={part} spaces={spaces} handlers={handlers} />}>
          <button type="button" className="jr-notecard" onClick={() => handlers.onOpenNote(part.note.id)}>
            <span className="jr-meta">
              <StickyNote aria-hidden="true" className="jr-glyph" /> Note
              <span className="jr-push">
                <Time at={part.at} />
              </span>
            </span>
            <span className="jr-notecard-title">{part.note.title || 'Untitled'}</span>
            {part.note.body && <span className="jr-notecard-body">{excerpt(part.note.body, 160)}</span>}
          </button>
        </EntryShell>
      );
    case 'link':
      if (isVisualLink(part)) {
        return (
          <EntryShell {...shell} className="jr-entry--picture" actions={<FileAction entry={part} spaces={spaces} handlers={handlers} />}>
            <a className="jr-unfurl" href={part.link.url} target="_blank" rel="noreferrer">
              <Picture link={part.link} className="jr-unfurl-image" />
              <span className="jr-unfurl-body">
                <span className="jr-meta">
                  <Favicon link={part.link} />
                  <span className="jr-ellipsis">{part.source.label}</span>
                  <span className="jr-push">
                    <Time at={part.at} />
                  </span>
                </span>
                <span className="jr-unfurl-title">{getLinkTitle(part.link)}</span>
              </span>
            </a>
          </EntryShell>
        );
      }
      return (
        <EntryShell {...shell} className="jr-entry--link" actions={<FileAction entry={part} spaces={spaces} handlers={handlers} />}>
          <a className="jr-hcard" href={part.link.url} target="_blank" rel="noreferrer">
            {part.link.preview_image_url ? <Picture link={part.link} className="jr-hcard-thumb" /> : <span className="jr-hcard-thumb jr-hcard-thumb--fav"><Favicon link={part.link} /></span>}
            <span className="jr-hcard-body">
              <span className="jr-hcard-title">{getLinkTitle(part.link)}</span>
              <span className="jr-meta">
                <span className="jr-ellipsis">{getHostname(part.link.url)}</span>
                <span className="jr-push">
                  <Time at={part.at} />
                </span>
              </span>
            </span>
          </a>
        </EntryShell>
      );
  }
};
