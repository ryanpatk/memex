import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, CalendarDays, Check, Ellipsis, Pencil, Trash2 } from 'lucide-react';
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
import MenuButton, { type MenuEntry } from '../library/MenuButton';
import { dragAttrs } from '../../utils/itemDrag';

/*
 * One task row, shared by the Tasks view and a space's board (decision 14B):
 * the check, the title (press to rename), space chips, the due date (native
 * picker) and a menu with due shortcuts, spaces, rename and delete. What the
 * buttons do comes from useTaskActions. Styles: styles/tasks.css (`tk-row`).
 */

export interface TaskRowHandlers {
  onToggle: (task: TaskWithTags) => void;
  onRename: (task: TaskWithTags, title: string) => void;
  onStartRename: (taskId: string | null) => void;
  onSetDue: (task: TaskWithTags, due: string | null) => void;
  onFileToggle: (task: TaskWithTags, spaceId: string) => void;
  onDelete: (task: TaskWithTags) => void;
}

export const TaskRow = ({
  task,
  taskSpaces,
  groupSpaceId,
  allSpaces,
  settling,
  renaming,
  now,
  handlers,
}: {
  task: TaskWithTags;
  taskSpaces: JournalSpace[];
  /** The space whose group this row sits in (its chip is left out). */
  groupSpaceId?: string;
  allSpaces: JournalSpace[];
  settling: boolean;
  renaming: boolean;
  now: Date;
  handlers: TaskRowHandlers;
}) => {
  const dueInputRef = useRef<HTMLInputElement>(null);
  const pending = task.id.startsWith('temp-');
  const key = itemKey('task', task.id);
  const due = dueDayKey(task.due_date);
  const overdue = isOverdue(task, now);
  const shortcuts = dueShortcuts(now);
  const chips = taskSpaces.filter((s) => s.id !== groupSpaceId);

  const openPicker = () => {
    const input = dueInputRef.current;
    if (!input) return;
    input.focus();
    try {
      input.showPicker?.();
    } catch {
      // Older browsers: the focused field takes typing instead
    }
  };

  const menuEntries: MenuEntry[] = task.is_done
    ? [
        { key: 'rename', label: 'Rename…', icon: <Pencil aria-hidden="true" />, onSelect: () => handlers.onStartRename(task.id) },
        { key: 'delete', label: 'Delete', icon: <Trash2 aria-hidden="true" />, danger: true, onSelect: () => handlers.onDelete(task) },
      ]
    : [
        { key: 'h-due', heading: 'Due' },
        { key: 'today', label: 'Today', role: 'radio', checked: due === shortcuts.today, onSelect: () => handlers.onSetDue(task, shortcuts.today) },
        { key: 'tomorrow', label: 'Tomorrow', role: 'radio', checked: due === shortcuts.tomorrow, onSelect: () => handlers.onSetDue(task, shortcuts.tomorrow) },
        {
          key: 'next-week',
          label: `Next week · ${dueLabel(shortcuts.nextWeek, now)}`,
          role: 'radio',
          checked: due === shortcuts.nextWeek,
          onSelect: () => handlers.onSetDue(task, shortcuts.nextWeek),
        },
        { key: 'none', label: 'No due date', role: 'radio', checked: !due, onSelect: () => handlers.onSetDue(task, null) },
        { key: 'pick', label: 'Pick a date…', icon: <CalendarDays aria-hidden="true" />, onSelect: () => setTimeout(openPicker, 0) },
        ...(allSpaces.length
          ? [
              { key: 'd-spaces', divider: true as const },
              { key: 'h-spaces', heading: 'Spaces' },
              ...allSpaces.map((space) => ({
                key: `space-${space.id}`,
                label: space.name,
                role: 'checkbox' as const,
                checked: taskSpaces.some((s) => s.id === space.id),
                icon: <span className="memex-space-dot" style={{ background: space.color }} aria-hidden="true" />,
                onSelect: () => handlers.onFileToggle(task, space.id),
              })),
            ]
          : []),
        { key: 'd-actions', divider: true },
        { key: 'rename', label: 'Rename…', icon: <Pencil aria-hidden="true" />, onSelect: () => handlers.onStartRename(task.id) },
        { key: 'delete', label: 'Delete', icon: <Trash2 aria-hidden="true" />, danger: true, onSelect: () => handlers.onDelete(task) },
      ];

  return (
    <li
      className={`tk-row${task.is_done ? ' is-done' : ''}${settling ? ' is-settling' : ''}${pending ? ' is-new' : ''}${
        overdue ? ' is-overdue' : ''
      }`}
      data-task-row=""
      data-task-id={task.id}
      data-item-key={key}
      {...(renaming ? {} : dragAttrs(key, task.title))}
    >
      <span className="tk-check-hit">
        <button
          type="button"
          role="checkbox"
          className="memex-task-check"
          aria-checked={task.is_done}
          aria-label={`${task.is_done ? 'Reopen' : 'Done:'} “${task.title}”`}
          disabled={pending}
          data-col="check"
          onClick={() => handlers.onToggle(task)}
        >
          <Check aria-hidden="true" />
        </button>
      </span>

      {renaming ? (
        <RenameField task={task} onDone={(title) => handlers.onRename(task, title)} onCancel={() => handlers.onStartRename(null)} />
      ) : (
        <button
          type="button"
          className="tk-title"
          data-col="title"
          title="Rename"
          aria-label={`Rename “${task.title}”`}
          disabled={pending}
          onClick={() => handlers.onStartRename(task.id)}
        >
          {task.title}
        </button>
      )}

      <span className="tk-meta">
        {chips.map((space) => (
          <span key={space.id} className="jr-chip tk-chip" style={{ '--hue': space.color } as CSSProperties}>
            <i className="jr-dot" aria-hidden="true" />
            <span className="jr-ellipsis">{space.name}</span>
          </span>
        ))}
        {task.is_done ? (
          <span className="tk-done-at" title={new Date(task.updated_at).toLocaleString()}>
            Done {relativeTime(task.updated_at, now.getTime())}
          </span>
        ) : (
          !pending && (
            <label className={`tk-due${due ? ' has-due' : ''}${overdue ? ' is-overdue' : ''}${due === shortcuts.today ? ' is-today' : ''}`}>
              {overdue ? <AlertCircle aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}
              <span className="tk-due-text">{due ? dueLabel(due, now) : 'Due'}</span>
              {overdue && <span className="sr-only"> (overdue)</span>}
              <input
                ref={dueInputRef}
                type="date"
                className="tk-due-input"
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
                  // Half-typed dates read as empty: keep the old date until it's whole
                  if (event.target.value) handlers.onSetDue(task, event.target.value);
                }}
              />
            </label>
          )
        )}
        {!pending && (
          <MenuButton
            triggerClassName="memex-icon-button is-compact tk-row-menu"
            triggerLabel={`More for “${task.title}”`}
            title="More"
            menuLabel={`“${task.title}”`}
            menuClassName="tk-row-menu-list"
            entries={menuEntries}
            align="end"
            fixed
          >
            <Ellipsis aria-hidden="true" />
          </MenuButton>
        )}
      </span>
    </li>
  );
};

const RenameField = ({ task, onDone, onCancel }: { task: TaskWithTags; onDone: (title: string) => void; onCancel: () => void }) => {
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
    // Back to the title button once it's rendered again
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"] [data-col="title"]`)?.focus(),
    );
  };

  return (
    <input
      ref={ref}
      className="tk-title-input"
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


