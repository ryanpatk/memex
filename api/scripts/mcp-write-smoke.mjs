#!/usr/bin/env node
/**
 * End-to-end smoke test for memex-api's MCP write tools (M3-B), with the
 * official MCP client. Everything it writes is labelled "[test]". Prints
 * statuses, counts and ids only, so its output is safe to paste into a report.
 *
 *   cd api
 *   node --env-file=../.env.agent-rw --env-file=../.env.agent-ro scripts/mcp-write-smoke.mjs https://memex-api.joyfulsystems.workers.dev/mcp
 *
 * Env: MEMEX_AGENT_TOKEN (a read_write agent token) and, optionally,
 * MEMEX_AGENT_READ_TOKEN (a read token, to check refusals). Writes one jot,
 * one note (appended to once), one task, one link, and one pending proposal
 * (an edit to its own [test] task, so approving it touches nothing else).
 * Then a fresh client session reads every item back.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const args = process.argv.slice(2);
const url = new URL(args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:8788/mcp');
const rw = process.env.MEMEX_AGENT_TOKEN;
const ro = process.env.MEMEX_AGENT_READ_TOKEN;
if (!rw) {
  console.error('Set MEMEX_AGENT_TOKEN (a read_write agent token)');
  process.exit(1);
}

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const parse = (r) => JSON.parse(r.content.find((c) => c.type === 'text').text);
const run = Date.now().toString(36);
const today = new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function session(token, name) {
  const client = new Client({ name, version: '1.0.0' }, { versionNegotiation: { mode: 'legacy' } });
  await client.connect(
    new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  return client;
}

const WRITE_TOOLS = ['add_jot', 'save_link', 'create_note', 'create_task', 'append_to_note', 'propose_change'];
const ids = {};

// ── session A: write ─────────────────────────────────────────────────────
{
  const a = await session(rw, 'm3b-smoke-writer');
  const names = (await a.listTools()).tools.map((t) => t.name);
  check('read_write token sees every write tool', WRITE_TOOLS.every((n) => names.includes(n)), `${names.length} tools`);
  check('read_write token sees get_images', names.includes('get_images'));

  const spaces = parse(await a.callTool({ name: 'list_spaces', arguments: {} })).spaces;
  const space = spaces.find((s) => /memex/i.test(s.name));
  console.log(`     spaces: ${spaces.length}; filing into a "memex" space: ${space ? space.id : 'none found, unfiled'}`);

  const jotArgs = { text: `[test] m3b smoke ${run}: a jot from the MCP smoke test`, idempotency_key: `m3b-smoke-${run}-jot` };
  const jot = parse(await a.callTool({ name: 'add_jot', arguments: jotArgs }));
  ids.jot = jot.id;
  check('add_jot', jot.type === 'jot' && !!jot.id, jot.id);
  const replay = parse(await a.callTool({ name: 'add_jot', arguments: jotArgs }));
  check('add_jot retry with the same idempotency_key replays, no second jot', replay.replayed === true && replay.id === jot.id);
  const reuse = await a.callTool({ name: 'add_jot', arguments: { ...jotArgs, text: '[test] different text' } });
  check('reusing a key for different content is refused', reuse.isError === true);

  const note = parse(
    await a.callTool({
      name: 'create_note',
      arguments: {
        title: `[test] m3b smoke ${run}: project context`,
        body: `[test] Project context note written by the M3-B smoke test.\n\n### ${today}\n- [test] first entry`,
        ...(space ? { space_id: space.id } : {}),
        idempotency_key: `m3b-smoke-${run}-note`,
      },
    }),
  );
  ids.note = note.id;
  check('create_note', note.type === 'note' && !!note.id, `${note.id}${note.space ? ' (filed)' : ''}`);

  const append = parse(
    await a.callTool({
      name: 'append_to_note',
      arguments: { note_id: note.id, text: `### ${today}\n- [test] appended entry`, idempotency_key: `m3b-smoke-${run}-append` },
    }),
  );
  check('append_to_note on its own note appends directly', append.mode === 'appended', `text_length ${append.text_length}`);

  const task = parse(
    await a.callTool({ name: 'create_task', arguments: { text: `[test] m3b smoke ${run}: a task`, due_date: inDays(7), idempotency_key: `m3b-smoke-${run}-task` } }),
  );
  ids.task = task.id;
  check('create_task', task.type === 'task' && !!task.id, task.id);

  const linkUrl = `https://example.com/memex-m3b-smoke-test-${run}`;
  const link = parse(await a.callTool({ name: 'save_link', arguments: { url: linkUrl, title: `[test] m3b smoke ${run}: a link`, note: '[test] saved by the smoke test' } }));
  ids.link = link.id;
  check('save_link (new)', link.duplicate === false && !!link.id, link.id);
  const again = parse(await a.callTool({ name: 'save_link', arguments: { url: `${linkUrl}/` } }));
  check('save_link again dedupes', again.duplicate === true && again.id === link.id);

  const proposal = parse(
    await a.callTool({
      name: 'propose_change',
      arguments: {
        type: 'task',
        id: task.id,
        action: 'edit',
        changes: { title: `[test] m3b smoke ${run}: a task (renamed by a proposal)`, due_date: inDays(10) },
        reason: '[test] Smoke-test proposal: approve or reject, either is safe',
        idempotency_key: `m3b-smoke-${run}-proposal`,
      },
    }),
  );
  ids.proposal = proposal.proposal_id;
  check('propose_change creates a pending proposal', proposal.status === 'pending' && !!proposal.proposal_id, proposal.proposal_id);
  const taskAfter = parse(await a.callTool({ name: 'get_item', arguments: { type: 'task', id: task.id } }));
  check('…and does not change the task', !taskAfter.title.includes('renamed'));

  const jotEdit = await a.callTool({ name: 'propose_change', arguments: { type: 'jot', id: jot.id, action: 'edit', changes: { text: 'x' } } });
  check('jots cannot be changed', jotEdit.isError === true);
  await a.close();
}

// ── read token: refused ──────────────────────────────────────────────────
if (ro) {
  const r = await session(ro, 'm3b-smoke-reader');
  const names = (await r.listTools()).tools.map((t) => t.name);
  check('read token sees no write tools', !names.some((n) => WRITE_TOOLS.includes(n)), `${names.length} tools`);
  let refused = 0;
  for (const name of WRITE_TOOLS) {
    try {
      const res = await r.callTool({ name, arguments: { text: `[test] m3b smoke ${run}: must not be written`, title: '[test] x', url: 'https://example.com/x', note_id: ids.note } });
      if (res.isError) refused++;
    } catch {
      refused++;
    }
  }
  check('read token is refused on every write tool', refused === WRITE_TOOLS.length, `${refused}/${WRITE_TOOLS.length}`);
  const leaked = parse(await r.callTool({ name: 'search', arguments: { query: `${run} must not be written` } }));
  check('nothing was written by the read token', leaked.items.length === 0);
  await r.close();
} else {
  console.log('skip read-token checks (no MEMEX_AGENT_READ_TOKEN)');
}

// ── session B: a fresh client reads everything back ──────────────────────
{
  const b = await session(rw, 'm3b-smoke-reader-fresh');
  const found = parse(await b.callTool({ name: 'search', arguments: { query: `m3b smoke ${run}` } }));
  const types = found.items.map((i) => i.type).sort();
  check('fresh session finds every written item by search', ['jot', 'link', 'note', 'task'].every((t) => types.includes(t)), types.join(','));
  const note = parse(await b.callTool({ name: 'get_item', arguments: { type: 'note', id: ids.note } }));
  check('note reads back with the appended entry', note.text.includes('[test] first entry') && note.text.includes('[test] appended entry'));
  check('note is marked as written by this agent', note.captured_by === 'agent' && !!note.captured_client);
  for (const type of ['jot', 'task', 'link']) {
    const item = parse(await b.callTool({ name: 'get_item', arguments: { type, id: ids[type] } }));
    check(`${type} reads back, captured_by agent`, item.id === ids[type] && item.captured_by === 'agent');
  }
  const journal = parse(await b.callTool({ name: 'get_journal', arguments: { from: today, to: today, types: ['jot'] } }));
  check('jot is in today’s Journal', journal.days.some((d) => d.items.some((i) => i.id === ids.jot)));
  const images = parse(await b.callTool({ name: 'get_images', arguments: { type: 'link', id: ids.link } }));
  check('get_images answers for the link', Array.isArray(images.items), `${images.items.reduce((n, i) => n + i.images.length, 0)} images`);
  await b.close();
}

console.log(`\nids: ${JSON.stringify(ids)}`);
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
