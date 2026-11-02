#!/usr/bin/env node
/**
 * End-to-end smoke test for memex-api's /mcp with the official MCP client.
 * Prints counts and statuses only, never item content, so its output is safe
 * to paste into a report.
 *
 *   cd api
 *   MEMEX_AGENT_TOKEN=mxa_… node scripts/mcp-smoke.mjs [url] [--mode legacy|auto]
 *   node --env-file=../.env.agent scripts/mcp-smoke.mjs https://memex-api.joyfulsystems.workers.dev/mcp
 *
 * Default url: http://localhost:8788/mcp (npm run dev). `--mode legacy` (the
 * default) connects like a 2025-era client (initialize); `auto` negotiates
 * the 2026-07-28 protocol.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const args = process.argv.slice(2);
const url = new URL(args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:8788/mcp');
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'legacy';
const token = process.env.MEMEX_AGENT_TOKEN;
if (!token) {
  console.error('Set MEMEX_AGENT_TOKEN (an agent token, mxa_…)');
  process.exit(1);
}

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

// Refusals first: no token, a malformed one, a well-formed unknown one.
for (const [label, auth] of [
  ['no token → 401', null],
  ['extension-style token → 401', `Bearer mx_${'a'.repeat(43)}`],
  ['unknown agent token → 401', `Bearer mxa_${'0'.repeat(43)}`],
]) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  check(label, res.status === 401, `status ${res.status}`);
}

const client = new Client({ name: 'memex-mcp-smoke', version: '1.0.0' }, { versionNegotiation: { mode } });
await client.connect(
  new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
);
check(`connect (${mode})`, true, `server ${client.getServerVersion()?.name} ${client.getServerVersion()?.version}`);

const { tools } = await client.listTools();
check('tools/list', tools.length >= 6, tools.map((t) => t.name).join(', '));

const call = async (name, args) => {
  const started = Date.now();
  const res = await client.callTool({ name, arguments: args });
  const ms = Date.now() - started;
  if (res.isError) {
    check(name, false, `error after ${ms} ms: ${res.content?.[0]?.text?.slice(0, 160)}`);
    return null;
  }
  return { data: JSON.parse(res.content[0].text), ms };
};

const spaces = await call('list_spaces', {});
if (spaces) {
  const totals = spaces.data.spaces.map((s) => s.total);
  check('list_spaces', true, `${spaces.data.spaces.length} spaces, ${totals.reduce((a, b) => a + b, 0)} filed items, ${spaces.ms} ms`);
}

const firstSpace = spaces?.data.spaces.find((s) => s.total > 0) ?? spaces?.data.spaces[0];
if (firstSpace) {
  const overview = await call('space_overview', { space_id: firstSpace.id, limit: 5 });
  if (overview) {
    check('space_overview', overview.data.recent.length <= 5, `total ${overview.data.total}, ${overview.data.recent.length} recent, more: ${!!overview.data.next_cursor}, ${overview.ms} ms`);
  }
}

let sample = null;
for (const query of ['the', 'a', 'http']) {
  const search = await call('search', { query, limit: 5 });
  if (!search) break;
  if (search.data.items.length) {
    sample = search.data.items[0];
    const types = [...new Set(search.data.items.map((i) => i.type))].join('/');
    check('search', search.data.items.length <= 5, `${search.data.items.length} items (${types}), more: ${!!search.data.next_cursor}, ${search.ms} ms`);
    if (search.data.next_cursor) {
      const next = await call('search', { query, limit: 5, cursor: search.data.next_cursor });
      const overlap = next ? next.data.items.filter((i) => search.data.items.some((j) => j.id === i.id)).length : -1;
      check('search page 2', !!next && overlap === 0, `${next?.data.items.length} items, overlap ${overlap}`);
    }
    break;
  }
}
if (!sample) check('search', false, 'no results for any probe word');

for (const type of ['link', 'note']) {
  const found = await call('search', { query: type === 'link' ? 'http' : 'the', types: [type], limit: 1 });
  const item = found?.data.items[0] ?? (sample?.type === type ? sample : null);
  if (!item) continue;
  const full = await call('get_item', { type, id: item.id });
  if (full) check(`get_item (${type})`, full.data.id === item.id, `text ${full.data.text_length} chars, truncated: ${full.data.text_truncated}, ${full.ms} ms`);
}

const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
const journal = await call('get_journal', { from: weekAgo, to: today, limit: 20 });
if (journal) {
  const n = journal.data.days.reduce((a, d) => a + d.items.length, 0);
  check('get_journal', true, `${journal.data.days.length} days, ${n} items, more: ${!!journal.data.next_cursor}, ${journal.ms} ms`);
}

const stats = await call('timeline_stats', {});
if (stats) {
  const t = stats.data.totals;
  check('timeline_stats', stats.data.series.length === 30, `30-day totals link ${t.link} · note ${t.note} · task ${t.task} · jot ${t.jot}; truncated: ${stats.data.truncated.length}, ${stats.ms} ms`);
}

const bad = await client.callTool({ name: 'get_item', arguments: { type: 'note', id: '00000000-0000-4000-8000-000000000000' } });
check('get_item unknown id → error', bad.isError === true);

await client.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
