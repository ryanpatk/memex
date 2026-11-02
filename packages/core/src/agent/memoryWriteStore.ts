/*
 * An in-memory AgentWriteStore for one user, for tests of the agent write
 * service and the MCP write tools. It keeps the store contract in
 * writeTypes.ts: ownership (only seeded rows exist), conditional note writes,
 * idempotency claims, pending-proposal lookups.
 */
import type { AgentItemType } from './types';
import type {
  AgentWriteStore,
  CreatedRow,
  EditableItem,
  KeyClaim,
  NewProposal,
  PendingProposalMatch,
  ProposalItemType,
  WriteKeyRow,
} from './writeTypes';

export interface MemoryWriteState {
  spaces: { id: string; name: string }[];
  items: EditableItem[];
  proposals: (NewProposal & CreatedRow & { status: 'pending' | 'applied' | 'rejected' })[];
  keys: Map<string, WriteKeyRow>;
  /** Every mutating call, for asserting that nothing deletes or bulk-edits. */
  writes: { method: string; args: unknown[] }[];
}

export interface MemoryAgentWriteStore extends AgentWriteStore {
  state: MemoryWriteState;
  /** Run before the next setNoteBody, e.g. to simulate the user editing the note meanwhile. */
  beforeNextNoteWrite?: () => void;
}

export function createMemoryAgentWriteStore(
  seed: { spaces?: { id: string; name: string }[]; items?: EditableItem[] } = {},
  opts: { now?: () => Date } = {},
): MemoryAgentWriteStore {
  const now = opts.now ?? (() => new Date('2026-11-01T12:00:00.000Z'));
  let counter = 0;
  const newId = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  };
  const tick = () => new Date(now().getTime() + counter).toISOString();
  const state: MemoryWriteState = {
    spaces: [...(seed.spaces ?? [])],
    items: (seed.items ?? []).map((i) => ({ ...i, space_ids: [...i.space_ids] })),
    proposals: [],
    keys: new Map(),
    writes: [],
  };
  const log = (method: string, ...args: unknown[]) => state.writes.push({ method, args });
  const find = (type: AgentItemType, id: string) => state.items.find((i) => i.type === type && i.id === id);
  const created = (type: AgentItemType, fields: Partial<EditableItem>): CreatedRow => {
    const row: EditableItem = {
      type,
      id: newId(),
      title: null,
      text: null,
      captured_by: null,
      captured_client: null,
      updated_at: tick(),
      space_ids: [],
      ...fields,
    };
    state.items.push(row);
    return { id: row.id, created_at: row.updated_at };
  };
  const keyOf = (client: string, key: string) => `${client}\u0000${key}`;

  const store: MemoryAgentWriteStore = {
    state,

    async getSpace(id) {
      return state.spaces.find((s) => s.id === id) ?? null;
    },

    async getEditable(type, id) {
      const item = find(type, id);
      return item ? { ...item, space_ids: [...item.space_ids] } : null;
    },

    async insertJot(row) {
      log('insertJot', row);
      return created('jot', { text: row.body, space_ids: row.profile_id ? [row.profile_id] : [], captured_by: row.captured_by, captured_client: row.captured_client });
    },

    async insertNote(row) {
      log('insertNote', row);
      return created('note', { title: row.title, text: row.body, captured_by: row.captured_by, captured_client: row.captured_client });
    },

    async insertTask(row) {
      log('insertTask', row);
      return created('task', {
        title: row.title,
        text: row.detail,
        due_date: row.due_date,
        is_done: false,
        captured_by: row.captured_by,
        captured_client: row.captured_client,
      });
    },

    async fileItem(type: ProposalItemType, itemId, spaceId) {
      log('fileItem', type, itemId, spaceId);
      const item = find(type, itemId);
      if (!item) throw new Error('fileItem: unknown item');
      if (!state.spaces.some((s) => s.id === spaceId)) throw new Error('fileItem: unknown space');
      if (!item.space_ids.includes(spaceId)) item.space_ids.push(spaceId);
    },

    async setNoteBody(id, body, expectedUpdatedAt) {
      const hook = store.beforeNextNoteWrite;
      store.beforeNextNoteWrite = undefined;
      hook?.();
      log('setNoteBody', id, body.length, expectedUpdatedAt);
      const note = find('note', id);
      if (!note || note.updated_at !== expectedUpdatedAt) return false;
      note.text = body;
      note.updated_at = tick();
      counter += 1;
      return true;
    },

    async insertProposal(row: NewProposal) {
      log('insertProposal', row);
      const out = { ...row, id: newId(), created_at: tick(), status: 'pending' as const };
      state.proposals.push(out);
      return { id: out.id, created_at: out.created_at };
    },

    async countPendingProposals(clientName) {
      return state.proposals.filter((p) => p.client_name === clientName && p.status === 'pending').length;
    },

    async findPendingProposal(m: PendingProposalMatch) {
      const p = state.proposals.find(
        (p) =>
          p.status === 'pending' &&
          p.client_name === m.client_name &&
          p.kind === m.kind &&
          p.item_type === m.item_type &&
          p.item_id === m.item_id &&
          p.space_id === m.space_id,
      );
      return p ? { id: p.id, created_at: p.created_at } : null;
    },

    async claimKey(row): Promise<KeyClaim> {
      const k = keyOf(row.client_name, row.idempotency_key);
      const existing = state.keys.get(k);
      if (existing) return { claimed: false, existing: { ...existing } };
      state.keys.set(k, { tool: row.tool, fingerprint: row.fingerprint, result: null, created_at: now().toISOString() });
      return { claimed: true };
    },

    async completeKey(clientName, key, result) {
      const row = state.keys.get(keyOf(clientName, key));
      if (row) row.result = JSON.parse(JSON.stringify(result));
    },

    async releaseKey(clientName, key) {
      state.keys.delete(keyOf(clientName, key));
    },
  };
  return store;
}
