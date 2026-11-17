import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Ellipsis,
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
import { focusTaskRow, nextFocusAfter, taskListKeyDown } from '../components/tasks/taskList';
import TaskComposer, { type TaskComposerHandle } from '../components/tasks/TaskComposer';
import { FeedbackToast } from '../components/ui';
import LoadErrorState from '../components/LoadErrorState';
import { HANDLES_ERRORS } from '../utils/mutationErrors';
import { loadStateOf } from '../utils/loadState';
import { DONE_PARAM, GROUP_PARAM, SPACE_PARAM } from '../constants/modules';
import { cue } from '../utils/sound';
import { TaskRow } from '../components/tasks/TaskRow';
import CardsMenu, { type MenuEntry as CardsMenuEntry } from '../components/cards/Menu';
import MoveSheet from '../components/cards/MoveSheet';
import { EmptySlot, ToggleGroup } from '../components/cards/Controls';
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
  const tasksQuery = useAllTasks();
  const tasks = tasksQuery.data;
  const loadState = loadStateOf([tasksQuery]);
  const isLoading = loadState === 'loading';
  const { data: profiles, isLoading: spacesLoading } = useProfiles();
  const colors = useSpaceColors();
  const { data: taskRows } = useProfileTaskMembership();
  // handleCreate reports both steps' failures itself
  const createTask = useCreateTask(HANDLES_ERRORS);
  const addTasks = useAddTasksToProfile(HANDLES_ERRORS);
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
  /** Memory Cards: the task whose “File in…” sheet is open. */
  const [fileInKey, setFileInKey] = useState<string | null>(null);
  const composerRef = useRef<TaskComposerHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<string | null>(null);

  const { hidden, settling, renamingId, handlers: rowHandlers } = useTaskActions({
    flash,
    dismiss: dismissToast,
    membership,
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

  const { open, done, groups, counts } = useMemo(() => {
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

  // Two steps: add, then file. Only a failed add rejects (the field gets the
  // text back); once the task exists, a failed filing says so instead, so
  // adding again can't make a duplicate.
  const handleCreate = useCallback(
    async ({ title, spaces: filing }: { title: string; spaces: JournalSpace[] }) => {
      let taskId: string;
      try {
        cue('confirm');
        taskId = (await createTask.mutateAsync({ title })).id;
      } catch (error) {
        console.error('Failed to add task:', error);
        cue('error');
        flash('Couldn’t add that task. Your text is back in the box.');
        throw error;
      }
      if (filing.length) {
        // Show it in its spaces at once; the writes below confirm it (a failed
        // one refetches the membership, which drops these rows again)
        queryClient.setQueryData<{ profile_id: string; task_id: string }[]>(profileTaskKeys.membership(), (old = []) => [
          ...old,
          ...filing.map((space) => ({ profile_id: space.id, task_id: taskId })),
        ]);
        try {
          await Promise.all(filing.map((space) => addTasks.mutateAsync({ profileId: space.id, taskIds: [taskId] })));
        } catch (error) {
          console.error('Failed to file a new task:', error);
          cue('error');
          flash(`Saved, but couldn’t file it in ${filing.map((space) => space.name).join(', ')}.`);
          return;
        }
      }
      const shown =
        spaceFilter.length === 0 ||
        (filing.length ? filing.some((s) => spaceFilter.includes(s.id)) : spaceFilter.includes(UNFILED_TASKS));
      if (!shown) flash(`Added “${title}”. The Space filter hides it.`);
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

  const spaceSummary =
    spaceFilter.length === 0
      ? 'Space'
      : spaceFilter.length === 1
        ? spaceFilter[0] === UNFILED_TASKS
          ? 'Unfiled'
          : (filterSpace?.name ?? 'Space')
        : `Space · ${spaceFilter.length}`;

  const spacesOf = (task: TaskWithTags) =>
    (membership.get(task.id) ?? []).map((id) => spaceById.get(id)).filter((s): s is JournalSpace => !!s);

  /* ---------- Render ---------- */

  const filtered = spaceFilter.length > 0;
  const failed = loadState === 'failed';
  const nothingAtAll = loadState === 'ready' && open.length === 0 && done.length === 0;

  /* ---------- Memory Cards (d27, d28) ---------- */

  const bandColor = (group: (typeof groups)[number]) =>
    group.space
      ? group.space.color
      : group.bucket === 'overdue'
        ? 'var(--mc-coral)'
        : group.bucket === 'today'
          ? 'var(--mc-gold)'
          : group.bucket === 'tomorrow'
            ? 'var(--mc-cyan)'
            : group.bucket === 'week'
              ? 'var(--mc-blue)'
              : group.bucket === 'later'
                ? 'var(--mc-vio)'
                : 'var(--mc-line)';

  const menuEntries: CardsMenuEntry[] = [
    { kind: 'header', id: 'h-space', label: 'Show' },
    {
      id: UNFILED_TASKS,
      label: `Unfiled · ${counts.get(UNFILED_TASKS) ?? 0}`,
      checked: spaceFilter.includes(UNFILED_TASKS),
      onSelect: () => toggleSpaceFilter(UNFILED_TASKS),
    },
    ...spaces.map<CardsMenuEntry>((space) => ({
      id: space.id,
      label: `${space.name} · ${counts.get(space.id) ?? 0}`,
      color: space.color,
      checked: spaceFilter.includes(space.id),
      onSelect: () => toggleSpaceFilter(space.id),
    })),
    ...(spaceFilter.length
      ? [{ id: 'every', label: 'Every space', onSelect: () => setParam(SPACE_PARAM, null) } as CardsMenuEntry]
      : []),
    { kind: 'separator', id: 'sep' },
    {
      id: 'done',
      label: showDone ? 'Hide done' : `Show done · ${done.length}`,
      icon: <Check />,
      disabled: done.length === 0,
      onSelect: () => setParam(DONE_PARAM, showDone ? null : '1'),
    },
  ];

  const renderCardsRow = (task: TaskWithTags, groupSpaceId?: string) => (
    <TaskRow
      key={task.id}
      task={task}
      taskSpaces={spacesOf(task)}
      groupSpaceId={groupSpaceId}
      settling={settling.has(task.id)}
      renaming={renamingId === task.id}
      now={now}
      handlers={rowHandlers}
      onFileIn={(t) => setFileInKey(`task:${t.id}`)}
    />
  );

  return (
    <main className="mc-page mc-tasks" aria-label="Tasks">
      <div className="mc-page-head">
        <h1 className="mc-hero">
          Tasks
          {loadState === 'ready' && <sup aria-label={`${openCount} open`}>{openCount}</sup>}
        </h1>
        <div className="mc-page-tools mc-tasks-tools">
          <TaskComposer ref={composerRef} spaces={spaces} defaultSpace={filterSpace} onSubmit={handleCreate} />
          <ToggleGroup
            label="Group by"
            value={grouping}
            options={[
              { value: 'space', label: 'By space' },
              { value: 'date', label: 'By date' },
            ]}
            onChange={setGrouping}
          />
          <CardsMenu
            label="Tasks options"
            entries={menuEntries}
            trigger={(props) => (
              <button {...props} type="button" className="mc-rb" aria-label="Tasks options">
                <Ellipsis aria-hidden="true" />
              </button>
            )}
          />
        </div>
      </div>

      {filtered && (
        <p className="mc-lab mc-tasks-filter" role="status">
          Showing {spaceFilter.length === 1 ? spaceSummary : `${spaceFilter.length} spaces`}
          <button type="button" className="mc-btn is-quiet is-small" onClick={() => setParam(SPACE_PARAM, null)}>
            Show every space
          </button>
        </p>
      )}

      <div className="mc-task-list" ref={listRef} onKeyDown={onListKeyDown}>
        {isLoading && (
          <div className="mc-task-groups" aria-busy="true" aria-label="Loading tasks">
            {[0, 1].map((n) => (
              <section key={n} className="mc-task-group">
                <span className="mc-sk mc-task-band-sk" />
                <ul className="mc-task-rows">
                  {[64, 48, 72].map((w) => (
                    <li key={w} className="mc-trow">
                      <span className="mc-sk" style={{ width: 40, height: 40, borderRadius: 12 }} />
                      <span className="mc-sk" style={{ width: `${w}%`, height: 20 }} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {failed && <LoadErrorState what="your tasks" onRetry={() => tasksQuery.refetch()} />}

        {nothingAtAll && !filtered && (
          <EmptySlot
            glyph={<ListTodo />}
            color="var(--mc-blue)"
            title="Nothing to do yet"
            body="Add one above. In the Journal, start a line with [] and it lands here too."
          />
        )}

        {loadState === 'ready' && open.length === 0 && (done.length > 0 || filtered) &&
          (filtered ? (
            <EmptySlot
              glyph={<ListTodo />}
              title={`Nothing open in ${spaceFilter.length === 1 ? spaceSummary : 'these spaces'}`}
              body={done.length > 0 ? `${done.length} done here.` : 'Add one above and it’s filed here.'}
              action={
                <button type="button" className="mc-btn" onClick={() => setParam(SPACE_PARAM, null)}>
                  Show every space
                </button>
              }
            />
          ) : (
            <EmptySlot glyph={<Check />} color="var(--mc-green)" title="All clear" body={`Every task is done. ${done.length} so far.`} />
          ))}

        {groups.length > 0 && (
          <div className="mc-task-groups">
            {groups.map((group) => (
              <section
                key={group.key}
                className="mc-task-group"
                aria-labelledby={`mc-tk-group-${group.key}`}
                style={{ '--c': bandColor(group) } as CSSProperties}
              >
                <h2 className="mc-band mc-task-band" id={`mc-tk-group-${group.key}`}>
                  <span className="mc-task-band-name" translate={group.space ? 'no' : undefined}>
                    {group.label}
                  </span>
                  <span className="mc-task-band-count">{group.tasks.filter((t) => !t.is_done).length}</span>
                </h2>
                <ul className="mc-task-rows">
                  {group.tasks.map((task) => renderCardsRow(task, grouping === 'space' ? group.space?.id : undefined))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <section className="mc-task-done" aria-label="Done">
            <button
              type="button"
              className="mc-btn is-quiet is-small mc-task-done-toggle"
              aria-expanded={showDone}
              aria-controls="mc-tk-done-list"
              onClick={() => setParam(DONE_PARAM, showDone ? null : '1')}
            >
              <ChevronRight aria-hidden="true" className={showDone ? 'is-open' : undefined} />
              Done ({done.length})
            </button>
            {showDone && (
              <>
                <ul className="mc-task-rows mc-task-rows--done" id="mc-tk-done-list">
                  {done.slice(0, doneLimit).map((task) => renderCardsRow(task))}
                </ul>
                {done.length > doneLimit && (
                  <button type="button" className="mc-btn is-small" onClick={() => setDoneLimit((n) => n + DONE_PAGE)}>
                    Show {Math.min(DONE_PAGE, done.length - doneLimit)} more
                  </button>
                )}
              </>
            )}
          </section>
        )}
      </div>

      <MoveSheet
        open={fileInKey !== null}
        onClose={() => setFileInKey(null)}
        itemKeys={fileInKey ? [fileInKey] : []}
        onFeedback={flash}
        title="File this task in…"
      />

      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </main>
  );
};

export default TasksPage;
