import {
  countOpenTasksBySpace,
  dueBucket,
  dueDayKey,
  dueShortcuts,
  filterTasksBySpace,
  groupTasks,
  splitTasks,
  taskSpaceMap,
  UNFILED_TASKS,
  type JournalSpace,
  type TaskGroup,
  type TaskGrouping,
  type TaskWithTags,
} from '@memex/core';

/*
 * The Tasks screen's model: core's Tasks view (docs/tasks-view.md;
 * `@memex/core` tasks/tasks.ts) over the Journal's rows. Grouping, sorting,
 * the space filter, the counts and the due-date maths are all core's; this
 * adds only the phone's one-beat hold, where a task you just ticked stays in
 * its group (checked) before it moves to Done, like the web.
 */

export interface TasksViewInput {
  tasks: TaskWithTags[];
  membership: { profile_id: string; task_id: string }[];
  spaces: JournalSpace[];
  by: TaskGrouping;
  /** One space id, `unfiled`, or null for every space (the phone's filter is single-choice). */
  space: string | null;
  /** Ticked a moment ago: still shown in their open group. */
  holding?: ReadonlySet<string>;
  now?: Date;
}

export interface TasksView {
  groups: TaskGroup<TaskWithTags, JournalSpace>[];
  done: TaskWithTags[];
  /** Open tasks shown (after the filter), counting the held ones. */
  openCount: number;
  /** Open tasks per space id and `unfiled`, before the filter (for the filter chips). */
  counts: Map<string, number>;
  /** Task id → its space ids. */
  membership: Map<string, string[]>;
  /** Tasks at all, before the filter. */
  total: number;
}

export const toTasksView = ({ tasks, membership: rows, spaces, by, space, holding, now = new Date() }: TasksViewInput): TasksView => {
  const membership = taskSpaceMap(rows);
  const filtered = filterTasksBySpace(tasks, membership, space ? [space] : []);
  // A held task sorts and groups as open; the row still shows it ticked.
  const held = holding?.size ? filtered.map((t) => (holding.has(t.id) && t.is_done ? { ...t, is_done: false } : t)) : filtered;
  const { open, done } = splitTasks(held);
  const byId = new Map(filtered.map((t) => [t.id, t]));
  const groups = groupTasks(open, { by, spaces, membership, now }).map((group) => ({
    ...group,
    tasks: group.tasks.map((t) => byId.get(t.id) ?? t),
  }));
  return {
    groups,
    done,
    openCount: open.length,
    counts: countOpenTasksBySpace(tasks, membership),
    membership,
    total: tasks.length,
  };
};

/** Open, overdue and due-today counts, for the Tasks button and the Spaces tab. */
export const taskTotals = (tasks: readonly TaskWithTags[], now = new Date()) => {
  const totals = { open: 0, overdue: 0, today: 0 };
  tasks.forEach((task) => {
    if (task.is_done) return;
    totals.open += 1;
    const bucket = dueBucket(task.due_date, now);
    if (bucket === 'overdue') totals.overdue += 1;
    else if (bucket === 'today') totals.today += 1;
  });
  return totals;
};

export interface DueOption {
  label: string;
  /** A `YYYY-MM-DD` day, null to clear, or 'pick' for the date sheet. */
  value: string | null | 'pick';
}

/**
 * The due-date menu (web: the Tasks row's ··· menu): Today, Tomorrow, Next
 * week (the coming Monday; core's dueShortcuts), Pick a date…, and No due
 * date when one is set. The day it already has is left out.
 */
export const dueOptions = (task: Pick<TaskWithTags, 'due_date'>, now = new Date()): DueOption[] => {
  const { today, tomorrow, nextWeek } = dueShortcuts(now);
  const current = dueDayKey(task.due_date);
  const options: DueOption[] = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: tomorrow },
    { label: 'Next week', value: nextWeek },
  ].filter((o) => o.value !== current);
  options.push({ label: 'Pick a date…', value: 'pick' });
  if (current) options.push({ label: 'No due date', value: null });
  return options;
};

export { UNFILED_TASKS };
