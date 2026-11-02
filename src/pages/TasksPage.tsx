import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ListTodo,
} from 'lucide-react';
import {
  UNFILED_TASKS,
  compareDoneTasks,
  compareOpenTasks,
  countOpenTasksBySpace,
  dueDayKey,
  dueShortcuts,
  filterTasksBySpace,
  groupTasks,
  isOverdue,
  parseTaskGrouping,
  taskSpaceMap,
  toJournalSpaces,
  type JournalSpace,
  type TaskGrouping,
  type TaskWithTags,
} from '@memex/core';
import { useAllTasks, useCreateTask } from '../hooks/useTasks';
import {
  profileTaskKeys,
  useAddTasksToProfile,
  useProfileTaskMembership,
} from '../hooks/useProfileTasks';
import { useProfiles } from '../hooks/useProfiles';
import { useSpaceColors } from '../hooks/useSpaceColors';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useTaskActions } from '../hooks/useTaskActions';
import { TaskRow } from '../components/tasks/TaskRow';
import { focusTaskRow, nextFocusAfter, taskListKeyDown } from '../components/tasks/taskList';
import MenuButton, { type MenuEntry } from '../components/library/MenuButton';
import TaskComposer, { type TaskComposerHandle } from '../components/tasks/TaskComposer';
import { FeedbackToast } from '../components/ui';
import { DONE_PARAM, GROUP_PARAM, SPACE_PARAM } from '../constants/modules';
import { cue } from '../utils/sound';
import '../styles/journal.css';
import '../styles/tasks.css';

/*
 * The Tasks view (`/tasks`, ROADMAP.md Phase 1): every open task across
 * spaces, grouped by space (default) or by due date, with a Space filter,
 * an add field on the composer's syntax and a Done list underneath. Ticking
 * a task keeps it in place for a beat, then it moves to Done; the toast
 * offers Undo. Deletes hide at once and commit after the Undo window, like
 * the Library. State lives in the URL: `?group=date`, `?space=<id>,unfiled`,
 * `?done=1`. Model: @memex/core `tasks/tasks.ts`. Styles: styles/tasks.css.
 */

const DONE_PAGE = 50;

const isEditingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

const TasksPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const grouping = parseTaskGrouping(searchParams.get(GROUP_PARAM));
  const rawSpaceFilter = useMemo(
    () => (searchParams.get(SPACE_PARAM) ?? '').split(',').filter(Boolean),
    [searchParams],
  );
  const showDone = searchParams.get(DONE_PARAM) === '1';

  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useAllTasks();
  const { data: profiles, isLoading: spacesLoading } = useProfiles();
  const colors = useSpaceColors();
  const { data: taskRows } = useProfileTaskMembership();
  const createTask = useCreateTask();
  const addTasks = useAddTasksToProfile();
  const { toast, flash, dismiss: dismissToast, handleAnimationEnd } = useFeedbackToast();

  const spaces = useMemo(() => toJournalSpaces(profiles ?? [], colors), [colors, profiles]);
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const membership = useMemo(() => taskSpaceMap(taskRows ?? []), [taskRows]);

  // Ignore ids of spaces that are gone (once spaces have loaded)
  const spaceFilter = useMemo(
    () =>
      spacesLoading
        ? rawSpaceFilter
        : rawSpaceFilter.filter((id) => id === UNFILED_TASKS || spaceById.has(id)),
    [rawSpaceFilter, spaceById, spacesLoading],
  );
  const filterSpace = spaceFilter.length === 1 ? spaceById.get(spaceFilter[0]) : undefined;

  const [doneLimit, setDoneLimit] = useState(DONE_PAGE);
  const composerRef = useRef<TaskComposerHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<string | null>(null);

  const { hidden, settling, renamingId, handlers: rowHandlers } = useTaskActions({
    flash,
    dismiss: dismissToast,
    membership,
    spaceById,
    // A focused row that leaves (ticked, deleted) hands focus to its neighbour, else the add field
    beforeRowLeaves: (taskId) => {
      const next = nextFocusAfter(listRef.current, taskId, 'composer');
      if (next) focusAfter.current = next;
    },
  });

  /* ---------- URL state ---------- */

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const setGrouping = (value: TaskGrouping) => setParam(GROUP_PARAM, value === 'space' ? null : value);
  const toggleSpaceFilter = (id: string) => {
    const next = spaceFilter.includes(id) ? spaceFilter.filter((x) => x !== id) : [...spaceFilter, id];
    setParam(SPACE_PARAM, next.length ? next.join(',') : null);
  };

  /* ---------- The lists ---------- */

  const now = useMemo(() => new Date(), [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const { open, done, groups, counts, overdueCount, todayCount } = useMemo(() => {
    const visible = (tasks ?? []).filter((t) => !hidden.has(t.id));
    // Optimistic rows have no spaces yet; keep them on screen whatever the filter
    const filtered = filterTasksBySpace(visible, membership, spaceFilter).concat(
      spaceFilter.length ? visible.filter((t) => t.id.startsWith('temp-')) : [],
    );
    const openList = filtered.filter((t) => !t.is_done || settling.has(t.id)).sort(compareOpenTasks);
    const doneList = filtered.filter((t) => t.is_done && !settling.has(t.id)).sort(compareDoneTasks);
    const stillOpen = openList.filter((t) => !t.is_done);
    return {
      open: openList,
      done: doneList,
      groups: groupTasks(openList, { by: grouping, spaces, membership, now }),
      counts: countOpenTasksBySpace(visible, membership),
      overdueCount: stillOpen.filter((t) => isOverdue(t, now)).length,
      todayCount: stillOpen.filter((t) => dueDayKey(t.due_date) === dueShortcuts(now).today).length,
    };
  }, [grouping, hidden, membership, now, settling, spaceFilter, spaces, tasks]);

  const openCount = open.filter((t) => !t.is_done).length;

  /* ---------- Focus that would be lost when a row leaves ---------- */

  useLayoutEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    if (id === 'composer') {
      composerRef.current?.focus();
      return;
    }
    focusTaskRow(listRef.current, id);
  });

  /* ---------- Writes ---------- */

  const handleCreate = useCallback(
    async ({ title, spaces: filing }: { title: string; spaces: JournalSpace[] }) => {
      try {
        cue('confirm');
        const task = await createTask.mutateAsync({ title });
        if (filing.length) {
          // Show it in its spaces at once; the writes below confirm it
          queryClient.setQueryData<{ profile_id: string; task_id: string }[]>(profileTaskKeys.membership(), (old = []) => [
            ...old,
            ...filing.map((space) => ({ profile_id: space.id, task_id: task.id })),
          ]);
          await Promise.all(filing.map((space) => addTasks.mutateAsync({ profileId: space.id, taskIds: [task.id] })));
        }
        const shown =
          spaceFilter.length === 0 ||
          (filing.length ? filing.some((s) => spaceFilter.includes(s.id)) : spaceFilter.includes(UNFILED_TASKS));
        if (!shown) flash(`Added “${title}”. The Space filter hides it.`);
      } catch (error) {
        console.error('Failed to add task:', error);
        cue('error');
        flash('Couldn’t add that task. Your text is back in the box.');
        throw error;
      }
    },
    [addTasks, createTask, flash, queryClient, spaceFilter],
  );

  /* ---------- Keyboard ---------- */

  // N focuses the add field from anywhere on the page
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditingTarget(event.target) || document.querySelector('dialog[open], [role="menu"]')) return;
      event.preventDefault();
      composerRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Rows: ↑/↓ (Home/End) move between rows, keeping the column; Delete deletes
  const onListKeyDown = taskListKeyDown(listRef, (id) => (tasks ?? []).find((t) => t.id === id), rowHandlers.onDelete);

  /* ---------- Menus ---------- */

  const spaceEntries = useMemo<MenuEntry[]>(
    () => [
      {
        key: UNFILED_TASKS,
        label: <MenuCountLabel label="Unfiled" count={counts.get(UNFILED_TASKS) ?? 0} />,
        role: 'checkbox',
        checked: spaceFilter.includes(UNFILED_TASKS),
        onSelect: () => toggleSpaceFilter(UNFILED_TASKS),
      },
      ...(spaces.length ? [{ key: 'divider-spaces', divider: true as const }] : []),
      ...spaces.map((space) => ({
        key: space.id,
        label: <MenuCountLabel label={space.name} count={counts.get(space.id) ?? 0} />,
        role: 'checkbox' as const,
        checked: spaceFilter.includes(space.id),
        icon: <span className="memex-space-dot" style={{ background: space.color }} aria-hidden="true" />,
        onSelect: () => toggleSpaceFilter(space.id),
      })),
      ...(spaceFilter.length
        ? [
            { key: 'divider-clear', divider: true as const },
            { key: 'clear', label: 'Every space', onSelect: () => setParam(SPACE_PARAM, null) },
          ]
        : []),
    ],
    // toggleSpaceFilter is rebuilt each render from spaceFilter
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts, setParam, spaceFilter, spaces],
  );

  const spaceSummary =
    spaceFilter.length === 0
      ? 'Space'
      : spaceFilter.length === 1
        ? spaceFilter[0] === UNFILED_TASKS
          ? 'Unfiled'
          : (filterSpace?.name ?? 'Space')
        : `Space · ${spaceFilter.length}`;

  const subtitleParts = [
    isLoading ? 'Loading…' : openCount === 0 ? 'Nothing open' : `${openCount} open`,
    todayCount > 0 ? `${todayCount} due today` : '',
    overdueCount > 0 ? `${overdueCount} overdue` : '',
  ].filter(Boolean);

  const spacesOf = (task: TaskWithTags) =>
    (membership.get(task.id) ?? []).map((id) => spaceById.get(id)).filter((s): s is JournalSpace => !!s);

  const renderRow = (task: TaskWithTags, groupSpaceId?: string) => (
    <TaskRow
      key={task.id}
      task={task}
      taskSpaces={spacesOf(task)}
      groupSpaceId={groupSpaceId}
      allSpaces={spaces}
      settling={settling.has(task.id)}
      renaming={renamingId === task.id}
      now={now}
      handlers={rowHandlers}
    />
  );

  /* ---------- Render ---------- */

  const filtered = spaceFilter.length > 0;
  const nothingAtAll = !isLoading && open.length === 0 && done.length === 0;

  return (
    <div className="tk-page">
      <header className="memex-page-header tk-head">
        <div className="memex-page-header-row">
          <div className="memex-page-heading">
            <h1 className="memex-page-title">
              <span className="memex-page-title-text">Tasks</span>
            </h1>
            <p className="memex-page-subtitle tk-subtitle">
              {subtitleParts.map((part, i) => (
                <span key={part} className={part.endsWith('overdue') ? 'is-overdue' : undefined}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {part}
                </span>
              ))}
            </p>
          </div>
          <div className="memex-page-actions tk-actions">
            <MenuButton
              triggerClassName={`bookmark-tag-chip memex-filter-menu${spaceFilter.length ? ' is-active' : ''}`}
              triggerLabel={spaceFilter.length ? `Space: ${spaceSummary}` : 'Filter by space'}
              menuLabel="Space"
              entries={spaceEntries}
              menuClassName="memex-filter-menu-list"
              align="end"
            >
              {filterSpace && (
                <span className="memex-space-dot" style={{ background: filterSpace.color }} aria-hidden="true" />
              )}
              <span className="bookmark-tag-chip-label">{spaceSummary}</span>
              <ChevronDown aria-hidden="true" className="memex-filter-menu-caret" />
            </MenuButton>
            <div className="memex-view-toggle tk-segment" role="group" aria-label="Group by">
              <button
                type="button"
                className={grouping === 'space' ? 'is-active' : ''}
                aria-pressed={grouping === 'space'}
                onClick={() => setGrouping('space')}
              >
                By space
              </button>
              <button
                type="button"
                className={grouping === 'date' ? 'is-active' : ''}
                aria-pressed={grouping === 'date'}
                onClick={() => setGrouping('date')}
              >
                By due date
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="tk-body">
        <main className="tk-main" aria-label="Tasks">
          <div className="tk-scroll">
            <div className="tk-column">
              <TaskComposer ref={composerRef} spaces={spaces} defaultSpace={filterSpace} onSubmit={handleCreate} />

              <div className="tk-list" ref={listRef} onKeyDown={onListKeyDown}>
                {isLoading && <TaskSkeleton />}

                {nothingAtAll && !filtered && (
                  <TasksEmpty
                    tone="start"
                    title="Nothing to do yet"
                    body={
                      <>
                        Add one above. In the Journal, start a line with <kbd className="memex-kbd">[]</kbd> and it
                        lands here too.
                      </>
                    }
                  />
                )}

                {!isLoading && open.length === 0 && (done.length > 0 || filtered) && (
                  filtered ? (
                    <TasksEmpty
                      tone="start"
                      title={`Nothing open in ${spaceFilter.length === 1 ? spaceSummary : 'these spaces'}`}
                      body={done.length > 0 ? `${done.length} done here.` : 'Add one above and it’s filed here.'}
                      action={{ label: 'Show every space', onClick: () => setParam(SPACE_PARAM, null) }}
                    />
                  ) : (
                    <TasksEmpty
                      tone="clear"
                      title="All clear"
                      body={`Every task is done. ${done.length} so far.`}
                    />
                  )
                )}

                {groups.map((group) => (
                  <section
                    key={group.key}
                    className={`tk-group${group.bucket === 'overdue' ? ' is-overdue' : ''}`}
                    aria-labelledby={`tk-group-${group.key}`}
                    style={group.space ? ({ '--hue': group.space.color } as CSSProperties) : undefined}
                  >
                    <h2 className="tk-group-head" id={`tk-group-${group.key}`}>
                      {group.space ? (
                        <i className="jr-dot" aria-hidden="true" />
                      ) : group.bucket === 'overdue' ? (
                        <AlertCircle aria-hidden="true" className="tk-group-icon" />
                      ) : group.bucket ? (
                        <CalendarDays aria-hidden="true" className="tk-group-icon" />
                      ) : (
                        <i className="jr-dot is-unfiled" aria-hidden="true" />
                      )}
                      <span className="tk-group-label">{group.label}</span>
                      <span className="tk-group-count">{group.tasks.filter((t) => !t.is_done).length}</span>
                    </h2>
                    <ul className="tk-rows">
                      {group.tasks.map((task) => renderRow(task, grouping === 'space' ? group.space?.id : undefined))}
                    </ul>
                  </section>
                ))}

                {done.length > 0 && (
                  <section className="tk-done" aria-label="Done">
                    <button
                      type="button"
                      className="tk-done-toggle"
                      aria-expanded={showDone}
                      aria-controls="tk-done-list"
                      onClick={() => setParam(DONE_PARAM, showDone ? null : '1')}
                    >
                      <ChevronRight aria-hidden="true" className={showDone ? 'is-open' : undefined} />
                      Done
                      <span className="tk-group-count">{done.length}</span>
                    </button>
                    {showDone && (
                      <>
                        <ul className="tk-rows tk-rows--done" id="tk-done-list">
                          {done.slice(0, doneLimit).map((task) => renderRow(task))}
                        </ul>
                        {done.length > doneLimit && (
                          <button type="button" className="jr-earlier tk-more" onClick={() => setDoneLimit((n) => n + DONE_PAGE)}>
                            Show {Math.min(DONE_PAGE, done.length - doneLimit)} more
                          </button>
                        )}
                      </>
                    )}
                  </section>
                )}
              </div>

              {!nothingAtAll && !isLoading && (
                <p className="tk-keys" aria-hidden="true">
                  <span>
                    <kbd className="memex-kbd">N</kbd> new task
                  </span>
                  <span>
                    <kbd className="memex-kbd">↑↓</kbd> move
                  </span>
                  <span>
                    <kbd className="memex-kbd">Space</kbd> tick
                  </span>
                  <span>
                    <kbd className="memex-kbd">Enter</kbd> on a title renames
                  </span>
                  <span>
                    <kbd className="memex-kbd">Delete</kbd> delete
                  </span>
                  <span>Drag a task onto a space to file it</span>
                </p>
              )}
            </div>
          </div>
        </main>
      </div>

      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </div>
  );
};

const MenuCountLabel = ({ label, count }: { label: string; count: number }) => (
  <span className="tk-menu-label">
    <span className="tk-menu-name">{label}</span>
    <span className="tk-menu-count">{count}</span>
  </span>
);

/* ------------------------------------------------------------------ */
/* Empty and loading states                                            */
/* ------------------------------------------------------------------ */

const TasksEmpty = ({
  tone,
  title,
  body,
  action,
}: {
  tone: 'start' | 'clear';
  title: string;
  body: ReactNode;
  action?: { label: string; onClick: () => void };
}) => (
  <div className={`tk-empty is-${tone}`} role="status">
    <span className="tk-empty-disc" aria-hidden="true">
      {tone === 'clear' ? <Check /> : <ListTodo />}
    </span>
    <p className="tk-empty-title">{title}</p>
    <p className="tk-empty-body">{body}</p>
    {action && (
      <button type="button" className="btn-secondary btn-compact" onClick={action.onClick}>
        {action.label}
      </button>
    )}
  </div>
);

const TaskSkeleton = () => (
  <section className="tk-group is-skeleton" aria-busy="true" aria-label="Loading tasks">
    <div className="tk-group-head">
      <span className="tk-skeleton-bar" style={{ width: 96 }} />
    </div>
    <ul className="tk-rows">
      {[64, 48, 72, 40].map((width) => (
        <li key={width} className="tk-row">
          <span className="tk-check-hit">
            <span className="tk-skeleton-check" />
          </span>
          <span className="tk-skeleton-bar" style={{ width: `${width}%` }} />
        </li>
      ))}
    </ul>
  </section>
);

export default TasksPage;
