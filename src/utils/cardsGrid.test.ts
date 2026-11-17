import { describe, expect, it } from 'vitest';
import { gridShowsJots, interleaveNewestFirst, jotMatches, toggleShownType } from './cardsGrid';
import { jotCardHeight, linesFor, pictureCardHeight, taskCardHeight } from './memoryCardEstimates';

describe('interleaveNewestFirst', () => {
  it('weaves two newest-first lists into one', () => {
    const items = [
      { key: 'link:1', at: '2026-11-16T10:00:00Z' },
      { key: 'note:2', at: '2026-11-14T10:00:00Z' },
    ];
    const jots = [
      { key: 'jot:a', at: '2026-11-15T10:00:00Z' },
      { key: 'jot:b', at: '2026-11-13T10:00:00Z' },
    ];
    expect(interleaveNewestFirst(items, jots)).toEqual(['link:1', 'jot:a', 'note:2', 'jot:b']);
  });

  it('copes with an empty side', () => {
    expect(interleaveNewestFirst([], [{ key: 'jot:a', at: '1' }])).toEqual(['jot:a']);
    expect(interleaveNewestFirst([{ key: 'x', at: '1' }], [])).toEqual(['x']);
  });
});

describe('gridShowsJots', () => {
  const base = { types: [], sources: [], tagIds: [], untagged: false, sortField: 'updated', sortDirection: 'desc' as const };
  it('shows jots in the default, unfiltered date order', () => {
    expect(gridShowsJots(base)).toBe(true);
    expect(gridShowsJots({ ...base, sortField: 'saved' })).toBe(true);
  });
  it('leaves them out of filtered or re-sorted views', () => {
    expect(gridShowsJots({ ...base, types: ['link'] })).toBe(false);
    expect(gridShowsJots({ ...base, sources: ['x'] })).toBe(false);
    expect(gridShowsJots({ ...base, sortField: 'title' })).toBe(false);
    expect(gridShowsJots({ ...base, sortDirection: 'asc' })).toBe(false);
  });
});

describe('jotMatches', () => {
  const jot = { body: 'Brass pulls, not black.', profile_id: 'kitchen' };
  it('follows the Space filter, including Unfiled', () => {
    expect(jotMatches(jot, [], '')).toBe(true);
    expect(jotMatches(jot, ['kitchen'], '')).toBe(true);
    expect(jotMatches(jot, ['kyoto'], '')).toBe(false);
    expect(jotMatches({ ...jot, profile_id: null }, ['unfiled'], '')).toBe(true);
  });
  it('matches the search, ignoring case', () => {
    expect(jotMatches(jot, [], 'BRASS')).toBe(true);
    expect(jotMatches(jot, [], 'copper')).toBe(false);
  });
});

describe('memory card estimates', () => {
  it('wraps more lines in narrower cards, within the clamp', () => {
    expect(linesFor(80, 300, 13.6, 4)).toBeGreaterThan(linesFor(80, 600, 13.6, 4));
    expect(linesFor(10000, 300, 13.6, 4)).toBe(4);
    expect(linesFor(0, 300, 13.6, 4)).toBe(1);
  });
  it('gives every card at least its label strip and padding', () => {
    expect(jotCardHeight(400, 5)).toBeGreaterThan(44 + 48);
    expect(taskCardHeight(400, 5, true)).toBeGreaterThan(taskCardHeight(400, 5, false) - 1);
    expect(pictureCardHeight(400, 1, 20)).toBeGreaterThan(pictureCardHeight(400, 0.5, 20));
  });
});

describe('toggleShownType', () => {
  const all = ['link', 'note', 'task'] as const;
  it('unticking one from all leaves the other two', () => {
    expect(toggleShownType(all, [], 'link')).toEqual(['note', 'task']);
  });
  it('ticking the last one back means all again', () => {
    expect(toggleShownType(all, ['note', 'task'], 'link')).toEqual([]);
  });
  it('unticking the only one means all again', () => {
    expect(toggleShownType(all, ['note'], 'note')).toEqual([]);
  });
});
