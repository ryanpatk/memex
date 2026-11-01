import { describe, expect, it } from 'vitest';
import { link, note, tag, task } from '../testing/fixtures';
import {
  countByType,
  countTags,
  countUntagged,
  isDoneTask,
  itemKeysInSpace,
  matchesTagFilter,
  matchesTypeFilter,
  orderTagsForRow,
  parseList,
  parseTypeFilter,
  pinnedLinks,
} from './filters';
import { buildStreamItems } from './items';

const red = tag('r', 'red');
const blue = tag('b', 'blue');
const green = tag('g', 'green');

describe('parseList', () => {
  it('splits, trims and drops empties', () => {
    expect(parseList(' a, ,b ,,c')).toEqual(['a', 'b', 'c']);
  });

  it('is empty for null or an empty string', () => {
    expect(parseList(null)).toEqual([]);
    expect(parseList('')).toEqual([]);
  });
});

describe('parseTypeFilter', () => {
  it('keeps known item types and drops the rest', () => {
    expect(parseTypeFilter('link,bogus, task,Note')).toEqual(['link', 'task']);
  });

  it('is empty without a param', () => {
    expect(parseTypeFilter(null)).toEqual([]);
  });
});

describe('matchesTypeFilter', () => {
  it('shows every type when nothing is selected', () => {
    expect(matchesTypeFilter('note', [])).toBe(true);
  });

  it('shows only the selected types', () => {
    expect(matchesTypeFilter('note', ['link', 'task'])).toBe(false);
    expect(matchesTypeFilter('task', ['link', 'task'])).toBe(true);
  });
});

describe('matchesTagFilter', () => {
  it('passes everything when no tag and no "Untagged" is selected', () => {
    expect(matchesTagFilter([], [], false)).toBe(true);
    expect(matchesTagFilter(['r'], [], false)).toBe(true);
  });

  it('passes an item with any selected tag', () => {
    expect(matchesTagFilter(['r', 'g'], ['b', 'g'], false)).toBe(true);
    expect(matchesTagFilter(['r'], ['b'], false)).toBe(false);
  });

  it('with "Untagged" on, passes untagged items too', () => {
    expect(matchesTagFilter([], ['b'], true)).toBe(true);
    expect(matchesTagFilter(['r'], ['b'], true)).toBe(false);
  });

  it('with only "Untagged" on, passes only untagged items', () => {
    expect(matchesTagFilter([], [], true)).toBe(true);
    expect(matchesTagFilter(['r'], [], true)).toBe(false);
  });
});

describe('counts', () => {
  const items = buildStreamItems(
    [link('l1', { tags: [red] }), link('l2', { tags: [red, blue] })],
    [note('n1')],
    [task('t1', { is_done: true, tags: [blue] }), task('t2')],
  );

  it('counts items per type, including zero', () => {
    expect(countByType(items)).toEqual({ link: 2, note: 1, task: 2 });
    expect(countByType([])).toEqual({ link: 0, note: 0, task: 0 });
  });

  it('counts items per tag', () => {
    expect(countTags(items)).toEqual({ r: 2, b: 2 });
  });

  it('counts untagged items', () => {
    expect(countUntagged(items)).toBe(2);
  });

  it('spots done tasks', () => {
    expect(items.filter(isDoneTask).map((i) => i.key)).toEqual(['task:t1']);
  });
});

describe('orderTagsForRow', () => {
  const tags = [green, red, blue];
  const counts = { r: 3, b: 3 };

  it('orders by count, then name', () => {
    expect(orderTagsForRow(tags, counts, { inSpace: false, selectedTagIds: [] }).map((t) => t.name)).toEqual([
      'blue',
      'red',
      'green',
    ]);
  });

  it('outside a space, keeps unused tags so they can be applied', () => {
    expect(orderTagsForRow(tags, counts, { inSpace: false, selectedTagIds: [] })).toHaveLength(3);
  });

  it('inside a space, hides unused tags unless selected', () => {
    expect(orderTagsForRow(tags, counts, { inSpace: true, selectedTagIds: [] }).map((t) => t.id)).toEqual(['b', 'r']);
    expect(orderTagsForRow(tags, counts, { inSpace: true, selectedTagIds: ['g'] }).map((t) => t.id)).toEqual(['b', 'r', 'g']);
  });

  it('does not mutate the input', () => {
    const input = [green, red, blue];
    orderTagsForRow(input, counts, { inSpace: false, selectedTagIds: [] });
    expect(input).toEqual([green, red, blue]);
  });
});

describe('itemKeysInSpace', () => {
  it('collects the keys of items filed in the space', () => {
    const keys = itemKeysInSpace(
      {
        links: [
          { profile_id: 's', link_id: 'l1' },
          { profile_id: 'other', link_id: 'l2' },
        ],
        notes: [{ profile_id: 's', note_id: 'n1' }],
        tasks: undefined,
      },
      's',
    );
    expect([...keys]).toEqual(['link:l1', 'note:n1']);
  });

  it('is empty while membership is loading', () => {
    expect(itemKeysInSpace({}, 's').size).toBe(0);
  });
});

describe('pinnedLinks', () => {
  const items = buildStreamItems(
    [
      link('global', { title: 'Zeta', is_super_favorite: true }),
      link('inSpace', { title: 'alpha' }),
      link('elsewhere', { url: 'https://beta.dev' }),
      link('plain', { title: 'Plain' }),
    ],
    [],
    [],
  );
  const membership = [
    { profile_id: 's', link_id: 'inSpace', is_super_favorite: true },
    { profile_id: 'other', link_id: 'elsewhere', is_super_favorite: true },
    { profile_id: 's', link_id: 'plain', is_super_favorite: false },
  ];

  it('outside a space, shows links pinned globally or in any space, by title', () => {
    expect(pinnedLinks(items, membership, undefined).map((l) => l.id)).toEqual(['inSpace', 'elsewhere', 'global']);
  });

  it('inside a space, shows only links pinned there', () => {
    expect(pinnedLinks(items, membership, 's').map((l) => l.id)).toEqual(['inSpace']);
  });

  it('is empty when nothing is pinned', () => {
    expect(pinnedLinks(items, [], 's')).toEqual([]);
  });
});
