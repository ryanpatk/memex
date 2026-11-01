/*
 * Capture input: the vocabulary (CONTEXT.md → Sources) and validation of
 * anything a client sends. Every id that reaches a database filter is checked
 * here first (UUIDs for spaces, tags and links; platform patterns for source ids).
 */
import type { SourceKey } from '../sources';
import { identifySource, isValidSourceId, type PlatformKey } from './identify';

export type CaptureList = 'bookmarked' | 'saved' | 'liked';
export type CapturedBy = 'app' | 'extension' | 'resync' | 'share' | 'api' | 'agent';

export const SOURCE_KEYS: readonly SourceKey[] = ['x', 'pinterest', 'youtube', 'web'];
export const CAPTURE_LISTS: readonly CaptureList[] = ['bookmarked', 'saved', 'liked'];
export const CAPTURED_BY: readonly CapturedBy[] = ['app', 'extension', 'resync', 'share', 'api', 'agent'];

export const LIMITS = {
  url: 2048,
  title: 500,
  description: 5000,
  client: 80,
  tagIds: 20,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A canonical 8-4-4-4-12 hex UUID (any version). */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

const isSourceKey = (value: unknown): value is SourceKey => SOURCE_KEYS.includes(value as SourceKey);
const isList = (value: unknown): value is CaptureList => CAPTURE_LISTS.includes(value as CaptureList);

/** An http(s) URL with no whitespace, within the length limit; else null. */
export function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > LIMITS.url || !/^https?:\/\/[^\s]+$/i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.hostname ? v : null;
  } catch {
    return null;
  }
}

/**
 * The single `links.source` string written before 2026-11-01 (and still sent
 * by v0.2 extensions): `extension`, `x:bookmark`, `pinterest:save`, and the
 * `<platform>:<list>` shape generally. New rows store the platform alone.
 */
export function parseSourceTag(tag: string | null | undefined): {
  source: SourceKey | null;
  lists: CaptureList[];
  capturedBy: CapturedBy | null;
} {
  if (!tag) return { source: null, lists: [], capturedBy: null };
  if (isSourceKey(tag)) return { source: tag, lists: [], capturedBy: null };
  if (tag === 'extension') return { source: null, lists: [], capturedBy: 'extension' };
  const [platform, verb] = tag.split(':');
  if (!isSourceKey(platform)) return { source: null, lists: [], capturedBy: null };
  const list: CaptureList | null =
    verb === 'bookmark' ? 'bookmarked' : verb === 'save' ? 'saved' : verb === 'like' ? 'liked' : isList(verb) ? verb : null;
  return {
    source: platform,
    lists: list ? [list] : [],
    capturedBy: 'extension',
  };
}

/** A validated capture request. */
export interface CaptureInput {
  url: string;
  source: SourceKey;
  sourceId: string | null;
  lists: CaptureList[];
  capturedBy: CapturedBy;
  client: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  spaceId: string | null;
  tagIds: string[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ParseCaptureOptions {
  /** Used when the body doesn't say (or isn't allowed to say). */
  defaultCapturedBy: CapturedBy;
  /** Values a client may claim for itself. Servers pin `agent` / `app` themselves. */
  allowedCapturedBy?: readonly CapturedBy[];
  /** Client name to use when the body has none (e.g. the MCP client's name). */
  defaultClient?: string | null;
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
};

const fail = (error: string): Parsed<never> => ({ ok: false, error });

/**
 * Validate a capture body (`POST /api/capture`, the MCP `save_link` tool…).
 * The URL decides the platform and id; a `source` / `sourceId` the client
 * sends must agree with it, so nothing can claim another item's dedupe key.
 */
export function parseCaptureInput(body: unknown, options: ParseCaptureOptions): Parsed<CaptureInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Body must be a JSON object');
  const b = body as Record<string, unknown>;

  const rawUrl = httpUrl(b.url);
  if (!rawUrl) return fail('A valid http(s) url is required');
  const identified = identifySource(rawUrl);

  // source: the platform, or a legacy tag (`x:bookmark`) from older clients.
  let claimed: SourceKey | null = null;
  const lists = new Set<CaptureList>();
  let legacyCapturedBy: CapturedBy | null = null;
  if (b.source != null) {
    if (typeof b.source !== 'string' || !/^[a-z0-9:_-]{1,40}$/.test(b.source)) return fail('Invalid source');
    const tag = parseSourceTag(b.source);
    if (!tag.source && !tag.capturedBy) return fail(`Unknown source "${b.source}"`);
    claimed = tag.source;
    tag.lists.forEach((l) => lists.add(l));
    legacyCapturedBy = tag.capturedBy;
  }
  if (claimed && claimed !== 'web' && claimed !== identified.source) {
    return fail(`url is not a ${claimed} item`);
  }

  if (b.sourceId != null) {
    if (typeof b.sourceId !== 'string' && typeof b.sourceId !== 'number') return fail('Invalid sourceId');
    const id = String(b.sourceId);
    if (identified.source === 'web') return fail('sourceId is only accepted for x, pinterest and youtube urls');
    if (!isValidSourceId(identified.source as PlatformKey, id)) return fail(`Invalid ${identified.source} sourceId`);
    if (id !== identified.sourceId) return fail('sourceId does not match url');
  }

  const listValues = b.lists ?? (b.list != null ? [b.list] : []);
  if (!Array.isArray(listValues)) return fail('lists must be an array');
  for (const l of listValues) {
    if (!isList(l)) return fail(`Unknown list "${String(l)}" (bookmarked · saved · liked)`);
    lists.add(l);
  }

  const allowed = options.allowedCapturedBy ?? [];
  let capturedBy: CapturedBy = legacyCapturedBy && allowed.includes(legacyCapturedBy) ? legacyCapturedBy : options.defaultCapturedBy;
  if (b.capturedBy != null) {
    if (!CAPTURED_BY.includes(b.capturedBy as CapturedBy)) return fail('Unknown capturedBy');
    if (!allowed.includes(b.capturedBy as CapturedBy)) return fail(`capturedBy "${String(b.capturedBy)}" is not allowed here`);
    capturedBy = b.capturedBy as CapturedBy;
  }

  let client: string | null = options.defaultClient ?? null;
  if (b.client != null) {
    if (typeof b.client !== 'string' || !/^[\w .:@/+()-]{1,80}$/.test(b.client.trim())) return fail('Invalid client name');
    client = b.client.trim();
  }

  let spaceId: string | null = null;
  if (b.spaceId != null && b.spaceId !== '') {
    if (!isUuid(b.spaceId)) return fail('spaceId must be a UUID');
    spaceId = b.spaceId.toLowerCase();
  }

  const tagValues = b.tagIds ?? [];
  if (!Array.isArray(tagValues)) return fail('tagIds must be an array');
  if (tagValues.length > LIMITS.tagIds) return fail(`At most ${LIMITS.tagIds} tagIds`);
  if (!tagValues.every(isUuid)) return fail('tagIds must be UUIDs');
  const tagIds = [...new Set(tagValues.map((t) => t.toLowerCase()))];

  const note = text(b.note, LIMITS.description);
  return {
    ok: true,
    value: {
      url: identified.url,
      source: identified.source,
      sourceId: identified.sourceId,
      lists: [...lists],
      capturedBy,
      client,
      title: text(b.title, LIMITS.title),
      // "Why I saved this" wins until links.note exists.
      description: note ?? text(b.description, LIMITS.description),
      image: httpUrl(b.image),
      favicon: httpUrl(b.favicon),
      spaceId,
      tagIds,
    },
  };
}
