import { isItemType, type ItemType } from '../itemTypes';
import type { LinkWithTag, ProfileLinkMembership, Tag } from '../types';
import { itemKey, type StreamItem } from './items';

/*
 * The Library's filters (CLAUDE.md "Filtering model"): type chips and tag
 * chips above the grid, where an empty selection shows everything, plus the
 * counts each chip row shows and the space scope. The URL holds the state
 * (`?type=`, `?tags=`, `?untagged=1`); these functions only read values.
 */

/** A comma-separated URL param as a list: trimmed, empties dropped. */
export const parseList = (value: string | null): string[] =>
  value ? value.split(',').map((v) => v.trim()).filter(Boolean) : [];

/** The `?type=` param as item types; unknown keys are ignored. */
export const parseTypeFilter = (value: string | null): ItemType[] =>
  parseList(value).filter(isItemType);

/** Type chips: no selection shows every type. */
export const matchesTypeFilter = (type: ItemType, selectedTypes: readonly ItemType[]): boolean =>
  selectedTypes.length === 0 || selectedTypes.includes(type);

/**
 * Tag chips: an item passes when it has any selected tag, or when "Untagged"
 * is on and it has none. No selection at all shows everything.
 */
export const matchesTagFilter = (
  tagIds: readonly string[],
  selectedTagIds: readonly string[],
  includeUntagged: boolean,
): boolean => {
  if (selectedTagIds.length === 0 && !includeUntagged) return true;
  const matches = selectedTagIds.some((id) => tagIds.includes(id));
  return matches || (includeUntagged && tagIds.length === 0);
};

export const isDoneTask = (item: StreamItem): boolean => item.type === 'task' && item.task.is_done;

/** How many items of each type. */
export const countByType = (items: readonly StreamItem[]): Record<ItemType, number> => {
  const counts: Record<ItemType, number> = { note: 0, link: 0, task: 0 };
  items.forEach((item) => {
    counts[item.type] += 1;
  });
  return counts;
};

/** How many items carry each tag id. */
export const countTags = (items: readonly StreamItem[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    item.tags.forEach((tag) => {
      counts[tag.id] = (counts[tag.id] ?? 0) + 1;
    });
  });
  return counts;
};

export const countUntagged = (items: readonly StreamItem[]): number =>
  items.filter((item) => item.tags.length === 0).length;

/**
 * The tag chip row, most used first, then by name. Inside a space only tags
 * used there are offered; everywhere else every tag is, so a fresh tag can be
 * applied straight away. Selected tags stay visible even at zero so they can
 * be cleared.
 */
export const orderTagsForRow = (
  tags: readonly Tag[],
  counts: Record<string, number>,
  options: { inSpace: boolean; selectedTagIds: readonly string[] },
): Tag[] => {
  const visible = options.inSpace
    ? tags.filter((tag) => (counts[tag.id] ?? 0) > 0 || options.selectedTagIds.includes(tag.id))
    : tags;
  return [...visible].sort((a, b) => {
    const diff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
};

/** Space membership rows, one list per item type (the `profile_*` joins). */
export interface SpaceMembership {
  links?: readonly { profile_id: string; link_id: string }[];
  notes?: readonly { profile_id: string; note_id: string }[];
  tasks?: readonly { profile_id: string; task_id: string }[];
}

/** Item keys (`link:<id>`) filed in one space. */
export const itemKeysInSpace = (membership: SpaceMembership, spaceId: string): Set<string> => {
  const set = new Set<string>();
  (membership.links ?? []).forEach((row) => {
    if (row.profile_id === spaceId) set.add(itemKey('link', row.link_id));
  });
  (membership.notes ?? []).forEach((row) => {
    if (row.profile_id === spaceId) set.add(itemKey('note', row.note_id));
  });
  (membership.tasks ?? []).forEach((row) => {
    if (row.profile_id === spaceId) set.add(itemKey('task', row.task_id));
  });
  return set;
};

/**
 * Pinned sites for the header, by title: inside a space, links pinned there;
 * everywhere else, links pinned globally or in any space.
 */
export const pinnedLinks = (
  items: readonly StreamItem[],
  linkMembership: readonly ProfileLinkMembership[],
  spaceId: string | undefined,
): LinkWithTag[] => {
  const pinnedInSpace = new Set<string>();
  const pinnedAnywhere = new Set<string>();
  linkMembership.forEach((row) => {
    if (!row.is_super_favorite) return;
    pinnedAnywhere.add(row.link_id);
    if (row.profile_id === spaceId) pinnedInSpace.add(row.link_id);
  });
  return items
    .filter((item): item is Extract<StreamItem, { type: 'link' }> => item.type === 'link')
    .map((item) => item.link)
    .filter((link) =>
      spaceId ? pinnedInSpace.has(link.id) : Boolean(link.is_super_favorite) || pinnedAnywhere.has(link.id),
    )
    .sort((a, b) => (a.title || a.url).toLowerCase().localeCompare((b.title || b.url).toLowerCase()));
};
