# memex MCP server

memex-api hosts a remote [MCP](https://modelcontextprotocol.io) server, so an agent (a Grok Bot, Claude Code, Cursor, any MCP client) can use memex as context: find the space for a project, read its latest items, search everything, read the Journal for given days, and, with a `read_write` token, **store** project context: jots, notes, tasks and links, with every change to something that already exists sent to your Inbox for approval. ROADMAP Phase 7a (read, M3-A) and 7d (write, M3-B).

- **Endpoint:** `https://memex-api.joyfulsystems.workers.dev/mcp`
- **Transport:** Streamable HTTP, stateless. Speaks MCP `2026-07-28` (no handshake) and still serves 2025-era clients (`initialize`, `2025-11-25` / `2025-06-18`) the same way: no session id, every POST stands alone. GET and DELETE answer `405`.
- **Auth:** `Authorization: Bearer mxa_…`, an **agent token** (below). OAuth is not offered yet; see `docs/mcp-auth.md`.
- **Code:** `api/src/mcp/` (endpoint, auth, tools, PostgREST read and write stores), `api/src/agentTokens.ts` (token creation for the app), `packages/core/src/agent/` (`@memex/core/agent`: the read and write services, proposals, cursors, token rules; tested), migrations `20261102120000_add_agent_tokens_and_mcp_audit.sql` and `20261103120000_add_agent_writes_and_proposals.sql`.

## 1. Create an agent token

One token per client, so each can be revoked alone and shows by name in the audit log, the Journal (“via <name>”) and the Inbox. Tokens are separate from the extension's access tokens (`mx_…`): an extension token is refused at `/mcp`, and an agent token is refused by `/api/*`.

**In the app: Settings → Agent tokens.** Name the agent (e.g. “Grok Bot: memex project”), pick **Read only** or **Read & write**, pick an expiry (7, 30, 90 days, a year, or never), and press Create token. The token is shown **once**, with a Copy button; paste it into the agent's secret settings. The same screen lists every agent token (scope, created, last used, expiry, status: active · expired · revoked), revokes one (press Revoke, then Confirm), and has the kill switch: **Revoke all agent tokens…**, which asks you to confirm and then revokes every live agent token at once. Extension tokens are never touched by it.

How creation works, and why: the app calls `POST https://memex-api.joyfulsystems.workers.dev/agent-tokens` with `{ name, scope, expires_in_days }` and the signed-in Supabase session as `Authorization: Bearer <access token>`. memex-api asks Supabase Auth who that session belongs to (`GET /auth/v1/user`; it never parses a JWT itself, and refuses agent and extension tokens), generates `mxa_` + 32 random bytes, stores only the SHA-256, writes a content-free `agent_tokens/create` row to the audit log, and returns the plaintext once with `Cache-Control: no-store`. The browser keeps it only in the dialog's state until you close it; it is never stored, cached or logged. Doing this server-side means every token has full entropy, a valid scope, an expiry of at most a year and a client name whatever the caller sends, and memex caps live agent tokens at 25. Listing and revoking go straight to the database through RLS (the app may only set `revoked_at`), so revoking works even when memex-api is down.

**From a terminal** (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in a gitignored env file, e.g. `.env.migrate`):

```bash
node --env-file=.env.migrate scripts/agent-token.mjs create --email you@example.com \
  --name "Grok Bot: memex project" --scope read_write --expires 90d
```

- The token is printed **once**, and only to an interactive terminal. Store it in the client's secret store, never in a repo. In a script, `--out FILE` writes `MEMEX_AGENT_TOKEN=…` to a new file with mode 600 instead (pick a gitignored name like `.env.agent`).
- `--scope read` (default) sees only the read tools; `read_write` also sees the write tools (§3).
- `--expires` is optional (`90d`, `12h`, or a date). Without it the token lives until revoked.
- Other commands: `list` (id, name, scope, created, expires, last used, state), `revoke <id>`, and `revoke-all`, the kill switch, which asks you to type “revoke all” and leaves extension tokens alone. Revocation works on the very next request.

## 2. Connect a client

**Quick start for a Grok Bot that stores project context:** (1) Settings → Agent tokens → name it after the bot and project, choose **Read & write**, Create, Copy. (2) Add memex as a remote MCP tool with the token (the xAI API block below). (3) Make sure the project has a space in memex (the bot can't create spaces). (4) Tell the bot something like: “Use memex as this project's memory: keep one note called ‘<project>: context’ in the <project> space, append dated entries to it, and read it at the start of each session.” Its writes show in your Journal as “via <name>”; anything that would change your own items waits in the Inbox.

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

**Smoke tests** (counts and ids only, no content; checks refusals, every tool, paging):

```bash
cd api && node --env-file=../.env.agent scripts/mcp-smoke.mjs https://memex-api.joyfulsystems.workers.dev/mcp [--mode auto]
# Write tools: every write tool with [test] content, read-token refusals, a fresh-session read-back.
# MEMEX_AGENT_TOKEN = a read_write token; MEMEX_AGENT_READ_TOKEN = a read token (optional).
node --env-file=../.env.agent-rw --env-file=../.env.agent-ro scripts/mcp-write-smoke.mjs https://memex-api.joyfulsystems.workers.dev/mcp
```

## 3. Tools

Results are compact JSON in a text block. Lists come back newest first (the Journal oldest first) and are paged with keyset cursors: pass `next_cursor` back as `cursor`. The server's `instructions` tell the agent how to use memex as project context (and, for `read_write` tokens, how to store it).

### Read tools (every token)

All read-only (`readOnlyHint: true`, `destructiveHint: false`) and limited to the token owner's data.

| Tool | Input | Returns |
| --- | --- | --- |
| `search` | `query` (1–200 chars, up to 6 words, all must match), `types?` (`link` `note` `task` `jot`), `space_id?`, `source?` (`x` `pinterest` `youtube` `web`; links only), `from?` / `to?` (days), `timezone?`, `limit?` (1–50, default 20), `cursor?` | `{ terms, items, next_cursor }`. Matches link titles, descriptions and URLs, note titles and text, task titles and details, jot text |
| `get_item` | `type`, `id` | The item in full: `text` up to 20,000 characters (`text_length`, `text_truncated`), task `done` / `due_date`, link `url`, `source`, `source_id`, `lists`, `preview_image_url`; `captured_by` / `captured_client` (who wrote it: `agent` + the client name for agent writes); `spaces`, `tags` |
| `get_journal` | `from` (day), `to?` (day, default `from`; ≤ 92 days), `timezone?`, `types?`, `space_id?`, `limit?` (1–100, default 50), `cursor?` | `{ from, to, timezone, days: [{ date, items }], next_cursor }`, oldest first |
| `list_spaces` | — | `{ spaces: [{ id, name, created_at, counts: { link, note, task, jot }, total }] }` |
| `space_overview` | `space_id`, `limit?` (1–25, default 10), `cursor?` | `{ space, counts, total, recent, next_cursor }` |
| `timeline_stats` | `from?` / `to?` (default: the last 30 days; ≤ 731 days), `timezone?`, `space_id?`, `bucket?` (`day` ≤ 366 days, `week`, `month`; default by range) | `{ totals, series: [{ start, link, note, task, jot, total }], links_by_source, by_space, truncated }` (counts stop at 5,000 items per type; `truncated` names any type that hit it) |
| `get_images` | either `type` + `id` (one item), or `space_id` (+ `limit?` 1–50, default 20 items, `cursor?`) | `{ items: [{ item: { type, id, title }, images: [{ url, alt, kind }] }], next_cursor }`: a link's preview picture (`kind: "preview"`) and images embedded in markdown (`"embedded"`, up to 5 per item). URLs only, never bytes, and only `http(s)` (no `data:` URIs) |

Every list item is `{ type, id, title, excerpt (≤ 280 chars), url?, source?, done?, due_date?, spaces: [{ id, name }], tags, created_at, updated_at }`. Days are `YYYY-MM-DD` in `timezone` (an IANA name, default `UTC`). Bad arguments come back as tool errors (`isError: true`) with a message the agent can act on, such as “cursor is not one this server issued”.

### Write tools (`read_write` tokens only)

The rules (approved by Ryan, 2026-11-01): **agents only add new items**. Every agent write is marked `captured_by = 'agent'` with `captured_client` = the token's client name, and shows in the Journal as “via <client>”. **Any change to an existing item the agent didn't create** (filing it into a space, editing, retitling, completing a task, appending to someone else's note) **arrives as an Inbox proposal** you approve or reject. No tool deletes or edits in bulk, ever: each call touches at most one item. Write tools carry `readOnlyHint: false`, `destructiveHint: false`.

| Tool | Input | Does | Returns |
| --- | --- | --- | --- |
| `add_jot` | `text` (≤ 4,000), `space_id?`, `idempotency_key?` | A jot in the Journal (in the space's Journal if given) | `{ type: "jot", id, created_at, space }` |
| `save_link` | `url`, `title?` (≤ 500), `note?` (≤ 5,000, stored as the description), `space_id?`, `idempotency_key?` | Saves through the capture service (`@memex/core/capture`): the same dedupe and enrichment (title, picture via memex-scraper) as the extension | `{ type: "link", id, url, title, created_at, duplicate, filed, space, proposal_id? }`. A link you already saved comes back `duplicate: true` and is **left untouched**; asking to file it then gives `filed: "proposed"` (a proposal), unless this client saved it first (`filed: "filed"`). `filed` is `filed` · `already` · `proposed` · `not_requested` |
| `create_note` | `title` (≤ 300), `body?` (markdown, ≤ 50,000), `space_id?`, `idempotency_key?` | A new note | `{ type: "note", id, created_at, space }` |
| `create_task` | `text` (≤ 300), `detail?` (≤ 5,000), `due_date?` (`YYYY-MM-DD`), `space_id?`, `idempotency_key?` | A new task, at the top of the list | `{ type: "task", id, created_at, space }` |
| `append_to_note` | `note_id`, `text` (≤ 20,000), `reason?` (≤ 500), `idempotency_key?` | Adds `text` after a blank line. **Directly** if the note was created by the same client name (the note may grow to 200,000 characters; a concurrent edit is re-read and appended to, never overwritten); **otherwise a proposal** | `{ note_id, mode: "appended" \| "proposed", proposal_id?, text_length?, message }` |
| `propose_change` | `type` (`link` `note` `task`), `id`, `action` (`file` \| `edit`), `space_id` (for `file`), `changes` (for `edit`: `title?`, `text?` = the complete new note body / task detail / link description, `due_date?` (`null` clears), `done?`; tasks only for the last two), `reason?`, `idempotency_key?` | Always a proposal, never a direct edit, even for the agent's own items. Jots can't be changed | `{ status: "pending" \| "already_pending" \| "already_filed", proposal_id, message }` |

Space ids, item ids and the user's ownership of each are checked before anything is written; another user's id gets the same “not found” as a missing one. Text is trimmed, control characters other than tab and newline are dropped, and every field has the cap shown. A client may have at most 50 pending proposals; past that, `propose_change` (and appends that would become proposals) answer with an error asking the agent to wait. memex has no tool that creates spaces: an agent writes unfiled and tells you if the project's space doesn't exist yet.

**Idempotency.** Every write tool takes an optional `idempotency_key` (8–128 characters of letters, digits, `_ . : -`; a UUID is ideal). The first call with a key claims it (`agent_write_keys`: user, client name, key, tool, a hash of the arguments, and the small result); a retry with the same key and arguments returns the first result with `replayed: true` instead of writing again; the same key with different arguments is refused. Keys are per client name. A call that fails before writing releases its key, so a corrected retry works.

**Using memex as a project store** (what the instructions tell an agent): find the project's space with `list_spaces`; keep **one note per project** (e.g. “memex: project context”), create it once with `create_note` and add dated entries with `append_to_note` (it applies directly because the note is the agent's own); jot decisions with `add_jot`, next steps with `create_task`, useful URLs with `save_link`; at the start of a session, `search` for the note's title and `get_item` it. Anything else goes through `propose_change`.

### Proposals (the Inbox)

A proposal is a row in `inbox_proposals`: which client (and token) asked, what (`file` into a space, `edit` fields, `append` text to a note), the target item, the agent's one-line `reason`, the item's `updated_at` when proposed, and a `status` (`pending` · `applied` · `rejected`). In the web app they appear in the Journal's **Inbox** (sidebar and header button, which show whenever a proposal or filing suggestion waits; `/?inbox=1` opens it) under “From agents”, each with the agent's name, what it wants, the item, the reason, and a diff against the item **as it is now** (a line diff for text, before → after for title, due date and status; a note if the item was edited since the proposal). **Approve** applies the change through the app's normal Repository code (`applyProposal` in `@memex/core/agent`: file into the space, update the note/task/link, or append to the note's current text) and marks it `applied`. **Reject** leaves the item alone and marks it `rejected`; the row stays as a record. Neither the agent nor the app can delete a proposal; the app may only move a pending one to `applied` or `rejected` (RLS).

## 4. Security model

- **Tokens.** `mxa_` + 32 random bytes (base64url). Only the SHA-256 is stored (`agent_tokens.token_hash`); the plaintext is shown once. Each token has a client name, a scope (`read` · `read_write`), an optional `expires_at`, `revoked_at` and `last_used_at` (written at most once a minute).
- **Every request is authenticated.** There is no session to hijack. A missing, malformed, unknown, revoked or expired token gets `401` with `WWW-Authenticate: Bearer realm="memex"`. Revoked and expired tokens are checked on every request, so `revoke` and `revoke-all` work immediately.
- **Scope per tool.** Tools a token's scope doesn't allow aren't registered for that request (they don't show in `tools/list`), and each tool checks the scope again before it runs; the write service isn't even built for a `read` token. A `read` token calling a write tool gets “tool not found” and a `denied` audit row.
- **What writes can and can't do.** Inserts into notes, tasks, jots, links (through the capture service) and `inbox_proposals`; membership rows for items the agent just created (or links it saved itself); and one conditional update: appending to a note whose `captured_client` is this client. Nothing else is updated, and nothing is deleted (the only DELETE in the code path removes an unfinished idempotency claim of the agent's own). There are no list-of-ids inputs anywhere, so no call touches more than one item. Tests in `packages/core/src/agent/writes.test.ts` and `api/src/mcp/handler.test.ts` pin all of this.
- **User scoping.** memex-api holds the Supabase service-role key, which bypasses RLS, so every read and write goes through `userScope(db, userId)` (`api/src/db.ts`), which adds `user_id=eq.<token's user>` to reads, updates and deletes and stamps `user_id` on inserts. Space and tag memberships are read only as embeds under those user-filtered rows. Unknown ids and other users' ids get the same “not found”.
- **Limits.** 600 requests a minute per client IP before the token is even looked up (`IP_RATE_LIMITER`, shared with `/api/*`), then 60 requests a minute per token (`MCP_RATE_LIMITER` in `api/wrangler.jsonc`; counted per Cloudflare location and asynchronously, so a short burst can overshoot before it engages: a brake on runaway agents rather than an exact quota) → `429` with `Retry-After: 60`. Bodies up to 64 KB (counted in bytes as they stream in; larger → `413`) and 20 messages per POST. Page sizes, text lengths and date ranges are capped as listed above.
- **Audit log.** `mcp_audit_log` gets one row per MCP message from an authenticated token: `initialize`, `tools/list` and every `tools/call`, with status (`ok` · `error` · `denied` · `invalid` · `rate_limited`), tool, result count, duration, token id and client name. Refusals of revoked or expired tokens are logged as `denied`; rate-limited requests about once a minute per token (per Worker instance, so a burst can leave a few rows). `args_summary` keeps ids, enums, dates and numbers but reduces free text to its length (a search for “kyoto plans” is stored as `{ "query": { "chars": 11 } }`), so no content or secrets land in the log. Requests with no recognisable token have no owner to log against; they show only in Cloudflare’s request logs. Owners can read their rows through RLS; only memex-api writes them.
- **No content leaves except what a tool returns**, and no tool deletes or bulk-edits. Errors from the database are logged in the Worker and returned as a generic message.
- **Audit of writes.** Each write's audit row adds `result_ref`, what it produced (`note:<id>`, `proposal:<id>`…), ids only; text arguments are still reduced to their length.
- **CORS** is open (`*`): the endpoint takes no cookies, so a browser origin can't use it without a token.

Read the audit log (SQL editor, or any Supabase client signed in as you):

```sql
select created_at, client_name, method, tool, status, result_count, result_ref, duration_ms, args_summary
from mcp_audit_log order by created_at desc limit 50;
```

## 5. Troubleshooting

- **401 “Invalid token”**: not an agent token (`mxa_…`, 47 characters), unknown, or pasted with extra quotes. `401` “revoked” / “expired” say so.
- **429**: over 60 requests a minute for this token; wait a minute.
- **405 on GET**: expected. Older clients probe for an SSE stream; this server is stateless and answers on the POST.
- **A tool returns “memex couldn’t complete that request”**: a backend error, with details in the Worker logs (`npx wrangler tail memex-api`).
