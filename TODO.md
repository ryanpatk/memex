# TODO

Working checklist to keep memex moving. Updated 2026-11-01 — prune freely as things land.

## 🚀 v1 (scope approved 2026-11-01)

v1 stays on Supabase + Cloudflare Workers. Details and phase mapping: `ROADMAP.md` §5 “Releases” and decisions 18–20. v2 (later): leave Supabase for the vault backend, Tauri desktop app, embeddings.

- [x] **Safety rails** ✓ 2026-11-01 — `scripts/backup-supabase.sh` (first backup in `~/memex-backups/`, restore tested locally, `docs/backups.md`); gitleaks on every push/PR + local command (`SETUP.md`); “Safety rules for agents” in `CLAUDE.md`; signed-out app routes go to sign-in and come back
- [ ] **Hosted MCP on memex-api** (headline) — Grok Bots read and store project context; token auth first (ROADMAP Phase 7a, 7d)
  - [x] **M3-A read tools** ✓ 2026-11-02: `/mcp` on memex-api (Streamable HTTP, stateless, MCP 2026-07-28 + 2025-era clients), agent tokens (`agent_tokens`: scope, expiry, revocation; `scripts/agent-token.mjs` create/list/revoke/revoke-all), per-token rate limit, `mcp_audit_log`, read tools `search` · `get_item` · `get_journal` · `list_spaces` · `space_overview` · `timeline_stats`. Migration applied after backup `~/memex-backups/2026-11-02T005325Z`. Docs: `docs/mcp.md`, `docs/mcp-auth.md`
  - [ ] **Ryan:** create your real agent token (`docs/mcp.md` §1; needs a gitignored env file with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, since `.env.migrate`'s key is blank now), connect a Grok Bot (§2), then revoke the smoke-test token `[test] agent-smoke-test-m3` (`scripts/agent-token.mjs list` shows its id; it also expires 2026-11-09)
  - [ ] **M3-B**: write tools (`add_jot` direct with `captured_by = 'agent'`; Inbox proposals for anything that changes existing items) and Settings → Agent tokens (list, create, revoke, revoke all)
  - [ ] **M3-C** (only if a connector needs it): OAuth for grok.com / claude.ai connectors, designed in `docs/mcp-auth.md`
- [ ] **Journal-first web for desktop** — finish Phase 1 (space board, ~~Library views~~ ✓ 2026-11-02, drag to space, Tasks view)
- [ ] **Live capture** — extension + memex-api deployed and verified on the real sites (Phase 3; memex-api first deploy ✓ 2026-11-01, `docs/extension-setup.md`)
- [x] **Walk-away export** ✓ 2026-11-01 — `scripts/export-vault.mjs` writes everything (images included) to `~/memex-vault/` as an Obsidian-ready vault; format + fixture in `docs/vault-format.md` / `docs/vault-fixture/`; nightly at 03:30 via launchd (`scripts/install-export-agent.sh`, log `~/Library/Logs/memex-export.log`). Next: a parser + round-trip test in `packages/core` (Phase 2)
- [x] **`packages/core` + first tests** ✓ 2026-11-01 — npm workspace, shared logic and tokens in `@memex/core`, the `Repository` interface with a Supabase adapter (no supabase-js imports left in `src/`), 185 Vitest tests, CI (typecheck, lint, test, build)
- [ ] **React Native (Expo) app on TestFlight** (Phase 6, on `packages/core`; talks to Supabase through `@memex/core/supabase` with SecureStore session storage, decision 20)
  - [x] Shell ✓ 2026-11-01 (M6-A): `apps/mobile` on Expo SDK 58: tabs (Journal, Library, Spaces, Inbox), sign-in (email + GitHub PKCE), read-only Journal feed with pull to refresh, light/dark, CI job. Run/architecture/screenshots: `docs/mobile.md`
  - [ ] Ryan: add `memex://auth/callback` to Supabase Auth → Redirect URLs, and work through the TestFlight checklist in `docs/mobile.md` (Apple Developer Program, App Store Connect record + bundle id, API key, Expo account)
  - [ ] Next: composer + writes, filing, Library grid, EAS build → TestFlight
- [ ] **Portfolio-ready screens** — v1 screens will appear on Ryan's public portfolio; plan demo data so screenshots don't show real jots

## 🔑 Your action items (need your credentials / accounts — code is ready and waiting)

These unlock everything built this session. Roughly 10 minutes total, in order:

- [x] **Apply the Notes to Self + per-space super favorite migrations** — applied (the Journal loads real jots, seen 2026-10-15)
- [x] **Migrate legacy Notes to Self** — 322 messages migrated into Home ✓ 2026-09-07 (`node --env-file=.env.migrate scripts/migrate-self-messages.mjs --email …`; `.env.migrate` holds the keys, gitignored — keep it for the notes migration, delete after)
- [x] **Migrate legacy notes** — 85 notes migrated into the root, no space association by decision ✓ 2026-09-07 (`scripts/migrate-notes.mjs`; legacy collections ignored). `.env.migrate` can be deleted now unless more legacy data is coming.
- [x] **Apply the token migration** — `supabase db push` ✓ 2026-09-06
- [ ] **Deploy the scraper** — `cd scraper && npx wrangler login && npm run deploy`
  - [ ] Add your production app origin to `ALLOWED_ORIGINS` in `scraper/wrangler.jsonc` first
  - [ ] Set `VITE_SCRAPER_URL` in `.env` (a commented line is already there) and in your production host's env
  - [ ] Re-test a Pinterest pin through the *deployed* worker (worked locally; datacenter IPs can differ — fallback plan is in `scraper/README.md`)
- [ ] **Browser extension v0.3 setup** — server side done ✓ 2026-11-01 (capture provenance migration applied, memex-api `151d132d` deployed and smoke-tested: dedupe across X / Pinterest / YouTube URL shapes). Left for you, in `docs/extension-setup.md`: create an access token (and revoke `agent-smoke-test` and `[test] agent-smoke-test-m2`), `cd extension && npm install && npm run build`, load or ↻ reload `extension/.output/chrome-mv3`, paste the token, Test connection, run the §4 checks (now incl. YouTube likes, the ✓ and Add to a space). Delete the `[test]` links listed there when done
- [x] **Scraper fix** ✓ 2026-11-02 — memex-api couldn't reach memex-scraper (Cloudflare error 1042 on Worker → workers.dev fetches), so API/extension captures since 2026-11-01 went unscraped; now a service binding (memex-api `bc7e29f2`). Only agent `[test]` links were affected; repaired with `backfill-metadata.mjs --since 2026-11-01 --via-api --apply`. Web-app saves were never affected
- [ ] **Backfill old links — needs your OK** — dry run 2026-11-01: of 410 links, 85 miss a title, description or image; 82 checked (3 X posts skipped, the scraper can't see X), **4 would change** (2 titles, 3 descriptions, 3 images), 50 nothing new, 28 blocked by their sites (403 / Cloudflare challenge). Report: `~/memex-backups/backfill-metadata-2026-11-01T2359-dry-run.json`. To apply: back up, then `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SCRAPER_URL=… node scripts/backfill-metadata.mjs --apply` (dry run is now the default)
- [ ] **Rotate the GitHub OAuth secret** — `.env` has `VITE_GITHUB_CLIENT_SECRET` in it; `VITE_`-prefixed vars are bundled into the client, so treat it as exposed. Rotate it in GitHub and keep the secret out of frontend env. *2026-11-01: `.env` no longer has the variable and the gitleaks history scan is clean, but any build made while it was set shipped it, so rotation still stands unless it's already done*
- [ ] **Walk-away drill** — open `~/memex-vault` in Obsidian once (File → Open folder as vault) and spot-check; after pulling changes to the export scripts, re-run `scripts/install-export-agent.sh install`
- [ ] **Back up regularly** — `scripts/backup-supabase.sh` (needs Docker Desktop running; 2026-11-01 run took ~1 min, 2.1 MB). Always before `supabase db push`. Consider a weekly reminder or launchd job
- [ ] **Migration history doesn't replay from scratch** — found 2026-11-01: a fresh local `supabase start` stops at `20260204134500_add_tags_and_profiles.sql`, so a local stack can't be built from `supabase/migrations/` alone (production is fine; restoring a backup's `schema.sql` works). Decide whether to squash into a baseline migration

## ✅ Verify after setup

- [x] Save a new link in the app → real title/description + preview image ✓ verified locally 2026-09-06, **including a Pinterest pin** (re-verify once against the deployed worker)
- [ ] Extension on real sites (⌘⇧S, X bookmark, Pinterest save, offline queue) — checklist in `docs/browser-extension-plan.md` → “Verify on the real sites"
- [ ] Dev server boots clean (the QueryClient crash is fixed; confirm no console errors)

## ☁️ Cloudflare migration (config done — run these in order)

- [x] Scraper deployed (`memex-scraper.joyfulsystems.workers.dev`) ✓
- [x] `.env.production` filled with deployed scraper URL ✓
- [x] App live at `https://memex.joyfulsystems.workers.dev` ✓
- [x] Scraper `ALLOWED_ORIGINS` includes production origin ✓
- [x] Verified live: scraper working on the deployed domain ✓ 2026-09-07
- [x] DigitalOcean app deleted ✓ 2026-09-07
- [ ] **Custom domain (Namecheap)**: add domain to Cloudflare (free plan) → switch nameservers at Namecheap → attach custom domain to the memex worker → update Supabase auth URLs + scraper `ALLOWED_ORIGINS` for the new origin → redeploy scraper

## 🎨 UX redesign (decided 2026-10-15 via `/mocks`, built same day)

- [x] **Stream** — masonry (1A) ⇄ reading list (1C) toggle; `?view=list`, remembered per browser. Tasks are a checklist band (grid) or inline rows (list), time-grouped in list view
- [x] **Link preview cards** — 7C image-first with frosted caption on hover; Settings → “Link cards” picks Hover (7C), Overlay (7A), or Inset (7E). Default lives in `src/utils/linkCaptions.ts`
- [x] **Pinned sites** — 2C labelled launcher row under the page heading; footer bar removed, settings at the sidebar foot (phones: wordmark → drawer)
- [x] **Link details** — 3C expand in place (`?link=`), neighbours animate via `MasonryLayout`. *Evaluate the feel; fallback is 3A side panel*
- [x] **Search & capture** — 4A command palette (`CommandBar`): ⌘↵ note, ⇧⌘↵ task, Add link for URLs, cross-type results, “/” to focus
- [x] **Note editor** — 5A document column, large title, metadata line, “Saved” as text, ··· menu
- [x] **Spaces** — 6A colour dot (swatch palette, creation order) + space heading with count and Edit space
- [x] **Undo** — deletes hide immediately and commit after 6s unless undone (no confirm dialogs)
- [ ] **Per-space colour picker / description** — needs `profiles.color` / `profiles.description` columns (migration)
- [ ] **“Why I saved this” note on links** — needs a `links.note` column (migration)
- [x] **Retire** `LinkDetailsPanel`, `Omnibar`, `TaskGridCard`, the old `.memex-grid` CSS ✓ 2026-10-16 — `/mocks` still to go once the new surfaces settle
- [x] **Notes to Self → Journal** (10B: continuous jot list by day with each day's activity folded; jot → note/task; 9A labelled header button, shortcut J) ✓ 2026-10-15; replaced the short-lived 8D Today column; `NotesToSelfPanel` / `TodayPanel` removed
- [ ] **Round 4 mocks** — mobile layout, tags (ship or remove), swatch presence

## 🔨 Next build tasks (ask Claude, no credentials needed)

- [x] **Phase 1, slice 1** ✓ 2026-10-25 — Journal home at `/` (11D entries, composer syntax, filing chips + one-press suggestions + “File to…”, Inbox per 12B), Library at `/library`, `/home` redirects, Joyful Utility depth pass. Try it: jot, paste a link, `[] ` a task, `@Space` to file, accept a suggestion
- [x] **15A Library views** ✓ 2026-11-02 — tabs (Everything · Unfiled · From X/Pinterest/YouTube · your views · Save view), Source/Space/Sort menus, Table view; `saved_views` migration applied after backup `~/memex-backups/2026-11-02T000351Z`; spec + choices to confirm in `docs/library-views.md`. **Ryan to check signed in**: save a view, reopen it, try the Table (sort, ⌘/Shift-click, X/Delete keys, Undo)
- [ ] **Phase 1, next** — 14B space board (scoped Journal + board column; retires the Journal panel in space pages), 16A phone tab bar (Journal · Library · Spaces · Inbox), drag an entry onto a sidebar space, a real Tasks view
- [ ] **Journal polish**: edit a jot in place, move a jot between scopes, jots in the command palette, markdown-lite in jots
- [x] **JOYFUL pass** ✓ 2026-09-08: color model (hue-keyed neutrals, paper-first canvas, tint pairs), Geist Mono for data, press travel, canvas grain, capture pop-in — listen/look test in both themes; next candidates: a hue per space, haptics on mobile
- [ ] **Stream refinements** (layout refactor landed 2026-09-07): ~~visual pass on note/task cards vs. the link card~~ ✓ 2026-10-16 (one card surface, shared selection check, note cards show last-edited, keyboard-selectable task rows); ~~space rename/delete from the sidebar~~ ✓ 2026-09-08; empty-space onboarding copy; keyboard nav across cards
- [x] **Remove list-view leftovers** ✓ 2026-10-16 — components deleted, styleguide shows the live stream cards
- [x] **Prune dead CSS** ✓ 2026-10-16 — `index.css` 8.6k → 4.6k lines; computed styles identical across 12 app states
- [x] **Surface audit** ✓ 2026-10-16 — one ghost icon button, Journal toggle on the shared secondary button, outline colours, complete type roles, note-editor CSS ownership
- [x] **Multi-select polish** ✓ 2026-10-16 — selection bar (count, Add to space, Delete + Undo), ⌘/Ctrl-click, Shift range, ⌘A, Esc; selection survives filters; calmer grid; sidebar spaces keep their dots
- [ ] **Multi-select follow-ups** — long-press to start selecting on touch; bulk "Remove from this space" and "Mark done" if wanted
- [ ] **Surface audit leftovers** — `memex-pin-toggle` / `memex-space-chip` keep their own toggle treatment (coherent, option-badge tint for pinned); `index.css` still holds live structure under legacy `bookmark-*` names (rename with the profiles → spaces pass)
- [x] **Deep-link check** — the extension opens saved links at `/home?link=<id>`; the API doesn't hardcode routes ✓ 2026-10-18

- [x] **Browser extension v0.2** ✓ 2026-10-18 — WXT rewrite, automatic X-bookmark + Pinterest-save capture, context menus, offline queue, server-side dedupe, `links.source`
- [x] **Capture provenance (M2)** ✓ 2026-11-01 — `source` / `source_id` / `lists` / `captured_by` / `captured_client` / `url_key` on links (additive), dedupe on (user, source, source id) with a normalized-URL fallback, capture rules in `@memex/core/capture` for the MCP write tools, memex-api on one user-scoping helper with id validation + rate limit, extension v0.3.0 (YouTube likes, ✓, space picker)
- [ ] **Browser extension next steps** — tracked in `docs/browser-extension-plan.md` (post-capture tags, selection → note, a “from X” filter in the Library, app-side dedupe, store listing)
- [x] Sound design pass in the app (confirm/dismiss/error/move/toggle via `src/utils/sound.ts`, mute in Settings) ✓ 2026-09-08 — listen-test the mix; the palette is retunable in one map
- [ ] Image proxy route on the scraper worker if preview hotlinking breaks for some domains
- [ ] Per-device token names/revocation polish (Settings modal exists; lean per-device early)

## 🗺 Standing roadmap — now lives in `ROADMAP.md` (2026-10-24)

Phases there: 1 Journal-first web → 2 `packages/core` seam + vault export → 3 extension (parallel) → 4 vault backend (leave Supabase) → 5 Tauri desktop (re-sync + mirror) → 6 React Native app → 7 agents (MCP). *2026-11-01: split into releases. v1 = 1 (desktop), 2, 3, 6 (TestFlight), 7a–7d; v2 = 4, 5, offline sync, 7e embeddings.* Older items, re-homed:

- [ ] Profiles → spaces rename: **UI copy only**. Skip the DB rename; the tables go away in Phase 4 and the vault uses `spaces/` from the start
- [ ] Attach-to-space modals → replaced by filing in the Journal + Inbox (Phase 1); retire legacy project views
- [x] Cross-primitive search — inherent to the stream / Library
- [ ] Supabase exit → `ROADMAP.md` Phase 4 (local-first event log + markdown vault in R2, not D1/Neon tables) — **v2** (2026-11-01)
- [ ] Encryption → Later; mobile polish → the PWA bridges until the Expo app (Phase 6, v1 on TestFlight). PWA hardening landed 2026-09-19: re-add to home screen to pick up the new manifest/meta; test bottom bar, safe areas, and input zoom on device
- [x] Testing setup → Vitest with `packages/core` ✓ 2026-11-01 (`npm test`, CI); Playwright later

## 📌 Parking lot / open questions

- [x] Hosting move DigitalOcean → Cloudflare — config in place (root `wrangler.jsonc`, `npm run deploy`); see ☁️ checklist above
- [ ] Extension distribution: stay load-unpacked or publish to Chrome Web Store?
- [ ] Old canvas swatch IDs (blush, lilac…) silently fall back to grey — fine, or add a migration toast?
