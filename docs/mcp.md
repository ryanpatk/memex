# memex MCP server

memex-api hosts a remote [MCP](https://modelcontextprotocol.io) server, so an agent (a Grok Bot, Claude Code, Cursor, any MCP client) can use memex as context: find the space for a project, read its latest items, search everything, and read the Journal for given days. ROADMAP Phase 7a; write tools come next (M3-B).

- **Endpoint:** `https://memex-api.joyfulsystems.workers.dev/mcp`
- **Transport:** Streamable HTTP, stateless. Speaks MCP `2026-07-28` (no handshake) and still serves 2025-era clients (`initialize`, `2025-11-25` / `2025-06-18`) the same way: no session id, every POST stands alone. GET and DELETE answer `405`.
- **Auth:** `Authorization: Bearer mxa_…`, an **agent token** (below). OAuth is not offered yet; see `docs/mcp-auth.md`.
- **Code:** `api/src/mcp/` (endpoint, auth, tools, PostgREST store), `packages/core/src/agent/` (`@memex/core/agent`: the read service, cursors, token rules; tested), migration `supabase/migrations/20261102120000_add_agent_tokens_and_mcp_audit.sql`.

## 1. Create an agent token

One token per client, so each can be revoked alone and shows by name in the audit log. Tokens are separate from the extension's access tokens (`mx_…`): an extension token is refused at `/mcp`, and an agent token is refused by `/api/*`.

```bash
# The script needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in a gitignored env file.
node --env-file=.env.agent-admin scripts/agent-token.mjs create --email you@example.com \
  --name "Grok Bot: memex project" --scope read --expires 90d
```

- The token is printed **once**, and only to an interactive terminal. Store it in the client's secret store, never in a repo. In a script, `--out FILE` writes `MEMEX_AGENT_TOKEN=…` to a new file with mode 600 instead (pick a gitignored name like `.env.agent`).
- `--scope read` (default) sees only the read tools. `read_write` will also see the write tools when they ship; until then the two behave the same.
- `--expires` is optional (`90d`, `12h`, or a date). Without it the token lives until revoked.
- Other commands: `list` (id, name, scope, created, expires, last used, state), `revoke <id>`, and `revoke-all`, the kill switch, which asks you to type “revoke all” and leaves extension tokens alone. Revocation works on the very next request.
- A Settings → Agent tokens section in the app is planned for M3-B. The table's RLS already allows the app to list tokens, create them and set `revoked_at` (and nothing else).

## 2. Connect a client

Replace `$MEMEX_AGENT_TOKEN` with the token, through each tool's secret or environment-variable mechanism.

**Grok via the xAI API** (Remote MCP tools; Responses API shape):

```json
{
  "tools": [
    {
      "type": "mcp",
      "server_url": "https://memex-api.joyfulsystems.workers.dev/mcp",
      "server_label": "memex",
      "server_description": "The user's working memory: Journal, links, notes, tasks and jots, filed into spaces (projects).",
      "authorization": "$MEMEX_AGENT_TOKEN"
    }
  ]
}
```

The xAI SDK equivalent is `mcp(server_url=…, server_label="memex", authorization=token)`. memex accepts the token with or without the `Bearer ` prefix, so either form of the `authorization` field works.

**Grok Build CLI, or any client that takes a URL plus headers:** add a remote HTTP MCP server with URL `https://memex-api.joyfulsystems.workers.dev/mcp` and header `Authorization: Bearer $MEMEX_AGENT_TOKEN`, read from an environment variable so the token stays out of config files.

**grok.com custom connectors and claude.ai / Claude Desktop custom connectors** sign in with OAuth, which memex doesn't offer yet (M3-C, `docs/mcp-auth.md`). Use the API, a CLI, or a header-capable client until then.

**Claude Code:**

```bash
claude mcp add --transport http memex https://memex-api.joyfulsystems.workers.dev/mcp \
  --header "Authorization: Bearer $MEMEX_AGENT_TOKEN"
```

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "memex": {
      "url": "https://memex-api.joyfulsystems.workers.dev/mcp",
      "headers": { "Authorization": "Bearer ${env:MEMEX_AGENT_TOKEN}" }
    }
  }
}
```

**MCP TypeScript SDK** (v2):

```ts
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const client = new Client({ name: 'my-agent', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
await client.connect(new StreamableHTTPClientTransport(new URL('https://memex-api.joyfulsystems.workers.dev/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MEMEX_AGENT_TOKEN}` } },
}));
```

**Smoke test** (counts only, no content; checks refusals, every tool, paging):

```bash
cd api && node --env-file=../.env.agent scripts/mcp-smoke.mjs https://memex-api.joyfulsystems.workers.dev/mcp [--mode auto]
```

## 3. Tools

All read-only (`readOnlyHint: true`, `destructiveHint: false`) and limited to the token owner's data. Results are compact JSON in a text block. Lists come back newest first (the Journal oldest first) and are paged with keyset cursors: pass `next_cursor` back as `cursor`. The server's `instructions` tell the agent how to use memex as project context.

| Tool | Input | Returns |
| --- | --- | --- |
| `search` | `query` (1–200 chars, up to 6 words, all must match), `types?` (`link` `note` `task` `jot`), `space_id?`, `source?` (`x` `pinterest` `youtube` `web`; links only), `from?` / `to?` (days), `timezone?`, `limit?` (1–50, default 20), `cursor?` | `{ terms, items, next_cursor }`. Matches link titles, descriptions and URLs, note titles and text, task titles and details, jot text |
| `get_item` | `type`, `id` | The item in full: `text` up to 20,000 characters (`text_length`, `text_truncated`), task `done` / `due_date`, link `url`, `source`, `source_id`, `lists`, `captured_by`, `captured_client`, `preview_image_url`; `spaces`, `tags` |
| `get_journal` | `from` (day), `to?` (day, default `from`; ≤ 92 days), `timezone?`, `types?`, `space_id?`, `limit?` (1–100, default 50), `cursor?` | `{ from, to, timezone, days: [{ date, items }], next_cursor }`, oldest first |
| `list_spaces` | — | `{ spaces: [{ id, name, created_at, counts: { link, note, task, jot }, total }] }` |
| `space_overview` | `space_id`, `limit?` (1–25, default 10), `cursor?` | `{ space, counts, total, recent, next_cursor }` |
| `timeline_stats` | `from?` / `to?` (default: the last 30 days; ≤ 731 days), `timezone?`, `space_id?`, `bucket?` (`day` ≤ 366 days, `week`, `month`; default by range) | `{ totals, series: [{ start, link, note, task, jot, total }], links_by_source, by_space, truncated }` (counts stop at 5,000 items per type; `truncated` names any type that hit it) |

Every list item is `{ type, id, title, excerpt (≤ 280 chars), url?, source?, done?, due_date?, spaces: [{ id, name }], tags, created_at, updated_at }`. Days are `YYYY-MM-DD` in `timezone` (an IANA name, default `UTC`). Bad arguments come back as tool errors (`isError: true`) with a message the agent can act on, such as “cursor is not one this server issued”.

**Coming in M3-B (write tools):** `add_jot` writes straight to the Journal, marked `captured_by = 'agent'` with the client name. Anything that would change existing items (file into a space, tag, create a note from a jot) arrives as an Inbox proposal you apply or dismiss. A tool declares `access: 'write'` in `api/src/mcp/tools.ts`, and only `read_write` tokens see or can call it. No tool will ever delete or bulk-edit.

## 4. Security model

- **Tokens.** `mxa_` + 32 random bytes (base64url). Only the SHA-256 is stored (`agent_tokens.token_hash`); the plaintext is shown once. Each token has a client name, a scope (`read` · `read_write`), an optional `expires_at`, `revoked_at` and `last_used_at` (written at most once a minute).
- **Every request is authenticated.** There is no session to hijack. A missing, malformed, unknown, revoked or expired token gets `401` with `WWW-Authenticate: Bearer realm="memex"`. Revoked and expired tokens are checked on every request, so `revoke` and `revoke-all` work immediately.
- **Scope per tool.** Tools a token's scope doesn't allow aren't registered for that request (they don't show in `tools/list`), and each tool checks the scope again before it runs.
- **User scoping.** memex-api holds the Supabase service-role key, which bypasses RLS, so every read goes through `userScope(db, userId)` (`api/src/db.ts`), which adds `user_id=eq.<token's user>`. Space and tag memberships are read only as embeds under those user-filtered rows. Unknown ids and other users' ids get the same “not found”.
- **Limits.** 60 requests a minute per token (`MCP_RATE_LIMITER` in `api/wrangler.jsonc`; counted per Cloudflare location and asynchronously, so a short burst can overshoot before it engages: a brake on runaway agents rather than an exact quota) → `429` with `Retry-After: 60`. Bodies up to 64 KB and 20 messages per POST. Page sizes, text lengths and date ranges are capped as listed above.
- **Audit log.** `mcp_audit_log` gets one row per MCP message from an authenticated token: `initialize`, `tools/list` and every `tools/call`, with status (`ok` · `error` · `denied` · `invalid` · `rate_limited`), tool, result count, duration, token id and client name. Refusals of revoked or expired tokens are logged as `denied`; rate-limited requests about once a minute per token (per Worker instance, so a burst can leave a few rows). `args_summary` keeps ids, enums, dates and numbers but reduces free text to its length (a search for “kyoto plans” is stored as `{ "query": { "chars": 11 } }`), so no content or secrets land in the log. Requests with no recognisable token have no owner to log against; they show only in Cloudflare’s request logs. Owners can read their rows through RLS; only memex-api writes them.
- **No content leaves except what a tool returns**, and no tool writes, deletes or bulk-edits. Errors from the database are logged in the Worker and returned as a generic message.
- **CORS** is open (`*`): the endpoint takes no cookies, so a browser origin can't use it without a token.

Read the audit log (SQL editor, or any Supabase client signed in as you):

```sql
select created_at, client_name, method, tool, status, result_count, duration_ms, args_summary
from mcp_audit_log order by created_at desc limit 50;
```

## 5. Troubleshooting

- **401 “Invalid token”**: not an agent token (`mxa_…`, 47 characters), unknown, or pasted with extra quotes. `401` “revoked” / “expired” say so.
- **429**: over 60 requests a minute for this token; wait a minute.
- **405 on GET**: expected. Older clients probe for an SSE stream; this server is stateless and answers on the POST.
- **A tool returns “memex couldn’t complete that request”**: a backend error, with details in the Worker logs (`npx wrangler tail memex-api`).
