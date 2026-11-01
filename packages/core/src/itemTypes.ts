/** The three item primitives (CONTEXT.md: Item). Jots are entries, not items. */
export type ItemType = 'note' | 'link' | 'task';

export interface ItemTypeDef {
  key: ItemType;
  label: string;
  /** Plural label used in chips and empty states. */
  plural: string;
}

export const ITEM_TYPES: ItemTypeDef[] = [
  { key: 'note', label: 'Note', plural: 'Notes' },
  { key: 'link', label: 'Link', plural: 'Links' },
  { key: 'task', label: 'Task', plural: 'Tasks' },
];

export const isItemType = (value: string): value is ItemType =>
  ITEM_TYPES.some((type) => type.key === value);
