# memex-api

Cloudflare Worker exposing a small capture API for the browser extension (and
any future client). Token-authenticated; today it writes through to Supabase
with a service-role key, and when the database migrates only this worker
changes — clients keep the same contract.

## Routes

All routes require `Authorization: Bearer mx_…` (create tokens in memex under
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
- The rules themselves (identify, normalize, validate, dedupe) are
  `@memex/core/capture` (`packages/core/src/capture/`), so the hosted MCP
  server's write tools call the same `createCaptureService`
- Tests: `src/*.test.ts`, run by the root `npm test`

## Deploy

```bash
cd api
npm install
npx wrangler login                          # once
npx wrangler secret put SUPABASE_SERVICE_KEY # paste the service-role key
npm run deploy                              # → https://memex-api.<account>.workers.dev
```

Set `SCRAPER_URL` in `wrangler.jsonc` to your deployed memex-scraper URL so
captures get titles/descriptions/preview images. Apply the token table first:

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
- Bodies over 64 KB are refused. Each token is rate-limited to about 120
  requests a minute (`ratelimits` in `wrangler.jsonc`; per Cloudflare
  location, so a brake rather than a quota).
- Database errors are logged and returned as a generic 502, never echoed.
