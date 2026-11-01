# memex-api

Cloudflare Worker exposing a small capture API for the browser extension (and
any future client). Token-authenticated; today it writes through to Supabase
with a service-role key, and when the database migrates only this worker
changes — clients keep the same contract.

## Routes

All routes require `Authorization: Bearer mx_…` (create tokens in memex under
**Settings → Access tokens**).

| Route                  | Method | Body / result                                          |
| ---------------------- | ------ | ------------------------------------------------------ |
| `/api/capture`         | POST   | `{ url, title?, description?, image?, favicon?, note?, source?, spaceId?, tagIds? }` → created link (201), or the existing link with `duplicate: true` (200). Client metadata wins; memex-scraper fills the gaps when `SCRAPER_URL` is set |
| `/api/links/:id`       | DELETE | undo a capture (scoped to the token's user)            |
| `/api/lookup?url=`     | GET    | `{ found: false }` or `{ found: true, link: { id, url, title, source, created_at } }` — read-only check using the same matching as capture (± trailing slash; X status / Pinterest pin ids) |
| `/api/spaces`          | GET    | `[{ id, name }]`                                       |
| `/api/tags`            | GET    | `[{ id, name }]`                                       |

**Dedupe:** before inserting, the worker looks for the same URL (± trailing
slash). For X posts and Pinterest pins it matches on the post/pin id, so
`x.com/a/status/1` and `twitter.com/i/web/status/1` count as one link.
`source` is stored on `links.source` (`extension`, `x:bookmark`,
`pinterest:save`; NULL = saved in the app).

CORS is wide open (`*`) by design — access control is the token, so clients
(extension pages, scripts) work from any origin without preregistration.

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
supabase db push   # applies api_tokens + links.source migrations
```

## Local dev

```bash
npm run dev   # http://localhost:8788
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
- The worker verifies row ownership explicitly (`user_id` scoping on every
  query) since the service role bypasses RLS.
