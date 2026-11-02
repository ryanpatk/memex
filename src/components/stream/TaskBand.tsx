import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Check, ChevronRight, Plus, X } from 'lucide-react';
import { type TaskWithTags, dueDateIso, itemKey } from '@memex/core';
import { dragAttrs } from '../../utils/itemDrag';

interface TaskBandProps {
  openTasks: TaskWithTags[];
  doneTasks: TaskWithTags[];
  onToggleDone: (task: TaskWithTags) => void;
  onDelete: (taskId: string) => void;
  onCreate?: (title: string) => void;
  selectionMode?: boolean;
  selectedKeys?: string[];
  onToggleSelect?: (task: TaskWithTags) => void;
}

const dueFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export const TaskRow = ({
  task,
  onToggleDone,
  onDelete,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: {
  task: TaskWithTags;
  onToggleDone: (task: TaskWithTags) => void;
  onDelete: (taskId: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (task: TaskWithTags) => void;
}) => {
  const toggleSelect = () => onToggleSelect?.(task);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleSelect();
    }
  };

  return (
    <div
      className={`memex-taskrow${task.is_done ? ' is-done' : ''}${isSelected ? ' is-selected' : ''}${
        selectionMode ? ' is-selection-mode' : ''
      }${task.id.startsWith('temp-') ? ' is-new' : ''}`}
      role={selectionMode ? 'button' : undefined}
      tabIndex={selectionMode ? 0 : undefined}
      aria-pressed={selectionMode ? isSelected : undefined}
      aria-label={selectionMode ? `Select “${task.title}”` : undefined}
      data-item-key={itemKey('task', task.id)}
      {...dragAttrs(itemKey('task', task.id), task.title)}
      onClick={selectionMode ? toggleSelect : undefined}
      onKeyDown={selectionMode ? handleKeyDown : undefined}
    >
      {selectionMode ? (
        <span className={`memex-select-check${isSelected ? ' is-on' : ''}`} aria-hidden="true">
          {isSelected && <Check />}
        </span>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={task.is_done}
          className="memex-task-check"
          onClick={(event) => {
            event.stopPropagation();
            onToggleDone(task);
          }}
          aria-label={task.is_done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
        >
          <Check aria-hidden="true" />
        </button>
      )}
      <span className="memex-taskrow-title">{task.title}</span>
      {task.due_date && (
        <span className="memex-taskrow-due">{dueFormat.format(new Date(dueDateIso(task.due_date)))}</span>
      )}
      {!selectionMode && (
        <button
          type="button"
          className="memex-icon-button memex-taskrow-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task.id);
          }}
          aria-label={`Delete “${task.title}”`}
          title="Delete task"
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

/** Open tasks as a checklist above the grid; done tasks fold away beneath. */
const TaskBand = ({
  openTasks,
  doneTasks,
  onToggleDone,
  onDelete,
  onCreate,
  selectionMode = false,
  selectedKeys = [],
  onToggleSelect,
}: TaskBandProps) => {
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title || !onCreate) return;
    onCreate(title);
    setDraft('');
  };

  const row = (task: TaskWithTags) => (
    <TaskRow
      key={task.id}
      task={task}
      onToggleDone={onToggleDone}
      onDelete={onDelete}
      selectionMode={selectionMode}
      isSelected={selectedKeys.includes(itemKey('task', task.id))}
      onToggleSelect={onToggleSelect}
    />
  );

  return (
    <section className="memex-taskband" aria-label="Tasks">
      <header className="memex-taskband-head">
        <h2 className="memex-taskband-title">Tasks</h2>
        <span className="memex-taskband-count">{openTasks.length} open</span>
      </header>

      <div className="memex-taskband-list">
        {openTasks.map(row)}
        {onCreate &&
          (adding ? (
            <form className="memex-taskrow memex-taskrow--add" onSubmit={submit}>
              <Plus aria-hidden="true" className="memex-taskrow-plus" />
              <input
                className="memex-taskrow-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                  if (!draft.trim()) setAdding(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setDraft('');
                    setAdding(false);
                  }
                }}
                placeholder="New task…"
                aria-label="New task"
                autoFocus
              />
            </form>
          ) : (
            <button
              type="button"
              className="memex-taskrow memex-taskrow--add"
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" className="memex-taskrow-plus" />
              <span>Add a task</span>
            </button>
          ))}
      </div>

      {doneTasks.length > 0 && (
        <div className="memex-taskband-done">
          <button
            type="button"
            className="memex-taskband-done-toggle"
            onClick={() => setShowDone((open) => !open)}
            aria-expanded={showDone}
          >
            <ChevronRight aria-hidden="true" className={showDone ? 'is-open' : ''} />
            Done ({doneTasks.length})
          </button>
          {showDone && <div className="memex-taskband-list">{doneTasks.map(row)}</div>}
        </div>
      )}
    </section>
  );
};

export default TaskBand;
