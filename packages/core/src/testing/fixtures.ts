import type { JournalSpace } from '../journal/feed';
import type { LinkWithTag, NoteWithTags, Profile, SelfMessage, Tag, TaskWithTags } from '../types';

/* Test fixtures: minimal valid rows with overridable fields. Not exported from the package. */

const T0 = '2026-10-20T12:00:00.000Z';

export const tag = (id: string, name = id): Tag => ({
  id,
  user_id: 'u',
  name,
  color: '#000',
  created_at: T0,
  updated_at: T0,
});

export const link = (id: string, over: Partial<LinkWithTag> = {}): LinkWithTag => ({
  id,
  project_id: 'p',
  user_id: 'u',
  url: `https://example.com/${id}`,
  created_at: T0,
  updated_at: T0,
  order_index: 0,
  ...over,
});

export const note = (id: string, over: Partial<NoteWithTags> = {}): NoteWithTags => ({
  id,
  user_id: 'u',
  body: '',
  order_index: 0,
  created_at: T0,
  updated_at: T0,
  ...over,
});

export const task = (id: string, over: Partial<TaskWithTags> = {}): TaskWithTags => ({
  id,
  user_id: 'u',
  title: `Task ${id}`,
  is_done: false,
  order_index: 0,
  created_at: T0,
  updated_at: T0,
  ...over,
});

export const jot = (id: string, over: Partial<SelfMessage> = {}): SelfMessage => ({
  id,
  user_id: 'u',
  profile_id: null,
  body: `jot ${id}`,
  created_at: T0,
  updated_at: T0,
  ...over,
});

export const profile = (id: string, name: string, created_at = T0): Profile => ({
  id,
  user_id: 'u',
  name,
  created_at,
  updated_at: created_at,
});

export const space = (id: string, name: string, color = '#123'): JournalSpace => ({ id, name, color });

/** ISO time `minutes` after a fixed base (2026-10-20 12:00 UTC). */
export const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
