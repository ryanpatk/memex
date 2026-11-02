/*
 * The write side of memex's MCP tools, over any `AgentWriteStore` already
 * scoped to one user (rules in writeTypes.ts). memex-api builds one per
 * request for `read_write` tokens. Each method validates its own arguments,
 * caps sizes, checks that every id it touches is the user's before writing,
 * and supports an idempotency key so a retrying agent doesn't write twice.
 */
import { isUuid, parseCaptureInput, type CaptureService } from '../capture';
import { isDay } from './dates';
import type { SpaceRef } from './service';
import { AgentInputError, AgentNotFoundError, type AgentItemType } from './types';
import {
  PROPOSAL_ITEM_TYPES,
  type AgentWriter,
  type AgentWriteStore,
  type EditableItem,
  type ProposalChanges,
  type ProposalItemType,
  type Provenance,
} from './writeTypes';

export const AGENT_WRITE_LIMITS = {
  jotChars: 4000,
  titleChars: 300,
  linkTitleChars: 500,
  linkNoteChars: 5000,
  /** create_note body; MCP request bodies are capped at 64 KB anyway. */
  noteBodyChars: 50_000,
  /** append_to_note: per call, and the most a note may grow to by appending. */
  appendChars: 20_000,
  noteMaxChars: 200_000,
  taskDetailChars: 5000,
  reasonChars: 500,
  keyMinChars: 8,
  keyMaxChars: 128,
  /** Pending proposals one client may have waiting at once. */
  pendingPerClient: 50,
  /** An unfinished idempotency claim older than this is reported as stale. */
  keyStaleMs: 120_000,
} as const;

const KEY_RE = /^[A-Za-z0-9_.:-]+$/;

// ── text checks ────────────────────────────────────────────────────────────

/** Normalize newlines and drop control characters other than tab and newline. */
// eslint-disable-next-line no-control-regex
const clean = (value: string) => value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');

function requiredText(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string') throw new AgentInputError(`${name} is required`);
  const text = clean(value).trim();
  if (!text) throw new AgentInputError(`${name} must not be empty`);
  if (text.length > max) throw new AgentInputError(`${name} can be at most ${max} characters (got ${text.length})`);
  return text;
}

function optionalText(value: unknown, name: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new AgentInputError(`${name} must be text`);
  const text = clean(value).trim();
  if (text.length > max) throw new AgentInputError(`${name} can be at most ${max} characters (got ${text.length})`);
  return text || null;
}

/** A one-line title: whitespace collapsed. */
const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

function idArg(value: unknown, name: string): string {
  if (!isUuid(value)) throw new AgentInputError(`${name} must be an id from another memex tool`);
  return value.toLowerCase();
}

function dueDateArg(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isDay(value)) throw new AgentInputError('due_date must be a date like 2026-11-20');
  return value;
}

// ── idempotency ────────────────────────────────────────────────────────────

/** JSON with sorted keys, so the same arguments always hash the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** FNV-1a 64-bit, hex. Only compares a retry's arguments with the first call's; not a security hash. */
export function fingerprint(tool: string, args: Record<string, unknown>): string {
  const rest = { ...args };
  delete rest.idempotency_key;
  const input = `${tool}\u0000${canonical(rest)}`;
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

function keyArg(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    value.length < AGENT_WRITE_LIMITS.keyMinChars ||
    value.length > AGENT_WRITE_LIMITS.keyMaxChars ||
    !KEY_RE.test(value)
  ) {
    throw new AgentInputError(
      `idempotency_key must be ${AGENT_WRITE_LIMITS.keyMinChars}–${AGENT_WRITE_LIMITS.keyMaxChars} characters of letters, digits, _ . : -`,
    );
  }
  return value;
}

// ── results ────────────────────────────────────────────────────────────────

export interface CreatedResult {
  type: AgentItemType;
  id: string;
  created_at: string;
  space: SpaceRef | null;
  /** Set when a retry with the same idempotency_key returned the first call's result. */
  replayed?: true;
  warning?: string;
}

export interface SaveLinkResult {
  type: 'link';
  id: string;
  url: string;
  title: string | null;
  created_at: string;
  /** The user already had this link (same post, video or normalized URL). Nothing about it changed. */
  duplicate: boolean;
  /** Filing into space_id: done, already there, waiting for approval, or not asked. */
  filed: 'filed' | 'already' | 'proposed' | 'not_requested';
  space: SpaceRef | null;
  proposal_id?: string;
  message?: string;
  warning?: string;
  replayed?: true;
}

export interface AppendResult {
  note_id: string;
  /** 'appended' (the note is this client's own) or 'proposed' (it isn't: an Inbox proposal waits). */
  mode: 'appended' | 'proposed';
  proposal_id?: string;
  text_length?: number;
  message: string;
  replayed?: true;
}

export interface ProposeResult {
  /** 'pending': a new proposal waits in the Inbox. 'already_pending': an identical one does. 'already_filed': nothing to do. */
  status: 'pending' | 'already_pending' | 'already_filed';
  proposal_id: string | null;
  message: string;
  replayed?: true;
}

/** What the audit log records about a write's result: ids only. */
export function writeRef(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (typeof r.proposal_id === 'string' && (r.mode === 'proposed' || r.status === 'pending' || r.status === 'already_pending' || r.filed === 'proposed')) {
    return `proposal:${r.proposal_id}`;
  }
  if (typeof r.note_id === 'string') return `note:${r.note_id}`;
  if (typeof r.type === 'string' && typeof r.id === 'string') return `${r.type}:${r.id}`;
  return null;
}

/** Joins an appended block onto a note body: one blank line between, no trailing blank lines kept. */
export function appendBlock(body: string, text: string): string {
  const head = body.replace(/\s+$/, '');
  return head ? `${head}\n\n${text}` : text;
}

// ── the service ────────────────────────────────────────────────────────────

export interface AgentWriteServiceDeps {
  writer: AgentWriter;
  /** Link capture (dedupe, enrichment), over the same user's store. */
  capture: CaptureService;
  now?: () => Date;
}

export function createAgentWriteService(store: AgentWriteStore, deps: AgentWriteServiceDeps) {
  const { writer, capture } = deps;
  const now = deps.now ?? (() => new Date());
  const provenance: Provenance = { captured_by: 'agent', captured_client: writer.clientName };
  const isOwn = (item: Pick<EditableItem, 'captured_by' | 'captured_client'>) =>
    item.captured_by === 'agent' && item.captured_client === writer.clientName;

  const spaceArg = async (value: unknown): Promise<SpaceRef | null> => {
    if (value === undefined || value === null || value === '') return null;
    const id = idArg(value, 'space_id');
    const space = await store.getSpace(id);
    if (!space) throw new AgentNotFoundError('No space with that id (list_spaces shows them)');
    return { id: space.id, name: space.name };
  };

  /**
   * Run `write` once per (client, idempotency_key). A repeat with the same
   * arguments returns the stored result (`replayed: true`); different
   * arguments are refused. Without a key, it just runs.
   */
  async function once<T extends object>(tool: string, args: Record<string, unknown>, write: () => Promise<T>): Promise<T> {
    const key = keyArg(args.idempotency_key);
    if (!key) return write();
    const fp = fingerprint(tool, args);
    const claim = await store.claimKey({ client_name: writer.clientName, idempotency_key: key, tool, fingerprint: fp });
    if (!claim.claimed) {
      const prior = claim.existing;
      if (prior.tool !== tool || prior.fingerprint !== fp) {
        throw new AgentInputError('idempotency_key was already used for a different call; use a new key for new content');
      }
      if (!prior.result) {
        const age = now().getTime() - Date.parse(prior.created_at);
        throw new AgentInputError(
          age > AGENT_WRITE_LIMITS.keyStaleMs
            ? 'An earlier call with this idempotency_key never finished; search memex to see whether it was saved before retrying with a new key'
            : 'A call with this idempotency_key is still running; retry in a few seconds',
        );
      }
      return { ...(prior.result as T), replayed: true };
    }
    let result: T;
    try {
      result = await write();
    } catch (err) {
      // Every write validates and ownership-checks before inserting, so a
      // failure here wrote nothing: free the key so the agent can retry.
      await store.releaseKey(writer.clientName, key).catch(() => {});
      throw err;
    }
    await store.completeKey(writer.clientName, key, result as Record<string, unknown>).catch(() => {});
    return result;
  }

  /** File a freshly created item; a failure leaves it saved but unfiled, with a warning. */
  const fileNew = async (type: ProposalItemType, id: string, space: SpaceRef | null) => {
    if (!space) return undefined;
    try {
      await store.fileItem(type, id, space.id);
      return undefined;
    } catch {
      return `Saved, but filing it into “${space.name}” failed; it is unfiled`;
    }
  };

  const proposalRoom = async () => {
    const pending = await store.countPendingProposals(writer.clientName);
    if (pending >= AGENT_WRITE_LIMITS.pendingPerClient) {
      throw new AgentInputError(
        `This client already has ${pending} proposals waiting for the user; wait until they review some before proposing more`,
      );
    }
  };

  const fileProposal = async (type: ProposalItemType, item: EditableItem, space: SpaceRef, reason: string | null) => {
    const match = { client_name: writer.clientName, kind: 'file' as const, item_type: type, item_id: item.id, space_id: space.id };
    const existing = await store.findPendingProposal(match);
    if (existing) return { id: existing.id, duplicate: true };
    await proposalRoom();
    const row = await store.insertProposal({
      ...match,
      token_id: writer.tokenId,
      changes: {},
      reason,
      base_updated_at: item.updated_at,
    });
    return { id: row.id, duplicate: false };
  };

  return {
    /** A jot in the Journal (optionally in a space). */
    addJot(args: { text: string; space_id?: string; idempotency_key?: string }): Promise<CreatedResult> {
      return once('add_jot', args as Record<string, unknown>, async () => {
        const body = requiredText(args.text, 'text', AGENT_WRITE_LIMITS.jotChars);
        const space = await spaceArg(args.space_id);
        const row = await store.insertJot({ body, profile_id: space?.id ?? null, ...provenance });
        return { type: 'jot', id: row.id, created_at: row.created_at, space };
      });
    },

    /** A new markdown note (optionally filed in a space). */
    createNote(args: { title: string; body?: string; space_id?: string; idempotency_key?: string }): Promise<CreatedResult> {
      return once('create_note', args as Record<string, unknown>, async () => {
        const title = oneLine(requiredText(args.title, 'title', AGENT_WRITE_LIMITS.titleChars));
        const body = optionalText(args.body, 'body', AGENT_WRITE_LIMITS.noteBodyChars) ?? '';
        const space = await spaceArg(args.space_id);
        const row = await store.insertNote({ title, body, ...provenance });
        const warning = await fileNew('note', row.id, space);
        return { type: 'note', id: row.id, created_at: row.created_at, space: warning ? null : space, ...(warning ? { warning } : {}) };
      });
    },

    /** A new task (optionally with detail, a due date, a space). */
    createTask(args: { text: string; detail?: string; due_date?: string; space_id?: string; idempotency_key?: string }): Promise<CreatedResult> {
      return once('create_task', args as Record<string, unknown>, async () => {
        const title = oneLine(requiredText(args.text, 'text', AGENT_WRITE_LIMITS.titleChars));
        const detail = optionalText(args.detail, 'detail', AGENT_WRITE_LIMITS.taskDetailChars);
        const due_date = dueDateArg(args.due_date);
        const space = await spaceArg(args.space_id);
        const row = await store.insertTask({ title, detail, due_date, ...provenance });
        const warning = await fileNew('task', row.id, space);
        return { type: 'task', id: row.id, created_at: row.created_at, space: warning ? null : space, ...(warning ? { warning } : {}) };
      });
    },

    /**
     * Save a link through the capture service (same dedupe as the extension).
     * A link the user already has comes back with `duplicate: true` and is
     * left as it is; filing it into a space then becomes a proposal unless
     * this client saved it in the first place.
     */
    saveLink(args: { url: string; title?: string; note?: string; space_id?: string; idempotency_key?: string }): Promise<SaveLinkResult> {
      return once('save_link', args as Record<string, unknown>, async () => {
        const title = optionalText(args.title, 'title', AGENT_WRITE_LIMITS.linkTitleChars);
        const note = optionalText(args.note, 'note', AGENT_WRITE_LIMITS.linkNoteChars);
        const parsed = parseCaptureInput(
          { url: typeof args.url === 'string' ? args.url.trim() : args.url, title: title ? oneLine(title) : null, note },
          { defaultCapturedBy: 'agent', allowedCapturedBy: [], defaultClient: writer.clientName },
        );
        if (!parsed.ok) throw new AgentInputError(parsed.error === 'A valid http(s) url is required' ? 'url must be a full http(s) URL' : parsed.error);
        const space = await spaceArg(args.space_id);

        const { link, duplicate } = await capture.capture({ ...parsed.value, spaceId: null, tagIds: [], lists: [] });
        const base = { type: 'link' as const, id: link.id, url: link.url, title: link.title, created_at: link.created_at, duplicate, space };
        if (!space) return { ...base, filed: 'not_requested' as const, space: null };

        if (!duplicate) {
          const warning = await fileNew('link', link.id, space);
          return warning ? { ...base, filed: 'not_requested' as const, space: null, warning } : { ...base, filed: 'filed' as const };
        }
        const item = await store.getEditable('link', link.id);
        if (!item) throw new AgentNotFoundError('That link disappeared while saving; try again');
        if (item.space_ids.includes(space.id)) return { ...base, filed: 'already' as const };
        if (isOwn(item)) {
          await store.fileItem('link', link.id, space.id);
          return { ...base, filed: 'filed' as const };
        }
        const proposal = await fileProposal('link', item, space, note ? note.slice(0, AGENT_WRITE_LIMITS.reasonChars) : null);
        return {
          ...base,
          filed: 'proposed' as const,
          proposal_id: proposal.id,
          message: `The user already saved this link. Filing it into “${space.name}” needs their approval, so a proposal is waiting in their Inbox.`,
        };
      });
    },

    /**
     * Add text at the end of a note. Directly, if this client created the
     * note; otherwise as an Inbox proposal the user approves.
     */
    appendToNote(args: { note_id: string; text: string; reason?: string; idempotency_key?: string }): Promise<AppendResult> {
      return once('append_to_note', args as Record<string, unknown>, async () => {
        const id = idArg(args.note_id, 'note_id');
        const text = requiredText(args.text, 'text', AGENT_WRITE_LIMITS.appendChars);
        const reason = optionalText(args.reason, 'reason', AGENT_WRITE_LIMITS.reasonChars);
        let note = await store.getEditable('note', id);
        if (!note) throw new AgentNotFoundError('No note with that id');

        if (!isOwn(note)) {
          await proposalRoom();
          const row = await store.insertProposal({
            token_id: writer.tokenId,
            client_name: writer.clientName,
            kind: 'append',
            item_type: 'note',
            item_id: id,
            space_id: null,
            changes: { text },
            reason,
            base_updated_at: note.updated_at,
          });
          return {
            note_id: id,
            mode: 'proposed' as const,
            proposal_id: row.id,
            message: 'This note was not created by this client, so the text waits in the user’s Inbox as a proposal. Keep your own project notes (create_note) to append directly.',
          };
        }

        // Conditional write: if the user edits the note between our read and
        // write, read again and append to what's there now.
        for (let attempt = 0; attempt < 3; attempt++) {
          const body = appendBlock(note.text ?? '', text);
          if (body.length > AGENT_WRITE_LIMITS.noteMaxChars) {
            throw new AgentInputError(
              `That would make the note longer than ${AGENT_WRITE_LIMITS.noteMaxChars} characters; start a new note (create_note) and link to it`,
            );
          }
          if (await store.setNoteBody(id, body, note.updated_at)) {
            return { note_id: id, mode: 'appended' as const, text_length: body.length, message: 'Appended.' };
          }
          const fresh = await store.getEditable('note', id);
          if (!fresh) throw new AgentNotFoundError('No note with that id');
          note = fresh;
        }
        throw new AgentInputError('The note kept changing while appending; try again in a moment');
      });
    },

    /**
     * Ask the user to change an existing item: file it into a space, or edit
     * it (title, text, due date, done). Always an Inbox proposal; never a direct edit.
     */
    proposeChange(args: {
      type: ProposalItemType;
      id: string;
      action: 'file' | 'edit';
      space_id?: string;
      changes?: ProposalChanges;
      reason?: string;
      idempotency_key?: string;
    }): Promise<ProposeResult> {
      return once('propose_change', args as Record<string, unknown>, async () => {
        if (!PROPOSAL_ITEM_TYPES.includes(args.type)) {
          throw new AgentInputError(`type must be one of ${PROPOSAL_ITEM_TYPES.join(', ')} (jots can't be changed by agents)`);
        }
        const type = args.type;
        const id = idArg(args.id, 'id');
        const reason = optionalText(args.reason, 'reason', AGENT_WRITE_LIMITS.reasonChars);
        if (args.action !== 'file' && args.action !== 'edit') throw new AgentInputError('action must be "file" or "edit"');

        if (args.action === 'file') {
          if (args.changes !== undefined) throw new AgentInputError('changes only go with action "edit"');
          const space = await spaceArg(args.space_id);
          if (!space) throw new AgentInputError('space_id is required to file an item');
          const item = await store.getEditable(type, id);
          if (!item) throw new AgentNotFoundError(`No ${type} with that id`);
          if (item.space_ids.includes(space.id)) {
            return { status: 'already_filed' as const, proposal_id: null, message: `It is already in “${space.name}”.` };
          }
          const proposal = await fileProposal(type, item, space, reason);
          return proposal.duplicate
            ? { status: 'already_pending' as const, proposal_id: proposal.id, message: 'The same proposal is already waiting in the user’s Inbox.' }
            : { status: 'pending' as const, proposal_id: proposal.id, message: `Proposed filing into “${space.name}”; it waits in the user’s Inbox.` };
        }

        if (args.space_id !== undefined) throw new AgentInputError('space_id only goes with action "file"');
        const item = await store.getEditable(type, id);
        if (!item) throw new AgentNotFoundError(`No ${type} with that id`);
        const changes = editChanges(type, args.changes, item);
        await proposalRoom();
        const row = await store.insertProposal({
          token_id: writer.tokenId,
          client_name: writer.clientName,
          kind: 'edit',
          item_type: type,
          item_id: id,
          space_id: null,
          changes,
          reason,
          base_updated_at: item.updated_at,
        });
        return { status: 'pending' as const, proposal_id: row.id, message: 'Proposed the edit; it waits in the user’s Inbox.' };
      });
    },
  };
}

/** Validate an edit against the item's type and drop fields that wouldn't change anything. */
function editChanges(type: ProposalItemType, raw: unknown, item: EditableItem): ProposalChanges {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentInputError('changes is required for action "edit": an object with title, text, due_date or done');
  }
  const input = raw as Record<string, unknown>;
  const allowed = type === 'task' ? ['title', 'text', 'due_date', 'done'] : ['title', 'text'];
  const unknown = Object.keys(input).filter((k) => !allowed.includes(k) && input[k] !== undefined);
  if (unknown.length) throw new AgentInputError(`A ${type} edit can change ${allowed.join(', ')}; not ${unknown.join(', ')}`);

  const out: ProposalChanges = {};
  if (input.title !== undefined) {
    const max = type === 'link' ? AGENT_WRITE_LIMITS.linkTitleChars : AGENT_WRITE_LIMITS.titleChars;
    const title = oneLine(requiredText(input.title, 'changes.title', max));
    if (title !== (item.title ?? '')) out.title = title;
  }
  if (input.text !== undefined) {
    const max = type === 'note' ? AGENT_WRITE_LIMITS.noteMaxChars : type === 'task' ? AGENT_WRITE_LIMITS.taskDetailChars : AGENT_WRITE_LIMITS.linkNoteChars;
    if (typeof input.text !== 'string') throw new AgentInputError('changes.text must be text');
    const text = clean(input.text);
    if (text.length > max) throw new AgentInputError(`changes.text can be at most ${max} characters (got ${text.length})`);
    if (text !== (item.text ?? '')) out.text = text;
  }
  if (input.due_date !== undefined) {
    const due = input.due_date === null ? null : dueDateArg(input.due_date);
    if (input.due_date !== null && !due) throw new AgentInputError('changes.due_date must be a date like 2026-11-20, or null to clear it');
    if (due !== (item.due_date ?? null)) out.due_date = due;
  }
  if (input.done !== undefined) {
    if (typeof input.done !== 'boolean') throw new AgentInputError('changes.done must be true or false');
    if (input.done !== !!item.is_done) out.done = input.done;
  }
  if (!Object.keys(out).length) throw new AgentInputError('Those changes match the item as it is; nothing to propose');
  return out;
}

export type AgentWriteService = ReturnType<typeof createAgentWriteService>;
