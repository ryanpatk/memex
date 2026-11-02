/**
 * PostgREST access for memex-api.
 *
 * The Worker holds the service_role key, which bypasses RLS. So nothing talks
 * to user data through the raw client: `userScope(db, userId)` is the one
 * door, and it adds `user_id=eq.<token's user>` to every read, update and
 * delete, and sets `user_id` on every insert. Join tables (profile_links,
 * link_tags) have no user_id; they're written only through `joinInsert`,
 * after the caller has checked that both sides belong to the user.
 */
import { isUuid } from '../../packages/core/src/capture';

export interface DbEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

/** A PostgREST error with its HTTP status and Postgres code (e.g. 23505 = unique violation). */
export class DbError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

export type Params = Record<string, string>;

/**
 * Tables that carry user_id and are reachable through userScope. Notes,
 * tasks, jots (self_messages), the MCP audit log, agent tokens, idempotency
 * keys and Inbox proposals joined for /mcp (api/src/mcp/); their space/tag
 * joins are read only as embeds under an owned parent row, so they inherit
 * its user filter.
 */
export type OwnedTable =
  | 'links'
  | 'profiles'
  | 'tags'
  | 'projects'
  | 'notes'
  | 'tasks'
  | 'self_messages'
  | 'mcp_audit_log'
  | 'agent_tokens'
  | 'agent_write_keys'
  | 'inbox_proposals';
/** Join tables, written only after both sides were ownership-checked. */
export type JoinTable = 'profile_links' | 'link_tags' | 'profile_notes' | 'profile_tasks';

const qs = (params: Params) => new URLSearchParams(params).toString();

/** Raw service-role client. Only `authenticate` and `userScope` use it directly. */
export function createDb(env: DbEnv, fetcher: typeof fetch = fetch) {
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const call = async <T>(method: string, table: string, params: Params, body?: unknown, prefer?: string): Promise<T> => {
    const res = await fetcher(`${base}/${table}?${qs(params)}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { code?: string } | null;
      throw new DbError(`db ${method} ${table} failed (${res.status})`, res.status, detail?.code ?? null);
    }
    // GETs and return=representation writes have a JSON body; return=minimal ones don't.
    return (!prefer || prefer.includes('return=representation') ? res.json() : undefined) as Promise<T>;
  };

  return {
    select: <T>(table: string, params: Params) => call<T[]>('GET', table, params),
    insert: <T>(table: string, rows: unknown, params: Params = {}, prefer = 'return=representation') =>
      call<T[]>('POST', table, params, rows, prefer),
    update: (table: string, params: Params, patch: unknown) => call<void>('PATCH', table, params, patch, 'return=minimal'),
    /** PATCH that returns the updated rows (an empty list when the filter matched nothing). */
    updateReturning: <T>(table: string, params: Params, patch: unknown) =>
      call<T[]>('PATCH', table, params, patch, 'return=representation'),
    delete: <T>(table: string, params: Params) => call<T[]>('DELETE', table, params, undefined, 'return=representation'),
  };
}

export type Db = ReturnType<typeof createDb>;

/**
 * Every query this returns is limited to one user's rows. `user_id` in
 * caller-supplied params or bodies is overwritten, never trusted.
 */
export function userScope(db: Db, userId: string) {
  if (!isUuid(userId)) throw new Error('userScope needs a user UUID');
  const owned = (params: Params): Params => ({ ...params, user_id: `eq.${userId}` });
  const stamp = (row: Record<string, unknown>) => ({ ...row, user_id: userId });

  return {
    userId,
    select: <T>(table: OwnedTable, params: Params) => db.select<T>(table, owned(params)),
    insert: <T>(table: OwnedTable, rows: Record<string, unknown> | Record<string, unknown>[]) =>
      db.insert<T>(table, Array.isArray(rows) ? rows.map(stamp) : stamp(rows)),
    update: (table: OwnedTable, params: Params, patch: Record<string, unknown>) => {
      const rest = { ...patch };
      delete rest.user_id; // rows never change owner
      return db.update(table, owned(params), rest);
    },
    /** Conditional update: returns the rows it changed, so a caller can tell a lost race. */
    updateReturning: <T>(table: OwnedTable, params: Params, patch: Record<string, unknown>) => {
      const rest = { ...patch };
      delete rest.user_id;
      return db.updateReturning<T>(table, owned(params), rest);
    },
    delete: <T>(table: OwnedTable, params: Params) => db.delete<T>(table, owned(params)),
    /**
     * Insert membership rows, ignoring ones that already exist. Callers must
     * have verified that every id in `rows` belongs to this user.
     */
    joinInsert: (table: JoinTable, rows: Record<string, string>[], onConflict: string) =>
      db.insert(table, rows, { on_conflict: onConflict }, 'resolution=ignore-duplicates,return=minimal'),
  };
}

export type UserDb = ReturnType<typeof userScope>;

/** Quote a value for a PostgREST `or=(…)` / `in.(…)` list. */
export const pgQuote = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;

/** `id=in.(…)` for ids already validated as UUIDs. */
export const inList = (ids: string[]) => {
  if (!ids.every(isUuid)) throw new Error('inList takes UUIDs only');
  return `in.(${ids.join(',')})`;
};
