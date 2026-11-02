/*
 * The agent read model (ROADMAP §3.6, Phase 7): what memex's MCP tools read,
 * independent of where the data lives. memex-api implements `AgentReadStore`
 * over Supabase today (api/src/mcp/store.ts); the v2 vault index can
 * implement the same port and the tools stay unchanged (decision 19).
 */
import type { SourceKey } from '../sources';

export const AGENT_ITEM_TYPES = ['link', 'note', 'task', 'jot'] as const;
/** The four primitives an agent can read. A jot is a `self_messages` row. */
export type AgentItemType = (typeof AGENT_ITEM_TYPES)[number];
export const isAgentItemType = (value: unknown): value is AgentItemType =>
  AGENT_ITEM_TYPES.includes(value as AgentItemType);

export const AGENT_SOURCES = ['x', 'pinterest', 'youtube', 'web'] as const satisfies readonly SourceKey[];
export type AgentSourceFilter = (typeof AGENT_SOURCES)[number];

/** Scan order: newest first (search, overviews) or oldest first (the Journal). */
export type ScanDirection = 'asc' | 'desc';

/** A position in the merged scan order: (created_at, type, id). */
export interface PageKey {
  /** Canonical timestamp (`canonicalTimestamp`): microseconds, UTC, `Z`. */
  at: string;
  type: AgentItemType;
  id: string;
}

/** One stored item, full text, as a store hands it to the service. */
export interface AgentRecord {
  type: AgentItemType;
  id: string;
  /** Canonical timestamps (the store normalizes them). */
  created_at: string;
  updated_at: string;
  /** Link title, note title, task title; null for jots and untitled items. */
  title: string | null;
  /** Link description, note body (markdown), task detail, jot body. */
  text: string | null;
  url?: string | null;
  /** Raw `links.source`: a platform, a pre-2026-11-01 tag, or null (saved in the app). */
  source?: string | null;
  source_id?: string | null;
  lists?: string[] | null;
  captured_by?: string | null;
  captured_client?: string | null;
  preview_image_url?: string | null;
  favicon_url?: string | null;
  is_done?: boolean;
  due_date?: string | null;
  space_ids: string[];
  tag_names: string[];
}

export interface AgentSpaceRecord {
  id: string;
  name: string;
  created_at: string;
  /** Items filed in the space, by type. */
  counts: Record<AgentItemType, number>;
}

/**
 * One page request to a store, for one type. A store must apply `terms`
 * (every term in some text field, case-insensitive), `spaceId`, the
 * `[from, to)` created_at range and the keyset exactly, ordered by
 * (created_at, id) in `direction`. `source` is a hint it may use to narrow
 * links; the service re-checks it with `sourceOf`.
 */
export interface ItemQuery {
  type: AgentItemType;
  terms: string[];
  spaceId: string | null;
  source: AgentSourceFilter | null;
  from: string | null;
  to: string | null;
  after: PageKey | null;
  direction: ScanDirection;
  limit: number;
}

/** Just enough of an item to count it (timeline_stats). */
export interface ActivityRecord {
  created_at: string;
  url?: string | null;
  source?: string | null;
  space_ids: string[];
}

export interface ActivityQuery {
  type: AgentItemType;
  from: string;
  to: string;
  spaceId: string | null;
  limit: number;
}

/** The storage port for agent reads, already scoped to one user. */
export interface AgentReadStore {
  listItems(query: ItemQuery): Promise<AgentRecord[]>;
  getItem(type: AgentItemType, id: string): Promise<AgentRecord | null>;
  listSpaces(): Promise<AgentSpaceRecord[]>;
  activity(query: ActivityQuery): Promise<ActivityRecord[]>;
}

/** Bad arguments from the agent; the message is safe to show it. */
export class AgentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentInputError';
  }
}

/** The id doesn't exist for this user (or isn't theirs: same answer on purpose). */
export class AgentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentNotFoundError';
  }
}
