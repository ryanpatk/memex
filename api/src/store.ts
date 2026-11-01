/**
 * CaptureStore (packages/core/src/capture/service.ts) over PostgREST, for
 * one user. Every query goes through `userScope`, so it is limited to the
 * token's user; join rows are written only for ids the service has already
 * ownership-checked.
 */
import {
  CaptureConflictError,
  type CapturedLink,
  type CaptureList,
  type CaptureStore,
  type LinkMatch,
  type NewCapturedLink,
} from '../../packages/core/src/capture';
import { DbError, inList, pgQuote, type UserDb } from './db';

/** Columns capture reads and returns (also the API's link shape). */
export const LINK_COLUMNS =
  'id,url,title,description,favicon_url,preview_image_url,source,source_id,lists,captured_by,captured_client,url_key,created_at';

const DEFAULT_PROJECT_NAME = 'Library';
const MAX_CANDIDATES = 25;

/**
 * `*fragment*` for LIKE. Fragments are built from validated ids, so the only
 * wildcard they can hold is `_` (YouTube ids); a looser match only over-fetches.
 */
const likeAnywhere = (fragment: string) => pgQuote(`*${fragment}*`);

/** The PostgREST `or=(…)` filter for a match. Over-fetches on purpose; the service re-checks each row. */
export function candidateFilter(match: LinkMatch): string {
  const terms: string[] = [];
  if (match.sourceId) terms.push(`and(source.eq.${pgQuote(match.source)},source_id.eq.${pgQuote(match.sourceId)})`);
  if (match.urlKey) terms.push(`url_key.eq.${pgQuote(match.urlKey)}`);
  if (match.urls.length) terms.push(`url.in.(${match.urls.map(pgQuote).join(',')})`);
  for (const fragment of match.idFragments) terms.push(`url.like.${likeAnywhere(fragment)}`);
  return `(${terms.join(',')})`;
}

export function createPostgrestCaptureStore(db: UserDb): CaptureStore {
  let projectId: Promise<string> | null = null;

  /** The hidden legacy 'Library' project every link still needs (links.project_id is NOT NULL). */
  const defaultProjectId = () =>
    (projectId ??= (async () => {
      const existing = await db.select<{ id: string }>('projects', {
        name: `eq.${DEFAULT_PROJECT_NAME}`,
        select: 'id',
        limit: '1',
      });
      if (existing[0]) return existing[0].id;
      const created = await db.insert<{ id: string }>('projects', {
        name: DEFAULT_PROJECT_NAME,
        description: 'Default link library (hidden)',
        is_starred: false,
      });
      return created[0].id;
    })());

  const owned = async (table: 'links' | 'profiles' | 'tags', ids: string[]) => {
    if (!ids.length) return [];
    const rows = await db.select<{ id: string }>(table, { id: inList(ids), select: 'id' });
    const found = new Set(rows.map((r) => r.id));
    return ids.filter((id) => found.has(id));
  };

  return {
    async findCandidates(match) {
      return db.select<CapturedLink>('links', {
        or: candidateFilter(match),
        select: LINK_COLUMNS,
        order: 'created_at.asc',
        limit: String(MAX_CANDIDATES),
      });
    },

    async insertLink(link: NewCapturedLink) {
      const project = await defaultProjectId();
      // New captures go to the top of the stack, matching the app.
      const top = await db.select<{ order_index: number }>('links', {
        project_id: `eq.${project}`,
        select: 'order_index',
        order: 'order_index.asc',
        limit: '1',
      });
      try {
        const rows = await db.insert<CapturedLink>('links', {
          ...link,
          project_id: project,
          order_index: (top[0]?.order_index ?? 1) - 1,
        });
        return pick(rows[0]);
      } catch (err) {
        if (err instanceof DbError && err.code === '23505') throw new CaptureConflictError();
        throw err;
      }
    },

    async setLists(linkId: string, lists: CaptureList[]) {
      await db.update('links', { id: `eq.${linkId}` }, { lists });
    },

    ownedLinkIds: (ids) => owned('links', ids),
    ownedSpaceIds: (ids) => owned('profiles', ids),
    ownedTagIds: (ids) => owned('tags', ids),

    async addToSpace(linkId, spaceId) {
      await db.joinInsert('profile_links', [{ profile_id: spaceId, link_id: linkId }], 'profile_id,link_id');
    },

    async addTags(linkId, tagIds) {
      await db.joinInsert(
        'link_tags',
        tagIds.map((tag_id) => ({ link_id: linkId, tag_id })),
        'link_id,tag_id',
      );
    },

    async deleteLink(linkId) {
      const rows = await db.delete<{ id: string }>('links', { id: `eq.${linkId}`, select: 'id' });
      return rows.length > 0;
    },
  };
}

const COLUMNS = LINK_COLUMNS.split(',') as (keyof CapturedLink)[];
/** Trim an inserted row (`select=*` on insert) to the API's link shape. */
const pick = (row: CapturedLink): CapturedLink =>
  Object.fromEntries(COLUMNS.map((c) => [c, row[c] ?? null])) as unknown as CapturedLink;
