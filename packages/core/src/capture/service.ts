/*
 * The capture service: save a link once, find it again, file it, undo it.
 * memex-api's HTTP routes and M3's MCP write tools both call this; storage
 * comes in through `CaptureStore`, already scoped to one user, so the service
 * never sees (or forgets) a user id.
 */
import type { SourceKey } from '../sources';
import { identifySource, legacyIdFragments } from './identify';
import { httpUrl, isUuid, parseSourceTag, type CaptureInput, type CaptureList, type CapturedBy } from './input';
import { normalizeUrlKey, urlVariants } from './urlKey';

/** The link columns capture reads and writes. */
export interface CapturedLink {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  favicon_url: string | null;
  preview_image_url: string | null;
  source: string | null;
  source_id: string | null;
  lists: CaptureList[] | null;
  captured_by: CapturedBy | null;
  captured_client: string | null;
  url_key: string | null;
  created_at: string;
}

export type NewCapturedLink = Omit<CapturedLink, 'id' | 'created_at'>;

/** How to find "the same thing" as a URL. Stores may over-fetch; the service re-checks. */
export interface LinkMatch {
  source: SourceKey;
  sourceId: string | null;
  urlKey: string | null;
  /** Exact spellings an older row (no url_key) might have stored. */
  urls: string[];
  /** Substrings that identify the item in older rows' URLs (no source_id). */
  idFragments: string[];
}

/** Thrown by `insertLink` when the (user, source, source_id) unique index rejects a row. */
export class CaptureConflictError extends Error {
  constructor() {
    super('A link with this source id already exists');
    this.name = 'CaptureConflictError';
  }
}

/** Thrown for bad input or ids the user doesn't own; `status` maps to HTTP. */
export class CaptureError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = 'CaptureError';
  }
}

/**
 * Storage for one user. Every method only ever sees that user's rows; the
 * memex-api implementation adds `user_id=eq.<token's user>` to every query in
 * one place (`api/src/db.ts`).
 */
export interface CaptureStore {
  /** Links that might match (by source id, url key, exact url or id fragment), oldest first. */
  findCandidates(match: LinkMatch): Promise<CapturedLink[]>;
  /** Insert a new link (the store adds placement: project, order). Throws CaptureConflictError on a duplicate source id. */
  insertLink(link: NewCapturedLink): Promise<CapturedLink>;
  setLists(linkId: string, lists: CaptureList[]): Promise<void>;
  /** Which of these ids are links / spaces / tags the user owns. */
  ownedLinkIds(ids: string[]): Promise<string[]>;
  ownedSpaceIds(ids: string[]): Promise<string[]>;
  ownedTagIds(ids: string[]): Promise<string[]>;
  /** Idempotent: an existing membership counts as success. */
  addToSpace(linkId: string, spaceId: string): Promise<void>;
  addTags(linkId: string, tagIds: string[]): Promise<void>;
  deleteLink(linkId: string): Promise<boolean>;
}

export interface PageMetadata {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  favicon?: string | null;
}

export interface CaptureServiceOptions {
  /** Fills gaps the client left (memex-scraper). Errors and timeouts count as "nothing". */
  enrich?: (url: string) => Promise<PageMetadata>;
}

export interface CaptureResult {
  link: CapturedLink;
  duplicate: boolean;
  /** Lists newly added to an existing link (e.g. bookmarked a post saved earlier from the toolbar). */
  listsAdded: CaptureList[];
  attached: { space: string | null; tags: string[] };
}

export type LookupResult = { found: false } | { found: true; link: CapturedLink };

/** Build the match for a URL (identify the item, normalize, list legacy spellings). */
export function linkMatchFor(url: string): LinkMatch {
  const identified = identifySource(url);
  const urls = new Set([...urlVariants(url), ...urlVariants(identified.url)]);
  return {
    source: identified.source,
    sourceId: identified.sourceId,
    urlKey: normalizeUrlKey(identified.url),
    urls: [...urls],
    idFragments: legacyIdFragments(identified.source, identified.sourceId),
  };
}

/** Rank how surely `link` is the thing `match` describes: 3 source id, 2 same item by URL, 1 same page, 0 not a match. */
export function matchStrength(link: Pick<CapturedLink, 'url' | 'source' | 'source_id' | 'url_key'>, match: LinkMatch): number {
  if (match.sourceId) {
    const rowSource = parseSourceTag(link.source).source;
    if (link.source_id === match.sourceId && rowSource === match.source) return 3;
    const fromUrl = identifySource(link.url);
    return fromUrl.source === match.source && fromUrl.sourceId === match.sourceId ? 2 : 0;
  }
  const key = link.url_key ?? normalizeUrlKey(link.url);
  return key && key === match.urlKey ? 1 : 0;
}

/** The best match among candidates: strongest, then oldest. */
export function pickMatch(candidates: CapturedLink[], match: LinkMatch): CapturedLink | null {
  let best: CapturedLink | null = null;
  let bestScore = 0;
  for (const link of candidates) {
    const score = matchStrength(link, match);
    if (score > bestScore || (score === bestScore && score > 0 && best && link.created_at < best.created_at)) {
      best = link;
      bestScore = score;
    }
  }
  return best;
}

const ensureUuid = (value: string, what: string) => {
  if (!isUuid(value)) throw new CaptureError(`${what} must be a UUID`);
  return value.toLowerCase();
};

export function createCaptureService(store: CaptureStore, options: CaptureServiceOptions = {}) {
  const find = async (match: LinkMatch) => pickMatch(await store.findCandidates(match), match);

  /** Ownership check before any write: a bad id never leaves a half-done capture. */
  const verify = async (input: Pick<CaptureInput, 'spaceId' | 'tagIds'>): Promise<CaptureResult['attached']> => {
    const [spaces, tags] = await Promise.all([
      input.spaceId ? store.ownedSpaceIds([input.spaceId]) : Promise.resolve([]),
      input.tagIds.length ? store.ownedTagIds(input.tagIds) : Promise.resolve([]),
    ]);
    if (input.spaceId && !spaces.length) throw new CaptureError('Space not found', 404);
    if (tags.length !== input.tagIds.length) throw new CaptureError('Tag not found', 404);
    return { space: spaces[0] ?? null, tags };
  };

  const attach = async (linkId: string, owned: CaptureResult['attached']) => {
    if (owned.space) await store.addToSpace(linkId, owned.space);
    if (owned.tags.length) await store.addTags(linkId, owned.tags);
    return owned;
  };

  const existing = async (link: CapturedLink, input: CaptureInput, owned: CaptureResult['attached']): Promise<CaptureResult> => {
    const current = link.lists ?? [];
    const listsAdded = input.lists.filter((l) => !current.includes(l));
    if (listsAdded.length) {
      await store.setLists(link.id, [...current, ...listsAdded]);
      link = { ...link, lists: [...current, ...listsAdded] };
    }
    return { link, duplicate: true, listsAdded, attached: await attach(link.id, owned) };
  };

  return {
    /**
     * Save `input` once. Same item already saved (same source id, the same
     * post under another URL, or the same normalized URL) → that link comes
     * back with `duplicate: true`; new lists are merged and the requested
     * space/tags are still applied. Space and tag ids are ownership-checked
     * before anything is written.
     */
    async capture(input: CaptureInput): Promise<CaptureResult> {
      const match = linkMatchFor(input.url);
      const [owned, found] = await Promise.all([verify(input), find(match)]);
      if (found) return existing(found, input, owned);

      const needsEnrich = !input.title || !input.description || !input.image;
      const scraped: PageMetadata = needsEnrich && options.enrich ? await options.enrich(input.url).catch(() => ({})) : {};
      const fallbackImage = identifySource(input.url).fallbackImage;

      let link: CapturedLink;
      try {
        link = await store.insertLink({
          url: input.url,
          title: input.title || scraped.title?.trim() || null,
          description: input.description || scraped.description?.trim() || null,
          favicon_url: httpUrl(scraped.favicon) || input.favicon || null,
          preview_image_url: input.image || httpUrl(scraped.image) || fallbackImage,
          source: input.source,
          source_id: input.sourceId,
          lists: input.lists,
          captured_by: input.capturedBy,
          captured_client: input.client,
          url_key: match.urlKey,
        });
      } catch (err) {
        // Two captures of one item raced; the other one won.
        if (!(err instanceof CaptureConflictError)) throw err;
        const winner = await find(match);
        if (!winner) throw err;
        return existing(winner, input, owned);
      }
      return { link, duplicate: false, listsAdded: [], attached: await attach(link.id, owned) };
    },

    /** The saved link that is the same thing as `url`, if any (read-only). */
    async lookup(url: string): Promise<LookupResult> {
      const valid = httpUrl(url);
      if (!valid) throw new CaptureError('A valid http(s) url is required');
      const link = await find(linkMatchFor(valid));
      return link ? { found: true, link } : { found: false };
    },

    /** File a saved link into a space (idempotent). */
    async addToSpace(linkId: string, spaceId: string): Promise<{ linkId: string; spaceId: string }> {
      const link = ensureUuid(linkId, 'linkId');
      const space = ensureUuid(spaceId, 'spaceId');
      const [[ownedLink], [ownedSpace]] = await Promise.all([store.ownedLinkIds([link]), store.ownedSpaceIds([space])]);
      if (!ownedLink) throw new CaptureError('Link not found', 404);
      if (!ownedSpace) throw new CaptureError('Space not found', 404);
      await store.addToSpace(link, space);
      return { linkId: link, spaceId: space };
    },

    /** Undo a capture. Only the user's own link; false when there was nothing to delete. */
    async remove(linkId: string): Promise<boolean> {
      const link = ensureUuid(linkId, 'linkId');
      const [owned] = await store.ownedLinkIds([link]);
      if (!owned) return false;
      return store.deleteLink(owned);
    },
  };
}

export type CaptureService = ReturnType<typeof createCaptureService>;
