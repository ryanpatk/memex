import { describe, expect, it } from 'vitest';
import { at, link, note, task } from '../testing/fixtures';
import { linkToItem, noteToItem, taskToItem } from './items';
import {
  DEFAULT_SORT,
  formatSort,
  groupDateFor,
  isDefaultSort,
  itemSavedAt,
  itemSourceLabel,
  itemTitle,
  nextSort,
  parseSort,
  sortItems,
  sortLabel,
  SORT_OPTIONS,
} from './sort';

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe('parseSort / formatSort', () => {
  it('reads field:direction', () => {
    expect(parseSort('title:asc')).toEqual({ field: 'title', direction: 'asc' });
    expect(parseSort('saved:desc')).toEqual({ field: 'saved', direction: 'desc' });
  });

  it('gives a bare field its default direction', () => {
    expect(parseSort('saved')).toEqual({ field: 'saved', direction: 'desc' });
    expect(parseSort('source')).toEqual({ field: 'source', direction: 'asc' });
  });

  it('falls back to the default for missing or unknown values', () => {
    expect(parseSort(null)).toEqual(DEFAULT_SORT);
    expect(parseSort('')).toEqual(DEFAULT_SORT);
    expect(parseSort('colour:asc')).toEqual(DEFAULT_SORT);
    expect(parseSort('title:sideways')).toEqual({ field: 'title', direction: 'asc' });
  });

  it('formats the default as null so the param drops', () => {
    expect(formatSort(DEFAULT_SORT)).toBeNull();
    expect(formatSort({ field: 'updated', direction: 'asc' })).toBe('updated:asc');
    expect(formatSort({ field: 'title', direction: 'desc' })).toBe('title:desc');
  });

  it('round-trips every menu option', () => {
    SORT_OPTIONS.forEach((option) => {
      expect(parseSort(formatSort(option))).toEqual(option);
    });
  });

  it('knows the default', () => {
    expect(isDefaultSort({ field: 'updated', direction: 'desc' })).toBe(true);
    expect(isDefaultSort({ field: 'updated', direction: 'asc' })).toBe(false);
  });
});

describe('nextSort', () => {
  it('flips the same column', () => {
    expect(nextSort({ field: 'title', direction: 'asc' }, 'title')).toEqual({ field: 'title', direction: 'desc' });
    expect(nextSort({ field: 'title', direction: 'desc' }, 'title')).toEqual({ field: 'title', direction: 'asc' });
  });

  it('starts another column at its default direction', () => {
    expect(nextSort(DEFAULT_SORT, 'title')).toEqual({ field: 'title', direction: 'asc' });
    expect(nextSort({ field: 'title', direction: 'asc' }, 'saved')).toEqual({ field: 'saved', direction: 'desc' });
  });
});

describe('sortLabel', () => {
  it('names dates by recency and words by A–Z', () => {
    expect(sortLabel(DEFAULT_SORT)).toBe('Recently updated');
    expect(sortLabel({ field: 'saved', direction: 'asc' })).toBe('Oldest saved');
    expect(sortLabel({ field: 'title', direction: 'asc' })).toBe('Title A–Z');
    expect(sortLabel({ field: 'space', direction: 'desc' })).toBe('Space Z–A');
  });
});

describe('item accessors', () => {
  it('reads titles, saved dates and source labels', () => {
    const x = linkToItem(link('1', { url: 'https://x.com/a/status/1', title: 'A post', created_at: at(5) }));
    const n = noteToItem(note('2', { title: '', body: '# Plans\nmore', created_at: at(6) }));
    const t = taskToItem(task('3', { title: 'Call', created_at: at(7) }));
    expect(itemTitle(x)).toBe('A post');
    expect(itemTitle(n)).toBe('Plans');
    expect(itemTitle(t)).toBe('Call');
    expect(itemSavedAt(x)).toBe(at(5));
    expect(itemSavedAt(n)).toBe(at(6));
    expect(itemSavedAt(t)).toBe(at(7));
    expect(itemSourceLabel(x)).toBe('X');
    expect(itemSourceLabel(linkToItem(link('4', { url: 'https://www.example.org/x' })))).toBe('example.org');
    expect(itemSourceLabel(n)).toBeNull();
  });
});

describe('sortItems', () => {
  const a = linkToItem(
    link('a', { title: 'banana', url: 'https://youtube.com/watch?v=1', created_at: at(1), updated_at: at(30) }),
  );
  const b = noteToItem(note('b', { title: 'Apple', created_at: at(2), updated_at: at(10) }));
  const c = taskToItem(task('c', { title: 'cherry 10', created_at: at(3), updated_at: at(20) }));
  const d = taskToItem(task('d', { title: 'cherry 9', created_at: at(4), updated_at: at(20) }));
  const items = [a, b, c, d];

  it('defaults to recently updated, ties by key', () => {
    expect(keys(sortItems(items, DEFAULT_SORT))).toEqual(['link:a', 'task:c', 'task:d', 'note:b']);
  });

  it('sorts by saved date either way', () => {
    expect(keys(sortItems(items, { field: 'saved', direction: 'desc' }))).toEqual(['task:d', 'task:c', 'note:b', 'link:a']);
    expect(keys(sortItems(items, { field: 'saved', direction: 'asc' }))).toEqual(['link:a', 'note:b', 'task:c', 'task:d']);
  });

  it('sorts titles case-insensitively with natural numbers', () => {
    expect(keys(sortItems(items, { field: 'title', direction: 'asc' }))).toEqual(['note:b', 'link:a', 'task:d', 'task:c']);
    expect(keys(sortItems(items, { field: 'title', direction: 'desc' }))).toEqual(['task:c', 'task:d', 'link:a', 'note:b']);
  });

  it('sorts by type label', () => {
    expect(keys(sortItems(items, { field: 'type', direction: 'asc' }))).toEqual(['link:a', 'note:b', 'task:c', 'task:d']);
  });

  it('sinks items without a source in both directions', () => {
    const x = linkToItem(link('x', { url: 'https://x.com/p', updated_at: at(0) }));
    const asc = keys(sortItems([b, a, x], { field: 'source', direction: 'asc' }));
    const desc = keys(sortItems([b, a, x], { field: 'source', direction: 'desc' }));
    expect(asc).toEqual(['link:x', 'link:a', 'note:b']);
    expect(desc).toEqual(['link:a', 'link:x', 'note:b']);
  });

  it('sorts by the first space name and sinks unfiled', () => {
    const names: Record<string, string[]> = { 'link:a': ['Zoo', 'Garden'], 'note:b': ['Kitchen'] };
    const sorted = sortItems(items, { field: 'space', direction: 'asc' }, { spaceNamesOf: (key) => names[key] ?? [] });
    expect(keys(sorted)).toEqual(['link:a', 'note:b', 'task:c', 'task:d']);
  });

  it('returns a new array', () => {
    const input = [b, a];
    const output = sortItems(input, DEFAULT_SORT);
    expect(output).not.toBe(input);
    expect(keys(input)).toEqual(['note:b', 'link:a']);
  });
});

describe('groupDateFor', () => {
  it('groups date sorts on their date and nothing else', () => {
    const item = noteToItem(note('n', { created_at: at(1), updated_at: at(2) }));
    expect(groupDateFor(DEFAULT_SORT)?.(item)).toBe(at(2));
    expect(groupDateFor({ field: 'saved', direction: 'asc' })?.(item)).toBe(at(1));
    expect(groupDateFor({ field: 'title', direction: 'asc' })).toBeNull();
  });
});
