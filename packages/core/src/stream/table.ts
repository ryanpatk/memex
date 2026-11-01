import type { LibrarySort, SortField } from './sort';

/*
 * The Library Table's columns (docs/library-views.md). `priority` decides
 * what goes first when the table is narrow: higher numbers hide sooner.
 */

export type TableColumnId = 'title' | 'type' | 'source' | 'spaces' | 'tags' | 'saved' | 'updated';

export interface TableColumn {
  id: TableColumnId;
  label: string;
  /** The sort a header click picks; tags don't sort. */
  sortField?: SortField;
  /** 0 never hides; 3 hides first. */
  priority: 0 | 1 | 2 | 3;
}

export const TABLE_COLUMNS: readonly TableColumn[] = [
  { id: 'title', label: 'Title', sortField: 'title', priority: 0 },
  { id: 'type', label: 'Type', sortField: 'type', priority: 3 },
  { id: 'source', label: 'Source', sortField: 'source', priority: 1 },
  { id: 'spaces', label: 'Spaces', sortField: 'space', priority: 0 },
  { id: 'tags', label: 'Tags', priority: 2 },
  { id: 'saved', label: 'Saved', sortField: 'saved', priority: 0 },
  { id: 'updated', label: 'Updated', sortField: 'updated', priority: 2 },
];

/** The columns to render; Tags only while the tag UI is shown. */
export const tableColumns = (options: { showTags: boolean }): TableColumn[] =>
  TABLE_COLUMNS.filter((column) => column.id !== 'tags' || options.showTags);

/** `aria-sort` for a header. */
export const ariaSortFor = (column: TableColumn, sort: LibrarySort): 'ascending' | 'descending' | 'none' =>
  column.sortField && column.sortField === sort.field
    ? sort.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

/**
 * The row to focus after a key press in the Table: ↑/↓ step, Home/End jump,
 * clamped to the rows that exist. Null for keys the Table doesn't move on.
 */
export const nextRowIndex = (key: string, current: number, count: number): number | null => {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return Math.min(current + 1, count - 1);
    case 'ArrowUp':
      return Math.max(current - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
};
