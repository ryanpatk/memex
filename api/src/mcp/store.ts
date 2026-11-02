/**
 * AgentReadStore (packages/core/src/agent/types.ts) over PostgREST, for one
 * user. Every query is a `userScope` select on an owned table (links, notes,
 * tasks, self_messages, profiles), so it carries `user_id=eq.<token's user>`.
 * Space and tag memberships are read only as embeds under those owned rows
 * (`profile_links(profile_id)`, `link_tags(tags(name))`), never from the join
 * tables directly, so they can't reach past the user filter either.
 */
import {
  canonicalTimestamp,
  keysetBound,
  type ActivityQuery,
  type AgentItemType,
  type AgentReadStore,
  type AgentRecord,
  type AgentSpaceRecord,
  type ItemQuery,
} from '../../../packages/core/src/agent';
import { pgQuote, type OwnedTable, type Params, type UserDb } from '../db';

interface TypeConfig {
  table: OwnedTable;
  columns: string;
  /** Columns a search term may match. */
  textColumns: string[];
  /** Membership join embedded under the row (none for jots: they carry profile_id). */
  spaceJoin: 'profile_links' | 'profile_notes' | 'profile_tasks' | null;
  tagJoin: 'link_tags' | 'note_tags' | 'task_tags' | null;
}

export const TYPES: Record<AgentItemType, TypeConfig> = {
  link: {
    table: 'links',
    columns:
      'id,created_at,updated_at,title,description,url,source,source_id,lists,captured_by,captured_client,preview_image_url,favicon_url',
    textColumns: ['title', 'description', 'url'],
    spaceJoin: 'profile_links',
    tagJoin: 'link_tags',
  },
  note: {
    table: 'notes',
    columns: 'id,created_at,updated_at,title,body',
    textColumns: ['title', 'body'],
    spaceJoin: 'profile_notes',
    tagJoin: 'note_tags',
  },
  task: {
    table: 'tasks',
    columns: 'id,created_at,updated_at,title,detail,is_done,due_date',
    textColumns: ['title', 'detail'],
    spaceJoin: 'profile_tasks',
    tagJoin: 'task_tags',
  },
  jot: {
    table: 'self_messages',
    columns: 'id,created_at,updated_at,body,profile_id',
    textColumns: ['body'],
    spaceJoin: null,
    tagJoin: null,
  },
};

/** Supabase caps a response at 1000 rows (`max_rows`), so long reads page. */
const MAX_ROWS = 1000;

type Row = Record<string, unknown> & { id: string; created_at: string; updated_at?: string };

const select = (cfg: TypeConfig, spaceId: string | null, base: string) => {
  const parts = [base];
  if (cfg.spaceJoin) {
    parts.push(`${cfg.spaceJoin}(profile_id)`);
    // A second, filtering embed keeps the full membership list above intact.
    if (spaceId) parts.push(`in_space:${cfg.spaceJoin}!inner(profile_id)`);
  }
  if (cfg.tagJoin) parts.push(`${cfg.tagJoin}(tags(name))`);
  return parts.join(',');
};

/** Space filter params for one type; the service has already checked the space is the user's. */
const spaceParams = (cfg: TypeConfig, spaceId: string | null): Params => {
  if (!spaceId) return {};
  return cfg.spaceJoin ? { 'in_space.profile_id': `eq.${spaceId}` } : { profile_id: `eq.${spaceId}` };
};

const spaceIdsOf = (cfg: TypeConfig, row: Row): string[] => {
  if (!cfg.spaceJoin) return typeof row.profile_id === 'string' ? [row.profile_id] : [];
  const joins = (row[cfg.spaceJoin] as { profile_id: string }[] | undefined) ?? [];
  return [...new Set(joins.map((j) => j.profile_id))];
};

const tagNamesOf = (cfg: TypeConfig, row: Row): string[] => {
  if (!cfg.tagJoin) return [];
  const joins = (row[cfg.tagJoin] as { tags: { name: string } | null }[] | undefined) ?? [];
  return joins.map((j) => j.tags?.name).filter((n): n is string => !!n);
};

const str = (v: unknown) => (typeof v === 'string' ? v : null);

function toRecord(type: AgentItemType, row: Row): AgentRecord {
  const cfg = TYPES[type];
  const base = {
    type,
    id: row.id,
    created_at: canonicalTimestamp(row.created_at),
    updated_at: canonicalTimestamp(row.updated_at ?? row.created_at),
    space_ids: spaceIdsOf(cfg, row),
    tag_names: tagNamesOf(cfg, row),
  };
  switch (type) {
    case 'link':
      return {
        ...base,
        title: str(row.title),
        text: str(row.description),
        url: str(row.url),
        source: str(row.source),
        source_id: str(row.source_id),
        lists: Array.isArray(row.lists) ? (row.lists as string[]) : [],
        captured_by: str(row.captured_by),
        captured_client: str(row.captured_client),
        preview_image_url: str(row.preview_image_url),
        favicon_url: str(row.favicon_url),
      };
    case 'note':
      return { ...base, title: str(row.title), text: str(row.body) };
    case 'task':
      return { ...base, title: str(row.title), text: str(row.detail), is_done: row.is_done === true, due_date: str(row.due_date) };
    case 'jot':
      return { ...base, title: null, text: str(row.body) };
  }
}

/** PostgREST conditions for a page query, as one `and=(…)` tree. */
export function itemConditions(q: Pick<ItemQuery, 'type' | 'terms' | 'from' | 'to' | 'after' | 'direction'>): string[] {
  const cfg = TYPES[q.type];
  const conds: string[] = [];
  if (q.from) conds.push(`created_at.gte.${pgQuote(q.from)}`);
  if (q.to) conds.push(`created_at.lt.${pgQuote(q.to)}`);
  if (q.after) {
    const b = keysetBound(q.type, q.after, q.direction);
    conds.push(
      b.tieId
        ? `or(created_at.${b.op}.${pgQuote(b.at)},and(created_at.eq.${pgQuote(b.at)},id.${b.tieOp}.${b.tieId}))`
        : `created_at.${b.op}.${pgQuote(b.at)}`,
    );
  }
  // Every term must match some column: and( or(col.ilike.*t*, …), … ).
  // Terms are free of * % \ (searchTerms); pgQuote escapes quotes.
  for (const term of q.terms) {
    conds.push(`or(${cfg.textColumns.map((c) => `${c}.ilike.${pgQuote(`*${term}*`)}`).join(',')})`);
  }
  return conds;
}

/** A narrowing hint for links from one platform (over-matches; the service re-checks with sourceOf). */
export function sourceHint(source: ItemQuery['source']): string | null {
  const hosts: Record<string, string[]> = {
    x: ['x.com', 'twitter.com'],
    pinterest: ['pinterest.', 'pin.it'],
    youtube: ['youtube.com', 'youtu.be'],
  };
  if (!source || !hosts[source]) return null; // 'web' is "none of the platforms": no cheap positive filter
  const terms = [`source.eq.${source}`, `source.like.${pgQuote(`${source}:*`)}`];
  for (const host of hosts[source]) terms.push(`url.ilike.${pgQuote(`*${host}*`)}`);
  return `or(${terms.join(',')})`;
}

export function createPostgrestAgentStore(db: UserDb): AgentReadStore {
  return {
    async listItems(q) {
      const cfg = TYPES[q.type];
      const conds = itemConditions(q);
      const hint = q.type === 'link' ? sourceHint(q.source) : null;
      if (hint) conds.push(hint);
      const dir = q.direction === 'asc' ? 'asc' : 'desc';
      const params: Params = {
        select: select(cfg, q.spaceId, cfg.columns),
        order: `created_at.${dir},id.${dir}`,
        limit: String(Math.min(q.limit, MAX_ROWS)),
        ...spaceParams(cfg, q.spaceId),
      };
      if (conds.length) params.and = `(${conds.join(',')})`;
      const rows = await db.select<Row>(cfg.table, params);
      return rows.map((row) => toRecord(q.type, row));
    },

    async getItem(type, id) {
      const cfg = TYPES[type];
      const rows = await db.select<Row>(cfg.table, { id: `eq.${id}`, select: select(cfg, null, cfg.columns), limit: '1' });
      return rows[0] ? toRecord(type, rows[0]) : null;
    },

    async listSpaces() {
      const rows = await db.select<{
        id: string;
        name: string;
        created_at: string;
        profile_links: { count: number }[];
        profile_notes: { count: number }[];
        profile_tasks: { count: number }[];
        self_messages: { count: number }[];
      }>('profiles', {
        select: 'id,name,created_at,profile_links(count),profile_notes(count),profile_tasks(count),self_messages(count)',
        order: 'name.asc',
        limit: String(MAX_ROWS),
      });
      const n = (agg: { count: number }[] | undefined) => agg?.[0]?.count ?? 0;
      return rows.map(
        (r): AgentSpaceRecord => ({
          id: r.id,
          name: r.name,
          created_at: canonicalTimestamp(r.created_at),
          counts: { link: n(r.profile_links), note: n(r.profile_notes), task: n(r.profile_tasks), jot: n(r.self_messages) },
        }),
      );
    },

    async activity(q: ActivityQuery) {
      const cfg = TYPES[q.type];
      const base = q.type === 'link' ? 'created_at,url,source' : q.type === 'jot' ? 'created_at,profile_id' : 'created_at';
      const rows: Row[] = [];
      for (let offset = 0; offset < q.limit; offset += MAX_ROWS) {
        const page = await db.select<Row>(cfg.table, {
          select: select(cfg, q.spaceId, base),
          and: `(${itemConditions({ type: q.type, terms: [], from: q.from, to: q.to, after: null, direction: 'asc' }).join(',')})`,
          order: 'created_at.asc,id.asc',
          limit: String(Math.min(MAX_ROWS, q.limit - offset)),
          offset: String(offset),
          ...spaceParams(cfg, q.spaceId),
        });
        rows.push(...page);
        if (page.length < MAX_ROWS) break;
      }
      return rows.map((row) => ({
        created_at: canonicalTimestamp(row.created_at),
        url: str(row.url),
        source: str(row.source),
        space_ids: spaceIdsOf(cfg, row),
      }));
    },
  };
}
