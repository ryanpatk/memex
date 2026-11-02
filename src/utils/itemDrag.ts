/*
 * Drag an item onto a space to file it (ROADMAP.md Phase 1, “drag to sidebar
 * space”). Anything that renders an item marks itself with `data-item-key`
 * (`${type}:${id}`) and spreads `dragAttrs(key, title)`; a gallery of several
 * items sets `data-drag-keys` instead. One document-level listener
 * (hooks/useItemDragSource.ts) turns any drag that starts inside such an
 * element into a drag of those keys, or of the whole selection when the item
 * is part of it. Sidebar spaces are the drop targets (MemexSidebar). Filing
 * goes through useAddToSpace, the same path as the selection bar's menu.
 */

/** The dataTransfer type carrying a JSON array of item keys. */
export const ITEM_DRAG_TYPE = 'application/x-memex-items';

/** Links, notes, tasks and jots can be filed (a jot moves); optimistic rows can't. */
export const isFileableKey = (key: string) => /^(link|note|task|jot):(?!temp-)\S/.test(key);

/**
 * Which keys a drag carries: the dragged item(s), or the whole selection when
 * a single dragged item is part of it (Finder-style: dragging an unselected
 * item drags only that item).
 */
export const resolveDragKeys = (
  dragged: readonly string[],
  selection: { active: boolean; keys: readonly string[] },
): string[] => {
  const own = Array.from(new Set(dragged.filter(isFileableKey)));
  if (own.length === 1 && selection.active && selection.keys.includes(own[0])) {
    return Array.from(new Set(selection.keys.filter(isFileableKey)));
  }
  return own;
};

/** Reads the drop payload; anything malformed is an empty drag. */
export const parseDragKeys = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((key): key is string => typeof key === 'string' && isFileableKey(key))));
  } catch {
    return [];
  }
};

/** What the drag ghost says: the title for one item, the count for several. */
export const dragGhostLabel = (keys: readonly string[], title?: string | null) => {
  if (keys.length !== 1) return `${keys.length} items`;
  const text = (title ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text || '1 item';
};

/** Props that make an item's element a drag source (none for optimistic rows). */
export const dragAttrs = (key: string, title: string) =>
  isFileableKey(key) ? { draggable: true, 'data-drag-label': title } : {};
