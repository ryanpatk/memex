import { describe, expect, it } from 'vitest';
import { at, jot, link, note, space, task } from '../testing/fixtures';
import { parseComposer } from '../composer';
import { buildEntries, entriesInSpace, toParts } from './feed';
import { isPinnedInSpace, spaceBoard, withDefaultSpace } from './space';

const kitchen = space('k', 'Kitchen reno');
const kyoto = space('y', 'Kyoto trip');
const spaces = [kitchen, kyoto];

const entries = buildEntries({
  jots: [
    jot('j-home', { created_at: at(1) }),
    jot('j-kitchen', { profile_id: 'k', created_at: at(2) }),
    jot('j-kyoto', { profile_id: 'y', created_at: at(3) }),
  ],
  links: [
    link('l-old', { title: 'Zellige tiles', created_at: at(10) }),
    link('l-new', { title: 'Oak shelving', created_at: at(40) }),
    link('l-both', { title: 'Brass inlay', created_at: at(20) }),
    link('l-unfiled', { created_at: at(30) }),
  ],
  notes: [
    note('n-stale', { title: 'Measurements', created_at: at(5), updated_at: at(5) }),
    note('n-fresh', { title: 'Quotes', created_at: at(4), updated_at: at(90) }),
  ],
  tasks: [
    task('t-later', { order_index: 2, created_at: at(6) }),
    task('t-due', { order_index: 5, due_date: '2026-10-25', created_at: at(7) }),
    task('t-first', { order_index: 1, created_at: at(8) }),
    task('t-done-old', { is_done: true, updated_at: at(50) }),
    task('t-done-new', { is_done: true, updated_at: at(60) }),
    task('t-elsewhere', { created_at: at(9) }),
  ],
  spaces,
  membership: {
    links: [
      { link_id: 'l-old', profile_id: 'k' },
      { link_id: 'l-new', profile_id: 'k' },
      { link_id: 'l-both', profile_id: 'k' },
      { link_id: 'l-both', profile_id: 'y' },
    ],
    notes: [
      { note_id: 'n-stale', profile_id: 'k' },
      { note_id: 'n-fresh', profile_id: 'k' },
    ],
    tasks: [
      { task_id: 't-later', profile_id: 'k' },
      { task_id: 't-due', profile_id: 'k' },
      { task_id: 't-first', profile_id: 'k' },
      { task_id: 't-done-old', profile_id: 'k' },
      { task_id: 't-done-new', profile_id: 'k' },
      { task_id: 't-elsewhere', profile_id: 'y' },
    ],
  },
});

describe('the scoped feed', () => {
  it('holds only what was written or filed in the space, oldest first', () => {
    const ids = entriesInSpace(entries, 'k').map((e) => e.id);
    expect(ids).not.toContain('jot:j-home');
    expect(ids).not.toContain('jot:j-kyoto');
    expect(ids).not.toContain('link:l-unfiled');
    expect(ids).not.toContain('task:t-elsewhere');
    expect(ids).toContain('jot:j-kitchen');
    expect(ids).toContain('link:l-both');
    const times = entriesInSpace(entries, 'k').map((e) => e.at);
    expect([...times].sort()).toEqual(times);
  });

  it('shares an item filed in two spaces between both feeds', () => {
    expect(entriesInSpace(entries, 'y').map((e) => e.id)).toEqual(['jot:j-kyoto', 'task:t-elsewhere', 'link:l-both']);
  });

  it('shapes into the same feed parts as the Journal', () => {
    const parts = toParts(entriesInSpace(entries, 'y'));
    expect(parts[0].kind).toBe('day');
    expect(parts.filter((p) => p.kind !== 'day')).toHaveLength(3);
  });
});

describe('withDefaultSpace', () => {
  it('files a plain jot, link, task or note in the space', () => {
    expect(withDefaultSpace(parseComposer('tile samples came', spaces), kitchen).spaces).toEqual([kitchen]);
    expect(withDefaultSpace(parseComposer('https://example.com/tile', spaces), kitchen)).toMatchObject({
      kind: 'link',
      spaces: [kitchen],
    });
    expect(withDefaultSpace(parseComposer('[] call the plasterer', spaces), kitchen)).toMatchObject({
      kind: 'task',
      title: 'call the plasterer',
      spaces: [kitchen],
    });
    expect(withDefaultSpace(parseComposer('Quotes\nthree so far', spaces, true), kitchen)).toMatchObject({
      kind: 'note',
      spaces: [kitchen],
    });
  });

  it('lets an explicit @Other win instead of adding to it', () => {
    const result = withDefaultSpace(parseComposer('book the ryokan @Kyoto trip', spaces), kitchen);
    expect(result).toMatchObject({ kind: 'jot', body: 'book the ryokan', spaces: [kyoto] });
  });

  it('keeps an explicit mention of the space itself once', () => {
    expect(withDefaultSpace(parseComposer('@Kitchen reno grout colour', spaces), kitchen).spaces).toEqual([kitchen]);
  });

  it('leaves the result alone without a space (the home Journal)', () => {
    const parsed = parseComposer('just a thought', spaces);
    expect(withDefaultSpace(parsed, undefined)).toBe(parsed);
    expect(withDefaultSpace(parsed, null).spaces).toEqual([]);
  });

  it('still reports empty text as empty, with the space for the hint', () => {
    expect(withDefaultSpace(parseComposer('   ', spaces), kitchen)).toEqual({ kind: 'empty', spaces: [kitchen] });
  });
});

describe('spaceBoard', () => {
  const membership = [
    { profile_id: 'k', link_id: 'l-new', is_super_favorite: true },
    { profile_id: 'k', link_id: 'l-old', is_super_favorite: true },
    { profile_id: 'k', link_id: 'l-both', is_super_favorite: false },
    { profile_id: 'y', link_id: 'l-both', is_super_favorite: true },
  ];

  it('pins only what is pinned in this space, by name', () => {
    const board = spaceBoard(entries, 'k', membership);
    expect(board.pinned.map((l) => l.id)).toEqual(['l-new', 'l-old']);
    expect(spaceBoard(entries, 'y', membership).pinned.map((l) => l.id)).toEqual(['l-both']);
  });

  it('lists open tasks in the Tasks view order and done tasks newest first', () => {
    const board = spaceBoard(entries, 'k', membership);
    expect(board.openTasks.map((t) => t.id)).toEqual(['t-due', 't-first', 't-later']);
    expect(board.doneTasks.map((t) => t.id)).toEqual(['t-done-new', 't-done-old']);
  });

  it('lists saves newest first and notes by last edit', () => {
    const board = spaceBoard(entries, 'k', membership);
    expect(board.saves.map((l) => l.id)).toEqual(['l-new', 'l-both', 'l-old']);
    expect(board.notes.map((n) => n.id)).toEqual(['n-fresh', 'n-stale']);
  });

  it('counts jots and every entry in the space', () => {
    const board = spaceBoard(entries, 'k', membership);
    expect(board.jotCount).toBe(1);
    expect(board.total).toBe(1 + 3 + 2 + 5);
  });

  it('is empty for a new space, and pins nothing without membership rows', () => {
    expect(spaceBoard(entries, 'new')).toEqual({
      pinned: [],
      openTasks: [],
      doneTasks: [],
      saves: [],
      notes: [],
      jotCount: 0,
      total: 0,
    });
    expect(spaceBoard(entries, 'k').pinned).toEqual([]);
  });

  it('never pins an optimistic link', () => {
    const withTemp = buildEntries({
      jots: [],
      links: [link('temp-1')],
      notes: [],
      tasks: [],
      spaces,
      membership: { links: [{ link_id: 'temp-1', profile_id: 'k' }], notes: [], tasks: [] },
    });
    expect(spaceBoard(withTemp, 'k', [{ profile_id: 'k', link_id: 'temp-1', is_super_favorite: true }]).pinned).toEqual([]);
  });
});

describe('isPinnedInSpace', () => {
  it('reads the per-space pin', () => {
    const rows = [{ profile_id: 'k', link_id: 'a', is_super_favorite: true }, { profile_id: 'y', link_id: 'b' }];
    expect(isPinnedInSpace(rows, 'k', 'a')).toBe(true);
    expect(isPinnedInSpace(rows, 'y', 'a')).toBe(false);
    expect(isPinnedInSpace(rows, 'y', 'b')).toBe(false);
  });
});
