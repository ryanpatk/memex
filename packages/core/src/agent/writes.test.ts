import { describe, expect, it } from 'vitest';
import { createCaptureService, createMemoryCaptureStore, type CapturedLink } from '../capture';
import { createMemoryAgentWriteStore } from './memoryWriteStore';
import { AgentInputError, AgentNotFoundError } from './types';
import { AGENT_WRITE_LIMITS, appendBlock, createAgentWriteService, fingerprint, writeRef } from './writes';
import type { EditableItem } from './writeTypes';

const SPACE = '5aaaaaaa-0000-4000-8000-000000000001';
const OTHER_USERS_SPACE = '5aaaaaaa-0000-4000-8000-000000000009';
const USER_NOTE = '6bbbbbbb-0000-4000-8000-000000000001';
const OWN_NOTE = '6bbbbbbb-0000-4000-8000-000000000002';
const OTHER_CLIENT_NOTE = '6bbbbbbb-0000-4000-8000-000000000003';
const USER_TASK = '6bbbbbbb-0000-4000-8000-000000000004';
const USER_LINK = '6bbbbbbb-0000-4000-8000-000000000005';
const CLIENT = '[test] Grok Bot';
const TOKEN = '7ccccccc-0000-4000-8000-000000000001';

const item = (patch: Partial<EditableItem> & Pick<EditableItem, 'type' | 'id'>): EditableItem => ({
  title: null,
  text: null,
  captured_by: null,
  captured_client: null,
  updated_at: '2026-10-30T10:00:00.000000+00:00',
  space_ids: [],
  ...patch,
});

const userLink: CapturedLink = {
  id: USER_LINK,
  url: 'https://example.com/kyoto',
  title: 'Kyoto ryokan',
  description: null,
  favicon_url: null,
  preview_image_url: null,
  source: null,
  source_id: null,
  lists: [],
  captured_by: null,
  captured_client: null,
  url_key: 'example.com/kyoto',
  created_at: '2026-10-01T00:00:00.000Z',
};

function setup(clientName = CLIENT) {
  const store = createMemoryAgentWriteStore({
    spaces: [{ id: SPACE, name: 'memex project' }],
    items: [
      item({ type: 'note', id: USER_NOTE, title: 'Ryan’s plan', text: '# Plan\n\nStep one.' }),
      item({ type: 'note', id: OWN_NOTE, title: 'Project log', text: 'Day 1: started.', captured_by: 'agent', captured_client: CLIENT }),
      item({ type: 'note', id: OTHER_CLIENT_NOTE, title: 'Other bot log', text: 'x', captured_by: 'agent', captured_client: 'Claude Code' }),
      item({ type: 'task', id: USER_TASK, title: 'Ship M3-B', text: null, is_done: false, due_date: null }),
      item({ type: 'link', id: USER_LINK, title: 'Kyoto ryokan' }),
    ],
  });
  const captureStore = createMemoryCaptureStore({ links: [userLink], spaces: [SPACE] }, () => '2026-11-01T12:00:00.000Z');
  // Links live in the capture store; mirror new ones into the write store so getEditable finds them.
  const insertLink = captureStore.insertLink.bind(captureStore);
  captureStore.insertLink = async (link) => {
    const row = await insertLink(link);
    store.state.items.push(item({ type: 'link', id: row.id, title: row.title, captured_by: link.captured_by, captured_client: link.captured_client }));
    return row;
  };
  const capture = createCaptureService(captureStore);
  const writes = createAgentWriteService(store, { writer: { clientName, tokenId: TOKEN }, capture, now: () => new Date('2026-11-01T12:00:30Z') });
  return { store, captureStore, writes };
}

describe('agent writes: new items', () => {
  it('adds a jot marked as agent-written, optionally in a space', async () => {
    const { store, writes } = setup();
    const result = await writes.addJot({ text: '  [test] decided on Supabase  ', space_id: SPACE });
    expect(result).toMatchObject({ type: 'jot', space: { id: SPACE, name: 'memex project' } });
    const jot = store.state.items.find((i) => i.id === result.id)!;
    expect(jot).toMatchObject({ text: '[test] decided on Supabase', captured_by: 'agent', captured_client: CLIENT, space_ids: [SPACE] });
  });

  it('creates notes and tasks with provenance and files them', async () => {
    const { store, writes } = setup();
    const note = await writes.createNote({ title: '[test] memex\nproject', body: '## Decisions\n- one', space_id: SPACE });
    const task = await writes.createTask({ text: '[test] write docs', due_date: '2026-11-20', space_id: SPACE });
    expect(store.state.items.find((i) => i.id === note.id)).toMatchObject({
      title: '[test] memex project',
      text: '## Decisions\n- one',
      captured_by: 'agent',
      captured_client: CLIENT,
      space_ids: [SPACE],
    });
    expect(store.state.items.find((i) => i.id === task.id)).toMatchObject({ title: '[test] write docs', due_date: '2026-11-20', space_ids: [SPACE] });
  });

  it('validates text, sizes, dates and space ids before writing anything', async () => {
    const { store, writes } = setup();
    await expect(writes.addJot({ text: '   ' })).rejects.toThrow(AgentInputError);
    await expect(writes.addJot({ text: 'x'.repeat(AGENT_WRITE_LIMITS.jotChars + 1) })).rejects.toThrow(/at most 4000/);
    await expect(writes.createTask({ text: 'ok', due_date: '2026-02-30' })).rejects.toThrow(/due_date/);
    await expect(writes.createNote({ title: 'ok', space_id: 'not-a-uuid' })).rejects.toThrow(/space_id/);
    // Another user's space id looks exactly like a missing one.
    await expect(writes.createNote({ title: 'ok', space_id: OTHER_USERS_SPACE })).rejects.toThrow(AgentNotFoundError);
    await expect(writes.createNote({ title: 'ok', body: 'x'.repeat(AGENT_WRITE_LIMITS.noteBodyChars + 1) })).rejects.toThrow(/body/);
    expect(store.state.writes).toEqual([]);
  });

  it('strips control characters but keeps newlines and tabs', async () => {
    const { store, writes } = setup();
    const r = await writes.createNote({ title: 'T', body: 'a\u0000b\r\n\tc\u0007' });
    expect(store.state.items.find((i) => i.id === r.id)!.text).toBe('ab\n\tc');
  });
});

describe('agent writes: save_link', () => {
  it('saves a new link through the capture service, marked agent + client, and files it', async () => {
    const { captureStore, writes } = setup();
    const r = await writes.saveLink({ url: 'https://example.org/post?utm_source=x', title: '[test] A post', space_id: SPACE });
    expect(r).toMatchObject({ duplicate: false, filed: 'filed', url: 'https://example.org/post?utm_source=x' });
    const row = captureStore.links.find((l) => l.id === r.id)!;
    expect(row).toMatchObject({ captured_by: 'agent', captured_client: CLIENT, lists: [] });
  });

  it('reports a duplicate and leaves the user’s link untouched; filing it becomes a proposal', async () => {
    const { store, captureStore, writes } = setup();
    const r = await writes.saveLink({ url: 'https://example.com/kyoto/', title: 'Different title', space_id: SPACE });
    expect(r).toMatchObject({ id: USER_LINK, duplicate: true, filed: 'proposed', title: 'Kyoto ryokan' });
    expect(captureStore.links.find((l) => l.id === USER_LINK)).toEqual(userLink);
    expect(store.state.writes.map((w) => w.method)).toEqual(['insertProposal']);
    expect(store.state.proposals[0]).toMatchObject({ kind: 'file', item_type: 'link', item_id: USER_LINK, space_id: SPACE, client_name: CLIENT });
    // Saving it again doesn't stack a second proposal.
    const again = await writes.saveLink({ url: 'https://example.com/kyoto', space_id: SPACE });
    expect(again.proposal_id).toBe(r.proposal_id);
    expect(store.state.proposals).toHaveLength(1);
  });

  it('files its own duplicate directly', async () => {
    const { store, writes } = setup();
    const first = await writes.saveLink({ url: 'https://example.org/mine' });
    const second = await writes.saveLink({ url: 'https://example.org/mine', space_id: SPACE });
    expect(second).toMatchObject({ id: first.id, duplicate: true, filed: 'filed' });
    expect(store.state.proposals).toHaveLength(0);
  });

  it('rejects bad urls', async () => {
    const { writes } = setup();
    await expect(writes.saveLink({ url: 'javascript:alert(1)' })).rejects.toThrow(/http/);
    await expect(writes.saveLink({ url: 'notaurl' })).rejects.toThrow(AgentInputError);
  });
});

describe('agent writes: append_to_note', () => {
  it('appends directly to a note this client created', async () => {
    const { store, writes } = setup();
    const r = await writes.appendToNote({ note_id: OWN_NOTE, text: 'Day 2: shipped.' });
    expect(r).toMatchObject({ mode: 'appended', note_id: OWN_NOTE });
    expect(store.state.items.find((i) => i.id === OWN_NOTE)!.text).toBe('Day 1: started.\n\nDay 2: shipped.');
    expect(store.state.proposals).toHaveLength(0);
  });

  it('turns an append to the user’s note, or another client’s, into a proposal', async () => {
    const { store, writes } = setup();
    const a = await writes.appendToNote({ note_id: USER_NOTE, text: 'Step two.', reason: 'From today’s call' });
    const b = await writes.appendToNote({ note_id: OTHER_CLIENT_NOTE, text: 'y' });
    expect(a.mode).toBe('proposed');
    expect(b.mode).toBe('proposed');
    expect(store.state.items.find((i) => i.id === USER_NOTE)!.text).toBe('# Plan\n\nStep one.');
    expect(store.state.proposals.map((p) => [p.kind, p.item_id, p.changes])).toEqual([
      ['append', USER_NOTE, { text: 'Step two.' }],
      ['append', OTHER_CLIENT_NOTE, { text: 'y' }],
    ]);
    expect(store.state.proposals[0].base_updated_at).toBe('2026-10-30T10:00:00.000000+00:00');
  });

  it('re-reads and appends to the latest text when the user edits the note meanwhile', async () => {
    const { store, writes } = setup();
    store.beforeNextNoteWrite = () => {
      const note = store.state.items.find((i) => i.id === OWN_NOTE)!;
      note.text = 'Day 1: started. (edited by Ryan)';
      note.updated_at = '2026-11-01T11:59:00.000000+00:00';
    };
    await writes.appendToNote({ note_id: OWN_NOTE, text: 'Day 2.' });
    expect(store.state.items.find((i) => i.id === OWN_NOTE)!.text).toBe('Day 1: started. (edited by Ryan)\n\nDay 2.');
  });

  it('refuses unknown notes and notes that would grow past the cap', async () => {
    const { store, writes } = setup();
    await expect(writes.appendToNote({ note_id: '6bbbbbbb-0000-4000-8000-0000000000ff', text: 'x' })).rejects.toThrow(AgentNotFoundError);
    store.state.items.find((i) => i.id === OWN_NOTE)!.text = 'x'.repeat(AGENT_WRITE_LIMITS.noteMaxChars - 5);
    await expect(writes.appendToNote({ note_id: OWN_NOTE, text: 'more text' })).rejects.toThrow(/new note/);
  });

  it('a client with the same name on a new token keeps appending (the note belongs to the client)', async () => {
    const { store, writes } = setup(CLIENT);
    await writes.appendToNote({ note_id: OWN_NOTE, text: 'z' });
    expect(store.state.proposals).toHaveLength(0);
  });
});

describe('agent writes: propose_change', () => {
  it('proposes filing and edits, never changing the item', async () => {
    const { store, writes } = setup();
    const before = JSON.stringify(store.state.items);
    const file = await writes.proposeChange({ type: 'note', id: USER_NOTE, action: 'file', space_id: SPACE, reason: 'project plan' });
    const edit = await writes.proposeChange({ type: 'task', id: USER_TASK, action: 'edit', changes: { title: 'Ship M3-B today', done: true, due_date: '2026-11-02' } });
    expect(file.status).toBe('pending');
    expect(edit.status).toBe('pending');
    expect(JSON.stringify(store.state.items)).toBe(before);
    expect(store.state.proposals[1]).toMatchObject({ kind: 'edit', changes: { title: 'Ship M3-B today', done: true, due_date: '2026-11-02' } });
  });

  it('proposes even for the agent’s own items (propose_change never edits)', async () => {
    const { store, writes } = setup();
    await writes.proposeChange({ type: 'note', id: OWN_NOTE, action: 'edit', changes: { title: 'Renamed' } });
    expect(store.state.items.find((i) => i.id === OWN_NOTE)!.title).toBe('Project log');
    expect(store.state.proposals).toHaveLength(1);
  });

  it('skips no-ops and repeats', async () => {
    const { store, writes } = setup();
    store.state.items.find((i) => i.id === USER_TASK)!.space_ids.push(SPACE);
    expect(await writes.proposeChange({ type: 'task', id: USER_TASK, action: 'file', space_id: SPACE })).toMatchObject({ status: 'already_filed', proposal_id: null });
    await expect(writes.proposeChange({ type: 'task', id: USER_TASK, action: 'edit', changes: { title: 'Ship M3-B' } })).rejects.toThrow(/nothing to propose/);
    const a = await writes.proposeChange({ type: 'note', id: USER_NOTE, action: 'file', space_id: SPACE });
    const b = await writes.proposeChange({ type: 'note', id: USER_NOTE, action: 'file', space_id: SPACE });
    expect(b).toMatchObject({ status: 'already_pending', proposal_id: a.proposal_id });
    expect(store.state.proposals).toHaveLength(1);
  });

  it('validates type, fields per type and arguments per action', async () => {
    const { writes } = setup();
    // @ts-expect-error jots can't be proposed against
    await expect(writes.proposeChange({ type: 'jot', id: USER_NOTE, action: 'edit', changes: { text: 'x' } })).rejects.toThrow(/jots/);
    await expect(writes.proposeChange({ type: 'note', id: USER_NOTE, action: 'edit', changes: { done: true } })).rejects.toThrow(/not done/);
    await expect(writes.proposeChange({ type: 'note', id: USER_NOTE, action: 'file' })).rejects.toThrow(/space_id is required/);
    await expect(writes.proposeChange({ type: 'note', id: USER_NOTE, action: 'edit', space_id: SPACE, changes: { title: 'x' } })).rejects.toThrow(/space_id only/);
    // @ts-expect-error unknown action
    await expect(writes.proposeChange({ type: 'note', id: USER_NOTE, action: 'delete' })).rejects.toThrow(/action/);
    await expect(writes.proposeChange({ type: 'link', id: '6bbbbbbb-0000-4000-8000-0000000000ff', action: 'file', space_id: SPACE })).rejects.toThrow(AgentNotFoundError);
  });

  it('caps pending proposals per client', async () => {
    const { store, writes } = setup();
    for (let i = 0; i < AGENT_WRITE_LIMITS.pendingPerClient; i++) {
      await store.insertProposal({ token_id: TOKEN, client_name: CLIENT, kind: 'edit', item_type: 'note', item_id: USER_NOTE, space_id: null, changes: { title: `t${i}` }, reason: null, base_updated_at: null });
    }
    await expect(writes.proposeChange({ type: 'note', id: USER_NOTE, action: 'edit', changes: { title: 'one more' } })).rejects.toThrow(/waiting/);
    // Adding new items isn't capped by proposals.
    await expect(writes.addJot({ text: 'still fine' })).resolves.toBeTruthy();
  });
});

describe('agent writes: idempotency', () => {
  it('replays the first result for a retry with the same key and arguments', async () => {
    const { store, writes } = setup();
    const first = await writes.createNote({ title: '[test] once', idempotency_key: 'note-0001' });
    const retry = await writes.createNote({ title: '[test] once', idempotency_key: 'note-0001' });
    expect(retry).toEqual({ ...first, replayed: true });
    expect(store.state.items.filter((i) => i.title === '[test] once')).toHaveLength(1);
  });

  it('protects appends from doubling on retry', async () => {
    const { store, writes } = setup();
    await writes.appendToNote({ note_id: OWN_NOTE, text: 'Day 2.', idempotency_key: 'append-0001' });
    await writes.appendToNote({ note_id: OWN_NOTE, text: 'Day 2.', idempotency_key: 'append-0001' });
    expect(store.state.items.find((i) => i.id === OWN_NOTE)!.text).toBe('Day 1: started.\n\nDay 2.');
  });

  it('refuses a reused key with different arguments, and bad keys', async () => {
    const { writes } = setup();
    await writes.addJot({ text: 'a', idempotency_key: 'jot-key-1' });
    await expect(writes.addJot({ text: 'b', idempotency_key: 'jot-key-1' })).rejects.toThrow(/different call/);
    await expect(writes.createNote({ title: 'a', idempotency_key: 'jot-key-1' })).rejects.toThrow(/different call/);
    await expect(writes.addJot({ text: 'a', idempotency_key: 'short' })).rejects.toThrow(/idempotency_key/);
    await expect(writes.addJot({ text: 'a', idempotency_key: 'has spaces in it' })).rejects.toThrow(/idempotency_key/);
  });

  it('frees the key when the call fails, so a corrected retry works', async () => {
    const { writes } = setup();
    await expect(writes.createNote({ title: 'a', space_id: OTHER_USERS_SPACE, idempotency_key: 'retry-key-1' })).rejects.toThrow(AgentNotFoundError);
    await expect(writes.createNote({ title: 'a', idempotency_key: 'retry-key-1' })).resolves.toMatchObject({ type: 'note' });
  });

  it('reports a call that is still running', async () => {
    const { store, writes } = setup();
    await store.claimKey({ client_name: CLIENT, idempotency_key: 'inflight-1', tool: 'add_jot', fingerprint: fingerprint('add_jot', { text: 'a' }) });
    await expect(writes.addJot({ text: 'a', idempotency_key: 'inflight-1' })).rejects.toThrow(/still running/);
  });

  it('keys are per client', async () => {
    const one = setup(CLIENT);
    await one.writes.addJot({ text: 'a', idempotency_key: 'shared-key' });
    const other = createAgentWriteService(one.store, { writer: { clientName: 'Claude Code', tokenId: TOKEN }, capture: createCaptureService(one.captureStore) });
    await other.addJot({ text: 'a', idempotency_key: 'shared-key' });
    expect(one.store.state.items.filter((i) => i.type === 'jot')).toHaveLength(2);
  });
});

describe('agent writes: no deletes, no bulk edits', () => {
  it('the service has no method that deletes or touches many items', async () => {
    const { writes } = setup();
    expect(Object.keys(writes).sort()).toEqual(['addJot', 'appendToNote', 'createNote', 'createTask', 'proposeChange', 'saveLink']);
  });

  it('every store write touches at most one item and none deletes', async () => {
    const { store, writes } = setup();
    await writes.addJot({ text: 'a', space_id: SPACE });
    await writes.createNote({ title: 'n', space_id: SPACE });
    await writes.createTask({ text: 't' });
    await writes.appendToNote({ note_id: OWN_NOTE, text: 'x' });
    await writes.appendToNote({ note_id: USER_NOTE, text: 'x' });
    await writes.proposeChange({ type: 'task', id: USER_TASK, action: 'edit', changes: { done: true } });
    const methods = new Set(store.state.writes.map((w) => w.method));
    expect([...methods].every((m) => ['insertJot', 'insertNote', 'insertTask', 'fileItem', 'setNoteBody', 'insertProposal'].includes(m))).toBe(true);
    // The only existing item that changed is the agent's own note.
    const userNote = store.state.items.find((i) => i.id === USER_NOTE)!;
    expect(userNote.text).toBe('# Plan\n\nStep one.');
  });
});

describe('helpers', () => {
  it('appendBlock joins with one blank line', () => {
    expect(appendBlock('a\n\n\n', 'b')).toBe('a\n\nb');
    expect(appendBlock('', 'b')).toBe('b');
  });

  it('fingerprint ignores the key and key order', () => {
    expect(fingerprint('t', { a: 1, b: 'x', idempotency_key: 'k1' })).toBe(fingerprint('t', { b: 'x', a: 1, idempotency_key: 'k2' }));
    expect(fingerprint('t', { a: 1 })).not.toBe(fingerprint('t', { a: 2 }));
    expect(fingerprint('t', { a: 1 })).toMatch(/^[0-9a-f]{16}$/);
  });

  it('writeRef names what a write produced', () => {
    expect(writeRef({ type: 'note', id: 'n1' })).toBe('note:n1');
    expect(writeRef({ mode: 'proposed', note_id: 'n1', proposal_id: 'p1' })).toBe('proposal:p1');
    expect(writeRef({ mode: 'appended', note_id: 'n1' })).toBe('note:n1');
    expect(writeRef({ status: 'already_filed', proposal_id: null })).toBeNull();
  });
});
