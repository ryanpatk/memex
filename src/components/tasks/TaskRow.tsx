import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, Check, Ellipsis, FolderInput, Pencil, Trash2 } from 'lucide-react';
import {
  dueDayKey,
  dueLabel,
  dueShortcuts,
  isOverdue,
  itemKey,
  relativeTime,
  type JournalSpace,
  type TaskWithTags,
} from '@memex/core';
import Menu, { type MenuEntry } from '../cards/Menu';
import { dragAttrs } from '../../utils/itemDrag';
import type { TaskRowHandlers } from './taskList';

/*
 * A task row in the Memory Cards look (s09, d27/d28): the big check, the
 * title (press to rename), the row's other spaces as strips, the due chip
 * (late / today states; press for the native date picker) and a ••• menu
 * with due shortcuts, Rename…, File in… and Delete. Same data attributes as
 * TaskRow (data-task-row, data-col) so taskList.ts keys work unchanged:
 * ↑/↓ move, Space ticks, Enter renames, Delete deletes.
 */

export const TaskRow = ({
  task,
  taskSpaces,
  groupSpaceId,
  settling,
  renaming,
  now,
  handlers,
  onFileIn,
}: {
  task: TaskWithTags;
  taskSpaces: JournalSpace[];
  /** The space whose group this row sits in (its strip is left out). */
  groupSpaceId?: string;
  settling: boolean;
  renaming: boolean;
  now: Date;
  handlers: TaskRowHandlers;
  /** Opens the move sheet for this task. */
  onFileIn?: (task: TaskWithTags) => void;
}) => {
  const dueInputRef = useRef<HTMLInputElement>(null);
  const pending = task.id.startsWith('temp-');
  const key = itemKey('task', task.id);
  const due = dueDayKey(task.due_date);
  const overdue = isOverdue(task, now);
  const shortcuts = dueShortcuts(now);
  const strips = taskSpaces.filter((s) => s.id !== groupSpaceId);

  const openPicker = () => {
    const input = dueInputRef.current;
    if (!input) return;
    input.focus();
    try {
      input.showPicker?.();
    } catch {
      // typing works instead
    }
  };

  const entries: MenuEntry[] = task.is_done
    ? [
        { id: 'rename', label: 'Rename…', icon: <Pencil />, shortcut: '↵', onSelect: () => handlers.onStartRename(task.id) },
        { id: 'delete', label: 'Delete', icon: <Trash2 />, shortcut: '⌫', danger: true, onSelect: () => handlers.onDelete(task) },
      ]
    : [
        { kind: 'header', id: 'h-due', label: 'Due' },
        { id: 'today', label: 'Today', checked: due === shortcuts.today, onSelect: () => handlers.onSetDue(task, shortcuts.today) },
        { id: 'tomorrow', label: 'Tomorrow', checked: due === shortcuts.tomorrow, onSelect: () => handlers.onSetDue(task, shortcuts.tomorrow) },
        {
          id: 'next-week',
          label: `Next week · ${dueLabel(shortcuts.nextWeek, now)}`,
          checked: due === shortcuts.nextWeek,
          onSelect: () => handlers.onSetDue(task, shortcuts.nextWeek),
        },
        { id: 'pick', label: 'Pick a date…', icon: <CalendarDays />, onSelect: () => setTimeout(openPicker, 0) },
        { id: 'none', label: 'No due date', checked: !due, onSelect: () => handlers.onSetDue(task, null) },
        { kind: 'separator', id: 'sep' },
        { id: 'rename', label: 'Rename…', icon: <Pencil />, shortcut: '↵', onSelect: () => handlers.onStartRename(task.id) },
        ...(onFileIn
          ? [{ id: 'file', label: 'File in…', icon: <FolderInput />, onSelect: () => onFileIn(task) } as MenuEntry]
          : []),
        { id: 'delete', label: 'Delete', icon: <Trash2 />, shortcut: '⌫', danger: true, onSelect: () => handlers.onDelete(task) },
      ];

  return (
    <li
      className={`mc-trow mc-task-row${task.is_done ? ' is-done' : ''}${settling ? ' is-settling' : ''}${pending ? ' is-new' : ''}${
        overdue ? ' is-overdue' : ''
      }`}
      data-task-row=""
      data-task-id={task.id}
      data-item-key={key}
      {...(renaming ? {} : dragAttrs(key, task.title))}
    >
      <button
        type="button"
        role="checkbox"
        className="mc-chk"
        aria-checked={task.is_done}
        aria-label={`${task.is_done ? 'Reopen' : 'Done:'} “${task.title}”`}
        disabled={pending}
        data-col="check"
        onClick={() => handlers.onToggle(task)}
      >
        <Check aria-hidden="true" />
      </button>

      {renaming ? (
        <CardsRenameField task={task} onDone={(title) => handlers.onRename(task, title)} onCancel={() => handlers.onStartRename(null)} />
      ) : (
        <button
          type="button"
          className="mc-trow-title mc-task-title"
          data-col="title"
          title="Rename"
          aria-label={`Rename “${task.title}”`}
          disabled={pending}
          onClick={() => handlers.onStartRename(task.id)}
        >
          {task.title}
        </button>
      )}

      <span className="mc-task-meta">
        {strips.map((space) => (
          <span key={space.id} className="mc-strip mc-task-strip" style={{ '--c': space.color } as CSSProperties}>
            <b aria-hidden="true" />
            <span translate="no">{space.name}</span>
          </span>
        ))}
        {task.is_done ? (
          <span className="mc-due" title={new Date(task.updated_at).toLocaleString()}>
            Done {relativeTime(task.updated_at, now.getTime())}
          </span>
        ) : (
          !pending && (
            <label
              className={`mc-due mc-task-due${due ? '' : ' is-empty'}${overdue ? ' is-late' : due === shortcuts.today ? ' is-today' : ''}`}
            >
              <span>{due ? dueLabel(due, now) : 'Due'}</span>
              {overdue && <span className="mc-sr-only"> (overdue)</span>}
              <input
                ref={dueInputRef}
                type="date"
                className="mc-task-due-input"
                value={due ?? ''}
                aria-label={due ? `Due ${dueLabel(due, now)}. Change the due date for “${task.title}”` : `Set a due date for “${task.title}”`}
                data-col="due"
                onClick={(event) => {
                  try {
                    event.currentTarget.showPicker?.();
                  } catch {
                    // typing works instead
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    try {
                      event.currentTarget.showPicker?.();
                    } catch {
                      // typing works instead
                    }
                  }
                }}
                onChange={(event) => {
                  if (event.target.value) handlers.onSetDue(task, event.target.value);
                }}
              />
            </label>
          )
        )}
        {!pending && (
          <Menu
            label={`“${task.title}”`}
            entries={entries}
            trigger={(props) => (
              <button {...props} type="button" className="mc-rb is-small mc-task-more" aria-label={`More for “${task.title}”`}>
                <Ellipsis aria-hidden="true" />
              </button>
            )}
          />
        )}
      </span>
    </li>
  );
};

const CardsRenameField = ({
  task,
  onDone,
  onCancel,
}: {
  task: TaskWithTags;
  onDone: (title: string) => void;
  onCancel: () => void;
}) => {
  const [value, setValue] = useState(task.title);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save) onDone(value);
    else onCancel();
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"] [data-col="title"]`)?.focus(),
    );
  };

  return (
    <input
      ref={ref}
      className="mc-inp mc-task-rename"
      value={value}
      maxLength={200}
      aria-label={`Rename “${task.title}”`}
      data-col="title"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      }}
    />
  );
};
