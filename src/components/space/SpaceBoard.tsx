import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ListTodo, Pin, Plus, StickyNote, X } from 'lucide-react';
import {
  compareOpenTasks,
  getHostname,
  getLinkTitle,
  isPinnedInSpace,
  itemKey,
  stripMarkdown,
  type JournalSpace,
  type LinkWithTag,
  type NoteWithTags,
  type ProfileLinkMembership,
  type SpaceBoard as Board,
  type TaskWithTags,
} from '@memex/core';
import { TaskRow, type TaskRowHandlers } from '../tasks/TaskRow';
import { taskListKeyDown } from '../tasks/taskList';
import { getInitials } from '../../utils/streamCardFormat';
import { dragAttrs } from '../../utils/itemDrag';
import { LIBRARY_PATH, SPACE_PARAM, TASKS_PATH } from '../../constants/modules';

/*
 * A space's board column (decision 14B), beside its scoped Journal: pinned
 * sites, open tasks, recent saves and notes. Tasks are the Tasks view's own
 * rows (tick, due date, rename, file, delete, all with Undo); saves and notes
 * open in place and drag onto other spaces like every item. Each section
 * caps what it shows and links to the full list. Styles: styles/space.css.
 */

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const TASKS_SHOWN = 6;
const SAVES_SHOWN = 6;
const NOTES_SHOWN = 4;

interface SpaceBoardProps {
  id: string;
  space: JournalSpace;
  board: Board;
  spaces: JournalSpace[];
  linkMembership: readonly ProfileLinkMembership[];
  /** Task id → its spaces, for the row chips and file toggles. */
  taskSpaces: (task: TaskWithTags) => JournalSpace[];
  settling: Set<string>;
  hidden: Set<string>;
  renamingId: string | null;
  taskHandlers: TaskRowHandlers;
  onTogglePin: (link: LinkWithTag, pinned: boolean) => void;
  onOpenNote: (noteId: string) => void;
  /** Start a task in the composer ("[] "). */
  onAddTask: () => void;
  /** Phones and narrow windows show the board as a tray with a close button. */
  onClose?: () => void;
}

const Favicon = ({ link }: { link: LinkWithTag }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className="sp-fav" aria-hidden="true">
      {link.favicon_url && !failed ? (
        <img src={link.favicon_url} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{getInitials(getHostname(link.url))}</span>
      )}
    </span>
  );
};

/** Short launcher label: the site name before any " | tagline". */
const pinLabel = (link: LinkWithTag) => {
  const title = link.title?.trim();
  if (!title) return getHostname(link.url);
  return title.split(/\s[|·—–-]\s|\s[|·—–]|[|·—–]\s/)[0].trim() || getHostname(link.url);
};

const Section = ({
  id,
  title,
  count,
  action,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="sp-section" aria-labelledby={id}>
    <div className="sp-section-head">
      <h2 id={id}>{title}</h2>
      {count !== undefined && <span className="sp-count">{count}</span>}
      {action && <span className="sp-section-action">{action}</span>}
    </div>
    {children}
  </section>
);

/** A quiet line for an empty section, with the one thing to do next. */
const Empty = ({ children }: { children: ReactNode }) => <p className="sp-empty-line">{children}</p>;

const SaveTile = ({
  link,
  pinned,
  onTogglePin,
}: {
  link: LinkWithTag;
  pinned: boolean;
  onTogglePin: (link: LinkWithTag, pinned: boolean) => void;
}) => {
  const [failed, setFailed] = useState(false);
  const title = getLinkTitle(link);
  const key = itemKey('link', link.id);
  const picture = link.preview_image_url && !failed;
  return (
    <li className={`sp-tile${picture ? '' : ' sp-tile--text'}`} data-item-key={key} {...dragAttrs(key, title)}>
      <a className="sp-tile-link" href={link.url} target="_blank" rel="noreferrer" title={title}>
        {picture ? (
          <img src={link.preview_image_url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        ) : (
          <>
            <Favicon link={link} />
            <span className="sp-tile-title">{title}</span>
          </>
        )}
        <span className="sr-only">{picture ? title : ''} (opens in a new tab)</span>
      </a>
      {!link.id.startsWith('temp-') && (
        <button
          type="button"
          className={`sp-pin${pinned ? ' is-pinned' : ''}`}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin “${title}”` : `Pin “${title}” to the board`}
          title={pinned ? 'Unpin' : 'Pin to the board'}
          onClick={() => onTogglePin(link, !pinned)}
        >
          <Pin aria-hidden="true" />
        </button>
      )}
    </li>
  );
};

const NoteRow = ({ note, onOpen }: { note: NoteWithTags; onOpen: (id: string) => void }) => {
  const key = itemKey('note', note.id);
  const title = note.title || 'Untitled';
  const body = stripMarkdown(note.body ?? '').replace(/\s+/g, ' ').trim();
  return (
    <li data-item-key={key} {...dragAttrs(key, title)}>
      <button type="button" className="sp-note" onClick={() => onOpen(note.id)}>
        <StickyNote aria-hidden="true" className="sp-note-glyph" />
        <span className="sp-note-text">
          <span className="sp-note-title">{title}</span>
          {body && <span className="sp-note-body">{body}</span>}
        </span>
      </button>
    </li>
  );
};

const SpaceBoard = ({
  id,
  space,
  board,
  spaces,
  linkMembership,
  taskSpaces,
  settling,
  hidden,
  renamingId,
  taskHandlers,
  onTogglePin,
  onOpenNote,
  onAddTask,
  onClose,
}: SpaceBoardProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  const now = useMemo(() => new Date(), [board]); // eslint-disable-line react-hooks/exhaustive-deps

  // A just-ticked task stays (struck through) for a beat, like the Tasks view
  const tasks = useMemo(() => {
    const open = board.openTasks.filter((t) => !hidden.has(t.id));
    const ticking = board.doneTasks.filter((t) => settling.has(t.id) && !hidden.has(t.id));
    // compareOpenTasks ignores is_done, so a ticked row keeps its place
    return [...open, ...ticking].sort(compareOpenTasks);
  }, [board.doneTasks, board.openTasks, hidden, settling]);
  const openCount = tasks.filter((t) => !t.is_done).length;
  const doneCount = board.doneTasks.filter((t) => !settling.has(t.id)).length;
  const tasksHref = `${TASKS_PATH}?${SPACE_PARAM}=${encodeURIComponent(space.id)}`;
  const libraryHref = `${LIBRARY_PATH}?${SPACE_PARAM}=${encodeURIComponent(space.id)}`;
  const onTaskKeys = taskListKeyDown(listRef, (taskId) => tasks.find((t) => t.id === taskId), taskHandlers.onDelete);

  return (
    <aside className="sp-board" id={id} aria-label={`${space.name} board`}>
      {onClose && (
        <div className="sp-board-head">
          <h2>Board</h2>
          <button type="button" className="memex-icon-button is-compact jr-push" aria-label="Close board" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <Section id={`${id}-pinned`} title="Pinned" count={board.pinned.length || undefined}>
        {board.pinned.length ? (
          <nav className="sp-pins" aria-label={`Pinned in ${space.name}`}>
            {board.pinned.map((link) => (
              <a
                key={link.id}
                className="memex-launch-chip sp-pin-chip"
                href={link.url}
                target="_blank"
                rel="noreferrer"
                title={link.title?.trim() || link.url}
                data-item-key={itemKey('link', link.id)}
                {...dragAttrs(itemKey('link', link.id), getLinkTitle(link))}
              >
                <span className="memex-launch-chip-icon" aria-hidden="true">
                  <Favicon link={link} />
                </span>
                <span className="memex-launch-chip-label">{pinLabel(link)}</span>
              </a>
            ))}
          </nav>
        ) : (
          <Empty>
            {board.saves.length
              ? 'Keep the sites you open most up here: press the pin on any save below.'
              : 'Sites you pin from this space’s saves show up here.'}
          </Empty>
        )}
      </Section>

      <Section
        id={`${id}-tasks`}
        title="Open tasks"
        count={openCount}
        action={
          <button type="button" className="sp-link-button" onClick={onAddTask}>
            <Plus aria-hidden="true" /> Add
          </button>
        }
      >
        {tasks.length ? (
          <>
            <ul className="tk-rows sp-tasks" ref={listRef} onKeyDown={onTaskKeys}>
              {tasks.slice(0, TASKS_SHOWN).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  taskSpaces={taskSpaces(task)}
                  groupSpaceId={space.id}
                  allSpaces={spaces}
                  settling={settling.has(task.id)}
                  renaming={renamingId === task.id}
                  now={now}
                  handlers={taskHandlers}
                />
              ))}
            </ul>
            {(tasks.length > TASKS_SHOWN || doneCount > 0) && (
              <Link className="sp-more" to={tasksHref}>
                {tasks.length > TASKS_SHOWN ? `All ${openCount} open` : `${doneCount} done`} in Tasks
                <ArrowUpRight aria-hidden="true" />
              </Link>
            )}
          </>
        ) : doneCount > 0 ? (
          <div className="sp-clear" role="status">
            <span className="sp-clear-disc" aria-hidden="true">
              <Check />
            </span>
            <span>
              All clear. <Link to={tasksHref}>{doneCount} done</Link>
            </span>
          </div>
        ) : (
          <div className="sp-start">
            <span className="sp-start-disc" aria-hidden="true">
              <ListTodo />
            </span>
            <span>
              Start a line with <kbd className="memex-kbd">[]</kbd> in the composer and it lands here.
            </span>
          </div>
        )}
      </Section>

      <Section
        id={`${id}-saves`}
        title="Saves"
        count={board.saves.length}
        action={
          board.saves.length > 0 && (
            <Link className="sp-link-button" to={libraryHref}>
              Open in Library <ArrowUpRight aria-hidden="true" />
            </Link>
          )
        }
      >
        {board.saves.length ? (
          <ul className="sp-tiles">
            {board.saves.slice(0, SAVES_SHOWN).map((link) => (
              <SaveTile key={link.id} link={link} pinned={isPinnedInSpace(linkMembership, space.id, link.id)} onTogglePin={onTogglePin} />
            ))}
          </ul>
        ) : (
          <Empty>Paste a link in the composer, or drag saves onto “{space.name}” in the sidebar.</Empty>
        )}
      </Section>

      <Section id={`${id}-notes`} title="Notes" count={board.notes.length}>
        {board.notes.length ? (
          <>
            <ul className="sp-notes">
              {board.notes.slice(0, NOTES_SHOWN).map((note) => (
                <NoteRow key={note.id} note={note} onOpen={onOpenNote} />
              ))}
            </ul>
            {board.notes.length > NOTES_SHOWN && (
              <Link className="sp-more" to={`${libraryHref}&type=note`}>
                All {board.notes.length} in the Library <ArrowUpRight aria-hidden="true" />
              </Link>
            )}
          </>
        ) : (
          <Empty>
            Write a jot and press <kbd className="memex-kbd">{isMac ? '⌘' : 'Ctrl'}&nbsp;↵</kbd> to keep it as a note.
          </Empty>
        )}
      </Section>
    </aside>
  );
};

export default SpaceBoard;
