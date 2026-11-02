import { describe, expect, it } from 'vitest';
import { at, link, note, tag, task } from '../testing/fixtures';
import type { SavedView } from '../types';
import { buildStreamItems } from './items';
import {
  BUILT_IN_VIEWS,
  EMPTY_FILTERS,
  countMatching,
  findActiveView,
  formatLibraryFilters,
  isEmptyFilters,
  isHideableWhenEmpty,
  matchesLibraryFilters,
  matchesSourceFilter,
  matchesSpaceFilter,
  nextViewPosition,
  normalizeViewName,
  parseLibraryFilters,
  parseViewDefinition,
  sameFilters,
  sanitizeFilters,
  savedViewsToTabs,
  serializeViewDefinition,
  spaceIdsByItem,
  suggestViewName,
  uniqueViewName,
  viewDiffers,
  type LibraryFilters,
} from './views';

const filters = (over: Partial<LibraryFilters>): LibraryFilters => ({ ...EMPTY_FILTERS, ...over });

const savedRow = (id: string, over: Partial<SavedView> = {}): SavedView => ({
  id,
  user_id: 'u',
  name: `View ${id}`,
  definition: {},
  position: 0,
  created_at: at(0),
  updated_at: at(0),
  ...over,
});

describe('parseLibraryFilters / formatLibraryFilters', () => {
  const none = { type: null, source: null, space: null, tags: null, untagged: null };

  it('reads every param, dropping unknown types and sources and duplicates', () => {
    expect(
      parseLibraryFilters({
        type: 'link,bogus,link',
        source: 'x,myspace,youtube',
        space: 'unfiled, s1',
        tags: 't1',
        untagged: '1',
      }),
    ).toEqual({ types: ['link'], sources: ['x', 'youtube'], spaces: ['unfiled', 's1'], tagIds: ['t1'], untagged: true });
  });

  it('is empty with no params', () => {
    expect(parseLibraryFilters(none)).toEqual(EMPTY_FILTERS);
  });

  it('formats empty lists as null and round-trips', () => {
    expect(formatLibraryFilters(EMPTY_FILTERS)).toEqual(none);
    const value = filters({ types: ['note', 'task'], sources: ['pinterest'], spaces: ['unfiled'], untagged: true });
    expect(parseLibraryFilters(formatLibraryFilters(value))).toEqual(value);
  });
});

describe('spaceIdsByItem', () => {
  it('maps item keys to their spaces without duplicates', () => {
    const map = spaceIdsByItem({
      links: [
        { profile_id: 's1', link_id: 'l' },
        { profile_id: 's2', link_id: 'l' },
        { profile_id: 's1', link_id: 'l' },
      ],
      notes: [{ profile_id: 's2', note_id: 'n' }],
      tasks: [{ profile_id: 's3', task_id: 't' }],
    });
    expect(map.get('link:l')).toEqual(['s1', 's2']);
    expect(map.get('note:n')).toEqual(['s2']);
    expect(map.get('task:t')).toEqual(['s3']);
    expect(map.get('link:other')).toBeUndefined();
  });
});

describe('matching', () => {
  const red = tag('r', 'red');
  const items = buildStreamItems(
    [
      link('x1', { url: 'https://x.com/a/status/1', source: 'x:bookmark', link_tags: [{ id: 'j', link_id: 'x1', tag_id: 'r', created_at: at(0), tag: red }] }),
      link('p1', { url: 'https://example.com/pin', source: 'pinterest:save' }),
      link('w1', { url: 'https://example.com/article' }),
    ],
    [note('n1')],
    [task('t1')],
  );
  const spaces: Record<string, string[]> = { 'link:x1': ['s1'], 'note:n1': ['s2'] };
  const context = { spacesOf: (key: string) => spaces[key] ?? [] };
  const pick = (value: LibraryFilters) =>
    items.filter((item) => matchesLibraryFilters(item, value, context)).map((item) => item.key);

  it('source filters keep only links from those platforms', () => {
    expect(matchesSourceFilter(items[3], [])).toBe(true);
    expect(pick(filters({ sources: ['x'] }))).toEqual(['link:x1']);
    expect(pick(filters({ sources: ['pinterest', 'web'] }))).toEqual(['link:p1', 'link:w1']);
  });

  it('space filters match any selected space, or none for unfiled', () => {
    expect(matchesSpaceFilter([], [])).toBe(true);
    expect(matchesSpaceFilter([], ['unfiled'])).toBe(true);
    expect(matchesSpaceFilter(['s1'], ['unfiled'])).toBe(false);
    expect(pick(filters({ spaces: ['unfiled'] }))).toEqual(['link:p1', 'link:w1', 'task:t1']);
    expect(pick(filters({ spaces: ['s1', 's2'] }))).toEqual(['link:x1', 'note:n1']);
    expect(pick(filters({ spaces: ['s2', 'unfiled'] }))).toEqual(['link:p1', 'link:w1', 'note:n1', 'task:t1']);
  });

  it('combines type, source, space and tag filters', () => {
    expect(pick(EMPTY_FILTERS)).toHaveLength(5);
    expect(pick(filters({ types: ['link'], spaces: ['unfiled'] }))).toEqual(['link:p1', 'link:w1']);
    expect(pick(filters({ tagIds: ['r'] }))).toEqual(['link:x1']);
    expect(pick(filters({ untagged: true, sources: ['x', 'web'] }))).toEqual(['link:w1']);
    expect(pick(filters({ types: ['note'], sources: ['x'] }))).toEqual([]);
  });

  it('can read tags from the caller (optimistic captures)', () => {
    const tagsOf = (item: { key: string }) => (item.key === 'note:n1' ? ['r'] : []);
    expect(items.filter((item) => matchesLibraryFilters(item, filters({ tagIds: ['r'] }), { ...context, tagsOf })).map((i) => i.key)).toEqual(['note:n1']);
  });

  it('counts matches', () => {
    expect(countMatching(items, BUILT_IN_VIEWS[1].definition.filters, context)).toBe(3);
    expect(countMatching(items, filters({ sources: ['youtube'] }), context)).toBe(0);
  });
});

describe('sameFilters / findActiveView', () => {
  it('ignores order', () => {
    expect(sameFilters(filters({ types: ['note', 'link'] }), filters({ types: ['link', 'note'] }))).toBe(true);
    expect(sameFilters(filters({ types: ['note'] }), filters({ types: ['note', 'link'] }))).toBe(false);
    expect(sameFilters(filters({ untagged: true }), EMPTY_FILTERS)).toBe(false);
    expect(isEmptyFilters(EMPTY_FILTERS)).toBe(true);
  });

  it('lights the view whose filters match, built-ins first', () => {
    const mine = savedViewsToTabs([savedRow('v1', { definition: { filters: { sources: ['x'] } } })]);
    const views = [...BUILT_IN_VIEWS, ...mine];
    expect(findActiveView(EMPTY_FILTERS, views)?.id).toBe('everything');
    expect(findActiveView(filters({ spaces: ['unfiled'] }), views)?.id).toBe('unfiled');
    expect(findActiveView(filters({ sources: ['x'] }), views)?.id).toBe('from-x');
    expect(findActiveView(filters({ sources: ['x'], types: ['link'] }), views)).toBeNull();
  });

  it('lights a saved view', () => {
    const mine = savedViewsToTabs([savedRow('v1', { definition: { filters: { types: ['note'], spaces: ['unfiled'] } } })]);
    expect(findActiveView(filters({ spaces: ['unfiled'], types: ['note'] }), [...BUILT_IN_VIEWS, ...mine])?.id).toBe('v1');
  });

  it('hides only the source built-ins when empty', () => {
    expect(BUILT_IN_VIEWS.filter(isHideableWhenEmpty).map((v) => v.id)).toEqual(['from-x', 'from-pinterest', 'from-youtube']);
  });
});

describe('sanitizeFilters', () => {
  it('drops ids that no longer exist, keeps unfiled', () => {
    const known = { spaceIds: new Set(['s1']), tagIds: new Set(['t1']) };
    expect(
      sanitizeFilters(filters({ spaces: ['unfiled', 's1', 'gone'], tagIds: ['t1', 'old'] }), known),
    ).toEqual(filters({ spaces: ['unfiled', 's1'], tagIds: ['t1'] }));
  });
});

describe('view definitions', () => {
  it('reads a full definition', () => {
    const raw = {
      filters: { types: ['link'], sources: ['x'], spaces: ['s1'], tagIds: ['t'], untagged: true },
      sort: { field: 'title', direction: 'asc' },
      layout: 'table',
    };
    expect(parseViewDefinition(raw)).toEqual({
      filters: { types: ['link'], sources: ['x'], spaces: ['s1'], tagIds: ['t'], untagged: true },
      sort: { field: 'title', direction: 'asc' },
      layout: 'table',
    });
  });

  it('falls back to defaults for broken or unknown fields', () => {
    expect(parseViewDefinition(null)).toEqual({ filters: EMPTY_FILTERS });
    expect(parseViewDefinition('nope')).toEqual({ filters: EMPTY_FILTERS });
    expect(
      parseViewDefinition({
        filters: { types: 'link', sources: ['x', 7, 'friendster'], spaces: [null, 's'], untagged: 'yes' },
        sort: { field: 'colour', direction: 'asc' },
        layout: 'carousel',
        future: { anything: true },
      }),
    ).toEqual({ filters: filters({ sources: ['x'], spaces: ['s'] }) });
  });

  it('round-trips through serialize', () => {
    const definition = {
      filters: filters({ types: ['task' as const], spaces: ['unfiled'] }),
      sort: { field: 'saved' as const, direction: 'asc' as const },
      layout: 'list' as const,
    };
    expect(parseViewDefinition(serializeViewDefinition(definition))).toEqual(definition);
    expect(serializeViewDefinition({ filters: EMPTY_FILTERS })).toEqual({
      filters: { types: [], sources: [], spaces: [], tagIds: [], untagged: false },
    });
  });

  it('orders saved views by position, then age', () => {
    const tabs = savedViewsToTabs([
      savedRow('late', { position: 2 }),
      savedRow('b', { position: 1, created_at: at(5) }),
      savedRow('a', { position: 1, created_at: at(1) }),
    ]);
    expect(tabs.map((t) => t.id)).toEqual(['a', 'b', 'late']);
    expect(tabs.every((t) => !t.builtIn)).toBe(true);
  });

  it('appends new views after the last position', () => {
    expect(nextViewPosition([])).toBe(0);
    expect(nextViewPosition([{ position: 3 }, { position: 1 }])).toBe(4);
  });

  it('knows when layout or sort changed', () => {
    const [tab] = savedViewsToTabs([
      savedRow('v', { definition: { filters: {}, sort: { field: 'title', direction: 'asc' }, layout: 'table' } }),
    ]);
    expect(viewDiffers(tab, { sort: { field: 'title', direction: 'asc' }, layout: 'table' })).toBe(false);
    expect(viewDiffers(tab, { sort: { field: 'title', direction: 'desc' }, layout: 'table' })).toBe(true);
    expect(viewDiffers(tab, { sort: { field: 'title', direction: 'asc' }, layout: 'grid' })).toBe(true);
  });
});

describe('view names', () => {
  it('normalizes typed names', () => {
    expect(normalizeViewName('  Reading   list ')).toBe('Reading list');
    expect(normalizeViewName('   ')).toBeNull();
    expect(normalizeViewName('x'.repeat(80))).toHaveLength(48);
  });

  const names = {
    space: (id: string) => ({ s1: 'Home reno', s2: 'Job search' })[id],
    tag: (id: string) => ({ t1: 'design' })[id],
  };

  it('suggests a name from the filters', () => {
    expect(suggestViewName(EMPTY_FILTERS)).toBe('Everything');
    expect(suggestViewName(filters({ sources: ['x'] }))).toBe('From X');
    expect(suggestViewName(filters({ types: ['link'], sources: ['x', 'youtube'] }))).toBe('Links from X & YouTube');
    expect(suggestViewName(filters({ spaces: ['unfiled'] }))).toBe('Unfiled');
    expect(suggestViewName(filters({ types: ['note'], spaces: ['unfiled'] }))).toBe('Unfiled notes');
    expect(suggestViewName(filters({ types: ['task'], spaces: ['s1'] }), names)).toBe('Tasks in Home reno');
    expect(suggestViewName(filters({ spaces: ['s1', 's2'] }), names)).toBe('Home reno & Job search');
    expect(suggestViewName(filters({ spaces: ['s1', 'unfiled'] }), names)).toBe('Home reno & Unfiled');
    expect(suggestViewName(filters({ sources: ['pinterest'], spaces: ['s1'] }), names)).toBe('From Pinterest in Home reno');
    expect(suggestViewName(filters({ types: ['note', 'link'] }))).toBe('Notes & Links');
    expect(suggestViewName(filters({ tagIds: ['t1'] }), names)).toBe('Tagged design');
    expect(suggestViewName(filters({ untagged: true }))).toBe('Untagged');
    expect(suggestViewName(filters({ spaces: ['gone'] }), names)).toBe('Everything');
  });

  it('numbers a taken name', () => {
    expect(uniqueViewName('From X', ['Everything'])).toBe('From X');
    expect(uniqueViewName('From X', ['from x'])).toBe('From X 2');
    expect(uniqueViewName('From X', ['From X', 'From X 2'])).toBe('From X 3');
  });
});
