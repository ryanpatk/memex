/*
 * An in-memory CaptureStore for one user: for tests of anything built on the
 * capture service (memex-api routes, MCP tools). It enforces the same unique
 * (source, source_id) rule as the database.
 */
import type { CaptureList } from './input';
import { mightMatch } from './repositoryStore';
import { CaptureConflictError, type CapturedLink, type CaptureStore, type LinkMatch, type NewCapturedLink } from './service';

export interface MemoryCaptureStore extends CaptureStore {
  links: CapturedLink[];
  spaces: Set<string>;
  tags: Set<string>;
  memberships: { linkId: string; spaceId: string }[];
  linkTags: { linkId: string; tagId: string }[];
}

export function createMemoryCaptureStore(
  seed: { links?: CapturedLink[]; spaces?: string[]; tags?: string[] } = {},
  now: () => string = () => new Date().toISOString(),
): MemoryCaptureStore {
  let seq = 0;
  const store: MemoryCaptureStore = {
    links: [...(seed.links ?? [])],
    spaces: new Set(seed.spaces),
    tags: new Set(seed.tags),
    memberships: [],
    linkTags: [],

    async findCandidates(match: LinkMatch) {
      return store.links
        .filter((l) => mightMatch(l, match))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async insertLink(link: NewCapturedLink) {
      if (link.source_id && store.links.some((l) => l.source === link.source && l.source_id === link.source_id)) {
        throw new CaptureConflictError();
      }
      seq += 1;
      const row: CapturedLink = { ...link, id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, created_at: now() };
      store.links.push(row);
      return row;
    },
    async setLists(linkId: string, lists: CaptureList[]) {
      const row = store.links.find((l) => l.id === linkId);
      if (row) row.lists = lists;
    },
    async ownedLinkIds(ids) {
      return ids.filter((id) => store.links.some((l) => l.id === id));
    },
    async ownedSpaceIds(ids) {
      return ids.filter((id) => store.spaces.has(id));
    },
    async ownedTagIds(ids) {
      return ids.filter((id) => store.tags.has(id));
    },
    async addToSpace(linkId, spaceId) {
      if (!store.memberships.some((m) => m.linkId === linkId && m.spaceId === spaceId)) store.memberships.push({ linkId, spaceId });
    },
    async addTags(linkId, tagIds) {
      for (const tagId of tagIds) {
        if (!store.linkTags.some((t) => t.linkId === linkId && t.tagId === tagId)) store.linkTags.push({ linkId, tagId });
      }
    },
    async deleteLink(linkId) {
      const before = store.links.length;
      store.links = store.links.filter((l) => l.id !== linkId);
      return store.links.length < before;
    },
  };
  return store;
}
