# memex-api

Cloudflare Worker exposing a small capture API for the browser extension (and
any future client). Token-authenticated; today it writes through to Supabase
with a service-role key, and when the database migrates only this worker
changes — clients keep the same contract.

## Hosted MCP server (`/mcp`)

`POST /mcp` is memex's remote MCP server for agents (Grok Bots, Claude Code,
Cursor…): Streamable HTTP, stateless, read tools (`search`, `get_item`,
`get_journal`, `list_spaces`, `space_overview`, `timeline_stats`). It takes
**agent tokens** (`mxa_…`, table `agent_tokens`, made with
`scripts/agent-token.mjs`), never the extension's `mx_…` tokens, and has its
own scopes, per-token rate limit (`MCP_RATE_LIMITER`, 60/min) and audit log
(`mcp_audit_log`). Read tools for every token; write tools (`add_jot`,
`save_link`, `create_note`, `create_task`, `append_to_note`,
`propose_change`) for `read_write` tokens only, which add items or file Inbox
proposals and never delete. Everything about it, client config included:
`docs/mcp.md`; auth decisions: `docs/mcp-auth.md`. Smoke tests:
`node --env-file=../.env.agent scripts/mcp-smoke.mjs <url>/mcp` (reads) and
`scripts/mcp-write-smoke.mjs` (writes, `[test]` content).

`POST /agent-tokens` creates an agent token for the web app (Settings → Agent
tokens): auth is the app's Supabase session, checked by Supabase Auth; the
token is generated server-side, only its hash stored, the plaintext returned
once (`src/agentTokens.ts`).

## Routes

All `/api/*` routes require `Authorization: Bearer mx_…` (create tokens in memex under
**Settings → Access tokens**). Responses are `{ success: true, data }` or
`{ success: false, error }`.

| Route                      | Method | Body / result |
| -------------------------- | ------ | ------------- |
| `/api/capture`             | POST   | `{ url, title?, description?, image?, favicon?, note?, source?, sourceId?, list? \| lists?, capturedBy?, client?, spaceId?, tagIds? }` → `{ link, duplicate, listsAdded, attached: { space, tags } }`: 201 when new, 200 with `duplicate: true` when the same item was already saved. Client metadata wins; memex-scraper fills the gaps when `SCRAPER_URL` is set |
| `/api/links/:id`           | DELETE | undo a capture (the token's user only); 404 if there's nothing to delete |
| `/api/links/:id/spaces`    | POST   | `{ spaceId }` → file a saved link into a space (idempotent) |
| `/api/lookup?url=`         | GET    | `{ found: false }` or `{ found: true, link }`, read-only, same matching as capture |
| `/api/spaces`              | GET    | `[{ id, name }]` |
| `/api/tags`                | GET    | `[{ id, name }]` |

A `link` is `{ id, url, title, description, favicon_url, preview_image_url,
source, source_id, lists, captured_by, captured_client, url_key, created_at }`.

**Capture fields** (vocabulary in `CONTEXT.md` → Sources):

- `source`: `x` · `pinterest` · `youtube` · `web`. The server works it out from
  the URL; a value the client sends must agree. v0.2 tags (`x:bookmark`,
  `pinterest:save`, `extension`) are still accepted and translated.
- `sourceId`: the post / pin / video id. Must match the URL.
- `list` / `lists`: `bookmarked` · `saved` · `liked`. Merged into an existing link.
- `capturedBy`: `extension` · `resync` · `share` · `api` (default `api`). `app`
  and `agent` are set by servers, never claimed by a client.
- `client`: free-form client name, e.g. `memex-extension/0.3.0`.
- `spaceId`, `tagIds`: UUIDs, checked for ownership before anything is written
  (404 if not the user's). Applied to duplicates too.

**Dedupe**, in order: the same `(source, source_id)` (unique in the database),
the same item under another URL (`twitter.com/i/web/status/1` ≡
`x.com/a/status/1`; `youtu.be/ID` ≡ `watch?v=ID` ≡ `/shorts/ID`), then the same
normalized URL (no scheme, `www.`, trailing slash, fragment or tracking
parameters like `utm_*` / `fbclid`). Platform items are stored at their
canonical URL. Links saved before 2026-11-01 have no `source_id`/`url_key`
and are still matched by URL.

## Code layout

- `src/index.ts`: routing, auth, rate limit, error mapping
- `src/db.ts`: PostgREST client and `userScope(db, userId)`, the one door to
  user data: it adds `user_id=eq.<token's user>` to every read, update and
  delete and stamps `user_id` on every insert
- `src/store.ts`: the `CaptureStore` adapter over `userScope`
- `src/scraper.ts`: memex-scraper enrichment
- `src/mcp/`: the MCP endpoint (`handler.ts`: auth → rate limit → MCP SDK →
  audit), agent-token auth (`auth.ts`), the tools and their scopes
  (`tools.ts`) and the `AgentReadStore` over `userScope` (`store.ts`). The
  read logic itself (validation, caps, keyset paging) is `@memex/core/agent`
- The rules themselves (identify, normalize, validate, dedupe) are
  `@memex/core/capture` (`packages/core/src/capture/`), so the hosted MCP
  server's write tools call the same `createCaptureService`
- Tests: `src/**/*.test.ts`, run by the root `npm test` (install `api/` first:
  the MCP tests import the SDK from `api/node_modules`)

## Deploy

```bash
cd api
npm install
npx wrangler login                          # once
npx wrangler secret put SUPABASE_SERVICE_KEY # paste the service-role key
npm run deploy                              # → https://memex-api.<account>.workers.dev
```

Captures get titles, descriptions and preview images from memex-scraper
through the `SCRAPER` **service binding** in `wrangler.jsonc` (deploy
`scraper/` first). Don't swap it for a URL fetch: Cloudflare refuses a
Worker's fetch to another Worker's `workers.dev` URL on the same account
(`error code: 1042`), which silently left every capture unscraped until
2026-11-02. `SCRAPER_URL` is only the fallback for local dev; failed scrapes
are logged (`npx wrangler tail`). Apply the token table first:

```bash
supabase db push   # applies api_tokens, links.source and capture provenance migrations
```

## Local dev

```bash
npm run dev   # http://localhost:8788 — still talks to the production database,
              # so label anything you create with [test] (CLAUDE.md → Safety rules)
# secrets for dev go in api/.dev.vars (gitignored):
#   SUPABASE_SERVICE_KEY=...
curl -X POST http://localhost:8788/api/capture \
  -H "Authorization: Bearer mx_..." -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

## Security model

- Tokens are 256-bit random values; only their SHA-256 hash is stored
  (`api_tokens` table). Revocation = deleting the row (Settings UI).
- The service-role key exists only as a Cloudflare secret — never in the repo
  or any client.
- The service role bypasses RLS, so every user-data query goes through
  `userScope` (`src/db.ts`), and join rows (space membership, tags) are only
  written after both ids are ownership-checked.
- Every id that reaches a filter is validated first: UUIDs for links, spaces
  and tags; platform patterns for source ids; tokens must look like `mx_…`
  before they're hashed and looked up.
- Bodies over 64 KB get `413` on every route (`/agent-tokens`: 4 KB). The
  cap counts bytes as the body streams in (`src/limits.ts`), so a request
  without or lying about `Content-Length` can't make the Worker buffer more.
- Two rate-limit layers, both Workers rate limiting bindings (`ratelimits` in
  `wrangler.jsonc`): every route is limited to 600 requests a minute **per
  client IP before any token lookup** (`IP_RATE_LIMITER`), so floods of bad
  tokens never reach the database; then each token gets about 120 a minute
  on `/api/*` (`RATE_LIMITER`) and 60 on `/mcp` (`MCP_RATE_LIMITER`). Counts
  are per Cloudflare location and approximate: a brake, not a quota. Over the
  limit → `429` with `Retry-After: 60`. Why the binding rather than a Durable
  Object or KV counter: `src/limits.ts`.
- The database backs all of this up: since migration
  `20261104120000_same_owner_checks.sql`, a trigger refuses any row that
  points at another user's space, tag, project, token or item, even from the
  service role (`docs/security-audit.md`).
- Database errors are logged and returned as a generic 502, never echoed.
- `/mcp`: agent tokens are checked for revocation and expiry on every
  request, tools are filtered by scope, and every message is audited without
  its content. Details: `docs/mcp.md` → Security model.
