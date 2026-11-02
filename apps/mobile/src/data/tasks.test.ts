import { describe, expect, it } from 'vitest';
import { toDayKey } from '@memex/core';
import { buildDemoData } from './fixtures/demoData';
import { toJournal } from './journal';
import { dueOptions, taskTotals, toTasksView } from './tasks';

const NOW = new Date(2026, 10, 1, 12, 0);
const journal = toJournal(buildDemoData(NOW), '#5077ff', NOW);
const base = { tasks: journal.tasks, membership: journal.taskMembership, spaces: journal.spaces, now: NOW };
const titles = (tasks: { title: string }[]) => tasks.map((t) => t.title);

describe('toTasksView (core’s Tasks model over the Journal’s rows)', () => {
  it('groups open tasks by space in sidebar order, then Unfiled; done apart', () => {
    const view = toTasksView({ ...base, by: 'space', space: null });
    expect(view.groups.map((g) => g.label)).toEqual(['Studio', 'Kyoto trip', 'Home', 'Unfiled']);
    // Dated first, soonest due first, then manual order.
    expect(titles(view.groups[0].tasks)).toEqual(['Write the case study intro', 'Sketch the share sheet flow']);
    expect(titles(view.done)).toEqual(['Send the deposit for the hallway paint', 'Book the ryokan in Arashiyama']);
    expect(view.openCount).toBe(6);
    expect(view.total).toBe(8);
    expect(view.counts.get('unfiled')).toBe(1);
  });

  it('groups by due date', () => {
    const view = toTasksView({ ...base, by: 'date', space: null });
    expect(view.groups.map((g) => [g.label, g.tasks.length])).toEqual([
      ['Overdue', 1],
      ['Today', 1],
      ['Tomorrow', 1],
      ['Next 7 days', 1],
      ['Later', 1],
      ['No due date', 1],
    ]);
  });

  it('filters to one space or to Unfiled, keeping the counts for every space', () => {
    const kyoto = toTasksView({ ...base, by: 'space', space: 'kyoto' });
    expect(kyoto.groups.map((g) => g.label)).toEqual(['Kyoto trip']);
    expect(titles(kyoto.done)).toEqual(['Book the ryokan in Arashiyama']);
    expect(kyoto.counts.get('studio')).toBe(2);
    const unfiled = toTasksView({ ...base, by: 'space', space: 'unfiled' });
    expect(titles(unfiled.groups.flatMap((g) => g.tasks))).toEqual(['Return the library books']);
  });

  it('keeps a task that was just ticked in its group, ticked, until it’s released', () => {
    const tasks = journal.tasks.map((t) => (t.id === 't3' ? { ...t, is_done: true, updated_at: NOW.toISOString() } : t));
    const held = toTasksView({ ...base, tasks, by: 'space', space: null, holding: new Set(['t3']) });
    const kyoto = held.groups.find((g) => g.key === 'kyoto')!;
    expect(kyoto.tasks.find((t) => t.id === 't3')?.is_done).toBe(true);
    expect(held.done.some((t) => t.id === 't3')).toBe(false);
    const released = toTasksView({ ...base, tasks, by: 'space', space: null });
    expect(released.done[0].id).toBe('t3');
  });
});

describe('taskTotals', () => {
  it('counts open, overdue and due today', () => {
    expect(taskTotals(journal.tasks, NOW)).toEqual({ open: 6, overdue: 1, today: 1 });
    expect(taskTotals([], NOW)).toEqual({ open: 0, overdue: 0, today: 0 });
    expect(toDayKey(NOW)).toBe('2026-11-01');
  });
});

describe('dueOptions', () => {
  it('offers Today, Tomorrow, Next week (Monday) and a picker; clearing only when set', () => {
    // 2026-11-01 is a Sunday: next week is Monday the 2nd, same as tomorrow.
    expect(dueOptions({ due_date: undefined }, NOW)).toEqual([
      { label: 'Today', value: '2026-11-01' },
      { label: 'Tomorrow', value: '2026-11-02' },
      { label: 'Next week', value: '2026-11-02' },
      { label: 'Pick a date…', value: 'pick' },
    ]);
    const set = dueOptions({ due_date: '2026-11-01' }, NOW);
    expect(set.map((o) => o.label)).toEqual(['Tomorrow', 'Next week', 'Pick a date…', 'No due date']);
    expect(set.at(-1)?.value).toBeNull();
  });
});
