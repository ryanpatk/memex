import {
  EMPTY_FILTERS,
  itemMatchesSearch,
  linkToItem,
  matchesLibraryFilters,
  sortItems,
  sourceKeyLabel,
  sourceOf,
  type LibraryFilters,
  type LinkWithTag,
  type SourceKey,
  type StreamItem,
} from '@memex/core';

/*
 * The phone Library: every saved link as a picture grid, newest saved first,
 * narrowed by source and search. Core does the work (linkToItem,
 * matchesLibraryFilters, itemMatchesSearch, sortItems), the same functions
 * the web Library runs, so a source filter means the same thing on both.
 * Plain TS, tested.
 */

export const LIBRARY_PAGE = 24;
const SOURCE_ORDER: SourceKey[] = ['x', 'pinterest', 'youtube', 'web'];
const NEWEST_SAVED = { field: 'saved', direction: 'desc' } as const;

export type LinkItem = Extract<StreamItem, { type: 'link' }>;

export interface LibraryQuery {
  source: SourceKey | null;
  search: string;
}

export const filtersFor = (source: SourceKey | null): LibraryFilters => ({
  ...EMPTY_FILTERS,
  types: ['link'],
  sources: source ? [source] : [],
});

const noSpaces = { spacesOf: () => [] as string[] };

/** The links to show, in order. Optimistic (`temp-`) rows are left to the Journal. */
export const libraryItems = (links: LinkWithTag[], query: LibraryQuery): LinkItem[] => {
  const filters = filtersFor(query.source);
  const items = links
    .filter((link) => !link.id.startsWith('temp-'))
    .map(linkToItem)
    .filter((item) => matchesLibraryFilters(item, filters, noSpaces) && itemMatchesSearch(item, query.search));
  return sortItems(items, NEWEST_SAVED) as LinkItem[];
};

/** "All" plus each source that has links, with counts (before search). */
export const sourceTabs = (links: LinkWithTag[]) => {
  const counts = new Map<SourceKey, number>();
  links.forEach((link) => {
    if (link.id.startsWith('temp-')) return;
    const key = sourceOf(link).key;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [
    { key: null, label: 'All', count: total },
    ...SOURCE_ORDER.filter((key) => counts.has(key)).map((key) => ({ key, label: sourceKeyLabel(key), count: counts.get(key) ?? 0 })),
  ];
};

/** Height ÷ width for a card's picture, by platform; null for a text card. */
export const pictureRatio = (link: LinkWithTag): number | null => {
  if (!link.preview_image_url) return null;
  switch (sourceOf(link).key) {
    case 'pinterest':
      return 4 / 3;
    case 'youtube':
      return 9 / 16;
    case 'x':
      return 3 / 4;
    default:
      return 5 / 8;
  }
};
