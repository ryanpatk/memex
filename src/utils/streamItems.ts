import {
  type ItemType,
  type LinkWithTag,
  type NoteWithTags,
  type Tag,
  type TaskWithTags,
  stripMarkdown,
} from '@memex/core';

/**
 * One row of the mixed stream. Every primitive is normalized to the same
 * envelope so filtering, sorting, and selection can treat them alike; the
 * payload keeps its full type for the card that renders it.
 */
export type StreamItem =
  | { type: 'link'; id: string; key: string; updatedAt: string; tags: Tag[]; link: LinkWithTag }
  | { type: 'note'; id: string; key: string; updatedAt: string; tags: Tag[]; note: NoteWithTags }
  | { type: 'task'; id: string; key: string; updatedAt: string; tags: Tag[]; task: TaskWithTags };

export const itemKey = (type: ItemType, id: string) => `${type}:${id}`;

export const parseItemKey = (key: string): { type: ItemType; id: string } => {
  const separator = key.indexOf(':');
  return {
    type: key.slice(0, separator) as ItemType,
    id: key.slice(separator + 1),
  };
};

/**
 * Merge the embedded join rows and any pre-resolved `tags` array into one
 * de-duplicated tag list. Links also carry a legacy single `tag`.
 */
export const mergeTags = (
  joins: { tag?: Tag }[] | undefined,
  direct: Tag[] | undefined,
  legacy?: Tag,
): Tag[] => {
  const map = new Map<string, Tag>();
  if (legacy) map.set(legacy.id, legacy);
  (joins ?? []).forEach((join) => {
    if (join.tag) map.set(join.tag.id, join.tag);
  });
  (direct ?? []).forEach((tag) => map.set(tag.id, tag));
  return Array.from(map.values());
};

export const linkToItem = (link: LinkWithTag): StreamItem => {
  const tags = mergeTags(link.link_tags, link.tags, link.tag);
  return {
    type: 'link',
    id: link.id,
    key: itemKey('link', link.id),
    updatedAt: link.updated_at,
    tags,
    link: { ...link, tags },
  };
};

export const noteToItem = (note: NoteWithTags): StreamItem => {
  const tags = mergeTags(note.note_tags, note.tags);
  return {
    type: 'note',
    id: note.id,
    key: itemKey('note', note.id),
    updatedAt: note.updated_at,
    tags,
    note: { ...note, tags },
  };
};

export const taskToItem = (task: TaskWithTags): StreamItem => {
  const tags = mergeTags(task.task_tags, task.tags);
  return {
    type: 'task',
    id: task.id,
    key: itemKey('task', task.id),
    updatedAt: task.updated_at,
    tags,
    task: { ...task, tags },
  };
};

export const buildStreamItems = (
  links: LinkWithTag[] | undefined,
  notes: NoteWithTags[] | undefined,
  tasks: TaskWithTags[] | undefined,
): StreamItem[] => [
  ...(links ?? []).map(linkToItem),
  ...(notes ?? []).map(noteToItem),
  ...(tasks ?? []).map(taskToItem),
];

/** Items still being created optimistically carry a temp id. */
export const isPendingItem = (item: StreamItem) => item.id.startsWith('temp-');

export const itemMatchesSearch = (item: StreamItem, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const has = (value?: string | null) => !!value && value.toLowerCase().includes(needle);

  if (item.type === 'link') {
    return (
      has(item.link.url) || has(item.link.title) || has(item.link.description)
    );
  }
  if (item.type === 'note') {
    return has(item.note.title) || has(stripMarkdown(item.note.body));
  }
  return has(item.task.title) || has(item.task.detail);
};

export const byUpdatedDesc = (a: StreamItem, b: StreamItem) =>
  b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0;
