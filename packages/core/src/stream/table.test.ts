import { describe, expect, it } from 'vitest';
import { DEFAULT_SORT } from './sort';
import { TABLE_COLUMNS, ariaSortFor, nextRowIndex, tableColumns } from './table';

describe('tableColumns', () => {
  it('drops Tags while the tag UI is hidden', () => {
    expect(tableColumns({ showTags: false }).map((c) => c.id)).toEqual([
      'title',
      'type',
      'source',
      'spaces',
      'saved',
      'updated',
    ]);
    expect(tableColumns({ showTags: true })).toHaveLength(TABLE_COLUMNS.length);
  });

  it('never hides title, spaces or saved', () => {
    expect(TABLE_COLUMNS.filter((c) => c.priority === 0).map((c) => c.id)).toEqual(['title', 'spaces', 'saved']);
  });
});

describe('ariaSortFor', () => {
  const [title] = TABLE_COLUMNS;
  const updated = TABLE_COLUMNS.find((c) => c.id === 'updated')!;
  const tags = TABLE_COLUMNS.find((c) => c.id === 'tags')!;

  it('marks only the sorted column', () => {
    expect(ariaSortFor(updated, DEFAULT_SORT)).toBe('descending');
    expect(ariaSortFor(title, DEFAULT_SORT)).toBe('none');
    expect(ariaSortFor(title, { field: 'title', direction: 'asc' })).toBe('ascending');
    expect(ariaSortFor(tags, DEFAULT_SORT)).toBe('none');
  });
});

describe('nextRowIndex', () => {
  it('steps and clamps', () => {
    expect(nextRowIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextRowIndex('ArrowDown', 2, 3)).toBe(2);
    expect(nextRowIndex('ArrowUp', 0, 3)).toBe(0);
    expect(nextRowIndex('ArrowUp', 2, 3)).toBe(1);
  });

  it('jumps with Home and End', () => {
    expect(nextRowIndex('Home', 2, 3)).toBe(0);
    expect(nextRowIndex('End', 0, 3)).toBe(2);
  });

  it('ignores other keys and empty tables', () => {
    expect(nextRowIndex('Enter', 0, 3)).toBeNull();
    expect(nextRowIndex('ArrowDown', 0, 0)).toBeNull();
  });
});
