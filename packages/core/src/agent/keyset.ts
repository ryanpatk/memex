/*
 * Keyset pagination across item types. Every list the agent tools return is
 * one merged scan over (created_at, type, id), so a cursor is the last
 * position handed out and the next page starts strictly after it, in every
 * table at once. Stable under inserts, unlike offsets.
 */
import { isUuid } from '../capture/input';
import { isAgentItemType, type AgentItemType, type PageKey, type ScanDirection } from './types';

const TYPE_RANK: Record<AgentItemType, number> = { link: 0, note: 1, task: 2, jot: 3 };

const CANONICAL_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(?:Z|[+-]00(?::?00)?)$/;

/**
 * One fixed-width UTC form (`2026-11-01T09:30:00.123456Z`) for every
 * timestamp, so string order is time order and a cursor's value can go back
 * into a database filter unchanged (Postgres keeps microseconds).
 */
export function canonicalTimestamp(value: string): string {
  const m = CANONICAL_RE.exec(value);
  if (m) return `${m[1]}T${m[2]}.${(m[3] ?? '').padEnd(6, '0').slice(0, 6)}Z`;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Not a timestamp: ${value}`);
  return new Date(ms).toISOString().replace('Z', '000Z');
}

export const keyOf = (item: { created_at: string; type: AgentItemType; id: string }): PageKey => ({
  at: item.created_at,
  type: item.type,
  id: item.id,
});

/** Ascending order of positions. */
export function compareKeys(a: PageKey, b: PageKey): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.type !== b.type) return TYPE_RANK[a.type] - TYPE_RANK[b.type];
  return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
}

/** Compare in scan order: negative when `a` comes first. */
export const compareInScan = (a: PageKey, b: PageKey, direction: ScanDirection) =>
  direction === 'asc' ? compareKeys(a, b) : compareKeys(b, a);

/** True when `key` comes strictly after `cursor` in the scan. */
export const isAfterCursor = (key: PageKey, cursor: PageKey, direction: ScanDirection) =>
  compareInScan(key, cursor, direction) > 0;

/**
 * The created_at condition for one type's table that selects exactly the rows
 * after `cursor`:
 * - `op` against `at` (`lt`/`lte` when scanning down, `gt`/`gte` up)
 * - `tieId`: for the cursor's own type, rows at the same instant also need
 *   `id` beyond the cursor's (`created_at op at OR (created_at = at AND id tieOp tieId)`).
 */
export function keysetBound(
  type: AgentItemType,
  cursor: PageKey,
  direction: ScanDirection,
): { op: 'lt' | 'lte' | 'gt' | 'gte'; at: string; tieId: string | null; tieOp: 'lt' | 'gt' } {
  const down = direction === 'desc';
  const strict = down ? 'lt' : 'gt';
  const tieOp = strict;
  if (type === cursor.type) return { op: strict, at: cursor.at, tieId: cursor.id, tieOp };
  // Rows at the cursor's instant come after it when their type ranks after
  // the cursor's in the scan direction.
  const typeAfter = down ? TYPE_RANK[type] < TYPE_RANK[cursor.type] : TYPE_RANK[type] > TYPE_RANK[cursor.type];
  return { op: typeAfter ? (down ? 'lte' : 'gte') : strict, at: cursor.at, tieId: null, tieOp };
}

const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)~([a-z]+)~([0-9a-fA-F-]{36})$/;

/** Opaque to agents, readable to us: `<at>~<type>~<id>`. */
export const encodeCursor = (key: PageKey) => `${key.at}~${key.type}~${key.id}`;

/** The position a cursor names, or null when it isn't one of ours. */
export function decodeCursor(cursor: string): PageKey | null {
  const m = CURSOR_RE.exec(cursor);
  if (!m || !isAgentItemType(m[2]) || !isUuid(m[3])) return null;
  return { at: m[1], type: m[2], id: m[3].toLowerCase() };
}
