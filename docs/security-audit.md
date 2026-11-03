# Security audit: RLS, tokens and memex-api (M7, 2026-11-02)

What was checked before v1 sign-off, what was wrong, and what changed. Production has one user today, but sign-up is open (`/auth/sign-up`), so every rule below is written for many users.

## 1. Row-level security, table by table

Read from production's schema (backup `~/memex-backups/2026-11-03T030204Z/schema.sql`), not only from `supabase/migrations/` (production has columns the migrations don't create, e.g. `links.project_id NOT NULL` and `links.tag_id`).

Postgres note: an `UPDATE` policy without `WITH CHECK` reuses its `USING` for the new row. So `USING (auth.uid() = user_id)` already stops a user giving a row away, but says nothing about the row's **other** references.

| Table | SELECT | INSERT | UPDATE | DELETE | Cross-user references | Verdict before M7 |
| --- | --- | --- | --- | --- | --- | --- |
| `links` | own | own `user_id` | own (USING as check) | own | `project_id` → projects, `tag_id` → tags | **Gap**: could name another user's project or tag |
| `notes`, `tasks` | own | own | own | own | none | ok |
| `self_messages` (jots) | own | own + space must be own | own, **no check on `profile_id`** | own | `profile_id` → profiles | **Gap (the reported one)**: a jot could be moved into another user's space |
| `profiles` (spaces), `tags`, `projects`, `saved_views` | own | own | own | own | none (`saved_views.definition` holds ids as data, not keys; RLS hides others' rows) | ok |
| `profile_links` / `profile_notes` / `profile_tasks` | space own | space own **and** item own | both own | space own | profile + item | ok for the app; **service-role writes unchecked** |
| `link_tags` / `note_tags` / `task_tags` | item own | item own and tag own | both own | item own | item + tag | ok for the app; service-role writes unchecked |
| `api_tokens` | own | own | none (revoke = delete) | own | none | ok |
| `agent_tokens` | own | own, not revoked | `revoked_at` only (column grant), can't un-revoke | none | none | ok |
| `mcp_audit_log` | own | none (service role only) | none | none | `token_id` → agent_tokens | service-role writes unchecked |
| `inbox_proposals` | own | none | `status`, `decided_at` only, pending → applied/rejected | none | `space_id`, `token_id`, `(item_type, item_id)` | service-role writes unchecked |
| `agent_write_keys` | own | none | none | none | none | ok |

No views, no RPC functions; the only functions are trigger functions. Storage buckets are empty.

**Impact of the gaps, honestly:** a signed-in user who knew another user's space UUID could file their own jot "into" it (the jot stayed theirs and invisible to the other user, but it would be deleted when that space was deleted, and the write confirmed the UUID existed). Links could reference another user's legacy project or tag the same way. The service-role gaps were never exploitable through memex-api, which ownership-checks every id first (§3); they were defence-in-depth holes.

## 2. The fix: migration `20261104120000_same_owner_checks.sql`

Additive only (one trigger function per kind, triggers, restrictive policies; nothing dropped or rewritten). Applied 2026-11-03 after backup `2026-11-03T030204Z`, with a read-only pre-check that found **0** existing rows breaking any rule (13 rules checked).

- **`memex_assert_same_owner()`**, a `SECURITY DEFINER` BEFORE INSERT/UPDATE trigger on `self_messages`, `links`, `profile_links`, `profile_notes`, `profile_tasks`, `link_tags`, `note_tags`, `task_tags`, `inbox_proposals` and `mcp_audit_log`. Every referenced row (space, project, tag, item, token) must belong to the row's owner; join tables need both sides to share one owner. It runs for **every role, the service role included**, so the database itself refuses a mismatch whoever writes. On UPDATE it only checks when an owner/reference column changes, so editing an old row's text never trips it. Error: SQLSTATE `42501`, like an RLS refusal.
- **`memex_assert_proposal_item_owner()`**: an Inbox proposal's `(item_type, item_id)` must be the owner's link, note or task.
- **Restrictive policies** (ANDed with the existing ones, so strictly tighter): `self_messages` UPDATE (space must be own), `links` INSERT and UPDATE (project and tag must be own). They make the rule visible to anyone auditing policies.
- Restores load data with `session_replication_role = replica` (`docs/backups.md`), which skips triggers, so backups still restore as before.

**Tests:** `supabase/tests/same_owner.test.sql` (pgTAP, 33 checks: two users; the app as `authenticated`, memex-api as `service_role`; every cross-user write refused, every same-user write still works). Run with `scripts/test-db.sh`, which loads production's schema from the newest backup into a throwaway local Postgres (port 54632) and applies the newer migrations; it never touches production. 15 of the 33 checks fail without the migration. Not in CI: CI has no backup schema, and `supabase/migrations/` doesn't replay from scratch (TODO.md). Production also refused a live attempt during the M7 smoke test (`42501`).

## 3. memex-api and agent tokens

| Check | Result |
| --- | --- |
| Every user-data query goes through `userScope(db, userId)` (`api/src/db.ts`): `user_id=eq.<token owner>` on reads/updates/deletes, stamped on inserts, caller-supplied `user_id` dropped | ok; tested (`db.test.ts`, new `index.test.ts` "scopes every query to the token owner…") |
| Join rows (`profile_*`, `link_tags`) written only after both ids are ownership-checked | ok in code; now also enforced by the database (§2) |
| Ids validated before they reach a filter (UUIDs, platform ids); `URLSearchParams` encodes values, so no PostgREST parameter injection | ok |
| No path where a caller-supplied id reaches another user's rows: other users' ids get the same 404 / "not found" as missing ones | ok |
| Extension tokens (`mx_…`) are refused at `/mcp`; agent tokens (`mxa_…`) refused at `/api/*`; neither can mint agent tokens (`/agent-tokens` needs a Supabase session, checked by Supabase Auth) | ok; smoke-tested live |
| `read` agent tokens: write tools aren't registered, a raw `tools/call` is refused and audited `denied`, the write service isn't even built | ok; tested and smoke-tested live |
| Revoked and expired agent tokens refused on the very next request (checked every request, no session cache) | ok; smoke-tested live (401 "This token has been revoked") |
| Rate limits | **Improved**: per-token limits existed; added a per-IP limit (600/min) before any token lookup (`IP_RATE_LIMITER`, `api/src/limits.ts`) |
| Body size | **Improved**: `/api/*` answered 400 and read the whole body before checking when `Content-Length` was missing; now every route counts bytes as they stream and answers `413` at 64 KB (4 KB for `/agent-tokens`) |
| Secrets: service key only as a Wrangler secret; tokens stored as SHA-256; DB errors logged and returned as a generic 502 | ok |
| MCP audit log: who (token id, client name, user id), what (method, tool), which item (`result_ref`, e.g. `note:<id>`), when, status; free text reduced to its length | ok; already in place since M3. Kept as a table (not Worker logs) because it's per user under RLS, survives Worker log retention, and is queryable from the app. Live check: 6 write tools → rows with `result_ref`, no content |

**Known and accepted:** extension tokens have no scopes or expiry (they only capture and list spaces/tags; revocation = delete in Settings). Rate limits are per Cloudflare location and approximate: a brake, not a quota. Extension captures aren't in `mcp_audit_log`; their provenance is on the row (`captured_by`, `captured_client`).

## 4. Secrets scan

`gitleaks git --redact --log-opts="--all" .` over 262 commits: **no leaks**. A working-tree scan flags only gitignored files: the anon key in `.env` and the built bundle (public by design), and `LEGACY_NOTE_ENCRYPTION_KEY` in `.env.migrate` (left from the legacy migration; Ryan can delete that file, see `docs/v1-signoff.md`).
