/*
 * The agent write model (ROADMAP §3.6, Phase 7d): what memex's MCP write
 * tools may do, independent of where the data lives. memex-api implements
 * `AgentWriteStore` over Supabase (api/src/mcp/writeStore.ts); tests use
 * `createMemoryAgentWriteStore`.
 *
 * Rules (approved by Ryan, 2026-11-01):
 * - Agents only add new items. Each one is stamped captured_by = 'agent' and
 *   captured_client = the token's client name.
 * - Any change to an existing item the agent didn't create (filing, editing,
 *   appending to someone else's note) becomes an Inbox proposal the user
 *   approves or rejects. `propose_change` never edits, even the agent's own items.
 * - Nothing deletes, and nothing touches more than one item per call.
 */
import type { AgentItemType } from './types';

/** Item types a proposal can target. Jots aren't edited or re-filed by agents. */
export const PROPOSAL_ITEM_TYPES = ['link', 'note', 'task'] as const;
export type ProposalItemType = (typeof PROPOSAL_ITEM_TYPES)[number];

export const PROPOSAL_KINDS = ['file', 'edit', 'append'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_STATUSES = ['pending', 'applied', 'rejected'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * What an edit proposal changes. `text` is the note body, task detail or
 * link description (the same field `get_item` calls `text`). `due_date: null`
 * clears a task's due date.
 */
export interface ProposalChanges {
  title?: string;
  text?: string;
  due_date?: string | null;
  done?: boolean;
}

/** Who is writing: the agent token's client name and id. */
export interface AgentWriter {
  clientName: string;
  tokenId: string;
}

export interface Provenance {
  captured_by: 'agent';
  captured_client: string;
}

/** A row the store just created. */
export interface CreatedRow {
  id: string;
  created_at: string;
}

/** An existing item as the write rules need it: who made it and its editable fields. */
export interface EditableItem {
  type: AgentItemType;
  id: string;
  title: string | null;
  /** Note body, task detail, link description, jot body. */
  text: string | null;
  due_date?: string | null;
  is_done?: boolean;
  captured_by: string | null;
  captured_client: string | null;
  /** Exactly as stored, so a conditional update can compare it. */
  updated_at: string;
  space_ids: string[];
}

export interface NewProposal {
  token_id: string;
  client_name: string;
  kind: ProposalKind;
  item_type: ProposalItemType;
  item_id: string;
  space_id: string | null;
  changes: ProposalChanges | { text: string } | Record<string, never>;
  reason: string | null;
  base_updated_at: string | null;
}

export interface PendingProposalMatch {
  client_name: string;
  kind: ProposalKind;
  item_type: ProposalItemType;
  item_id: string;
  space_id: string | null;
}

/** A stored idempotency key (agent_write_keys). `result` is null while the first call runs. */
export interface WriteKeyRow {
  tool: string;
  fingerprint: string;
  result: Record<string, unknown> | null;
  created_at: string;
}

export type KeyClaim = { claimed: true } | { claimed: false; existing: WriteKeyRow };

/**
 * The storage port for agent writes, already scoped to one user. Inserts
 * stamp the user; every id passed in has been ownership-checked by the
 * service through `getSpace` / `getEditable` first.
 */
export interface AgentWriteStore {
  getSpace(id: string): Promise<{ id: string; name: string } | null>;
  /** The item if it is the user's, else null. */
  getEditable(type: AgentItemType, id: string): Promise<EditableItem | null>;
  insertJot(row: { body: string; profile_id: string | null } & Provenance): Promise<CreatedRow>;
  insertNote(row: { title: string; body: string } & Provenance): Promise<CreatedRow>;
  insertTask(row: { title: string; detail: string | null; due_date: string | null } & Provenance): Promise<CreatedRow>;
  /** File an item into a space; an existing membership counts as success. */
  fileItem(type: ProposalItemType, itemId: string, spaceId: string): Promise<void>;
  /**
   * Replace a note's body only if its updated_at is still `expectedUpdatedAt`.
   * Returns false when the note changed meanwhile (nothing written).
   */
  setNoteBody(id: string, body: string, expectedUpdatedAt: string): Promise<boolean>;
  insertProposal(row: NewProposal): Promise<CreatedRow>;
  countPendingProposals(clientName: string): Promise<number>;
  /** An identical pending proposal, to avoid filling the Inbox with repeats. */
  findPendingProposal(match: PendingProposalMatch): Promise<CreatedRow | null>;
  /** Claim (client, key) for a call; when taken, the stored row comes back instead. */
  claimKey(row: { client_name: string; idempotency_key: string; tool: string; fingerprint: string }): Promise<KeyClaim>;
  completeKey(clientName: string, key: string, result: Record<string, unknown>): Promise<void>;
  /** Forget a claim whose call failed before writing anything, so the agent can retry. */
  releaseKey(clientName: string, key: string): Promise<void>;
}
