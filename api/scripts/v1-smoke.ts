/* eslint-disable @typescript-eslint/no-explicit-any -- a smoke script reading untyped JSON from live services */
/**
 * memex v1 end-to-end smoke test (M7, docs/v1-signoff.md). Exercises the
 * whole loop against production and cleans up after itself:
 *
 *   capture (extension API, web composer path, MCP writes) → display (core's
 *   Journal, space board, Tasks and Library-view logic over the rows) →
 *   agent analysis (every MCP read tool), plus the scraper, token scopes,
 *   revocation and the database's same-owner checks.
 *
 *   cd api
 *   export SUPABASE_URL=https://zwgotlojioprtjvrxltc.supabase.co
 *   # the service-role key straight from the Supabase CLI into this one process, never printed:
 *   SUPABASE_SERVICE_ROLE_KEY="$(npx -y supabase@2 projects api-keys --project-ref zwgotlojioprtjvrxltc -o json \
 *     | jq -r '.[] | select(.name=="service_role") | .api_key')" \
 *     node --import tsx scripts/v1-smoke.ts run --user <uuid> [--api https://memex-api…]
 *   # …check the vault export while the [test] items exist (docs/v1-signoff.md)…
 *   (same env) node --import tsx scripts/v1-smoke.ts cleanup --user <uuid>
 *
 * (`tsx` must be resolvable: `npm i -g tsx`, or pass its path to --import.)
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. The service role bypasses
 * RLS, so every query here filters on --user, like memex-api's userScope.
 *
 * Safety (CLAUDE.md → Safety rules): everything it creates starts with
 * "[test]" and goes in a "[test] M7" space; every id is recorded in a state
 * file (ids only, mode 600, outside the repo), and `cleanup` deletes exactly
 * those ids and nothing else, revokes the test agent tokens and deletes the
 * test extension token. Tokens are never printed: agent tokens are made by
 * scripts/agent-token.mjs with --out (mode 600 files, removed by cleanup),
 * the extension token exists only in memory. Output is statuses, counts and
 * ids only.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { parseComposer } from '../../packages/core/src/composer';
import { buildEntries, entriesInSpace } from '../../packages/core/src/journal/feed';
import { spaceBoard } from '../../packages/core/src/journal/space';
import { groupTasks } from '../../packages/core/src/tasks/tasks';
import { buildStreamItems } from '../../packages/core/src/stream/items';
import { matchesLibraryFilters, parseViewDefinition, spaceIdsByItem } from '../../packages/core/src/stream/views';
import { WEB_CLIENT, withAppProvenance } from '../../packages/core/src/capture/provenance';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');
const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const USER = flag('--user') ?? '';
const API = (flag('--api') ?? 'https://memex-api.joyfulsystems.workers.dev').replace(/\/$/, '');
const STATE_DIR = flag('--state-dir') ?? '/tmp/memex-v1-smoke';
const STATE = path.join(STATE_DIR, 'state.json');
const SPACE_NAME = '[test] M7';
const RW_NAME = '[test] M7 smoke';
const RO_NAME = '[test] M7 smoke ro';
const EXT_NAME = '[test] M7 smoke ext';
const ORIGIN = 'chrome-extension://memexm7smoketestextensionidxxxx';

const SB = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!['run', 'cleanup'].includes(command ?? '')) die('Usage: v1-smoke.ts run|cleanup --user <uuid> (see the header)');
if (!/^[0-9a-f-]{36}$/i.test(USER)) die('--user <uuid> is required');
if (!SB || !KEY) die('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (see the header)');

function die(message: string): never {
  console.error(message);
  process.exit(2);
}

// ── state (ids only) ─────────────────────────────────────────────────────────
type Kind = 'links' | 'notes' | 'tasks' | 'self_messages' | 'inbox_proposals' | 'saved_views' | 'profiles' | 'api_tokens' | 'agent_tokens';
type State = { run: string; created: Record<Kind, string[]> };
const emptyState = (): State => ({
  run: Date.now().toString(36),
  created: { links: [], notes: [], tasks: [], self_messages: [], inbox_proposals: [], saved_views: [], profiles: [], api_tokens: [], agent_tokens: [] },
});
const loadState = (): State => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : emptyState());
const saveState = (s: State) => {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2), { mode: 0o600 });
};
const record = (s: State, kind: Kind, id: string | undefined) => {
  if (id && !s.created[kind].includes(id)) s.created[kind].push(id);
  saveState(s);
};

// ── service-role PostgREST, always filtered by --user ────────────────────────
const sbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
class DbFail extends Error {
  constructor(readonly status: number, readonly code: string | null) {
    super(`db ${status} ${code ?? ''}`);
  }
}
async function rest<T = any>(method: string, table: string, params: Record<string, string>, body?: unknown): Promise<T> {
  const q = new URLSearchParams(params);
  if (method !== 'POST') q.set('user_id', `eq.${USER}`); // scoped like userScope
  const res = await fetch(`${SB}/rest/v1/${table}?${q}`, {
    method,
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(method === 'POST' ? { ...(body as object), user_id: USER } : body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { code?: string } | null;
    throw new DbFail(res.status, detail?.code ?? null);
  }
  return res.json() as Promise<T>;
}
/** Join tables have no user_id; written only for ids this script owns. */
async function joinInsert(table: string, row: Record<string, string | boolean>) {
  const res = await fetch(`${SB}/rest/v1/${table}`, { method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  if (!res.ok) throw new DbFail(res.status, ((await res.json().catch(() => null)) as { code?: string } | null)?.code ?? null);
}

// ── results ──────────────────────────────────────────────────────────────────
const results: { area: string; check: string; ok: boolean; detail: string }[] = [];
const check = (area: string, label: string, ok: boolean, detail = '') => {
  results.push({ area, check: label, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${area}] ${label}${detail ? ` — ${detail}` : ''}`);
};
async function attempt(area: string, label: string, fn: () => Promise<boolean | string | void>) {
  try {
    const r = await fn();
    check(area, label, r !== false, typeof r === 'string' ? r : '');
  } catch (err) {
    check(area, label, false, err instanceof Error ? err.message.slice(0, 160) : String(err));
  }
}

// ── tokens ───────────────────────────────────────────────────────────────────
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
/** The web app's Settings → Access tokens generator (src/hooks/useApiTokens.ts): mx_ + 32 random bytes, base64url. */
const newExtensionToken = () => `mx_${randomBytes(32).toString('base64url')}`;

function agentToken(name: string, scope: 'read' | 'read_write', file: string): { id: string; token: string } {
  if (fs.existsSync(file)) fs.rmSync(file);
  const out = execFileSync(
    process.execPath,
    [path.join(REPO, 'scripts/agent-token.mjs'), 'create', '--user', USER, '--name', name, '--scope', scope, '--expires', '2d', '--out', file],
    { env: process.env, encoding: 'utf8' },
  );
  const id = /Created agent token ([0-9a-f-]{36})/.exec(out)?.[1];
  const token = /^MEMEX_AGENT_TOKEN=(.+)$/m.exec(fs.readFileSync(file, 'utf8'))?.[1]?.trim();
  if (!id || !token) throw new Error('agent-token.mjs did not create a token');
  return { id, token };
}

// ── MCP ──────────────────────────────────────────────────────────────────────
async function mcp(token: string) {
  const client = new Client({ name: '[test] m7-smoke', version: '1.0.0' }, { versionNegotiation: { mode: 'legacy' } });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${API}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
const parse = (r: any) => JSON.parse(r.content.find((c: any) => c.type === 'text').text);
const call = async (c: Client, name: string, a: Record<string, unknown>) => {
  const r: any = await c.callTool({ name, arguments: a });
  if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text?.slice(0, 140)}`);
  return parse(r);
};

// ── run ──────────────────────────────────────────────────────────────────────
async function run() {
  const s = loadState();
  if (Object.values(s.created).some((ids) => ids.length)) die(`State at ${STATE} still lists created ids; run cleanup first`);
  saveState(s);
  const tag = `m7-${s.run}`;
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  // Setup: the test space and three tokens.
  const [space] = await rest('POST', 'profiles', {}, { name: SPACE_NAME });
  record(s, 'profiles', space.id);
  const ext = newExtensionToken();
  const [extRow] = await rest('POST', 'api_tokens', {}, { name: EXT_NAME, token_hash: sha256(ext) });
  record(s, 'api_tokens', extRow.id);
  const rw = agentToken(RW_NAME, 'read_write', path.join(STATE_DIR, 'agent-rw.env'));
  record(s, 'agent_tokens', rw.id);
  const ro = agentToken(RO_NAME, 'read', path.join(STATE_DIR, 'agent-ro.env'));
  record(s, 'agent_tokens', ro.id);
  check('setup', 'test space and tokens created', true, `space ${space.id}, ext token ${extRow.id}, agent rw ${rw.id}, ro ${ro.id}`);

  // ── 1. Extension API (/api/*), as the Chrome extension calls it ───────────
  const api = (p: string, init: RequestInit = {}, token = ext) =>
    fetch(`${API}${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN, 'Content-Type': 'application/json', ...init.headers } });
  const capture = async (body: Record<string, unknown>) => {
    const res = await api('/api/capture', { method: 'POST', body: JSON.stringify(body) });
    const json: any = await res.json();
    if (json?.data?.link?.id) record(s, 'links', json.data.link.id);
    return { res, json };
  };

  await attempt('extension', 'GET /api/spaces lists the test space (CORS open)', async () => {
    const res = await api('/api/spaces');
    const json: any = await res.json();
    return res.status === 200 && res.headers.get('access-control-allow-origin') === '*' && json.data.some((x: any) => x.id === space.id);
  });
  await attempt('extension', 'GET /api/tags', async () => (await api('/api/tags')).status === 200);

  const scrapeUrl = `https://example.com/?memex-test=${tag}`;
  let extLinkId = '';
  await attempt('extension', 'POST /api/capture: 201, filed, captured_by extension', async () => {
    const { res, json } = await capture({ url: scrapeUrl, note: '[test] M7 smoke: extension capture', capturedBy: 'extension', client: 'memex-extension/0.3.0', spaceId: space.id });
    extLinkId = json.data.link.id;
    const l = json.data.link;
    return res.status === 201 && l.captured_by === 'extension' && l.captured_client === 'memex-extension/0.3.0' && json.data.attached.space !== null
      ? `link ${l.id}`
      : false;
  });
  await attempt('scraper', 'capture without a title gets one from memex-scraper (service binding)', async () => {
    const [row] = await rest('GET', 'links', { id: `eq.${extLinkId}`, select: 'title,favicon_url,url' });
    return row?.title && row.title !== row.url ? `title "${row.title}"` : false;
  });
  await attempt('extension', 'same URL again → 200 duplicate', async () => {
    const { res, json } = await capture({ url: scrapeUrl, capturedBy: 'extension' });
    return res.status === 200 && json.data.duplicate === true && json.data.link.id === extLinkId;
  });
  await attempt('extension', 'GET /api/lookup finds it (normalized URL)', async () => {
    const json: any = await (await api(`/api/lookup?url=${encodeURIComponent(`http://www.example.com/?memex-test=${tag}&utm_source=x`)}`)).json();
    return json.data.found === true && json.data.link.id === extLinkId;
  });
  const statusId = String(BigInt(1_900_000_000_000_000_000n) + BigInt(Date.now()));
  await attempt('extension', 'X bookmark dedupes across twitter.com / x.com URL shapes', async () => {
    const a = await capture({ url: `https://x.com/memextest/status/${statusId}`, title: '[test] M7 X bookmark', list: 'bookmarked', capturedBy: 'extension' });
    const b = await capture({ url: `https://twitter.com/i/web/status/${statusId}`, list: 'liked', capturedBy: 'extension' });
    return a.res.status === 201 && a.json.data.link.source === 'x' && b.json.data.duplicate === true && b.json.data.link.id === a.json.data.link.id
      ? `lists ${JSON.stringify(b.json.data.link.lists)}`
      : false;
  });
  await attempt('extension', 'POST /api/links/:id/spaces files it; another space id → 404', async () => {
    const okRes = await api(`/api/links/${extLinkId}/spaces`, { method: 'POST', body: JSON.stringify({ spaceId: space.id }) });
    const bad = await api(`/api/links/${extLinkId}/spaces`, { method: 'POST', body: JSON.stringify({ spaceId: randomUUID() }) });
    return okRes.status === 200 && bad.status === 404;
  });
  await attempt('extension', 'DELETE /api/links/:id undoes a capture; twice → 404', async () => {
    const { json } = await capture({ url: `https://example.net/?memex-test=${tag}-undo`, title: '[test] M7 undo', capturedBy: 'extension' });
    const id = json.data.link.id;
    const first = await api(`/api/links/${id}`, { method: 'DELETE' });
    const second = await api(`/api/links/${id}`, { method: 'DELETE' });
    return first.status === 200 && second.status === 404;
  });
  await attempt('extension', 'oversized body → 413; bad token → 401; agent token refused on /api', async () => {
    const big = await api('/api/capture', { method: 'POST', body: JSON.stringify({ url: 'https://example.com', note: 'x'.repeat(70_000) }) });
    const bad = await api('/api/spaces', {}, `mx_${'0'.repeat(43)}`);
    const agent = await api('/api/spaces', {}, rw.token);
    return big.status === 413 && bad.status === 401 && agent.status === 401;
  });

  // ── 2. The web app's composer and save path (core logic, same rows the app writes) ──
  const spaces = [{ id: space.id, name: SPACE_NAME }];
  const [project] = await rest('GET', 'projects', { name: 'eq.Library', select: 'id', limit: '1' });
  let webLinkId = '';
  let webJotId = '';
  let webTaskId = '';
  await attempt('web', 'composer: lone https:// text (any TLD) is a link, @Space files it', async () => {
    const r = parseComposer(`https://are.na/block/${tag} @${SPACE_NAME}`, spaces);
    const r2 = parseComposer('https://example.zzzz/whatever', spaces);
    if (r.kind !== 'link' || r2.kind !== 'link' || r.spaces[0]?.id !== space.id) return false;
    const data = withAppProvenance({ url: r.url, title: '[test] M7 web save' } as any, WEB_CLIENT);
    const [row] = await rest('POST', 'links', {}, { ...data, project_id: project.id, order_index: 0 });
    record(s, 'links', row.id);
    webLinkId = row.id;
    await joinInsert('profile_links', { profile_id: space.id, link_id: row.id, is_super_favorite: true });
    return row.captured_by === 'app' && row.captured_client === 'memex-web' ? `link ${row.id} captured_by app` : false;
  });
  await attempt('web', 'composer jot filed into the space, moved Home and back', async () => {
    const r = parseComposer(`[test] M7 web jot ${tag} @${SPACE_NAME}`, spaces);
    if (r.kind !== 'jot') return false;
    const [jot] = await rest('POST', 'self_messages', {}, { body: r.body, profile_id: r.spaces[0].id });
    record(s, 'self_messages', jot.id);
    webJotId = jot.id;
    await rest('PATCH', 'self_messages', { id: `eq.${jot.id}` }, { profile_id: null });
    const [back] = await rest('PATCH', 'self_messages', { id: `eq.${jot.id}` }, { profile_id: space.id });
    return back.profile_id === space.id;
  });
  await attempt('rls', 'production refuses moving a jot into a space that isn\'t the owner\'s (trigger, even for the service role)', async () => {
    try {
      await rest('PATCH', 'self_messages', { id: `eq.${webJotId}` }, { profile_id: randomUUID() });
      return false;
    } catch (err) {
      return err instanceof DbFail && err.code === '42501' ? 'refused 42501' : false;
    }
  });
  await attempt('web', 'composer task ([] ) filed into the space', async () => {
    const r = parseComposer(`[] [test] M7 web task ${tag} @${SPACE_NAME}`, spaces);
    if (r.kind !== 'task') return false;
    const [task] = await rest('POST', 'tasks', {}, { title: r.title, is_done: false, order_index: 0 });
    record(s, 'tasks', task.id);
    webTaskId = task.id;
    await joinInsert('profile_tasks', { profile_id: space.id, task_id: task.id });
    return true;
  });

  // ── 3. MCP ─────────────────────────────────────────────────────────────────
  const writer = await mcp(rw.token);
  const reader = await mcp(ro.token);
  const ids: Record<string, string> = {};
  await attempt('mcp', 'tools/list: read_write sees 13 tools, read sees the 7 read tools', async () => {
    const w = (await writer.listTools()).tools.map((t) => t.name);
    const r = (await reader.listTools()).tools.map((t) => t.name);
    return w.length === 13 && r.length === 7 && !r.includes('add_jot') ? `${w.length} / ${r.length}` : false;
  });
  const key = `m7-smoke-${s.run}-jot`;
  await attempt('mcp', 'add_jot (with idempotency key; a retry replays)', async () => {
    const a = await call(writer, 'add_jot', { text: `[test] M7 smoke jot ${tag}`, space_id: space.id, idempotency_key: key });
    record(s, 'self_messages', a.id);
    ids.jot = a.id;
    const b = await call(writer, 'add_jot', { text: `[test] M7 smoke jot ${tag}`, space_id: space.id, idempotency_key: key });
    return b.id === a.id && b.replayed === true ? `jot ${a.id}` : false;
  });
  await attempt('mcp', 'save_link (scraped, filed)', async () => {
    const r = await call(writer, 'save_link', { url: `https://example.org/?memex-test=${tag}`, note: '[test] M7 smoke MCP link', space_id: space.id });
    record(s, 'links', r.id);
    ids.link = r.id;
    const [row] = await rest('GET', 'links', { id: `eq.${r.id}`, select: 'title,captured_by,captured_client' });
    return r.filed === 'filed' && row.captured_by === 'agent' && row.captured_client === RW_NAME && row.title ? `title "${row.title}"` : false;
  });
  await attempt('mcp', 'create_note', async () => {
    const r = await call(writer, 'create_note', { title: `[test] M7 smoke note ${tag}`, body: '[test] context line one', space_id: space.id });
    record(s, 'notes', r.id);
    ids.note = r.id;
    return true;
  });
  await attempt('mcp', 'create_task (due tomorrow)', async () => {
    const r = await call(writer, 'create_task', { text: `[test] M7 smoke task ${tag}`, due_date: tomorrow, space_id: space.id });
    record(s, 'tasks', r.id);
    ids.task = r.id;
    return true;
  });
  await attempt('mcp', 'append_to_note (own note → appended directly)', async () => {
    const r = await call(writer, 'append_to_note', { note_id: ids.note, text: '[test] appended line' });
    return r.mode === 'appended';
  });
  await attempt('mcp', 'propose_change on an item the agent didn\'t write → pending proposal', async () => {
    const r = await call(writer, 'propose_change', { type: 'task', id: webTaskId, action: 'edit', changes: { title: '[test] M7 proposed title' }, reason: '[test] smoke' });
    record(s, 'inbox_proposals', r.proposal_id);
    const [task] = await rest('GET', 'tasks', { id: `eq.${webTaskId}`, select: 'title' });
    return r.status === 'pending' && task.title.startsWith('[test] M7 web task') ? `proposal ${r.proposal_id}, task unchanged` : false;
  });
  await attempt('mcp', 'read tool list_spaces counts the test space', async () => {
    const r = await call(reader, 'list_spaces', {});
    const sp = r.spaces.find((x: any) => x.id === space.id);
    return sp ? `counts ${JSON.stringify(sp.counts)}` : false;
  });
  await attempt('mcp', 'read tool space_overview', async () => {
    const r = await call(reader, 'space_overview', { space_id: space.id, limit: 25 });
    const got = new Set(r.recent.map((i: any) => i.id));
    return [ids.jot, ids.link, ids.note, ids.task, webLinkId, webJotId, webTaskId, extLinkId].every((id) => got.has(id)) ? `total ${r.total}` : false;
  });
  await attempt('mcp', 'read tool search', async () => {
    const r = await call(reader, 'search', { query: tag, limit: 50 });
    const got = new Set(r.items.map((i: any) => i.id));
    return [ids.jot, ids.note, ids.task].every((id) => got.has(id)) ? `${r.items.length} hits` : false;
  });
  await attempt('mcp', 'read tool get_item (each type)', async () => {
    const note = await call(reader, 'get_item', { type: 'note', id: ids.note });
    const link = await call(reader, 'get_item', { type: 'link', id: ids.link });
    const task = await call(reader, 'get_item', { type: 'task', id: ids.task });
    const jot = await call(reader, 'get_item', { type: 'jot', id: ids.jot });
    return note.text.includes('appended line') && link.captured_by === 'agent' && task.due_date === tomorrow && jot.spaces?.[0]?.id === space.id;
  });
  await attempt('mcp', 'read tool get_journal (today)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await call(reader, 'get_journal', { from: today, space_id: space.id, limit: 100 });
    const got = new Set(r.days.flatMap((d: any) => d.items.map((i: any) => i.id)));
    return got.has(ids.jot) && got.has(webJotId) ? `${got.size} items` : false;
  });
  await attempt('mcp', 'read tool timeline_stats', async () => {
    const r = await call(reader, 'timeline_stats', { space_id: space.id });
    return r.totals && Object.values(r.totals as Record<string, number>).reduce((a, b) => a + b, 0) >= 8 ? `totals ${JSON.stringify(r.totals)}` : false;
  });
  await attempt('mcp', 'read tool get_images', async () => {
    const r = await call(reader, 'get_images', { space_id: space.id });
    return Array.isArray(r.items) ? `${r.items.length} items with pictures` : false;
  });
  await attempt('mcp', 'read token: write tool refused, nothing written', async () => {
    const r: any = await reader.callTool({ name: 'add_jot', arguments: { text: '[test] must not exist' } }).catch((e: Error) => ({ isError: true, content: [{ text: e.message }] }));
    const rows = await rest('GET', 'self_messages', { body: 'eq.[test] must not exist', select: 'id' });
    return r.isError === true && rows.length === 0;
  });
  await attempt('mcp', 'audit rows for every write: token, tool, item id; no content', async () => {
    await new Promise((r) => setTimeout(r, 2500)); // audit is written after the response
    const rows = await rest('GET', 'mcp_audit_log', { token_id: `eq.${rw.id}`, method: 'eq.tools/call', select: 'tool,status,result_ref,args_summary,client_name' });
    const writes = rows.filter((r: any) => ['add_jot', 'save_link', 'create_note', 'create_task', 'append_to_note', 'propose_change'].includes(r.tool));
    const tools = new Set(writes.map((r: any) => r.tool));
    const leaked = JSON.stringify(rows.map((r: any) => r.args_summary)).includes('[test]'); // text is reduced to its length
    return tools.size === 6 && writes.every((r: any) => r.result_ref && r.client_name === RW_NAME) && !leaked ? `${writes.length} write rows` : false;
  });
  await writer.close();
  await reader.close();

  // ── 4. Display: core's Journal, space board, Tasks and Library-view logic ──
  await attempt('core', 'Journal feed, space board, Tasks and a saved Library view show the test items', async () => {
    const linkIds = s.created.links.join(',');
    const [links, notes, tasks, jots, pl, pn, pt] = await Promise.all([
      rest('GET', 'links', { id: `in.(${linkIds})`, select: '*' }),
      rest('GET', 'notes', { id: `in.(${s.created.notes.join(',')})`, select: '*' }),
      rest('GET', 'tasks', { id: `in.(${s.created.tasks.join(',')})`, select: '*' }),
      rest('GET', 'self_messages', { id: `in.(${s.created.self_messages.join(',')})`, select: '*' }),
      fetch(`${SB}/rest/v1/profile_links?profile_id=eq.${space.id}&select=*`, { headers: sbHeaders }).then((r) => r.json()),
      fetch(`${SB}/rest/v1/profile_notes?profile_id=eq.${space.id}&select=*`, { headers: sbHeaders }).then((r) => r.json()),
      fetch(`${SB}/rest/v1/profile_tasks?profile_id=eq.${space.id}&select=*`, { headers: sbHeaders }).then((r) => r.json()),
    ]);
    const withTags = (rows: any[]) => rows.map((r) => ({ ...r, link_tags: [], note_tags: [], task_tags: [], tags: [] }));
    const membership = { links: pl, notes: pn, tasks: pt };
    const entries = buildEntries({
      jots,
      links: withTags(links),
      notes: withTags(notes),
      tasks: withTags(tasks),
      spaces: [{ id: space.id, name: SPACE_NAME, color: '#888' } as any],
      membership,
    });
    const inSpace = entriesInSpace(entries, space.id);
    const board = spaceBoard(entries, space.id, pl);
    const groups = groupTasks(board.openTasks, { by: 'space', spaces: [space], membership: new Map(pt.map((r: any) => [r.task_id, [space.id]])) });
    const [view] = await rest('POST', 'saved_views', {}, { name: '[test] M7 view', definition: { filters: { spaces: [space.id], types: ['link'] }, layout: 'table' }, position: 999 });
    record(s, 'saved_views', view.id);
    const def = parseViewDefinition(view.definition);
    const spaceMap = spaceIdsByItem(membership);
    const items = buildStreamItems(withTags(links), withTags(notes), withTags(tasks));
    const shown = items.filter((i) => matchesLibraryFilters(i, def.filters, { spacesOf: (k) => spaceMap.get(k) ?? [] }));
    const ok =
      inSpace.length === 8 &&
      board.pinned.some((l) => l.id === webLinkId) &&
      board.openTasks.length === 2 &&
      board.saves.length === 3 &&
      board.notes.length === 1 &&
      board.jotCount === 2 &&
      groups.length === 1 && groups[0].tasks.length === 2 &&
      shown.length === 3 && shown.every((i) => i.type === 'link') && def.layout === 'table';
    return ok
      ? `space: ${inSpace.length} entries; board: 1 pinned, ${board.openTasks.length} open tasks, ${board.saves.length} saves, ${board.notes.length} note, ${board.jotCount} jots; view: ${shown.length} links`
      : `inSpace ${inSpace.length}, pinned ${board.pinned.length}, open ${board.openTasks.length}, saves ${board.saves.length}, notes ${board.notes.length}, jots ${board.jotCount}, groups ${groups.length}, view ${shown.length}`;
  });

  // ── 5. Revocation ──────────────────────────────────────────────────────────
  await attempt('mcp', 'revoked token refused on the next request (401)', async () => {
    execFileSync(process.execPath, [path.join(REPO, 'scripts/agent-token.mjs'), 'revoke', ro.id, '--user', USER], { env: process.env, encoding: 'utf8' });
    const res = await fetch(`${API}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ro.token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    const json: any = await res.json();
    return res.status === 401 && /revoked/.test(json.error?.message ?? '') ? 'This token has been revoked' : false;
  });

  summary();
  console.log(`\nState (ids only): ${STATE}. Run the vault export now if you want it to include these items, then: v1-smoke.ts cleanup --user ${USER}`);
}

// ── cleanup: exactly the recorded ids ────────────────────────────────────────
async function cleanup() {
  const s = loadState();
  const del = async (table: Kind, idsToDelete: string[]) => {
    if (!idsToDelete.length) return 0;
    const rows = await rest('DELETE', table, { id: `in.(${idsToDelete.join(',')})`, select: 'id' });
    return rows.length;
  };
  // Proposals before the items they point at; the space last (its joins cascade).
  for (const table of ['inbox_proposals', 'saved_views', 'self_messages', 'notes', 'tasks', 'links', 'api_tokens'] as Kind[]) {
    const n = await del(table, s.created[table]);
    check('cleanup', `deleted ${table}`, true, `${n} of ${s.created[table].length} recorded`);
    s.created[table] = [];
    saveState(s);
  }
  // Idempotency keys the test agents claimed (their client names are [test]).
  const keys = await rest('DELETE', 'agent_write_keys', { client_name: `in.("${RW_NAME}","${RO_NAME}")`, select: 'id' });
  check('cleanup', 'deleted agent_write_keys of the test clients', true, `${keys.length}`);
  const n = await del('profiles', s.created.profiles);
  check('cleanup', 'deleted the [test] M7 space', n === s.created.profiles.length, `${n}`);
  s.created.profiles = [];
  // Agent tokens are revoked, never deleted (the audit log points at them).
  if (s.created.agent_tokens.length) {
    const revoked = await rest('PATCH', 'agent_tokens', { id: `in.(${s.created.agent_tokens.join(',')})`, revoked_at: 'is.null', select: 'id' }, { revoked_at: new Date().toISOString() });
    const rows = await rest('GET', 'agent_tokens', { id: `in.(${s.created.agent_tokens.join(',')})`, select: 'id,revoked_at' });
    check('cleanup', 'test agent tokens revoked', rows.every((r: any) => r.revoked_at), `${revoked.length} newly revoked, ${rows.length} total`);
  }
  for (const f of ['agent-rw.env', 'agent-ro.env']) fs.rmSync(path.join(STATE_DIR, f), { force: true });
  s.created.agent_tokens = [];
  saveState(s);
  // Nothing with this run's tag is left.
  const left = await Promise.all(
    (['links', 'notes', 'tasks', 'self_messages'] as const).map(async (t) => {
      const col = t === 'links' ? 'url' : t === 'self_messages' ? 'body' : 'title';
      return (await rest('GET', t, { [col]: `like.*m7-${s.run}*`, select: 'id' })).length;
    }),
  );
  check('cleanup', 'no item tagged with this run remains', left.every((x) => x === 0), left.join('/'));
  summary();
  fs.rmSync(STATE, { force: true });
}

function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

await (command === 'run' ? run() : cleanup());
