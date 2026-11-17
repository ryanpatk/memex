import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ListTodo, Pin, Plus } from 'lucide-react';
import {
  compareOpenTasks,
  getHostname,
  getLinkTitle,
  isPinnedInSpace,
  type JournalSpace,
  type LinkWithTag,
  type NoteWithTags,
  type ProfileLinkMembership,
  type SpaceBoard as Board,
  type TaskWithTags,
} from '@memex/core';
import { TaskRow } from '../tasks/TaskRow';
import type { TaskRowHandlers } from '../tasks/taskList';
import { taskListKeyDown } from '../tasks/taskList';
import { LinkMemoryCard, NoteMemoryCard } from '../cards/cards';
import { EmptySlot } from '../cards/Controls';
import { useCardLabels } from '../../hooks/useCardLabels';
import { dragAttrs } from '../../utils/itemDrag';
import { LIBRARY_PATH, SPACE_PARAM, TASKS_PATH } from '../../constants/modules';

/*
 * A space's board in the Memory Cards look (d03, m02): a left column with
 * the pinned sites as round buttons and the open tasks as rows, then the
 * space's saves and notes as memory cards. Cards open where they open in
 * Cards (the centred card, the note document); each save carries a pin
 * button that pins it to the top of the board.
 */

const TASKS_SHOWN = 8;
const CARDS_SHOWN = 30;

interface SpaceBoardProps {
  space: JournalSpace;
  board: Board;
  linkMembership: readonly ProfileLinkMembership[];
  taskSpaces: (task: TaskWithTags) => JournalSpace[];
  settling: Set<string>;
  hidden: Set<string>;
  renamingId: string | null;
  taskHandlers: TaskRowHandlers;
  onTogglePin: (link: LinkWithTag, pinned: boolean) => void;
  onOpenLink: (link: LinkWithTag) => void;
  onOpenNote: (note: NoteWithTags) => void;
  onAddTask: () => void;
  onFileIn: (key: string) => void;
}

/** Short launcher label: the site name before any " | tagline". */
const pinLabel = (link: LinkWithTag) => {
  const title = link.title?.trim();
  if (!title) return getHostname(link.url);
  return title.split(/\s[|·—–-]\s|\s[|·—–]|[|·—–]\s/)[0].trim() || getHostname(link.url);
};

const PinButton = ({ link }: { link: LinkWithTag }) => {
  const [failed, setFailed] = useState(false);
  const label = pinLabel(link);
  return (
    <a
      className="mc-rb is-large mc-sp-pin"
      href={link.url}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={`${label} (opens in a new tab)`}
      data-item-key={`link:${link.id}`}
      {...dragAttrs(`link:${link.id}`, getLinkTitle(link))}
    >
      {link.favicon_url && !failed ? (
        <img src={link.favicon_url} alt="" width={28} height={28} onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
      )}
    </a>
  );
};

type BoardCard = { kind: 'link'; at: string; link: LinkWithTag } | { kind: 'note'; at: string; note: NoteWithTags };

const SpaceBoard = ({
  space,
  board,
  linkMembership,
  taskSpaces,
  settling,
  hidden,
  renamingId,
  taskHandlers,
  onTogglePin,
  onOpenLink,
  onOpenNote,
  onAddTask,
  onFileIn,
}: SpaceBoardProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  const now = useMemo(() => new Date(), [board]); // eslint-disable-line react-hooks/exhaustive-deps
  const { labelFor } = useCardLabels(space.id);
  const [brokenPictures, setBrokenPictures] = useState<Set<string>>(() => new Set());

  const tasks = useMemo(() => {
    const open = board.openTasks.filter((t) => !hidden.has(t.id));
    const ticking = board.doneTasks.filter((t) => settling.has(t.id) && !hidden.has(t.id));
    return [...open, ...ticking].sort(compareOpenTasks);
  }, [board.doneTasks, board.openTasks, hidden, settling]);
  const openCount = tasks.filter((t) => !t.is_done).length;
  const doneCount = board.doneTasks.filter((t) => !settling.has(t.id)).length;
  const onTaskKeys = taskListKeyDown(listRef, (taskId) => tasks.find((t) => t.id === taskId), taskHandlers.onDelete);

  const cards = useMemo<BoardCard[]>(
    () =>
      [
        ...board.saves.map((link): BoardCard => ({ kind: 'link', at: link.created_at, link })),
        ...board.notes.map((note): BoardCard => ({ kind: 'note', at: note.updated_at, note })),
      ].sort((a, b) => b.at.localeCompare(a.at)),
    [board.notes, board.saves],
  );
  const shown = cards.slice(0, CARDS_SHOWN);
  const tasksHref = `${TASKS_PATH}?${SPACE_PARAM}=${encodeURIComponent(space.id)}`;
  const cardsHref = `${LIBRARY_PATH}?${SPACE_PARAM}=${encodeURIComponent(space.id)}`;

  return (
    <div className="mc-sp-board" aria-label={`${space.name} board`}>
      <aside className="mc-sp-side">
        <section aria-labelledby="mc-sp-pinned">
          <h2 className="mc-sec" id="mc-sp-pinned">
            Pinned
          </h2>
          {board.pinned.length ? (
            <nav className="mc-sp-pins" aria-label={`Pinned in ${space.name}`}>
              {board.pinned.map((link) => (
                <PinButton key={link.id} link={link} />
              ))}
            </nav>
          ) : (
            <p className="mc-lab mc-sp-hint">
              {board.saves.length ? 'Press the pin on a save to keep it up here.' : 'Sites you pin show up here.'}
            </p>
          )}
        </section>

        <section aria-labelledby="mc-sp-tasks">
          <div className="mc-sp-sec-head">
            <h2 className="mc-sec" id="mc-sp-tasks">
              Open tasks
            </h2>
            <button type="button" className="mc-btn is-quiet is-small" onClick={onAddTask}>
              <Plus aria-hidden="true" /> Add
            </button>
          </div>
          {tasks.length ? (
            <>
              <ul className="mc-task-rows" ref={listRef} onKeyDown={onTaskKeys}>
                {tasks.slice(0, TASKS_SHOWN).map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    taskSpaces={taskSpaces(task)}
                    groupSpaceId={space.id}
                    settling={settling.has(task.id)}
                    renaming={renamingId === task.id}
                    now={now}
                    handlers={taskHandlers}
                    onFileIn={(t) => onFileIn(`task:${t.id}`)}
                  />
                ))}
              </ul>
              {(tasks.length > TASKS_SHOWN || doneCount > 0) && (
                <Link className="mc-btn is-quiet is-small mc-sp-more" to={tasksHref}>
                  {tasks.length > TASKS_SHOWN ? `All ${openCount} open` : `${doneCount} done`} in Tasks
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              )}
            </>
          ) : doneCount > 0 ? (
            <p className="mc-lab mc-sp-hint">
              <Check aria-hidden="true" className="mc-sp-hint-icon" /> All clear. <Link to={tasksHref}>{doneCount} done</Link>
            </p>
          ) : (
            <p className="mc-lab mc-sp-hint">
              <ListTodo aria-hidden="true" className="mc-sp-hint-icon" /> Start a line with [] in the Journal and it lands here.
            </p>
          )}
        </section>
      </aside>

      <section className="mc-sp-cards" aria-label={`${space.name} cards`}>
        {shown.length === 0 ? (
          <EmptySlot
            glyph={<Plus />}
            color={space.color}
            title="A fresh space"
            body={`Everything you save here is filed in ${space.name}. Paste a link or write a note in the Journal.`}
          />
        ) : (
          <div className="mc-sp-grid">
            {shown.map((card) => {
              if (card.kind === 'note') {
                return (
                  <div key={`n${card.note.id}`} className="mc-sp-cell">
                    <NoteMemoryCard note={card.note} label={labelFor(`note:${card.note.id}`)} onActivate={onOpenNote} />
                  </div>
                );
              }
              const link = card.link;
              const pinned = isPinnedInSpace(linkMembership, space.id, link.id);
              return (
                <div key={`l${link.id}`} className="mc-sp-cell">
                  <LinkMemoryCard
                    link={link}
                    label={labelFor(`link:${link.id}`)}
                    onActivate={onOpenLink}
                    withPicture={!brokenPictures.has(link.id)}
                    onImageError={(id) => setBrokenPictures((prev) => new Set(prev).add(id))}
                    pinned={pinned}
                  />
                  {!link.id.startsWith('temp-') && (
                    <button
                      type="button"
                      className={`mc-rb is-small mc-sp-pin-toggle${pinned ? ' is-pinned' : ''}`}
                      aria-pressed={pinned}
                      aria-label={pinned ? `Unpin “${getLinkTitle(link)}”` : `Pin “${getLinkTitle(link)}” to the board`}
                      title={pinned ? 'Unpin' : 'Pin to the board'}
                      onClick={() => onTogglePin(link, !pinned)}
                    >
                      <Pin aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {cards.length > CARDS_SHOWN && (
          <Link className="mc-btn mc-sp-all" to={cardsHref}>
            All {cards.length} in Cards <ArrowUpRight aria-hidden="true" />
          </Link>
        )}
      </section>
    </div>
  );
};

export default SpaceBoard;
