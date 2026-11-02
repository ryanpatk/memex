import { extractMentions, type ComposerSpace } from '../composer';
import { fromDayKey, toDayKey } from '../time';

/*
 * The Tasks view's model (ROADMAP.md Phase 1, “a real Tasks view”): open
 * tasks across every space, grouped by space or by due date, with a space
 * filter and a Done list. Plain TS, no React, so the Expo app can share it.
 *
 * Tasks are stored with `is_done`, an optional `due_date` (YYYY-MM-DD, a
 * local calendar day) and `order_index` (new tasks go to the top). Space
 * membership comes from the `profile_tasks` rows. There is no completed-at
 * column: a done task's `updated_at` stands in for when it was done.
 */

/** The fields of a task this module reads. */
export interface TaskLike {
  id: string;
  title: string;
  is_done: boolean;
  due_date?: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface TaskSpaceLike {
  id: string;
  name: string;
}

export type TaskGrouping = 'space' | 'date';

export const TASK_GROUPINGS: readonly TaskGrouping[] = ['space', 'date'];

/** The Space filter's value for tasks that are in no space (same word as the Library). */
export const UNFILED_TASKS = 'unfiled';

export const parseTaskGrouping = (value: string | null | undefined): TaskGrouping =>
  value === 'date' ? 'date' : 'space';

/* ------------------------------------------------------------------ */
/* Membership and filtering                                            */
/* ------------------------------------------------------------------ */

/** Task id → the ids of the spaces it's filed in. */
export const taskSpaceMap = (rows: readonly { profile_id: string; task_id: string }[]) => {
  const map = new Map<string, string[]>();
  rows.forEach(({ profile_id, task_id }) => {
    const list = map.get(task_id);
    if (!list) map.set(task_id, [profile_id]);
    else if (!list.includes(profile_id)) list.push(profile_id);
  });
  return map;
};

/**
 * Keep the tasks in any of `spaceIds` (`unfiled` = in no space). An empty
 * filter keeps everything, like every other memex filter.
 */
export const filterTasksBySpace = <T extends TaskLike>(
  tasks: readonly T[],
  membership: Map<string, string[]>,
  spaceIds: readonly string[],
): T[] => {
  if (spaceIds.length === 0) return [...tasks];
  const wanted = new Set(spaceIds);
  return tasks.filter((task) => {
    const filed = membership.get(task.id) ?? [];
    if (filed.length === 0) return wanted.has(UNFILED_TASKS);
    return filed.some((id) => wanted.has(id));
  });
};

/** Open tasks per space id (and `unfiled`), for the filter menu. A task in two spaces counts in both. */
export const countOpenTasksBySpace = (tasks: readonly TaskLike[], membership: Map<string, string[]>) => {
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  tasks.forEach((task) => {
    if (task.is_done) return;
    const filed = membership.get(task.id) ?? [];
    if (filed.length === 0) bump(UNFILED_TASKS);
    else filed.forEach(bump);
  });
  return counts;
};

/* ------------------------------------------------------------------ */
/* Due dates                                                           */
/* ------------------------------------------------------------------ */

/** A stored due date as its YYYY-MM-DD day key, or null (accepts full ISO strings too). */
export const dueDayKey = (due: string | null | undefined): string | null => {
  if (!due) return null;
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(due)?.[1];
  return day ?? null;
};

const daysBetween = (fromKey: string, toKey: string) =>
  Math.round((fromDayKey(toKey).getTime() - fromDayKey(fromKey).getTime()) / 86_400_000);

/** Whole days from today to the due date: 0 today, 1 tomorrow, negative when overdue. */
export const daysUntilDue = (due: string | null | undefined, now: Date = new Date()): number | null => {
  const key = dueDayKey(due);
  return key ? daysBetween(toDayKey(now), key) : null;
};

export const isOverdue = (task: Pick<TaskLike, 'is_done' | 'due_date'>, now: Date = new Date()) => {
  const days = daysUntilDue(task.due_date, now);
  return !task.is_done && days !== null && days < 0;
};

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** “Today”, “Tomorrow”, “Yesterday”, “Fri” (this coming week), “Nov 12”, “Jan 3, 2028”. */
export const dueLabel = (due: string | null | undefined, now: Date = new Date()): string | null => {
  const key = dueDayKey(due);
  if (!key) return null;
  const days = daysBetween(toDayKey(now), key);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  const date = fromDayKey(key);
  if (days > 1 && days < 7) return weekday.format(date);
  return date.getFullYear() === now.getFullYear() ? monthDay.format(date) : monthDayYear.format(date);
};

/** One-press due dates for the task menu, as YYYY-MM-DD. “Next week” is the coming Monday. */
export const dueShortcuts = (now: Date = new Date()) => {
  const at = (delta: number) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
    return toDayKey(date);
  };
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  return { today: at(0), tomorrow: at(1), nextWeek: at(toMonday) };
};

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

/**
 * Open tasks: dated ones first, soonest due first; then the rest in their
 * manual order (new tasks sit at the top), newest first on ties.
 */
export const compareOpenTasks = (a: TaskLike, b: TaskLike) => {
  const dueA = dueDayKey(a.due_date);
  const dueB = dueDayKey(b.due_date);
  if (dueA && dueB && dueA !== dueB) return dueA < dueB ? -1 : 1;
  if (dueA && !dueB) return -1;
  if (!dueA && dueB) return 1;
  if (a.order_index !== b.order_index) return a.order_index - b.order_index;
  return b.created_at.localeCompare(a.created_at);
};

/** Done tasks: most recently done first (`updated_at` stands in for done-at). */
export const compareDoneTasks = (a: TaskLike, b: TaskLike) => b.updated_at.localeCompare(a.updated_at);

/** Split into open (sorted for the list) and done (most recent first). */
export const splitTasks = <T extends TaskLike>(tasks: readonly T[]) => ({
  open: tasks.filter((task) => !task.is_done).sort(compareOpenTasks),
  done: tasks.filter((task) => task.is_done).sort(compareDoneTasks),
});

/* ------------------------------------------------------------------ */
/* Grouping                                                            */
/* ------------------------------------------------------------------ */

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'Next 7 days',
  later: 'Later',
  none: 'No due date',
};

const DUE_ORDER: DueBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none'];

export const dueBucket = (due: string | null | undefined, now: Date = new Date()): DueBucket => {
  const days = daysUntilDue(due, now);
  if (days === null) return 'none';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return 'week';
  return 'later';
};

export interface TaskGroup<T, S extends TaskSpaceLike = TaskSpaceLike> {
  /** Stable key: a space id, `unfiled`, or a due bucket. */
  key: string;
  label: string;
  /** Set when grouping by space (absent for Unfiled). */
  space?: S;
  /** Set when grouping by date. */
  bucket?: DueBucket;
  tasks: T[];
}

/**
 * Group open tasks (already sorted) for the list. By space: one group per
 * space in the spaces' order, then Unfiled; a task filed in several spaces
 * shows once, under the first of them (its other spaces show as chips). By
 * date: Overdue, Today, Tomorrow, Next 7 days, Later, No due date. Empty
 * groups are left out; order inside a group is kept.
 */
export const groupTasks = <T extends TaskLike, S extends TaskSpaceLike>(
  tasks: readonly T[],
  options: {
    by: TaskGrouping;
    spaces: readonly S[];
    membership: Map<string, string[]>;
    now?: Date;
  },
): TaskGroup<T, S>[] => {
  const { by, spaces, membership, now = new Date() } = options;

  if (by === 'date') {
    const buckets = new Map<DueBucket, T[]>();
    tasks.forEach((task) => {
      const bucket = dueBucket(task.due_date, now);
      const list = buckets.get(bucket);
      if (list) list.push(task);
      else buckets.set(bucket, [task]);
    });
    return DUE_ORDER.filter((bucket) => buckets.has(bucket)).map((bucket) => ({
      key: bucket,
      label: DUE_BUCKET_LABELS[bucket],
      bucket,
      tasks: buckets.get(bucket)!,
    }));
  }

  const rank = new Map(spaces.map((space, index) => [space.id, index]));
  const bySpace = new Map<string, T[]>();
  tasks.forEach((task) => {
    const filed = (membership.get(task.id) ?? []).filter((id) => rank.has(id));
    const home = filed.length ? filed.reduce((a, b) => (rank.get(a)! <= rank.get(b)! ? a : b)) : UNFILED_TASKS;
    const list = bySpace.get(home);
    if (list) list.push(task);
    else bySpace.set(home, [task]);
  });
  const groups: TaskGroup<T, S>[] = spaces
    .filter((space) => bySpace.has(space.id))
    .map((space) => ({ key: space.id, label: space.name, space, tasks: bySpace.get(space.id)! }));
  if (bySpace.has(UNFILED_TASKS)) {
    groups.push({ key: UNFILED_TASKS, label: 'Unfiled', tasks: bySpace.get(UNFILED_TASKS)! });
  }
  return groups;
};

/* ------------------------------------------------------------------ */
/* Inline add                                                          */
/* ------------------------------------------------------------------ */

export interface ParsedTaskInput<S extends ComposerSpace = ComposerSpace> {
  title: string;
  spaces: S[];
}

/**
 * The Tasks view's add field, on the Journal composer's syntax: `@Space`
 * files the task (composer.ts `extractMentions`), and a leading “[] ” is
 * accepted but not needed (everything typed here is a task). Null when
 * there's no title left. Titles are one line, up to 200 characters, like
 * the composer's tasks.
 */
export const parseTaskInput = <S extends ComposerSpace>(raw: string, spaces: readonly S[]): ParsedTaskInput<S> | null => {
  const { text, spaces: filed } = extractMentions(raw, [...spaces]);
  const title = text
    .replace(/^\[\s?\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  if (!title) return null;
  return { title, spaces: filed as S[] };
};
