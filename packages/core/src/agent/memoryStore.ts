/*
 * An in-memory AgentReadStore for one user, for tests of the agent read
 * service and the MCP tools. It follows the store contract in types.ts
 * exactly (terms, space, range, keyset, order) and ignores the `source`
 * hint, which the service must cope with.
 */
import { compareKeys, isAfterCursor, keyOf } from './keyset';
import { matchesTerms } from './text';
import type { ActivityQuery, AgentItemType, AgentReadStore, AgentRecord, AgentSpaceRecord, ItemQuery } from './types';

export interface MemoryAgentStore extends AgentReadStore {
  items: AgentRecord[];
  spaces: Omit<AgentSpaceRecord, 'counts'>[];
  /** Every store call, for asserting on what the service asked for. */
  calls: { method: string; query?: unknown }[];
}

const textFields = (r: AgentRecord) => [r.title, r.text, r.type === 'link' ? r.url : null];

export function createMemoryAgentStore(seed: {
  items?: AgentRecord[];
  spaces?: Omit<AgentSpaceRecord, 'counts'>[];
}): MemoryAgentStore {
  const inRange = (r: { created_at: string }, from: string | null, to: string | null) =>
    (!from || r.created_at >= from) && (!to || r.created_at < to);
  const inSpace = (r: AgentRecord, spaceId: string | null) => !spaceId || r.space_ids.includes(spaceId);

  const store: MemoryAgentStore = {
    items: [...(seed.items ?? [])],
    spaces: [...(seed.spaces ?? [])],
    calls: [],

    async listItems(q: ItemQuery) {
      store.calls.push({ method: 'listItems', query: q });
      return store.items
        .filter(
          (r) =>
            r.type === q.type &&
            matchesTerms(textFields(r), q.terms) &&
            inSpace(r, q.spaceId) &&
            inRange(r, q.from, q.to) &&
            (!q.after || isAfterCursor(keyOf(r), q.after, q.direction)),
        )
        .sort((a, b) => (q.direction === 'asc' ? 1 : -1) * compareKeys(keyOf(a), keyOf(b)))
        .slice(0, q.limit);
    },

    async getItem(type: AgentItemType, id: string) {
      store.calls.push({ method: 'getItem', query: { type, id } });
      return store.items.find((r) => r.type === type && r.id === id) ?? null;
    },

    async listSpaces() {
      store.calls.push({ method: 'listSpaces' });
      return store.spaces
        .map((s) => {
          const counts = { link: 0, note: 0, task: 0, jot: 0 };
          for (const r of store.items) if (r.space_ids.includes(s.id)) counts[r.type]++;
          return { ...s, counts };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async activity(q: ActivityQuery) {
      store.calls.push({ method: 'activity', query: q });
      return store.items
        .filter((r) => r.type === q.type && inSpace(r, q.spaceId) && inRange(r, q.from, q.to))
        .slice(0, q.limit)
        .map((r) => ({ created_at: r.created_at, url: r.url, source: r.source, space_ids: r.space_ids }));
    },
  };
  return store;
}
