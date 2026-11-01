import { ITEM_TYPES } from '../itemTypes';
import { getLinkTitle } from '../links';
import { noteDisplayTitle } from '../markdown';
import { sourceOf } from '../sources';
import type { StreamItem } from './items';

/*
 * Library sort (docs/library-views.md): one order for every layout. The
 * default, recently updated first, is what the Library has always shown;
 * the Table's column headers and the Sort menu pick another. In the URL as
 * `?sort=<field>:<asc|desc>`; absent means the default.
 */

export type SortField = 'updated' | 'saved' | 'title' | 'type' | 'source' | 'space';
export type SortDirection = 'asc' | 'desc';
export interface LibrarySort {
  field: SortField;
  direction: SortDirection;
}

export interface SortFieldDef {
  key: SortField;
  label: string;
  /** Where a first click on the column starts: dates newest first, words A–Z. */
  defaultDirection: SortDirection;
}

export const SORT_FIELDS: readonly SortFieldDef[] = [
  { key: 'updated', label: 'Updated', defaultDirection: 'desc' },
  { key: 'saved', label: 'Saved', defaultDirection: 'desc' },
  { key: 'title', label: 'Title', defaultDirection: 'asc' },
  { key: 'type', label: 'Type', defaultDirection: 'asc' },
  { key: 'source', label: 'Source', defaultDirection: 'asc' },
  { key: 'space', label: 'Space', defaultDirection: 'asc' },
];

export const DEFAULT_SORT: LibrarySort = { field: 'updated', direction: 'desc' };

const fieldDef = (field: SortField) => SORT_FIELDS.find((def) => def.key === field)!;

export const isSortField = (value: string): value is SortField =>
  SORT_FIELDS.some((def) => def.key === value);

export const sameSort = (a: LibrarySort, b: LibrarySort) =>
  a.field === b.field && a.direction === b.direction;

export const isDefaultSort = (sort: LibrarySort) => sameSort(sort, DEFAULT_SORT);

/** `title:asc` → a sort; a bare field takes its default direction; anything else is the default. */
export const parseSort = (value: string | null | undefined): LibrarySort => {
  if (!value) return DEFAULT_SORT;
  const [field, direction] = value.trim().split(':');
  if (!isSortField(field)) return DEFAULT_SORT;
  if (direction === 'asc' || direction === 'desc') return { field, direction };
  return { field, direction: fieldDef(field).defaultDirection };
};

/** The URL value for a sort; null for the default, so the param can be dropped. */
export const formatSort = (sort: LibrarySort): string | null =>
  isDefaultSort(sort) ? null : `${sort.field}:${sort.direction}`;

/** A column header click: the same column flips, another starts at its default direction. */
export const nextSort = (current: LibrarySort, field: SortField): LibrarySort =>
  current.field === field
    ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { field, direction: fieldDef(field).defaultDirection };

const DATE_LABELS: Record<'updated' | 'saved', Record<SortDirection, string>> = {
  updated: { desc: 'Recently updated', asc: 'Least recently updated' },
  saved: { desc: 'Newest saved', asc: 'Oldest saved' },
};

/** How the Sort menu names a sort: “Recently updated”, “Title A–Z”, “Source Z–A”. */
export const sortLabel = (sort: LibrarySort): string => {
  if (sort.field === 'updated' || sort.field === 'saved') return DATE_LABELS[sort.field][sort.direction];
  return `${fieldDef(sort.field).label} ${sort.direction === 'asc' ? 'A–Z' : 'Z–A'}`;
};

/** The menu's choices, in order. */
export const SORT_OPTIONS: readonly LibrarySort[] = [
  { field: 'updated', direction: 'desc' },
  { field: 'saved', direction: 'desc' },
  { field: 'saved', direction: 'asc' },
  { field: 'title', direction: 'asc' },
  { field: 'type', direction: 'asc' },
  { field: 'source', direction: 'asc' },
  { field: 'space', direction: 'asc' },
];

/* ---------- Item accessors ---------- */

/** The title an item shows on its card, row or table cell. */
export const itemTitle = (item: StreamItem): string => {
  if (item.type === 'link') return getLinkTitle(item.link);
  if (item.type === 'note') return noteDisplayTitle(item.note);
  return item.task.title;
};

/** When the item was saved (created). */
export const itemSavedAt = (item: StreamItem): string =>
  item.type === 'link' ? item.link.created_at : item.type === 'note' ? item.note.created_at : item.task.created_at;

/** The source label a link shows (“X”, “YouTube”, or its host); null for notes and tasks. */
export const itemSourceLabel = (item: StreamItem): string | null =>
  item.type === 'link' ? sourceOf(item.link).label : null;

export const itemTypeLabel = (item: StreamItem): string =>
  ITEM_TYPES.find((type) => type.key === item.type)?.label ?? item.type;

/* ---------- Sorting ---------- */

export interface SortContext {
  /** Names of the spaces an item is filed in (any order); empty when unfiled. */
  spaceNamesOf?: (key: string) => readonly string[];
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const compareText = (a: string, b: string) => collator.compare(a, b);
const compareIso = (a: string, b: string) => (a > b ? 1 : a < b ? -1 : 0);

/** The value a field sorts on; null sorts last in either direction (blank cells sink). */
const sortValue = (item: StreamItem, field: SortField, context: SortContext): string | null => {
  switch (field) {
    case 'updated':
      return item.updatedAt;
    case 'saved':
      return itemSavedAt(item);
    case 'title':
      return itemTitle(item).trim() || null;
    case 'type':
      return itemTypeLabel(item);
    case 'source':
      return itemSourceLabel(item);
    case 'space': {
      const names = [...(context.spaceNamesOf?.(item.key) ?? [])].sort(compareText);
      return names[0] ?? null;
    }
  }
};

/**
 * Items in the given order, as a new array. Ties fall back to most recently
 * updated, then to the item key, so the order is stable between renders.
 */
export const sortItems = (
  items: readonly StreamItem[],
  sort: LibrarySort,
  context: SortContext = {},
): StreamItem[] => {
  const isDate = sort.field === 'updated' || sort.field === 'saved';
  const sign = sort.direction === 'asc' ? 1 : -1;
  const keyed = items.map((item) => ({ item, value: sortValue(item, sort.field, context) }));
  keyed.sort((a, b) => {
    if (a.value !== b.value) {
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const diff = isDate ? compareIso(a.value, b.value) : compareText(a.value, b.value);
      if (diff !== 0) return diff * sign;
    }
    const recent = compareIso(b.item.updatedAt, a.item.updatedAt);
    if (recent !== 0) return recent;
    return compareIso(a.item.key, b.item.key);
  });
  return keyed.map(({ item }) => item);
};

/** The date the List groups on for a sort (Today / This week…), or null for an ungrouped list. */
export const groupDateFor = (sort: LibrarySort): ((item: StreamItem) => string) | null => {
  if (sort.field === 'updated') return (item) => item.updatedAt;
  if (sort.field === 'saved') return itemSavedAt;
  return null;
};
