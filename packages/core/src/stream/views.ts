import { SOURCE_KEYS } from '../capture/input';
import { ITEM_TYPES, isItemType, type ItemType } from '../itemTypes';
import { SOURCES, sourceOf, type SourceKey } from '../sources';
import type { SavedView } from '../types';
import { matchesTagFilter, matchesTypeFilter, parseList, type SpaceMembership } from './filters';
import { itemKey, type StreamItem } from './items';
import { DEFAULT_SORT, isSortField, sameSort, type LibrarySort } from './sort';

/*
 * Saved views (decision 15A, docs/library-views.md): tabs over the Library,
 * each a named set of filters with a layout and sort. The lit tab is the one
 * whose filters equal the URL's; layout and sort are a view's defaults and
 * never unlight it. Built-in views ship with the app; saved ones are rows in
 * `saved_views` (vault: `views/<id>.json`).
 */

/** Library layouts: masonry (`grid`), the reading list, the Table. */
export type LibraryLayout = 'grid' | 'list' | 'table';
export const LIBRARY_LAYOUTS: readonly LibraryLayout[] = ['grid', 'list', 'table'];
export const isLibraryLayout = (value: unknown): value is LibraryLayout =>
  typeof value === 'string' && (LIBRARY_LAYOUTS as readonly string[]).includes(value);

/** The Space filter's value for items filed nowhere. */
export const UNFILED = 'unfiled';

/** Whether a URL or stored value names a source (the capture module's list). */
export const isSourceKey = (value: string): value is SourceKey =>
  (SOURCE_KEYS as readonly string[]).includes(value);
export const sourceKeyLabel = (key: SourceKey): string => (key === 'web' ? 'Web' : SOURCES[key].label);

/** Every Library filter. Empty lists (and `untagged: false`) filter nothing. */
export interface LibraryFilters {
  types: ItemType[];
  /** Platforms; only links have one, so any source hides notes and tasks. */
  sources: SourceKey[];
  /** Space ids, plus `unfiled` for items in no space. */
  spaces: string[];
  tagIds: string[];
  untagged: boolean;
}

export const EMPTY_FILTERS: LibraryFilters = { types: [], sources: [], spaces: [], tagIds: [], untagged: false };

export interface ViewDefinition {
  filters: LibraryFilters;
  /** Absent: opening the view keeps the current sort. */
  sort?: LibrarySort;
  /** Absent: opening the view keeps the current layout. */
  layout?: LibraryLayout;
}

/** A tab: built in, or a saved view from `saved_views`. */
export interface LibraryView {
  id: string;
  name: string;
  builtIn: boolean;
  definition: ViewDefinition;
}

const view = (id: string, name: string, filters: Partial<LibraryFilters>): LibraryView => ({
  id,
  name,
  builtIn: true,
  definition: { filters: { ...EMPTY_FILTERS, ...filters } },
});

export const BUILT_IN_VIEWS: readonly LibraryView[] = [
  view('everything', 'Everything', {}),
  view('unfiled', 'Unfiled', { spaces: [UNFILED] }),
  view('from-x', 'From X', { sources: ['x'] }),
  view('from-pinterest', 'From Pinterest', { sources: ['pinterest'] }),
  view('from-youtube', 'From YouTube', { sources: ['youtube'] }),
];

/** Built-ins that hide while they hold nothing (and aren't the lit tab). */
export const isHideableWhenEmpty = (view: LibraryView) => view.builtIn && view.definition.filters.sources.length > 0;

/* ---------- URL values ---------- */

/** The raw URL values, keyed by meaning; the app maps them to its param names. */
export interface FilterParams {
  type: string | null;
  source: string | null;
  space: string | null;
  tags: string | null;
  untagged: string | null;
}

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

export const parseLibraryFilters = (params: FilterParams): LibraryFilters => ({
  types: unique(parseList(params.type).filter(isItemType)),
  sources: unique(parseList(params.source).filter(isSourceKey)),
  spaces: unique(parseList(params.space)),
  tagIds: unique(parseList(params.tags)),
  untagged: params.untagged === '1',
});

/** URL values for filters; null drops the param. */
export const formatLibraryFilters = (filters: LibraryFilters): FilterParams => {
  const list = (values: readonly string[]) => (values.length ? values.join(',') : null);
  return {
    type: list(filters.types),
    source: list(filters.sources),
    space: list(filters.spaces),
    tags: list(filters.tagIds),
    untagged: filters.untagged ? '1' : null,
  };
};

/* ---------- Matching ---------- */

/** Space ids per item key, from the membership joins. */
export const spaceIdsByItem = (membership: SpaceMembership): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  const add = (key: string, spaceId: string) => {
    const list = map.get(key);
    if (!list) map.set(key, [spaceId]);
    else if (!list.includes(spaceId)) list.push(spaceId);
  };
  (membership.links ?? []).forEach((row) => add(itemKey('link', row.link_id), row.profile_id));
  (membership.notes ?? []).forEach((row) => add(itemKey('note', row.note_id), row.profile_id));
  (membership.tasks ?? []).forEach((row) => add(itemKey('task', row.task_id), row.profile_id));
  return map;
};

export const matchesSourceFilter = (item: StreamItem, sources: readonly SourceKey[]): boolean =>
  sources.length === 0 || (item.type === 'link' && sources.includes(sourceOf(item.link).key));

/** Space filter: in any selected space, or in none when `unfiled` is selected. */
export const matchesSpaceFilter = (itemSpaceIds: readonly string[], selected: readonly string[]): boolean =>
  selected.length === 0 ||
  selected.some((value) => (value === UNFILED ? itemSpaceIds.length === 0 : itemSpaceIds.includes(value)));

export interface MatchContext {
  /** Space ids the item is filed in. */
  spacesOf: (key: string) => readonly string[];
  /** Tag ids on the item; defaults to its own tags. */
  tagsOf?: (item: StreamItem) => readonly string[];
}

export const matchesLibraryFilters = (item: StreamItem, filters: LibraryFilters, context: MatchContext): boolean =>
  matchesTypeFilter(item.type, filters.types) &&
  matchesSourceFilter(item, filters.sources) &&
  matchesSpaceFilter(context.spacesOf(item.key), filters.spaces) &&
  matchesTagFilter(
    context.tagsOf ? context.tagsOf(item) : item.tags.map((tag) => tag.id),
    filters.tagIds,
    filters.untagged,
  );

export const countMatching = (items: readonly StreamItem[], filters: LibraryFilters, context: MatchContext): number =>
  items.reduce((n, item) => (matchesLibraryFilters(item, filters, context) ? n + 1 : n), 0);

/**
 * Drops space and tag ids that no longer exist (a view saved before a space
 * was deleted), so a stale id neither empties the view nor shows as a chip.
 */
export const sanitizeFilters = (
  filters: LibraryFilters,
  known: { spaceIds: ReadonlySet<string>; tagIds: ReadonlySet<string> },
): LibraryFilters => ({
  ...filters,
  spaces: filters.spaces.filter((id) => id === UNFILED || known.spaceIds.has(id)),
  tagIds: filters.tagIds.filter((id) => known.tagIds.has(id)),
});

const sameSet = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((value) => set.has(value));
};

/** Same filters, ignoring order. */
export const sameFilters = (a: LibraryFilters, b: LibraryFilters): boolean =>
  sameSet(a.types, b.types) &&
  sameSet(a.sources, b.sources) &&
  sameSet(a.spaces, b.spaces) &&
  sameSet(a.tagIds, b.tagIds) &&
  a.untagged === b.untagged;

export const isEmptyFilters = (filters: LibraryFilters) => sameFilters(filters, EMPTY_FILTERS);

/** The lit tab: the first view whose filters equal these (built-ins win ties). */
export const findActiveView = (filters: LibraryFilters, views: readonly LibraryView[]): LibraryView | null =>
  views.find((candidate) => sameFilters(candidate.definition.filters, filters)) ?? null;

/** Whether saving now would change a saved view's layout or sort. */
export const viewDiffers = (target: LibraryView, current: { sort: LibrarySort; layout: LibraryLayout }): boolean =>
  !sameSort(target.definition.sort ?? DEFAULT_SORT, current.sort) ||
  (target.definition.layout ?? 'grid') !== current.layout;

/* ---------- Stored definitions ---------- */

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A stored definition, read forgivingly (vault rule: unknown or broken fields
 * fall back to defaults instead of failing).
 */
export const parseViewDefinition = (raw: unknown): ViewDefinition => {
  const record = isRecord(raw) ? raw : {};
  const filters = isRecord(record.filters) ? record.filters : {};
  const sort = isRecord(record.sort) ? record.sort : null;
  const definition: ViewDefinition = {
    filters: {
      types: unique(stringList(filters.types).filter(isItemType)),
      sources: unique(stringList(filters.sources).filter(isSourceKey)),
      spaces: unique(stringList(filters.spaces)),
      tagIds: unique(stringList(filters.tagIds)),
      untagged: filters.untagged === true,
    },
  };
  if (
    sort &&
    typeof sort.field === 'string' &&
    isSortField(sort.field) &&
    (sort.direction === 'asc' || sort.direction === 'desc')
  ) {
    definition.sort = { field: sort.field, direction: sort.direction };
  }
  if (isLibraryLayout(record.layout)) definition.layout = record.layout;
  return definition;
};

/** The JSON stored in `saved_views.definition`. */
export const serializeViewDefinition = (definition: ViewDefinition): Record<string, unknown> => ({
  filters: {
    types: [...definition.filters.types],
    sources: [...definition.filters.sources],
    spaces: [...definition.filters.spaces],
    tagIds: [...definition.filters.tagIds],
    untagged: definition.filters.untagged,
  },
  ...(definition.sort ? { sort: { ...definition.sort } } : {}),
  ...(definition.layout ? { layout: definition.layout } : {}),
});

/** Saved rows as tabs, in tab order (position, then oldest first). */
export const savedViewsToTabs = (rows: readonly SavedView[]): LibraryView[] =>
  [...rows]
    .sort((a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((row) => ({ id: row.id, name: row.name, builtIn: false, definition: parseViewDefinition(row.definition) }));

/** Where a new view goes: after every saved one. */
export const nextViewPosition = (rows: readonly Pick<SavedView, 'position'>[]): number =>
  rows.reduce((max, row) => Math.max(max, row.position), -1) + 1;

/* ---------- Names ---------- */

export const VIEW_NAME_MAX = 48;

/** A view name as typed: trimmed, inner whitespace collapsed, capped; null when blank. */
export const normalizeViewName = (raw: string): string | null => {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, VIEW_NAME_MAX).trim();
  return name || null;
};

const joinAnd = (parts: readonly string[]) =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;

const typeOrder = (types: readonly ItemType[]) =>
  ITEM_TYPES.filter((type) => types.includes(type.key)).map((type) => type.plural);

/**
 * A name for the current filters, offered when saving: “Links from X”,
 * “Unfiled notes”, “Tasks in Home reno”, “Untagged”.
 */
export const suggestViewName = (
  filters: LibraryFilters,
  names: { space?: (id: string) => string | undefined; tag?: (id: string) => string | undefined } = {},
): string => {
  const types = typeOrder(filters.types);
  const unfiled = filters.spaces.includes(UNFILED);
  const spaceNames = filters.spaces
    .filter((id) => id !== UNFILED)
    .map((id) => names.space?.(id))
    .filter((name): name is string => Boolean(name));
  const sources = SOURCE_KEYS.filter((key) => filters.sources.includes(key)).map(sourceKeyLabel);
  const tagNames = filters.tagIds.map((id) => names.tag?.(id)).filter((name): name is string => Boolean(name));

  let subject = types.length ? joinAnd(types) : '';
  if (unfiled && !spaceNames.length) subject = subject ? `Unfiled ${subject.toLowerCase()}` : 'Unfiled';
  const places = unfiled ? [...spaceNames, 'Unfiled'] : spaceNames;
  // Spaces alone read as their names (“Kyoto trip”), not “In Kyoto trip”
  const spacesAsSubject = !subject && !sources.length && spaceNames.length > 0;
  if (spacesAsSubject) subject = joinAnd(places);
  const parts: string[] = [];
  if (sources.length) parts.push(`from ${joinAnd(sources)}`);
  if (spaceNames.length && !spacesAsSubject) parts.push(`in ${joinAnd(places)}`);
  if (tagNames.length) parts.push(`tagged ${joinAnd(tagNames)}`);
  if (filters.untagged) parts.push(tagNames.length ? 'or untagged' : 'untagged');

  const phrase = [subject, ...parts].filter(Boolean).join(' ');
  if (!phrase) return 'Everything';
  return normalizeViewName(phrase.charAt(0).toUpperCase() + phrase.slice(1)) ?? 'Everything';
};

/** `name`, or `name 2`, `name 3`… when a tab already uses it (case-insensitive). */
export const uniqueViewName = (name: string, taken: readonly string[]): string => {
  const used = new Set(taken.map((value) => value.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; ; n += 1) {
    const candidate = `${name} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
};
