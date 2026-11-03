# memex v1 sign-off (M7, 2026-11-02)

v1 as scoped on 2026-11-01 (ROADMAP §5 “Releases”, decision 18): a Journal-first desktop web app, live capture (extension + memex-api), a hosted MCP server so Grok Bots can read and store project context, the iPhone app ready for TestFlight, and the walk-away export, all on Supabase + Cloudflare Workers. v2 (leave Supabase, Tauri, embeddings) is out of scope.

Dates are local (US Central); production timestamps are UTC, so the M7 runs show as 2026-11-03 UTC.

## 1. What shipped, by milestone

The repo labels M2, M3, M5 and M6 explicitly. M1 and M4 are the remaining v1 work in order, as far as the history shows.

| Milestone | What | Docs |
| --- | --- | --- |
| M1: safety rails | `scripts/backup-supabase.sh` with a tested restore; gitleaks in CI and locally; "Safety rules for agents" in `CLAUDE.md`; signed-out routes go to sign-in and come back | `docs/backups.md`, `SETUP.md` |
| M2: capture provenance | `source` / `source_id` / `lists` / `captured_by` / `captured_client` / `url_key` on links; dedupe across X, Pinterest and YouTube URL shapes; capture rules in `@memex/core/capture`; extension v0.3.0 (YouTube likes, ✓, space picker); scraper service-binding fix | `api/README.md`, `docs/extension-setup.md` |
| M3: hosted MCP | M3-A read tools + agent tokens + audit log; M3-B write tools, Inbox proposals, idempotency, Settings → Agent tokens; M3-C (OAuth) designed, built only when a connector needs it | `docs/mcp.md`, `docs/mcp-auth.md` |
| M4: shared core + walk-away | `packages/core` (`@memex/core`) with the `Repository` interface and Supabase adapter; Vitest and CI; the Markdown vault export, nightly via launchd | `packages/core/README.md`, `docs/vault-format.md` |
| M5: Journal-first desktop | Journal at `/`, Library at `/library` with saved views and a Table (15A), Tasks view (M5-B), space pages as boards (M5-C, 14B), notebook Journal with grouped, editable, movable jots (M5-D, 17B), drag to a space | `docs/library-views.md`, `docs/tasks-view.md`, `docs/space-page.md`, `docs/journal-17b.md` |
| M6: iPhone app | Expo app on core: Journal + composer, Library, Spaces, boards, Inbox, Tasks, notes, link detail (M6-A to C); iOS share extension "Save to memex" and an offline outbox (M6-D) | `docs/mobile.md` |
| M7: hardening + sign-off | Below | this doc, `docs/security-audit.md` |

### M7 itself

- **RLS gap closed at the database level.** Migration `20261104120000_same_owner_checks.sql` makes the database refuse any row that points at another user's space, project, tag, item or token: triggers for every role (the service role included), plus restrictive RLS policies. Applied after backup `~/memex-backups/2026-11-03T030204Z`; 0 existing rows violated it. Full audit, every table: `docs/security-audit.md`.
- **memex-api:** a per-IP rate limit before any token lookup, and byte-counted streaming body caps with `413` on every route.
- **Web:** failed loads say so with Retry, instead of showing the new-user empty state or an endless skeleton. Failed writes always show a message (one fallback toast). A failed note save keeps the draft and offers Retry, and leaving asks first. Saving and filing are separate steps, so a failed filing can't cause a duplicate. Route error boundaries. Offline writes fail fast, and the shell shows an offline pill.
- **Mobile:** a failed or offline load shows "You're offline" or "Couldn't load…" with Try again, instead of "No spaces yet", "Nothing waiting" or "isn't here anymore". A root ErrorBoundary. Screens refetch when the connection returns. `mailto:` links work. Sign-in and sign-out failures are reported.
- **Dependencies:** `npm audit fix` without semver-major bumps. Root has no high findings left; api and scraper are clean. The rest are in §3.
- **Docs:** `README.md` rewritten (setup, deploy for each part, backup and restore, agent tokens and MCP clients), plus `docs/security-audit.md` and this file.

## 2. What was verified

### Deploys (2026-11-02)

| Worker | Version | What |
| --- | --- | --- |
| `memex` (web) | `8b07238f-f09a-4970-8093-b255e2148b6c` | M6-D core: offline creates throw the network error |
| `memex` (web) | **`7a137b2d-fa39-4e36-9577-9248eab5ccd0`** (live) | + M7 web hardening (commit `f3b45dc`) |
| `memex-api` | **`4ab2233c-2202-45ce-a351-ea123894b005`** (live) | per-IP limit, streamed 413 caps, current core (replaces `aa9e9443`) |
| `memex-scraper` | `3e6a479b-195c-429d-885c-90c9400bef81` (live, unchanged) | reached through memex-api's service binding |

**Live web checks** (signed out, fresh browser profile): `/`, `/auth/sign-in` and `/auth/sign-up` load with no console errors and no failed requests. JS, CSS and fonts load. `memoryextension.app` answers 200. Protected routes redirect to sign-in and keep the deep link (`/library?space=x` → `/auth/sign-in?next=%2Flibrary%3Fspace%3Dx`).

### End-to-end smoke test (production, 2026-11-03 UTC)

`api/scripts/v1-smoke.ts run` passed **33/33**; `cleanup` passed **11/11**. Every item was `[test]`-labelled, in a `[test] M7` space, and deleted by recorded id afterwards.

| Area | Checked | Result |
| --- | --- | --- |
| Extension API (`chrome-extension://` Origin) | `/api/spaces`, `/api/tags`, capture (201, filed, `captured_by: extension`), duplicate (200), lookup by a normalized URL, X dedupe across `x.com` / `twitter.com/i/web` (lists merged), file into a space (another id → 404), undo (`DELETE`, then 404), oversized → 413, bad token → 401, agent token refused | ✅ |
| Scraper | captures without a title get one through the service binding ("Example Domain"), for both the extension API and MCP `save_link` | ✅ |
| Web composer path | lone `https://` text on any TLD is a link, and `@Space` files it; the save records `captured_by: app`, `captured_client: memex-web`; a jot is filed, moved Home and back; a `[] ` task | ✅ |
| Database same-owner rule | production refused moving a jot into a space that isn't the owner's (`42501`), even for the service role | ✅ |
| MCP tools/list | read_write sees 13 tools, read sees 7 | ✅ |
| MCP write tools | `add_jot` (an idempotent retry replays), `save_link` (scraped, filed, `captured_by: agent`), `create_note`, `create_task` (due date), `append_to_note` (applied directly), `propose_change` (pending, item unchanged) | ✅ |
| MCP read tools | `list_spaces` (counts 3 links, 1 note, 2 tasks, 2 jots), `space_overview` (all 8), `search`, `get_item` (each type), `get_journal`, `timeline_stats`, `get_images` | ✅ |
| Scopes and revocation | a read token's write call is refused and nothing is written; a revoked token gets 401 "This token has been revoked" on its next request | ✅ |
| Audit log | a row for each of the 6 write tools, with token, client, tool and `result_ref`; no content in `args_summary` | ✅ |
| Journal, boards, Tasks, Library views (core logic over the rows) | the space has 8 entries; board: 1 pinned, 2 open tasks, 3 saves, 1 note, 2 jots; Tasks groups both under the space; a saved view (space + links, Table) shows exactly the 3 links | ✅ |
| Vault export | `scripts/export-vault.mjs --out <temp dir> --no-images`: 416 links, 100 notes, 13 tasks, 374 jots, 11 spaces. Every test item and the view were present, with correct `capturedBy` / `capturedClient` / spaces / `pinnedIn` (the one deleted on purpose was absent). `~/memex-vault` wasn't touched, and the temp copy was deleted | ✅ |
| Cleanup | content tables match the pre-test backup row for row (links 412, notes 99, tasks 11, jots 372, spaces 10, joins unchanged). Only `agent_tokens` (+2, the revoked test tokens, kept for the audit trail) and `mcp_audit_log` (+25 content-free rows) grew | ✅ |

The smoke test didn't sign in as Ryan. The web path was exercised through core's composer, provenance and Journal/board/Tasks/view functions, with rows written the same way the app writes them. A real signed-in pass is still in the "Needs Ryan" list.

### Tests (final commit)

| Suite | Count |
| --- | --- |
| Vitest, root (`npm test`: `packages/core` 477, web `src` 62, memex-api 57) | **596** passed |
| Mobile Vitest | **95** passed |
| Mobile Jest (RNTL) | **87** passed (12 suites) |
| Database (pgTAP, `scripts/test-db.sh`) | **33** passed; 15 of them fail without the M7 migration |
| Production smoke (`api/scripts/v1-smoke.ts`) | **33** + 11 cleanup |
| Mobile release bundle | OK (7.4 MB, no fixture code) |

CI (`.github/workflows/ci.yml` + `secret-scan.yml`) runs typecheck, lint, tests, build, api typecheck, the extension build, the mobile job and gitleaks on every push. The status of the final commit is in the M7 report.

### Secrets

`gitleaks git --redact --log-opts="--all" .`: 262 commits, no leaks. No secret was printed, logged or committed during M7. The service-role key went from the Supabase CLI straight into each smoke-test process's environment; test tokens existed only in mode-600 temp files, deleted at cleanup.

## 3. Known limitations

- **Safari Share → Save to memex was only partly verified in the simulator.** The extension's handoff (App Group item + deep link) was reproduced and saving was proven, but pressing Share → Save to memex in Safari itself wasn't (the simulator can't be tapped from scripts). The full check is **step 11 of the TestFlight checklist in `docs/mobile.md`**, along with X, YouTube and Airplane Mode.
- **No signed-in browser pass in M7.** The new error states were checked on demo data and by tests, not with Ryan's account.
- **Database tests aren't in CI.** They need a backup's schema, because `supabase/migrations/` doesn't replay from scratch (TODO.md); run `scripts/test-db.sh` locally.
- **Rate limits are approximate** (per Cloudflare location): a brake, not a quota. Extension tokens have no scopes or expiry.
- **Deletes that RLS filters out count as success** (0 rows deleted, no error). That's deliberate: deleting something already gone is fine. It only matters if the UI offered a row that isn't yours, which it can't.
- **npm audit, left as is:** vitest/tinypool are critical but dev-only (test runner) and need vitest 5. The eslint 8 chain (moderate) needs eslint 9. supabase-js 2.49 → 2.118 is a "minor" bump that breaks core's `Database` typings, so it's a deliberate upgrade for later; its auth-js advisory is rated low. On mobile, Expo's own dependency chain only offers semver-major bumps or bogus downgrades.
- From earlier milestones and still open: Android share intent untested; the phone's Library has no spaces row; notes on the phone are edited as plain text; MCP OAuth (M3-C) is not built, so grok.com / claude.ai custom connectors can't connect yet (xAI API, CLIs and Cursor can).

## 4. Needs Ryan

- [ ] **TestFlight** (`docs/mobile.md` → TestFlight checklist): Apple Developer Program account; Expo/EAS account; App Store Connect record and bundle ids (app + `Savetomemex` extension); the App Group `group.com.joyfulsystems.memex`; add `memex://auth/callback` to Supabase Auth → Redirect URLs. Then on the TestFlight build: **the Safari share test** (step 11: Share → Save to memex, pick a space, it lands filed) and **the Airplane Mode test** (save offline, it waits at the bottom of the Journal, and sends once when you turn Airplane Mode off).
- [ ] **Load Chrome extension v0.3.0**: `cd extension && npm install && npm run build`, load or ↻ reload `extension/.output/chrome-mv3`, paste an access token, Test connection, run `docs/extension-setup.md` §4.
- [ ] **Revoke the old smoke-test tokens** (still live on 2026-11-02): Settings → Agent tokens → `[test] agent-smoke-test-m3` and `[test] agent-smoke-test-m3b`; Settings → Access tokens → `[test] agent-smoke-test-m2` and `[test] agent-smoke-test-m2b`. Those two are your only access tokens, so make a real one for the extension first. Your "Grok Bot" agent token is untouched. M7's own test tokens are already revoked (agent) or deleted (access).
- [ ] **Rotate the GitHub OAuth secret** (it was once in a `VITE_` variable, so any build from then shipped it): GitHub → OAuth app → new secret → Supabase Auth → GitHub provider.
- [ ] **Dismiss the stale M1-B approval in T3.**
- [ ] **Review the design-choice docs** and run their signed-in checklists: `docs/journal-17b.md`, `docs/space-page.md`, `docs/tasks-view.md`, `docs/library-views.md`.
- [ ] **Optional: approve the backfill of 4 links** (2 titles, 3 descriptions, 3 images; report `~/memex-backups/backfill-metadata-2026-11-01T2359-dry-run.json`; TODO.md has the command).
- [ ] **Open mobile questions:** should "Not now" stay phone-only (local)? Should Tasks stay a header button rather than a tab? Is plain-text note editing OK for now?
- [ ] **New from M7:**
  - **Public sign-up is open** (`/auth/sign-up` → "Create one"). The cross-user gaps are closed now, but if memex is meant to be single-user, turn off sign-ups in Supabase → Authentication → Sign In / Providers (and hide the link). Your call.
  - **Delete `.env.migrate`** in the main checkout once you're done with legacy migrations: it still holds `LEGACY_NOTE_ENCRYPTION_KEY` (gitignored, never committed). Its service-role keys are already empty.
  - **Leftover `[test]` items from M2/M3** (listed in TODO.md: the `[test] m3b smoke …` jot, note, task and link, and the pending proposal): delete or reject them in the app when convenient. M7 didn't touch them, because the rule is to delete only what M7 created.
  - **A signed-in pass of the new error states**: e.g. turn Wi-Fi off on the Journal and on a note (offline pill, "Couldn't save · Retry", the leave-without-saving prompt). The leave prompt uses the browser's confirm dialog (the one exception to Undo-not-confirm, since there's nothing to undo); say if you'd rather have an in-app dialog.
  - **Decide on squashing migrations into a baseline** (TODO.md), which would let the database tests run in CI.
