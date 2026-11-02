import { describe, expect, it } from 'vitest';
import { at, space, task } from '../testing/fixtures';
import {
  compareOpenTasks,
  countOpenTasksBySpace,
  daysUntilDue,
  dueBucket,
  dueDayKey,
  dueLabel,
  dueShortcuts,
  filterTasksBySpace,
  groupTasks,
  isOverdue,
  parseTaskGrouping,
  parseTaskInput,
  splitTasks,
  taskSpaceMap,
  UNFILED_TASKS,
} from './tasks';

// Local dates throughout: due dates are calendar days, read in local time.
const NOW = new Date(2026, 10, 4, 15, 30); // Wed 4 Nov 2026, 15:30
const ids = (list: { id: string }[]) => list.map((t) => t.id);

const kitchen = space('sp-k', 'Kitchen');
const kyoto = space('sp-y', 'Kyoto');
const spaces = [kitchen, kyoto];

describe('parseTaskGrouping', () => {
  it('defaults to space and accepts date', () => {
    expect(parseTaskGrouping(null)).toBe('space');
    expect(parseTaskGrouping('nonsense')).toBe('space');
    expect(parseTaskGrouping('date')).toBe('date');
  });
});

describe('membership and the space filter', () => {
  const membership = taskSpaceMap([
    { profile_id: 'sp-k', task_id: 'a' },
    { profile_id: 'sp-y', task_id: 'a' },
    { profile_id: 'sp-k', task_id: 'a' }, // duplicate row
    { profile_id: 'sp-y', task_id: 'b' },
  ]);
  const tasks = [task('a'), task('b'), task('c')];

  it('maps each task to its spaces without duplicates', () => {
    expect(membership.get('a')).toEqual(['sp-k', 'sp-y']);
    expect(membership.get('c')).toBeUndefined();
  });

  it('keeps everything when the filter is empty', () => {
    expect(ids(filterTasksBySpace(tasks, membership, []))).toEqual(['a', 'b', 'c']);
  });

  it('keeps tasks in any chosen space', () => {
    expect(ids(filterTasksBySpace(tasks, membership, ['sp-y']))).toEqual(['a', 'b']);
    expect(ids(filterTasksBySpace(tasks, membership, ['sp-k']))).toEqual(['a']);
  });

  it('treats unfiled as tasks in no space', () => {
    expect(ids(filterTasksBySpace(tasks, membership, [UNFILED_TASKS]))).toEqual(['c']);
    expect(ids(filterTasksBySpace(tasks, membership, [UNFILED_TASKS, 'sp-k']))).toEqual(['a', 'c']);
  });

  it('counts open tasks per space, a multi-space task in each', () => {
    const counts = countOpenTasksBySpace([...tasks, task('d', { is_done: true })], membership);
    expect(Object.fromEntries(counts)).toEqual({ 'sp-k': 1, 'sp-y': 2, unfiled: 1 });
  });
});

describe('due dates', () => {
  it('reads day keys from dates and timestamps', () => {
    expect(dueDayKey('2026-11-05')).toBe('2026-11-05');
    expect(dueDayKey('2026-11-05T00:00:00')).toBe('2026-11-05');
    expect(dueDayKey(null)).toBeNull();
    expect(dueDayKey('')).toBeNull();
  });

  it('counts whole calendar days, whatever the time of day', () => {
    expect(daysUntilDue('2026-11-04', NOW)).toBe(0);
    expect(daysUntilDue('2026-11-05', NOW)).toBe(1);
    expect(daysUntilDue('2026-11-01', NOW)).toBe(-3);
    expect(daysUntilDue('2026-11-05', new Date(2026, 10, 4, 23, 59))).toBe(1);
    expect(daysUntilDue(undefined, NOW)).toBeNull();
  });

  it('crosses daylight-saving changes cleanly', () => {
    expect(daysUntilDue('2026-11-02', new Date(2026, 9, 31, 12))).toBe(2);
    expect(daysUntilDue('2026-03-09', new Date(2026, 2, 7, 12))).toBe(2);
  });

  it('flags overdue open tasks only', () => {
    expect(isOverdue({ is_done: false, due_date: '2026-11-03' }, NOW)).toBe(true);
    expect(isOverdue({ is_done: true, due_date: '2026-11-03' }, NOW)).toBe(false);
    expect(isOverdue({ is_done: false, due_date: '2026-11-04' }, NOW)).toBe(false);
    expect(isOverdue({ is_done: false }, NOW)).toBe(false);
  });

  it('labels near days in words and far ones as dates', () => {
    expect(dueLabel('2026-11-04', NOW)).toBe('Today');
    expect(dueLabel('2026-11-05', NOW)).toBe('Tomorrow');
    expect(dueLabel('2026-11-03', NOW)).toBe('Yesterday');
    expect(dueLabel('2026-11-07', NOW)).toBe(new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2026, 10, 7)));
    expect(dueLabel('2026-11-20', NOW)).toBe(new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(2026, 10, 20)));
    expect(dueLabel('2027-01-03', NOW)).toContain('2027');
    expect(dueLabel(null, NOW)).toBeNull();
  });

  it('offers today, tomorrow and the coming Monday', () => {
    expect(dueShortcuts(NOW)).toEqual({ today: '2026-11-04', tomorrow: '2026-11-05', nextWeek: '2026-11-09' });
    // On a Monday, next week is the Monday after
    expect(dueShortcuts(new Date(2026, 10, 9, 9)).nextWeek).toBe('2026-11-16');
    // Month and year roll over
    expect(dueShortcuts(new Date(2026, 11, 31, 9)).tomorrow).toBe('2027-01-01');
  });

  it('buckets due dates', () => {
    expect(dueBucket('2026-10-30', NOW)).toBe('overdue');
    expect(dueBucket('2026-11-04', NOW)).toBe('today');
    expect(dueBucket('2026-11-05', NOW)).toBe('tomorrow');
    expect(dueBucket('2026-11-10', NOW)).toBe('week');
    expect(dueBucket('2026-11-11', NOW)).toBe('later');
    expect(dueBucket(undefined, NOW)).toBe('none');
  });
});

describe('sorting', () => {
  it('puts dated tasks first, soonest first, then manual order, then newest', () => {
    const list = [
      task('plain-2', { order_index: 2 }),
      task('due-late', { due_date: '2026-11-20', order_index: -5 }),
      task('plain-1a', { order_index: 1, created_at: at(0) }),
      task('due-soon', { due_date: '2026-11-05', order_index: 9 }),
      task('plain-1b', { order_index: 1, created_at: at(10) }),
    ];
    expect(ids([...list].sort(compareOpenTasks))).toEqual(['due-soon', 'due-late', 'plain-1b', 'plain-1a', 'plain-2']);
  });

  it('splits open from done, done most recent first', () => {
    const { open, done } = splitTasks([
      task('o1', { order_index: 1 }),
      task('d-old', { is_done: true, updated_at: at(0) }),
      task('o0', { order_index: 0 }),
      task('d-new', { is_done: true, updated_at: at(60) }),
    ]);
    expect(ids(open)).toEqual(['o0', 'o1']);
    expect(ids(done)).toEqual(['d-new', 'd-old']);
  });
});

describe('groupTasks', () => {
  const membership = taskSpaceMap([
    { profile_id: 'sp-y', task_id: 'both' },
    { profile_id: 'sp-k', task_id: 'both' },
    { profile_id: 'sp-y', task_id: 'kyoto' },
    { profile_id: 'sp-gone', task_id: 'ghost' },
  ]);
  const list = [task('loose'), task('both'), task('kyoto'), task('ghost')];

  it('groups by space in the spaces’ order, Unfiled last', () => {
    const groups = groupTasks(list, { by: 'space', spaces, membership, now: NOW });
    expect(groups.map((g) => [g.key, g.label, ids(g.tasks)])).toEqual([
      ['sp-k', 'Kitchen', ['both']],
      ['sp-y', 'Kyoto', ['kyoto']],
      [UNFILED_TASKS, 'Unfiled', ['loose', 'ghost']],
    ]);
    expect(groups[0].space).toBe(kitchen);
    expect(groups[2].space).toBeUndefined();
  });

  it('leaves out empty groups', () => {
    expect(groupTasks([task('kyoto')], { by: 'space', spaces, membership, now: NOW }).map((g) => g.key)).toEqual(['sp-y']);
    expect(groupTasks([], { by: 'space', spaces, membership, now: NOW })).toEqual([]);
  });

  it('groups by due date in time order, keeping order inside a group', () => {
    const dated = [
      task('later', { due_date: '2026-12-01' }),
      task('none-1'),
      task('today', { due_date: '2026-11-04' }),
      task('late', { due_date: '2026-11-01' }),
      task('none-2'),
      task('week', { due_date: '2026-11-08' }),
      task('tomorrow', { due_date: '2026-11-05' }),
    ];
    const groups = groupTasks(dated, { by: 'date', spaces, membership, now: NOW });
    expect(groups.map((g) => [g.label, ids(g.tasks)])).toEqual([
      ['Overdue', ['late']],
      ['Today', ['today']],
      ['Tomorrow', ['tomorrow']],
      ['Next 7 days', ['week']],
      ['Later', ['later']],
      ['No due date', ['none-1', 'none-2']],
    ]);
    expect(groups[0].bucket).toBe('overdue');
  });
});

describe('parseTaskInput', () => {
  it('takes plain text as the title', () => {
    expect(parseTaskInput('  buy   milk ', spaces)).toEqual({ title: 'buy milk', spaces: [] });
  });

  it('accepts the composer’s task prefix', () => {
    expect(parseTaskInput('[] buy milk', spaces)?.title).toBe('buy milk');
    expect(parseTaskInput('[ ] buy milk', spaces)?.title).toBe('buy milk');
  });

  it('files with @Space like the composer', () => {
    expect(parseTaskInput('book flights @Kyoto', spaces)).toEqual({ title: 'book flights', spaces: [kyoto] });
    expect(parseTaskInput('[] @kitchen order tiles @Kyoto', spaces)).toEqual({
      title: 'order tiles',
      spaces: [kitchen, kyoto],
    });
  });

  it('keeps an @word that is not a space', () => {
    expect(parseTaskInput('email @dana', spaces)?.title).toBe('email @dana');
  });

  it('returns null when nothing is left to do', () => {
    expect(parseTaskInput('   ', spaces)).toBeNull();
    expect(parseTaskInput('[] ', spaces)).toBeNull();
    expect(parseTaskInput('@Kyoto', spaces)).toBeNull();
  });

  it('caps titles at 200 characters on one line', () => {
    const parsed = parseTaskInput(`line one\nline two ${'x'.repeat(300)}`, spaces);
    expect(parsed?.title.startsWith('line one line two')).toBe(true);
    expect(parsed?.title).toHaveLength(200);
  });
});
