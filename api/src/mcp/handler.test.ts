import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import * as z from 'zod/v4';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../db';
import { sha256Hex } from './auth';
import { handleMcp, type McpEnv } from './handler';
import { TOOLS } from './tools';

const USER = '11111111-1111-4111-8111-111111111111';
const TOKEN_ID = '22222222-2222-4222-8222-222222222222';
const SPACE = '33333333-3333-4333-8333-333333333333';
const LINK = '44444444-4444-4444-8444-444444444444';
const tokenOf = (c: string) => `mxa_${c.repeat(43)}`;
const LIVE = tokenOf('a');
const REVOKED = tokenOf('r');
const EXPIRED = tokenOf('e');
const WRITER = tokenOf('w');

const env: McpEnv = { SUPABASE_URL: 'https://db.example.co', SUPABASE_SERVICE_KEY: 'service-key' };
const NOW = new Date('2026-11-01T12:00:00Z');

interface Recorded {
  method: string;
  table: string;
  params: URLSearchParams;
  body: unknown;
}

/** A fake PostgREST: four tokens, one space, one link, one note; records every request. */
async function fakeBackend() {
  const hashes = new Map([
    [await sha256Hex(LIVE), { scope: 'read', revoked_at: null, expires_at: null }],
    [await sha256Hex(WRITER), { scope: 'read_write', revoked_at: null, expires_at: null }],
    [await sha256Hex(REVOKED), { scope: 'read', revoked_at: '2026-10-31T00:00:00Z', expires_at: null }],
    [await sha256Hex(EXPIRED), { scope: 'read', revoked_at: null, expires_at: '2026-11-01T11:59:59Z' }],
  ]);
  const calls: Recorded[] = [];
  let inserted = 0;
  const rows: Record<string, unknown[]> = {
    profiles: [
      { id: SPACE, name: 'Kyoto trip', created_at: '2026-10-01T00:00:00+00:00', profile_links: [{ count: 1 }], profile_notes: [{ count: 0 }], profile_tasks: [{ count: 0 }], self_messages: [{ count: 0 }] },
    ],
    links: [
      {
        id: LINK,
        created_at: '2026-10-02T10:00:00.5+00:00',
        updated_at: '2026-10-02T10:00:00.5+00:00',
        title: 'Kyoto ryokan',
        description: 'Where to stay',
        url: 'https://example.com/kyoto',
        source: null,
        lists: [],
        profile_links: [{ profile_id: SPACE }],
        link_tags: [{ tags: { name: 'travel' } }],
      },
    ],
    notes: [{ id: '55555555-5555-4555-8555-555555555555', created_at: '2026-10-03T10:00:00+00:00', updated_at: '2026-10-03T10:00:00+00:00', title: null, body: '# Plan\nKyoto' }],
    tasks: [],
    self_messages: [],
  };
  const fetcher = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const table = url.pathname.replace('/rest/v1/', '');
    const method = init.method ?? 'GET';
    calls.push({ method, table, params: url.searchParams, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (table === 'agent_tokens' && method === 'GET') {
      const hash = url.searchParams.get('token_hash')!.slice(3);
      const t = hashes.get(hash);
      return new Response(JSON.stringify(t ? [{ id: TOKEN_ID, user_id: USER, client_name: '[test] client', last_used_at: null, ...t }] : []));
    }
    if (method === 'PATCH') {
      const prefer = new Headers(init.headers).get('Prefer') ?? '';
      return prefer.includes('representation') ? new Response(JSON.stringify([{ id: 'patched' }])) : new Response(null, { status: 204 });
    }
    if (method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (['self_messages', 'notes', 'tasks', 'inbox_proposals'].includes(table)) {
        inserted += 1;
        const row = { ...body, id: `99999999-9999-4999-8999-${String(inserted).padStart(12, '0')}`, created_at: '2026-11-01T12:00:00.000000+00:00' };
        return new Response(JSON.stringify([row]), { status: 201 });
      }
      return new Response('[]', { status: 201 });
    }
    return new Response(JSON.stringify(rows[table] ?? []));
  });
  vi.stubGlobal('fetch', fetcher);
  return { calls, audit: () => calls.filter((c) => c.table === 'mcp_audit_log').flatMap((c) => c.body as Record<string, unknown>[]) };
}

/** Runs handleMcp like the Worker would, then waits for its background work (audit writes). */
function harness(extraEnv: Partial<McpEnv> = {}) {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };
  const db = createDb(env, (...args) => fetch(...args));
  const call = async (req: Request) => handleMcp(req, { ...env, ...extraEnv }, ctx, { db, now: () => NOW });
  const settle = async () => {
    while (pending.length) await pending.shift();
  };
  return { call, settle };
}

const post = (token: string | null, body: unknown) =>
  new Request('https://api.example/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const listTools = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

afterEach(() => vi.unstubAllGlobals());

describe('/mcp auth', () => {
  it('refuses missing and malformed tokens without touching the database', async () => {
    const backend = await fakeBackend();
    const { call } = harness();
    const missing = await call(post(null, listTools));
    expect(missing.status).toBe(401);
    expect(missing.headers.get('WWW-Authenticate')).toContain('Bearer');
    // An extension token (mx_…) is not an agent token.
    expect((await call(post(`mx_${'a'.repeat(43)}`, listTools))).status).toBe(401);
    expect((await call(post('mxa_short', listTools))).status).toBe(401);
    expect(backend.calls).toEqual([]);
  });

  it('refuses unknown tokens', async () => {
    await fakeBackend();
    const { call } = harness();
    const res = await call(post(tokenOf('z'), listTools));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { message: 'Invalid token' } });
  });

  it('refuses revoked and expired tokens and audits the refusal', async () => {
    const backend = await fakeBackend();
    const { call, settle } = harness();
    const revoked = await call(post(REVOKED, listTools));
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({ error: { message: 'This token has been revoked' } });
    const expired = await call(post(EXPIRED, listTools));
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ error: { message: 'This token has expired' } });
    await settle();
    expect(backend.audit().map((r) => [r.status, r.error, r.user_id])).toEqual([
      ['denied', 'token revoked', USER],
      ['denied', 'token expired', USER],
    ]);
  });

  it('rate-limits per token, logging the limit at most once a minute', async () => {
    const backend = await fakeBackend();
    const keys: string[] = [];
    const { call, settle } = harness({
      MCP_RATE_LIMITER: { limit: async ({ key }) => (keys.push(key), { success: false }) },
    });
    const first = await call(post(LIVE, listTools));
    expect(first.status).toBe(429);
    expect(first.headers.get('Retry-After')).toBe('60');
    expect((await call(post(LIVE, listTools))).status).toBe(429);
    await settle();
    expect(keys).toEqual([`mcp:${TOKEN_ID}`, `mcp:${TOKEN_ID}`]);
    expect(backend.audit().map((r) => r.status)).toEqual(['rate_limited']);
    // Nothing past auth ran.
    expect(backend.calls.filter((c) => !['agent_tokens', 'mcp_audit_log'].includes(c.table))).toEqual([]);
  });

  it('rejects bodies that are not JSON-RPC', async () => {
    const backend = await fakeBackend();
    const { call, settle } = harness();
    const bad = new Request('https://api.example/mcp', { method: 'POST', headers: { Authorization: `Bearer ${LIVE}` }, body: '{nope' });
    expect((await call(bad)).status).toBe(400);
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ ...listTools, id: i }));
    expect((await call(post(LIVE, tooMany))).status).toBe(400);
    expect((await call(new Request('https://api.example/mcp', { headers: { Authorization: `Bearer ${LIVE}` } }))).status).toBe(405);
    await settle();
    expect(backend.audit().map((r) => [r.method, r.status])).toEqual([
      ['(body)', 'invalid'],
      ['(batch)', 'invalid'],
    ]);
  });
});

/** An MCP SDK client whose HTTP goes straight into handleMcp. */
async function connect(token: string, mode: 'legacy' | 'auto' = 'legacy') {
  const backend = await fakeBackend();
  const h = harness();
  const client = new Client({ name: '[test] client', version: '1.0.0' }, { versionNegotiation: { mode } });
  const transport = new StreamableHTTPClientTransport(new URL('https://api.example/mcp'), {
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return h.call(new Request(url, { ...init, headers }));
    },
  });
  await client.connect(transport);
  return { client, backend, ...h };
}

const parse = (result: unknown) => JSON.parse((result as { content: { text: string }[] }).content[0].text);

describe('/mcp tools', () => {
  it('serves 2025-era clients: initialize, tools/list and every read tool', async () => {
    const { client, backend, settle } = await connect(LIVE);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['search', 'get_item', 'get_journal', 'list_spaces', 'space_overview', 'timeline_stats', 'get_images']);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false)).toBe(true);
    expect(client.getInstructions()).toContain('list_spaces');
    expect(client.getInstructions()).toContain('can only read');

    const search = parse(await client.callTool({ name: 'search', arguments: { query: 'kyoto' } }));
    // Newest first: the note (Oct 3) before the link (Oct 2).
    expect(search.items.map((i: { type: string }) => i.type)).toEqual(['note', 'link']);
    expect(search.items[1]).toMatchObject({ type: 'link', id: LINK, title: 'Kyoto ryokan', tags: ['travel'], spaces: [{ id: SPACE, name: 'Kyoto trip' }] });
    expect(search.items[1].created_at).toBe('2026-10-02T10:00:00.500000Z');
    expect(parse(await client.callTool({ name: 'get_item', arguments: { type: 'link', id: LINK } }))).toMatchObject({ id: LINK, text: 'Where to stay' });
    expect(parse(await client.callTool({ name: 'get_journal', arguments: { from: '2026-10-02', to: '2026-10-03' } })).days).toBeDefined();
    expect(parse(await client.callTool({ name: 'list_spaces', arguments: {} })).spaces).toHaveLength(1);
    expect(parse(await client.callTool({ name: 'space_overview', arguments: { space_id: SPACE } })).total).toBe(1);
    expect(parse(await client.callTool({ name: 'timeline_stats', arguments: { from: '2026-10-01', to: '2026-10-07' } })).series).toHaveLength(7);

    const notFound = await client.callTool({ name: 'space_overview', arguments: { space_id: '66666666-6666-4666-8666-666666666666' } });
    expect(notFound.isError).toBe(true);
    const invalid = await client.callTool({ name: 'search', arguments: { query: '' } });
    expect(invalid.isError).toBe(true);

    await settle();
    // Every query for user data carried the token's user; nothing but the audit log and last_used_at was written.
    const data = backend.calls.filter((c) => !['agent_tokens', 'mcp_audit_log'].includes(c.table));
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((c) => c.method === 'GET' && c.params.get('user_id') === `eq.${USER}`)).toBe(true);
    expect(backend.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.table}`).sort()).toEqual(
      expect.arrayContaining(['PATCH agent_tokens', 'POST mcp_audit_log']),
    );
    expect(backend.calls.filter((c) => c.method !== 'GET' && !['agent_tokens', 'mcp_audit_log'].includes(c.table))).toEqual([]);

    // One audit row per message, outcome included, no content.
    const audit = backend.audit();
    expect(audit.map((r) => [r.method, r.tool, r.status])).toEqual([
      ['initialize', null, 'ok'],
      ['notifications/initialized', null, 'ok'],
      ['tools/list', null, 'ok'],
      ['tools/call', 'search', 'ok'],
      ['tools/call', 'get_item', 'ok'],
      ['tools/call', 'get_journal', 'ok'],
      ['tools/call', 'list_spaces', 'ok'],
      ['tools/call', 'space_overview', 'ok'],
      ['tools/call', 'timeline_stats', 'ok'],
      ['tools/call', 'space_overview', 'error'],
      ['tools/call', 'search', 'error'],
    ]);
    expect(audit[0].args_summary).toEqual({ protocol_version: expect.any(String), client: '[test] client' });
    expect(audit[3]).toMatchObject({ args_summary: { query: { chars: 5 } }, result_count: 2, user_id: USER, token_id: TOKEN_ID, client_name: '[test] client' });
    expect(JSON.stringify(audit)).not.toContain('kyoto');
    expect(audit[9].error).toMatch(/No space/);
  });

  it('serves 2026-07-28 clients without a handshake', async () => {
    const { client, backend, settle } = await connect(LIVE, 'auto');
    expect((await client.listTools()).tools).toHaveLength(7);
    expect(parse(await client.callTool({ name: 'list_spaces', arguments: {} })).spaces[0].name).toBe('Kyoto trip');
    await settle();
    expect(backend.audit().some((r) => r.tool === 'list_spaces' && r.status === 'ok')).toBe(true);
  });
});

const WRITE_TOOLS = ['add_jot', 'save_link', 'create_note', 'create_task', 'append_to_note', 'propose_change'];

describe('/mcp scope', () => {
  it('declares exactly the six write tools as write, and nothing that deletes or bulk-edits', () => {
    expect(TOOLS.filter((t) => t.access === 'write').map((t) => t.name)).toEqual(WRITE_TOOLS);
    expect(TOOLS.every((t) => !/delete|remove|bulk|purge|clear|batch|update_many/i.test(t.name))).toBe(true);
    // Every write tool takes one item at most: no array of ids anywhere in their inputs.
    for (const tool of TOOLS.filter((t) => t.access === 'write')) {
      const shape = JSON.stringify(z.toJSONSchema(tool.inputSchema));
      expect(shape).not.toMatch(/"ids"|"item_ids"/);
    }
  });

  it('hides write tools from read tokens and refuses calls to them, writing nothing', async () => {
    const reader = await connect(LIVE);
    const names = (await reader.client.listTools()).tools.map((t) => t.name);
    expect(names.filter((n) => WRITE_TOOLS.includes(n))).toEqual([]);
    // Not registered for this token, so the SDK answers as for an unknown tool.
    for (const name of WRITE_TOOLS) {
      await expect(reader.client.callTool({ name, arguments: { text: '[test] nope', title: 'x', url: 'https://example.com', note_id: SPACE } })).rejects.toThrow(/not found/);
    }
    await reader.settle();
    const denied = reader.backend.audit().filter((r) => r.status === 'denied');
    expect(denied.map((r) => r.tool)).toEqual(WRITE_TOOLS);
    const writes = reader.backend.calls.filter((c) => c.method !== 'GET' && !['agent_tokens', 'mcp_audit_log'].includes(c.table));
    expect(writes).toEqual([]);
  });

  it('refuses a raw tools/call from a read token too', async () => {
    const backend = await fakeBackend();
    const { call, settle } = harness();
    const res = await call(post(LIVE, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'add_jot', arguments: { text: '[test] raw' } } }));
    const text = await res.text();
    expect(text).not.toContain('"isError":false');
    await settle();
    expect(backend.calls.some((c) => c.table === 'self_messages' && c.method === 'POST')).toBe(false);
    expect(backend.audit().find((r) => r.tool === 'add_jot')).toMatchObject({ status: 'denied' });
  });

  it('lets read_write tokens see and call the write tools, scoped to the token’s user and marked as the agent', async () => {
    const writer = await connect(WRITER);
    const { tools } = await writer.client.listTools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining([...WRITE_TOOLS, 'search', 'get_images']));
    const writeAnnotations = tools.filter((t) => WRITE_TOOLS.includes(t.name)).map((t) => t.annotations);
    expect(writeAnnotations.every((a) => a?.readOnlyHint === false && a?.destructiveHint === false)).toBe(true);
    expect(writer.client.getInstructions()).toContain('propose_change');

    const jot = parse(await writer.client.callTool({ name: 'add_jot', arguments: { text: '[test] a decision', space_id: SPACE } }));
    expect(jot).toMatchObject({ type: 'jot', space: { id: SPACE, name: 'Kyoto trip' } });
    const note = parse(await writer.client.callTool({ name: 'create_note', arguments: { title: '[test] project context', body: '# Context' } }));
    expect(note.type).toBe('note');
    const task = parse(await writer.client.callTool({ name: 'create_task', arguments: { text: '[test] next step', due_date: '2026-11-20' } }));
    expect(task.type).toBe('task');
    // The user's note (no captured_by): appending becomes a proposal.
    const append = parse(await writer.client.callTool({ name: 'append_to_note', arguments: { note_id: '55555555-5555-4555-8555-555555555555', text: '[test] more' } }));
    expect(append.mode).toBe('proposed');
    const proposal = parse(
      await writer.client.callTool({ name: 'propose_change', arguments: { type: 'link', id: LINK, action: 'edit', changes: { title: '[test] Better title' } } }),
    );
    expect(proposal.status).toBe('pending');
    const badType = await writer.client.callTool({ name: 'propose_change', arguments: { type: 'jot', id: LINK, action: 'edit' } });
    expect(badType.isError).toBe(true);

    await writer.settle();
    const posts = writer.backend.calls.filter((c) => c.method === 'POST' && c.table !== 'mcp_audit_log');
    expect(posts.map((c) => c.table)).toEqual(['self_messages', 'notes', 'tasks', 'inbox_proposals', 'inbox_proposals']);
    for (const c of posts) {
      expect(c.body).toMatchObject({ user_id: USER });
    }
    expect(posts.slice(0, 3).map((c) => [(c.body as Record<string, unknown>).captured_by, (c.body as Record<string, unknown>).captured_client])).toEqual([
      ['agent', '[test] client'],
      ['agent', '[test] client'],
      ['agent', '[test] client'],
    ]);
    expect(posts[3].body).toMatchObject({ kind: 'append', item_type: 'note', client_name: '[test] client', token_id: TOKEN_ID, changes: { text: '[test] more' } });
    // No write touched an existing row: no PATCH or DELETE on user data.
    expect(writer.backend.calls.filter((c) => ['PATCH', 'DELETE'].includes(c.method) && c.table !== 'agent_tokens')).toEqual([]);
    // Every read carried the token's user.
    expect(writer.backend.calls.filter((c) => c.method === 'GET' && c.table !== 'agent_tokens').every((c) => c.params.get('user_id') === `eq.${USER}`)).toBe(true);

    const audit = writer.backend.audit().filter((r) => r.method === 'tools/call');
    expect(audit.map((r) => [r.tool, r.status, r.result_ref?.toString().split(':')[0] ?? null])).toEqual([
      ['add_jot', 'ok', 'jot'],
      ['create_note', 'ok', 'note'],
      ['create_task', 'ok', 'task'],
      ['append_to_note', 'ok', 'proposal'],
      ['propose_change', 'ok', 'proposal'],
      ['propose_change', 'error', null],
    ]);
    // Content never reaches the audit log.
    expect(JSON.stringify(writer.backend.audit())).not.toMatch(/decision|project context|next step|Better title/);
  });
});
