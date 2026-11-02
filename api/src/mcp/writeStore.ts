/**
 * AgentWriteStore (packages/core/src/agent/writeTypes.ts) over PostgREST, for
 * one user. Every query goes through `userScope`, so reads carry
 * `user_id=eq.<token's user>` and inserts are stamped with it. Membership
 * rows (profile_links / profile_notes / profile_tasks) are written only by
 * `fileItem`, which the write service calls after checking that both the
 * item and the space are the user's.
 */
import type {
  AgentItemType,
  AgentWriteStore,
  CreatedRow,
  EditableItem,
  KeyClaim,
  ProposalItemType,
  WriteKeyRow,
} from '../../../packages/core/src/agent';
import { DbError, type JoinTable, type OwnedTable, type Params, type UserDb } from '../db';

interface EditableConfig {
  table: OwnedTable;
  columns: string;
  titleColumn: string | null;
  textColumn: string;
  spaceJoin: 'profile_links' | 'profile_notes' | 'profile_tasks' | null;
}

const EDITABLE: Record<AgentItemType, EditableConfig> = {
  link: {
    table: 'links',
    columns: 'id,title,description,captured_by,captured_client,updated_at,profile_links(profile_id)',
    titleColumn: 'title',
    textColumn: 'description',
    spaceJoin: 'profile_links',
  },
  note: {
    table: 'notes',
    columns: 'id,title,body,captured_by,captured_client,updated_at,profile_notes(profile_id)',
    titleColumn: 'title',
    textColumn: 'body',
    spaceJoin: 'profile_notes',
  },
  task: {
    table: 'tasks',
    columns: 'id,title,detail,due_date,is_done,captured_by,captured_client,updated_at,profile_tasks(profile_id)',
    titleColumn: 'title',
    textColumn: 'detail',
    spaceJoin: 'profile_tasks',
  },
  jot: {
    table: 'self_messages',
    columns: 'id,body,captured_by,captured_client,updated_at,profile_id',
    titleColumn: null,
    textColumn: 'body',
    spaceJoin: null,
  },
};

const JOIN: Record<ProposalItemType, { table: JoinTable; column: string }> = {
  link: { table: 'profile_links', column: 'link_id' },
  note: { table: 'profile_notes', column: 'note_id' },
  task: { table: 'profile_tasks', column: 'task_id' },
};

type Row = Record<string, unknown> & { id: string };

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const created = (rows: Row[]): CreatedRow => ({ id: rows[0].id, created_at: String(rows[0].created_at) });

/** `updated_at` filter for a conditional write (rows always have one; NULL is matched just in case). */
const updatedAtParam = (expected: string) => (expected ? `eq.${expected}` : 'is.null');

export function createPostgrestAgentWriteStore(db: UserDb): AgentWriteStore {
  return {
    async getSpace(id) {
      const rows = await db.select<{ id: string; name: string }>('profiles', { id: `eq.${id}`, select: 'id,name', limit: '1' });
      return rows[0] ?? null;
    },

    async getEditable(type, id): Promise<EditableItem | null> {
      const cfg = EDITABLE[type];
      const rows = await db.select<Row>(cfg.table, { id: `eq.${id}`, select: cfg.columns, limit: '1' });
      const row = rows[0];
      if (!row) return null;
      const joins = cfg.spaceJoin ? ((row[cfg.spaceJoin] as { profile_id: string }[] | undefined) ?? []) : [];
      const space_ids = cfg.spaceJoin ? [...new Set(joins.map((j) => j.profile_id))] : str(row.profile_id) ? [row.profile_id as string] : [];
      return {
        type,
        id: row.id,
        title: cfg.titleColumn ? str(row[cfg.titleColumn]) : null,
        text: str(row[cfg.textColumn]),
        ...(type === 'task' ? { due_date: str(row.due_date), is_done: row.is_done === true } : {}),
        captured_by: str(row.captured_by),
        captured_client: str(row.captured_client),
        updated_at: str(row.updated_at) ?? '',
        space_ids,
      };
    },

    async insertJot(row) {
      return created(await db.insert<Row>('self_messages', { ...row }));
    },

    async insertNote(row) {
      return created(await db.insert<Row>('notes', { ...row, order_index: 0 }));
    },

    async insertTask(row) {
      // New tasks go to the top of the order, like the app's.
      const top = await db.select<{ order_index: number | null }>('tasks', { select: 'order_index', order: 'order_index.asc.nullslast', limit: '1' });
      return created(await db.insert<Row>('tasks', { ...row, is_done: false, order_index: (top[0]?.order_index ?? 1) - 1 }));
    },

    async fileItem(type, itemId, spaceId) {
      const join = JOIN[type];
      await db.joinInsert(join.table, [{ profile_id: spaceId, [join.column]: itemId }], `profile_id,${join.column}`);
    },

    async setNoteBody(id, body, expectedUpdatedAt) {
      const rows = await db.updateReturning<{ id: string }>(
        'notes',
        { id: `eq.${id}`, updated_at: updatedAtParam(expectedUpdatedAt), select: 'id' },
        { body },
      );
      return rows.length > 0;
    },

    async insertProposal(row) {
      return created(await db.insert<Row>('inbox_proposals', row as unknown as Record<string, unknown>));
    },

    async countPendingProposals(clientName) {
      const rows = await db.select<{ id: string }>('inbox_proposals', {
        client_name: `eq.${clientName}`,
        status: 'eq.pending',
        select: 'id',
        limit: '200',
      });
      return rows.length;
    },

    async findPendingProposal(m) {
      const params: Params = {
        client_name: `eq.${m.client_name}`,
        status: 'eq.pending',
        kind: `eq.${m.kind}`,
        item_type: `eq.${m.item_type}`,
        item_id: `eq.${m.item_id}`,
        space_id: m.space_id ? `eq.${m.space_id}` : 'is.null',
        select: 'id,created_at',
        limit: '1',
      };
      const rows = await db.select<CreatedRow>('inbox_proposals', params);
      return rows[0] ?? null;
    },

    async claimKey(row): Promise<KeyClaim> {
      try {
        await db.insert('agent_write_keys', { ...row });
        return { claimed: true };
      } catch (err) {
        if (!(err instanceof DbError) || err.code !== '23505') throw err;
        const rows = await db.select<WriteKeyRow>('agent_write_keys', {
          client_name: `eq.${row.client_name}`,
          idempotency_key: `eq.${row.idempotency_key}`,
          select: 'tool,fingerprint,result,created_at',
          limit: '1',
        });
        if (!rows[0]) throw err;
        return { claimed: false, existing: rows[0] };
      }
    },

    async completeKey(clientName, key, result) {
      await db.update('agent_write_keys', { client_name: `eq.${clientName}`, idempotency_key: `eq.${key}` }, { result });
    },

    async releaseKey(clientName, key) {
      // Only an unfinished claim; a completed key is never removed.
      await db.delete('agent_write_keys', { client_name: `eq.${clientName}`, idempotency_key: `eq.${key}`, result: 'is.null' });
    },
  };
}
