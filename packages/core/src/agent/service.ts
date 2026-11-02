/*
 * The read side of memex's MCP tools, over any `AgentReadStore` already
 * scoped to one user. memex-api builds one per request
 * (api/src/mcp/server.ts); each method validates its own arguments (the MCP
 * layer's JSON Schema is the first check, this is the one that counts),
 * caps sizes, and pages with keyset cursors (keyset.ts).
 */
import { httpUrl, isUuid } from '../capture/input';
import { markdownExcerpt, noteDisplayTitle } from '../markdown';
import { hostOf, sourceOf, type SourceKey } from '../sources';
import { IMAGE_LIMITS, markdownImages, type AgentImage } from './images';
import { addDays, bucketStart, dayOf, dayStartMs, daySpan, isDay, isTimeZone, type Bucket } from './dates';
import { canonicalTimestamp, compareInScan, decodeCursor, encodeCursor, keyOf } from './keyset';
import { AGENT_LIMITS, clip, firstLine, searchTerms } from './text';
import {
  AGENT_ITEM_TYPES,
  AGENT_SOURCES,
  AgentInputError,
  AgentNotFoundError,
  isAgentItemType,
  type AgentItemType,
  type AgentReadStore,
  type AgentRecord,
  type AgentSourceFilter,
  type AgentSpaceRecord,
  type ItemQuery,
  type PageKey,
  type ScanDirection,
} from './types';

export interface SpaceRef {
  id: string;
  name: string;
}

/** An item in a list: enough to decide whether to open it with get_item. */
export interface AgentItemSummary {
  type: AgentItemType;
  id: string;
  title: string;
  excerpt: string | null;
  /** Links: the saved URL and where it came from (x · pinterest · youtube · web). */
  url?: string | null;
  source?: SourceKey;
  /** Tasks. */
  done?: boolean;
  due_date?: string | null;
  spaces: SpaceRef[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

/** get_item: the summary plus the full text (capped) and link metadata. */
export interface AgentItemDetail extends AgentItemSummary {
  text: string | null;
  text_length: number;
  text_truncated: boolean;
  source_id?: string | null;
  lists?: string[];
  /** 'agent' when an MCP agent wrote it (captured_client names which); for links also extension, api…; null = the user, in the app. */
  captured_by: string | null;
  captured_client: string | null;
  preview_image_url?: string | null;
}

export interface ItemPage {
  items: AgentItemSummary[];
  /** Pass back as `cursor` for the next page; null when there is none. */
  next_cursor: string | null;
}

export interface SearchArgs {
  query: string;
  types?: AgentItemType[];
  space_id?: string;
  source?: AgentSourceFilter;
  from?: string;
  to?: string;
  timezone?: string;
  limit?: number;
  cursor?: string;
}

export interface JournalArgs {
  from: string;
  to?: string;
  timezone?: string;
  types?: AgentItemType[];
  space_id?: string;
  limit?: number;
  cursor?: string;
}

export interface OverviewArgs {
  space_id: string;
  limit?: number;
  cursor?: string;
}

export interface ImagesArgs {
  type?: AgentItemType;
  id?: string;
  space_id?: string;
  limit?: number;
  cursor?: string;
}

/** One item's pictures, for get_images. */
export interface ItemImages {
  item: { type: AgentItemType; id: string; title: string };
  images: AgentImage[];
}

export interface StatsArgs {
  from?: string;
  to?: string;
  timezone?: string;
  space_id?: string;
  bucket?: Bucket;
}

type Counts = Record<AgentItemType, number>;
const zeroCounts = (): Counts => ({ link: 0, note: 0, task: 0, jot: 0 });
const total = (c: Counts) => c.link + c.note + c.task + c.jot;

// ── argument checks ────────────────────────────────────────────────────────

const limitArg = (value: unknown, fallback: number, max: number): number => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AgentInputError(`limit must be a whole number from 1 to ${max}`);
  }
  return Math.min(value, max);
};

const typesArg = (value: unknown): AgentItemType[] => {
  if (value === undefined || value === null) return [...AGENT_ITEM_TYPES];
  if (!Array.isArray(value) || !value.every(isAgentItemType)) {
    throw new AgentInputError(`types must be a list of ${AGENT_ITEM_TYPES.join(', ')}`);
  }
  // Empty means "every type", same as leaving it out.
  return value.length ? AGENT_ITEM_TYPES.filter((t) => value.includes(t)) : [...AGENT_ITEM_TYPES];
};

const timeZoneArg = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return 'UTC';
  if (!isTimeZone(value)) throw new AgentInputError('timezone must be an IANA name like "UTC" or "America/New_York"');
  return value;
};

const dayArg = (value: unknown, name: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (!isDay(value)) throw new AgentInputError(`${name} must be a date like 2026-11-01`);
  return value;
};

const cursorArg = (value: unknown): PageKey | null => {
  if (value === undefined || value === null || value === '') return null;
  const key = typeof value === 'string' ? decodeCursor(value) : null;
  if (!key) throw new AgentInputError('cursor is not one this server issued; drop it to start from the beginning');
  return key;
};

const spaceIdArg = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (!isUuid(value)) throw new AgentInputError('space_id must be a space id from list_spaces');
  return value.toLowerCase();
};

const instant = (ms: number) => canonicalTimestamp(new Date(ms).toISOString());

// ── shaping ────────────────────────────────────────────────────────────────

function titleOf(r: AgentRecord): string {
  const T = AGENT_LIMITS.titleChars;
  switch (r.type) {
    case 'link':
      return clip(r.title?.trim() || (r.url ? hostOf(r.url) : '') || 'Untitled link', T);
    case 'note':
      return clip(noteDisplayTitle({ title: r.title ?? undefined, body: r.text ?? '' }), T);
    case 'task':
      return clip(r.title?.trim() || 'Untitled task', T);
    case 'jot':
      return clip(firstLine(r.text ?? '') || 'Empty jot', 80);
  }
}

function excerptOf(r: AgentRecord, title: string): string | null {
  const text = r.text?.trim();
  if (!text) return null;
  const E = AGENT_LIMITS.excerptChars;
  if (r.type === 'note') return markdownExcerpt(text, E) || null;
  // A short one-line jot is all title.
  if (r.type === 'jot' && text === title) return null;
  return clip(text.replace(/\s+/g, ' '), E);
}

/** A record's http(s) pictures: a link's preview, then images in its text. */
function imagesOf(r: AgentRecord): AgentImage[] {
  const out: AgentImage[] = [];
  const preview = r.type === 'link' ? httpUrl(r.preview_image_url) : null;
  if (preview) out.push({ url: preview, alt: null, kind: 'preview' });
  for (const img of markdownImages(r.text, IMAGE_LIMITS.perItem)) if (img.url !== preview) out.push(img);
  return out.slice(0, IMAGE_LIMITS.perItem + 1);
}

// ── the service ────────────────────────────────────────────────────────────

export function createAgentReadService(store: AgentReadStore, deps: { now?: () => Date } = {}) {
  const now = deps.now ?? (() => new Date());
  let spacesOnce: Promise<AgentSpaceRecord[]> | null = null;
  const spaces = () => (spacesOnce ??= store.listSpaces());
  const spaceNames = async () => new Map((await spaces()).map((s) => [s.id, s.name]));

  const requireSpace = async (id: string) => {
    const space = (await spaces()).find((s) => s.id === id);
    if (!space) throw new AgentNotFoundError('No space with that id (list_spaces shows them)');
    return space;
  };

  const summarize = (r: AgentRecord, names: Map<string, string>): AgentItemSummary => {
    const title = titleOf(r);
    const item: AgentItemSummary = {
      type: r.type,
      id: r.id,
      title,
      excerpt: excerptOf(r, title),
      spaces: r.space_ids.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! })),
      tags: r.tag_names.slice(0, 20),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
    if (r.type === 'link') {
      item.url = r.url ?? null;
      item.source = sourceOf({ url: r.url ?? '', source: r.source ?? null }).key;
    }
    if (r.type === 'task') {
      item.done = !!r.is_done;
      item.due_date = r.due_date ?? null;
    }
    return item;
  };

  /**
   * One page of the merged scan over `types`. Each type is read after the
   * cursor; when a post-filter (`keep`) is in play a type may need several
   * reads, and the page is cut at the earliest point any unfinished type got
   * to, so nothing is ever skipped between pages.
   */
  async function scanPage(opts: {
    types: AgentItemType[];
    base: Omit<ItemQuery, 'type' | 'after' | 'limit' | 'direction'>;
    direction: ScanDirection;
    after: PageKey | null;
    limit: number;
    keep: ((r: AgentRecord) => boolean) | null;
  }): Promise<{ records: AgentRecord[]; next: PageKey | null }> {
    const { direction, limit, keep } = opts;
    const perType = await Promise.all(
      opts.types.map(async (type) => {
        const matched: AgentRecord[] = [];
        let after = opts.after;
        const batch = keep ? AGENT_LIMITS.scanBatch : limit + 1;
        for (let scan = 0; scan < (keep ? AGENT_LIMITS.maxScans : 1); scan++) {
          const rows = await store.listItems({ ...opts.base, type, after, limit: batch, direction });
          for (const row of rows) if (!keep || keep(row)) matched.push(row);
          if (rows.length < batch) return { matched, frontier: null };
          after = keyOf(rows[rows.length - 1]);
          if (matched.length > limit) break;
        }
        return { matched, frontier: after };
      }),
    );

    // The earliest point an unfinished type reached bounds what we can hand out.
    let frontier: PageKey | null = null;
    for (const t of perType) {
      if (t.frontier && (!frontier || compareInScan(t.frontier, frontier, direction) < 0)) frontier = t.frontier;
    }
    const eligible = perType
      .flatMap((t) => t.matched)
      .filter((r) => !frontier || compareInScan(keyOf(r), frontier, direction) <= 0)
      .sort((a, b) => compareInScan(keyOf(a), keyOf(b), direction));
    const records = eligible.slice(0, limit);
    const next =
      eligible.length > limit ? keyOf(records[records.length - 1]) : frontier;
    return { records, next };
  }

  const dayRange = (from: string | null, to: string | null, tz: string) => ({
    from: from ? instant(dayStartMs(from, tz)) : null,
    to: to ? instant(dayStartMs(addDays(to, 1), tz)) : null,
  });

  return {
    /** Text search over every type, newest first. */
    async search(args: SearchArgs): Promise<ItemPage & { terms: string[] }> {
      if (typeof args.query !== 'string') throw new AgentInputError('query is required');
      const terms = searchTerms(args.query);
      if (!terms.length) throw new AgentInputError('query needs at least one word');
      const source = args.source ?? null;
      if (source !== null && !AGENT_SOURCES.includes(source)) {
        throw new AgentInputError(`source must be one of ${AGENT_SOURCES.join(', ')}`);
      }
      // Only links have a source.
      const types = typesArg(args.types).filter((t) => !source || t === 'link');
      const spaceId = spaceIdArg(args.space_id);
      if (spaceId) await requireSpace(spaceId);
      const tz = timeZoneArg(args.timezone);
      const from = dayArg(args.from, 'from');
      const to = dayArg(args.to, 'to');
      if (from && to && from > to) throw new AgentInputError('from must not be after to');
      const limit = limitArg(args.limit, AGENT_LIMITS.pageDefault, AGENT_LIMITS.pageMax);
      const after = cursorArg(args.cursor);

      const [names, page] = await Promise.all([
        spaceNames(),
        types.length
          ? scanPage({
              types,
              base: { terms, spaceId, source, ...dayRange(from, to, tz) },
              direction: 'desc',
              after,
              limit,
              keep: source ? (r) => sourceOf({ url: r.url ?? '', source: r.source ?? null }).key === source : null,
            })
          : Promise.resolve({ records: [], next: null }),
      ]);
      return {
        terms,
        items: page.records.map((r) => summarize(r, names)),
        next_cursor: page.next ? encodeCursor(page.next) : null,
      };
    },

    /** One item in full (note bodies capped at AGENT_LIMITS.fullTextChars). */
    async getItem(args: { type: AgentItemType; id: string }): Promise<AgentItemDetail> {
      if (!isAgentItemType(args.type)) throw new AgentInputError(`type must be one of ${AGENT_ITEM_TYPES.join(', ')}`);
      if (!isUuid(args.id)) throw new AgentInputError('id must be an item id from another tool');
      const [record, names] = await Promise.all([store.getItem(args.type, args.id.toLowerCase()), spaceNames()]);
      if (!record) throw new AgentNotFoundError(`No ${args.type} with that id`);
      const text = record.text ?? null;
      const max = AGENT_LIMITS.fullTextChars;
      const detail: AgentItemDetail = {
        ...summarize(record, names),
        text: text && text.length > max ? text.slice(0, max) : text,
        text_length: text?.length ?? 0,
        text_truncated: !!text && text.length > max,
        // Who wrote it: 'agent' + client name for MCP writes (append_to_note applies
        // directly only to notes this client wrote), null when the user did.
        captured_by: record.captured_by ?? null,
        captured_client: record.captured_client ?? null,
      };
      if (record.type === 'link') {
        detail.source_id = record.source_id ?? null;
        detail.lists = record.lists ?? [];
        detail.preview_image_url = record.preview_image_url ?? null;
      }
      return detail;
    },

    /** The Journal for a range of days, oldest first, grouped by day. */
    async getJournal(args: JournalArgs) {
      const tz = timeZoneArg(args.timezone);
      const from = dayArg(args.from, 'from');
      if (!from) throw new AgentInputError('from is required (a date like 2026-11-01)');
      const to = dayArg(args.to, 'to') ?? from;
      if (from > to) throw new AgentInputError('from must not be after to');
      if (daySpan(from, to) > AGENT_LIMITS.journalRangeDays) {
        throw new AgentInputError(`A journal range can cover at most ${AGENT_LIMITS.journalRangeDays} days`);
      }
      const types = typesArg(args.types);
      const spaceId = spaceIdArg(args.space_id);
      if (spaceId) await requireSpace(spaceId);
      const limit = limitArg(args.limit, AGENT_LIMITS.journalPageDefault, AGENT_LIMITS.journalPageMax);
      const after = cursorArg(args.cursor);

      const [names, page] = await Promise.all([
        spaceNames(),
        scanPage({
          types,
          base: { terms: [], spaceId, source: null, ...dayRange(from, to, tz) },
          direction: 'asc',
          after,
          limit,
          keep: null,
        }),
      ]);
      const days: { date: string; items: AgentItemSummary[] }[] = [];
      for (const r of page.records) {
        const date = dayOf(r.created_at, tz);
        if (days[days.length - 1]?.date !== date) days.push({ date, items: [] });
        days[days.length - 1].items.push(summarize(r, names));
      }
      return { from, to, timezone: tz, days, next_cursor: page.next ? encodeCursor(page.next) : null };
    },

    /** Every space with how much is filed in it. */
    async listSpaces() {
      const list = await spaces();
      return {
        spaces: list.map((s) => ({ id: s.id, name: s.name, created_at: s.created_at, counts: s.counts, total: total(s.counts) })),
      };
    },

    /** One space: counts and its most recent items, newest first. */
    async spaceOverview(args: OverviewArgs) {
      const spaceId = spaceIdArg(args.space_id);
      if (!spaceId) throw new AgentInputError('space_id is required');
      const space = await requireSpace(spaceId);
      const limit = limitArg(args.limit, 10, AGENT_LIMITS.recentMax);
      const after = cursorArg(args.cursor);
      const [names, page] = await Promise.all([
        spaceNames(),
        scanPage({
          types: [...AGENT_ITEM_TYPES],
          base: { terms: [], spaceId, source: null, from: null, to: null },
          direction: 'desc',
          after,
          limit,
          keep: null,
        }),
      ]);
      return {
        space: { id: space.id, name: space.name, created_at: space.created_at },
        counts: space.counts,
        total: total(space.counts),
        recent: page.records.map((r) => summarize(r, names)),
        next_cursor: page.next ? encodeCursor(page.next) : null,
      };
    },

    /**
     * Pictures as URLs (never bytes): one item's (`type` + `id`), or the
     * newest items in a space that have any (`space_id`, paged by item).
     */
    async getImages(args: ImagesArgs): Promise<{ items: ItemImages[]; next_cursor: string | null }> {
      const hasItem = args.type !== undefined || args.id !== undefined;
      const spaceId = spaceIdArg(args.space_id);
      if (hasItem === !!spaceId) throw new AgentInputError('Pass either type and id (one item) or space_id (a space), not both');
      const names = await spaceNames();
      if (hasItem) {
        if (args.cursor) throw new AgentInputError('cursor only applies to space_id');
        if (!isAgentItemType(args.type)) throw new AgentInputError(`type must be one of ${AGENT_ITEM_TYPES.join(', ')}`);
        if (!isUuid(args.id)) throw new AgentInputError('id must be an item id from another tool');
        const record = await store.getItem(args.type, args.id.toLowerCase());
        if (!record) throw new AgentNotFoundError(`No ${args.type} with that id`);
        const images = imagesOf(record);
        return { items: images.length ? [{ item: { type: record.type, id: record.id, title: summarize(record, names).title }, images }] : [], next_cursor: null };
      }
      await requireSpace(spaceId!);
      const limit = limitArg(args.limit, IMAGE_LIMITS.pageDefault, IMAGE_LIMITS.pageMax);
      const page = await scanPage({
        types: ['link', 'note', 'task', 'jot'],
        base: { terms: [], spaceId, source: null, from: null, to: null },
        direction: 'desc',
        after: cursorArg(args.cursor),
        limit,
        keep: (r) => imagesOf(r).length > 0,
      });
      return {
        items: page.records.map((r) => ({ item: { type: r.type, id: r.id, title: summarize(r, names).title }, images: imagesOf(r) })),
        next_cursor: page.next ? encodeCursor(page.next) : null,
      };
    },

    /** Counts over time: by day/week/month, by type, by source and by space. */
    async timelineStats(args: StatsArgs) {
      const tz = timeZoneArg(args.timezone);
      const to = dayArg(args.to, 'to') ?? dayOf(now().getTime(), tz);
      const from = dayArg(args.from, 'from') ?? addDays(to, -29);
      if (from > to) throw new AgentInputError('from must not be after to');
      const span = daySpan(from, to);
      if (span > AGENT_LIMITS.statsRangeDays) {
        throw new AgentInputError(`A stats range can cover at most ${AGENT_LIMITS.statsRangeDays} days`);
      }
      const bucket: Bucket = args.bucket ?? (span <= 92 ? 'day' : span <= 366 ? 'week' : 'month');
      if (!['day', 'week', 'month'].includes(bucket)) throw new AgentInputError('bucket must be day, week or month');
      if (bucket === 'day' && span > AGENT_LIMITS.statsDayBuckets) {
        throw new AgentInputError(`Use bucket "week" or "month" for ranges over ${AGENT_LIMITS.statsDayBuckets} days`);
      }
      const spaceId = spaceIdArg(args.space_id);
      if (spaceId) await requireSpace(spaceId);
      const range = dayRange(from, to, tz) as { from: string; to: string };
      const cap = AGENT_LIMITS.statsRowsPerType;

      const [names, ...perType] = await Promise.all([
        spaceNames(),
        ...AGENT_ITEM_TYPES.map((type) => store.activity({ type, ...range, spaceId, limit: cap })),
      ]);

      const buckets = new Map<string, Counts>();
      for (let day = bucketStart(from, bucket); day <= to; ) {
        buckets.set(day, zeroCounts());
        day = bucket === 'day' ? addDays(day, 1) : bucket === 'week' ? addDays(day, 7) : bucketStart(addDays(day, 31), 'month');
      }
      const totals = zeroCounts();
      const bySource: Record<SourceKey, number> = { x: 0, pinterest: 0, youtube: 0, web: 0 };
      const bySpace = new Map<string, number>();
      const truncated: AgentItemType[] = [];
      AGENT_ITEM_TYPES.forEach((type, i) => {
        const rows = perType[i];
        if (rows.length >= cap) truncated.push(type);
        for (const row of rows) {
          totals[type]++;
          const counts = buckets.get(bucketStart(dayOf(row.created_at, tz), bucket));
          if (counts) counts[type]++;
          if (type === 'link') bySource[sourceOf({ url: row.url ?? '', source: row.source ?? null }).key]++;
          for (const id of row.space_ids) bySpace.set(id, (bySpace.get(id) ?? 0) + 1);
        }
      });

      return {
        from,
        to,
        timezone: tz,
        bucket,
        totals: { ...totals, total: total(totals) },
        series: [...buckets].map(([start, c]) => ({ start, ...c, total: total(c) })),
        links_by_source: bySource,
        by_space: [...bySpace]
          .filter(([id]) => names.has(id))
          .map(([id, count]) => ({ id, name: names.get(id)!, count }))
          .sort((a, b) => b.count - a.count),
        /** Types with more than AGENT_LIMITS.statsRowsPerType items in range were counted only that far. */
        truncated,
      };
    },
  };
}

export type AgentReadService = ReturnType<typeof createAgentReadService>;
