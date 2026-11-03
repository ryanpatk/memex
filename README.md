# memex

**A personal working-memory system.** One Journal of everything you jot, save and plan (jots, links, notes, tasks), a Library to browse it, and spaces for the projects your work happens in. Captures arrive from the web app, the iPhone app and its share sheet, a Chrome extension (including X bookmarks, Pinterest saves and YouTube likes), and AI agents over MCP. Everything can be exported as a plain Markdown vault you own.

Where it's going: [`ROADMAP.md`](ROADMAP.md). What v1 is and what was verified: [`docs/v1-signoff.md`](docs/v1-signoff.md).

## What's in this repo

| Part | Where | Runs on |
| --- | --- | --- |
| Web app (React 19, Vite) | `src/` | Cloudflare Worker `memex` (static assets): https://memex.joyfulsystems.workers.dev, memoryextension.app |
| Shared logic (`@memex/core`) | `packages/core/` | imported by every client and memex-api |
| iPhone app (Expo) | `apps/mobile/` | Expo Go / dev build; TestFlight next |
| Capture API + hosted MCP server | `api/` | Cloudflare Worker `memex-api`: https://memex-api.joyfulsystems.workers.dev (`/api/*`, `/mcp`) |
| Link metadata scraper | `scraper/` | Cloudflare Worker `memex-scraper` (memex-api reaches it by service binding) |
| Chrome extension (MV3) | `extension/` | load unpacked from `extension/.output/chrome-mv3` |
| Database | `supabase/migrations/`, `supabase/tests/` | Supabase (Postgres + Auth + RLS), project `zwgotlojioprtjvrxltc` |

## Local setup

Needs Node 22+ (CI uses 22), npm, and for database work Docker Desktop and the Supabase CLI (`npx supabase@2`).

```bash
npm install                     # web app + packages/core (npm workspace)
(cd api && npm install)         # memex-api; also needed for the root test run (MCP SDK)
cp .env.example .env            # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, optional VITE_SCRAPER_URL
npm run dev                     # http://localhost:5173
VITE_MEMEX_FIXTURES=1 npm run dev   # or: the whole app on invented demo data, no account or .env needed
```

Checks (the same ones CI runs): `npm run typecheck && npm run lint && npm test && npm run build`, `(cd api && npx tsc --noEmit)`, `(cd extension && npm ci && npm run typecheck && npm run build)`, `(cd apps/mobile && npm run check && npm run check:release)`. Database tests (pgTAP, against a throwaway local Postgres loaded with production's schema from a backup): `scripts/test-db.sh`.

iPhone app: `cd apps/mobile && npm install && npm run ios` (Expo Go; needs `apps/mobile/.env`) or `npm run fixtures` for demo data. Details: [`docs/mobile.md`](docs/mobile.md). Fuller setup notes, including GitHub OAuth: [`SETUP.md`](SETUP.md).

Production holds Ryan's real data and there's no staging copy: read the **Safety rules for agents** in [`CLAUDE.md`](CLAUDE.md) before running anything that writes, and label any test data `[test]`.

## Deploy

Each Worker deploys with Wrangler from its own folder (`npx wrangler login` once). Every deploy prints a version id; `npx wrangler deployments status` shows the live one.

| What | Command | Notes |
| --- | --- | --- |
| Web app (`memex`) | `npm run deploy` (repo root) | builds with `.env` + `.env.production`, uploads `dist/` (root `wrangler.jsonc`) |
| memex-api | `cd api && npm run deploy` | needs the `SUPABASE_SERVICE_KEY` secret once (`npx wrangler secret put SUPABASE_SERVICE_KEY`); rate limits and the scraper binding are in `api/wrangler.jsonc`. [`api/README.md`](api/README.md) |
| memex-scraper | `cd scraper && npm run deploy` | deploy before memex-api; origins in `ALLOWED_ORIGINS`. [`scraper/README.md`](scraper/README.md) |
| Database migrations | back up first (below), then `supabase db push` | additive only without Ryan's OK. [`docs/database-migrations.md`](docs/database-migrations.md) |
| Chrome extension | `cd extension && npm run build`, then load or ↻ reload `extension/.output/chrome-mv3` | [`docs/extension-setup.md`](docs/extension-setup.md) |
| iPhone app | TestFlight via EAS (not set up yet) | the checklist, including what Ryan provides: [`docs/mobile.md`](docs/mobile.md) → TestFlight checklist |

After deploying memex-api, `api/scripts/v1-smoke.ts` runs the whole capture → display → agent loop against production with `[test]` data and cleans up after itself (usage in its header).

## Backups and restore

`scripts/backup-supabase.sh` writes schema, data, roles, per-table row counts and checksums to `~/memex-backups/<UTC timestamp>/` (outside the repo, mode 700). It only reads, needs Docker running and a Supabase CLI login, and no database password. **Always take one before a migration**, then check it: `cd ~/memex-backups/<timestamp> && shasum -a 256 -c SHA256SUMS`.

Restore into a **new, empty** project or a local stack, never on top of live data: `psql --file roles.sql`, then `schema.sql` + `data.sql` in one transaction with `session_replication_role = replica`, then compare against `row-counts.txt`. The exact commands, a tested local restore drill, and how to restore a single table: [`docs/backups.md`](docs/backups.md).

Separately, the walk-away export writes everything (images included) as an Obsidian-ready Markdown vault, nightly at 03:30: `node scripts/export-vault.mjs` (default `~/memex-vault/`, `--out DIR` for elsewhere). Format: [`docs/vault-format.md`](docs/vault-format.md).

## Agent tokens and MCP

memex-api hosts an MCP server at `https://memex-api.joyfulsystems.workers.dev/mcp` (Streamable HTTP, stateless) so a Grok Bot, Claude Code, Cursor or any MCP client can read memex and, with a write token, store project context.

- **Create a token:** web app → Settings → **Agent tokens** → name it after the client (it shows in the Journal as "via <name>" and in the audit log), pick **Read only** or **Read & write**, pick an expiry, Create, Copy. It's shown once; memex stores only its SHA-256. From a terminal: `scripts/agent-token.mjs create --name … --scope read_write --expires 90d --out .env.agent` (needs the service-role key in the environment; see the script's header).
- **Scopes:** `read` sees the 7 read tools (`search`, `get_item`, `get_journal`, `list_spaces`, `space_overview`, `timeline_stats`, `get_images`). `read_write` also gets 6 write tools (`add_jot`, `save_link`, `create_note`, `create_task`, `append_to_note`, `propose_change`), which only add new items; any change to something that already exists arrives in your Inbox as a proposal. No tool deletes.
- **Revoke:** Settings → Agent tokens → Revoke (or **Revoke all agent tokens…**), or `scripts/agent-token.mjs revoke <id>` / `revoke-all`. It takes effect on the next request.
- **Connect a client:** send `Authorization: Bearer <token>`. Claude Code: `claude mcp add --transport http memex https://memex-api.joyfulsystems.workers.dev/mcp --header "Authorization: Bearer $MEMEX_AGENT_TOKEN"`. Grok via the xAI API: a remote MCP tool with `server_url` set to the endpoint and `authorization` set to the token. Cursor and the MCP SDK configs, the quick start for a Grok Bot that keeps project context, and troubleshooting: [`docs/mcp.md`](docs/mcp.md).
- **Limits and audit:** 600 requests a minute per IP, 60 per token, 64 KB bodies; every MCP call is logged without its content in `mcp_audit_log` (readable by you through RLS). The security model: [`docs/mcp.md`](docs/mcp.md) §4 and [`docs/security-audit.md`](docs/security-audit.md).

The Chrome extension uses a different kind of token (`mx_…`, Settings → **Access tokens**) for `/api/*`; neither kind works on the other's endpoints.

## Documentation

| Doc | Purpose |
| --- | --- |
| [`ROADMAP.md`](ROADMAP.md) | The north star: phases, releases (v1/v2), decisions |
| [`docs/v1-signoff.md`](docs/v1-signoff.md) | What shipped in v1, what was verified, known limits, what needs Ryan |
| [`docs/security-audit.md`](docs/security-audit.md) | RLS, token and memex-api audit (M7) |
| [`CONTEXT.md`](CONTEXT.md) | Domain language (Journal, Entry, Jot, Space, Library, Capture, Vault…) |
| [`CLAUDE.md`](CLAUDE.md) | Architecture, conventions and safety rules for agents |
| [`DESIGN.md`](DESIGN.md), [`GUI.md`](GUI.md), [`JOYFUL_SYSTEMS.md`](JOYFUL_SYSTEMS.md) | Design system and theme |
| [`PRODUCT.md`](PRODUCT.md), [`VISION.md`](VISION.md) | Positioning and the original product vision |
| [`TODO.md`](TODO.md) | Living checklist, including Ryan's pending steps |
| [`docs/`](docs/) | Feature notes (`journal-17b.md`, `space-page.md`, `tasks-view.md`, `library-views.md`), `mobile.md`, `mcp.md`, `backups.md`, `vault-format.md`, extension docs |
