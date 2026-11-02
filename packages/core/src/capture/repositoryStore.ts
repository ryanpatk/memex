/*
 * A CaptureStore over the Repository, for clients that talk to their data
 * through it (the Expo app today, decision 20). memex-api keeps its own
 * PostgREST store (api/src/store.ts); both feed the same capture service,
 * so a link saved from the phone dedupes exactly like one from the extension.
 */
import type { Repository } from '../repository';
import type { LinkWithTag } from '../types';
import { urlHasFragment } from './identify';
import type { CaptureList, CapturedBy } from './input';
import { CaptureConflictError, type CapturedLink, type CaptureStore, type LinkMatch } from './service';

/** Could `link` be the thing `match` describes? Over-matches on purpose; `pickMatch` decides. */
export const mightMatch = (link: Pick<CapturedLink, 'url' | 'source' | 'source_id' | 'url_key'>, match: LinkMatch): boolean =>
  Boolean(
    (match.sourceId && link.source === match.source && link.source_id === match.sourceId) ||
      (match.urlKey && link.url_key === match.urlKey) ||
      match.urls.includes(link.url) ||
      match.idFragments.some((f) => urlHasFragment(link.url, f)),
  );

/** A Repository link row as the capture service sees it (nulls, not undefined). */
export const toCapturedLink = (link: LinkWithTag): CapturedLink => ({
  id: link.id,
  url: link.url,
  title: link.title ?? null,
  description: link.description ?? null,
  favicon_url: link.favicon_url ?? null,
  preview_image_url: link.preview_image_url ?? null,
  source: link.source ?? null,
  source_id: link.source_id ?? null,
  lists: (link.lists as CaptureList[] | undefined) ?? null,
  captured_by: (link.captured_by as CapturedBy | null | undefined) ?? null,
  captured_client: link.captured_client ?? null,
  url_key: link.url_key ?? null,
  created_at: link.created_at,
});

/** Postgres unique violation (Supabase / PostgREST surface it as code 23505). */
const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: unknown; message?: unknown } | null;
  return e?.code === '23505' || (typeof e?.message === 'string' && e.message.includes('duplicate key'));
};

export interface RepositoryCaptureStoreOptions {
  /**
   * Where candidates come from. Defaults to `repository.links.getAll()`; a
   * client with the links already in memory (a React Query cache) can pass
   * them to skip the round trip.
   */
  links?: () => Promise<LinkWithTag[]> | LinkWithTag[];
}

export function createRepositoryCaptureStore(repository: Repository, options: RepositoryCaptureStoreOptions = {}): CaptureStore {
  const allLinks = async () => (options.links ? await options.links() : await repository.links.getAll());

  return {
    async findCandidates(match) {
      return (await allLinks())
        .filter((link) => !link.id.startsWith('temp-'))
        .map(toCapturedLink)
        .filter((link) => mightMatch(link, match))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },

    async insertLink(link) {
      try {
        const row = await repository.links.create({
          url: link.url,
          title: link.title ?? undefined,
          description: link.description ?? undefined,
          favicon_url: link.favicon_url ?? undefined,
          preview_image_url: link.preview_image_url ?? undefined,
          source: link.source,
          source_id: link.source_id,
          lists: link.lists ?? [],
          captured_by: link.captured_by,
          captured_client: link.captured_client,
          url_key: link.url_key,
        });
        return toCapturedLink(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new CaptureConflictError();
        throw error;
      }
    },

    async setLists(linkId, lists) {
      await repository.links.update(linkId, { lists });
    },

    async ownedLinkIds(ids) {
      const rows = await Promise.all(ids.map((id) => repository.links.getById(id)));
      return rows.filter((row): row is LinkWithTag => Boolean(row)).map((row) => row.id);
    },

    async ownedSpaceIds(ids) {
      const owned = new Set((await repository.spaces.getAll()).map((space) => space.id));
      return ids.filter((id) => owned.has(id));
    },

    async ownedTagIds(ids) {
      const owned = new Set((await repository.tags.getAll()).map((tag) => tag.id));
      return ids.filter((id) => owned.has(id));
    },

    async addToSpace(linkId, spaceId) {
      await repository.spaceLinks.addLinks(spaceId, [linkId]);
    },

    async addTags(linkId, tagIds) {
      const link = await repository.links.getById(linkId);
      const current = (link?.link_tags ?? []).map((row) => row.tag_id ?? row.tag?.id).filter((id): id is string => Boolean(id));
      await repository.links.setTags(linkId, [...new Set([...current, ...tagIds])]);
    },

    async deleteLink(linkId) {
      if (!(await repository.links.getById(linkId))) return false;
      await repository.links.delete(linkId);
      return true;
    },
  };
}
