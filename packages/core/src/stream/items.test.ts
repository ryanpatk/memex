import { describe, expect, it } from 'vitest';
import { link, note, tag, task } from '../testing/fixtures';
import {
  buildStreamItems,
  byUpdatedDesc,
  isPendingItem,
  itemKey,
  itemMatchesSearch,
  linkToItem,
  mergeTags,
  noteToItem,
  parseItemKey,
  taskToItem,
} from './items';

const red = tag('r', 'red');
const blue = tag('b', 'blue');

describe('item keys', () => {
  it('round-trips type and id', () => {
    expect(itemKey('link', 'abc')).toBe('link:abc');
    expect(parseItemKey('note:abc')).toEqual({ type: 'note', id: 'abc' });
  });

  it('keeps colons inside the id', () => {
    expect(parseItemKey('task:a:b')).toEqual({ type: 'task', id: 'a:b' });
  });
});

describe('mergeTags', () => {
  it('merges legacy, join and direct tags without duplicates', () => {
    expect(mergeTags([{ tag: red }, {}, { tag: blue }], [red], red).map((t) => t.id)).toEqual(['r', 'b']);
  });

  it('is empty with nothing to merge', () => {
    expect(mergeTags(undefined, undefined)).toEqual([]);
  });
});

describe('to items', () => {
  it('normalizes a link and writes the merged tags back onto it', () => {
    const item = linkToItem(link('l', { tag: red, link_tags: [{ id: 'x', link_id: 'l', tag_id: 'b', created_at: '', tag: blue }], updated_at: 'U' }));
    expect(item).toMatchObject({ type: 'link', id: 'l', key: 'link:l', updatedAt: 'U' });
    expect(item.tags.map((t) => t.id)).toEqual(['r', 'b']);
    expect(item.type === 'link' && item.link.tags).toEqual(item.tags);
  });

  it('normalizes notes and tasks from their join rows', () => {
    expect(noteToItem(note('n', { note_tags: [{ id: 'x', note_id: 'n', tag_id: 'r', created_at: '', tag: red }] })).tags).toEqual([red]);
    expect(taskToItem(task('t', { tags: [blue] })).tags).toEqual([blue]);
  });

  it('builds links, then notes, then tasks, tolerating missing lists', () => {
    expect(buildStreamItems([link('l')], undefined, [task('t')]).map((i) => i.key)).toEqual(['link:l', 'task:t']);
    expect(buildStreamItems(undefined, undefined, undefined)).toEqual([]);
  });
});

describe('isPendingItem', () => {
  it('spots optimistic temp ids', () => {
    expect(isPendingItem(noteToItem(note('temp-123')))).toBe(true);
    expect(isPendingItem(noteToItem(note('123')))).toBe(false);
  });
});

describe('itemMatchesSearch', () => {
  const l = linkToItem(link('l', { url: 'https://github.com/memex', title: 'Memex repo', description: 'Source code' }));
  const n = noteToItem(note('n', { title: 'Ideas', body: '## Big **bold** plan' }));
  const t = taskToItem(task('t', { title: 'Ship it', detail: 'Before Friday' }));

  it('matches everything for an empty or blank query', () => {
    expect(itemMatchesSearch(l, '')).toBe(true);
    expect(itemMatchesSearch(n, '   ')).toBe(true);
  });

  it('searches link url, title and description, case-insensitively', () => {
    expect(itemMatchesSearch(l, 'GITHUB')).toBe(true);
    expect(itemMatchesSearch(l, 'repo')).toBe(true);
    expect(itemMatchesSearch(l, 'source')).toBe(true);
    expect(itemMatchesSearch(l, 'gitlab')).toBe(false);
  });

  it('searches note title and the body without markdown', () => {
    expect(itemMatchesSearch(n, 'ideas')).toBe(true);
    expect(itemMatchesSearch(n, 'big bold plan')).toBe(true);
    expect(itemMatchesSearch(n, '**')).toBe(false);
  });

  it('searches task title and detail', () => {
    expect(itemMatchesSearch(t, 'friday')).toBe(true);
    expect(itemMatchesSearch(t, 'ship')).toBe(true);
  });

  it('trims the query', () => {
    expect(itemMatchesSearch(t, '  ship  ')).toBe(true);
  });
});

describe('byUpdatedDesc', () => {
  it('sorts most recently updated first and keeps ties stable', () => {
    const items = [
      noteToItem(note('a', { updated_at: '2026-01-01' })),
      noteToItem(note('b', { updated_at: '2026-03-01' })),
      noteToItem(note('c', { updated_at: '2026-01-01' })),
    ];
    expect([...items].sort(byUpdatedDesc).map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });
});
