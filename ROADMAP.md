# memex — North-star roadmap

**Status:** Written 2026-10-24, revised the same day after reviewing pond (raphaelsalaja/pond). This is the big picture that every build task should serve. Where this doc and `VISION.md` disagree, this doc wins. Update both deliberately. Domain words are defined in `CONTEXT.md`.

Mockups for the UI direction: `docs/mocks/2026-10-24-journal-first.html` (open it in a browser).

**2026-11-01 — scope split into v1 and v2 (approved by Ryan).** v1 stays on Supabase + Cloudflare Workers and ships: Journal-first web for desktop, live capture (extension + memex-api), a hosted MCP server on memex-api so Grok Bots can read and store project context (the headline goal), a React Native (Expo) app on TestFlight, and the walk-away export. v2: leaving Supabase (the vault backend), the Tauri desktop app, embeddings. The requirements and architecture below are unchanged as the destination; §5 says which release each phase belongs to, and decision 18 records the split. v1 is single-user, but its screens will appear on Ryan's public portfolio.

---

## 1. What memex is for

memex is the place for all of one person's scattered thoughts, creative inspiration and browsing interests: a digital extension of their mind. It closes one loop:

```
   total capture  ──►  visual display  ──►  high-level analysis
   (journal, extension,   (Journal, space boards,   (Claude and other agents
    share sheet, re-sync)   Library)                  over MCP or the files)
          ▲                                                   │
          └─────────────── insights become jots ◄─────────────┘
```

**The ownership rule:** memex the app can be thrown away at any time. Everything it ever knew lives in plain files you can back up, read without memex, and take with you (§3.4).

## 2. Requirements

1. **The Journal is home.** The root view is a chat-style feed where you dump everything: jots, links, notes, tasks, and things saved automatically. Everything is filed into spaces in the background. Spaces are working boards. The **Library** (today's stream grid) is the second view: a visual database of everything ever captured.
2. **Files you own, working like a remote database.** All data lives as plain files (markdown + frontmatter, JSON for structured settings, original images) that belong to you. They sync across phone, desktop and browser like a database does. Supabase goes away.
3. **Walk away any time.** Nothing exists only inside memex: not preview images, not space layouts, not filing rules. One folder is the whole product state.
4. **A native mobile app.** React Native (Expo), journal-first, with share-sheet capture.
5. **Rich automatic capture.** The browser extension saves X bookmarks, Pinterest saves and YouTube likes the moment you make them. v0.2 already does X + Pinterest.
6. **A desktop app (Tauri) with a re-sync safety net.** Periodically walks your saved lists on X, Pinterest and YouTube and captures anything the extension missed (pond-style). It also holds the local mirror of your files and a global capture shortcut.
7. **Agent access.** Claude and other agents can search, read and analyze everything through an MCP server, or by reading the files directly.

## 3. Architecture

```
 apps/web (Vite)    apps/mobile (Expo)    apps/desktop (Tauri)          extension (WXT)
     │                    │                ├─ wraps the web UI               │
     │                    │                ├─ re-sync harvester ─────────┐   │
     │                    │                └─ mirror ~/memex ◄──┐        │   │
     └──── packages/core ─┴─────────────────────┘              │        │   │
        types · model · parsing · filters · Repository ·        │        │   │
        local replica (SQLite) + outbox + sync client           │        │   │
                          │ changes up / change feed down        │        ▼   ▼
                          ▼                                      │   POST /api/capture
        ┌─────────── memex backend (Cloudflare) ──────────────────────────────────┐
        │ Worker: auth, /api/*, /mcp (agents), scraper                             │
        │ Durable Object per vault = THE ONE WRITER                                │
        │   applies changes in order · journals multi-file writes · change feed   │
        │   SQLite index (FTS) — rebuildable from the vault at any time           │
        │ R2 bucket in your account = THE VAULT (source of truth)                 │
        └──────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Shared core, separate UI layers

There isn't a magic bridge between React DOM and React Native. What's practical is one shared TypeScript package for everything that isn't pixels, plus separate UI layers.

- **Shared (`packages/core`):** data types, the entry/item model, composer parsing (`@space`, `#tag`, URL and task detection), filtering and search (`stream/`), the `Repository` interface, React Query hooks, Zustand stores, the source registry, design tokens as TS constants.
- **Web stays Vite + React DOM.** The Pastel Sky CSS, masonry, frosted surfaces and CodeMirror editor are DOM-native craft.
- **Desktop reuses the web UI** inside Tauri, so it costs almost nothing beyond the native parts (re-sync, mirror, shortcut, tray).
- **Mobile is new Expo UI** on the same core. Expo DOM components (`'use dom'`) keep the CodeMirror editor instead of rewriting it.

### 3.2 Storage: the vault is the truth, one writer applies changes

Learned from two sources. Logseq moved off markdown files because several devices writing the same files caused conflicts and data loss. pond keeps files as the truth and works well, because **only one program ever writes them**. memex does the same, with the writer in the cloud so the phone and browser can reach it:

- **The vault is the source of truth.** An R2 bucket in your Cloudflare account holds plain files (§3.3).
- **One writer.** A Durable Object per vault applies every change in order. Multi-file changes are journaled (write a journal, apply, record a commit marker; on restart, finish or roll back), so a crash never leaves half a change. This is pond's executor.
- **Devices never write files.** Every client (web, desktop, phone, extension) keeps a local SQLite replica and an outbox of pending changes (`item.update {field, value}`, `entry.create`, `item.file {space}`…). It pushes the outbox to the writer and pulls the **change feed** since its last cursor (pond's `sync_actions`, across the network). The Journal opens instantly and works offline.
- **Conflicts are resolved by the writer, per field**, last write wins. Note bodies edited on two offline devices keep a conflict copy rather than merging (CRDT text merge only if that ever hurts).
- **The index can always be rebuilt.** The writer's SQLite (full-text search, counts, filters) is derived from the vault. “Reset index” rebuilds it from files, and a test does exactly that.
- **Auth:** single-user device pairing. Passkey sign-in on the web; pair the desktop app, phone and extension with a device token (QR code or paste). Generalizes today's `api_tokens`.
- **Sync engine:** with one writer, a small custom protocol (outbox push, cursor pull) is likely simpler than adopting LiveStore. The 4a spike confirms which one.

### 3.3 Vault format (draft)

Every file carries a schema version. IDs live inside files, so filenames are cosmetic and renames never break references. Tags and space membership are stored on the item (as pond stores `folderIds` in `info.json`), so there are no join tables. Readers are forgiving: unknown or broken fields fall back to defaults instead of failing.

```
memex/
  vault.json                        vault id, schema version, created
  journal/2026/2026-10-24.md        one file per day, entries in time order
  links/frank-chimero-desk-8d2k1a.md
  notes/kitchen-layout-options-3fa9c0.md
  tasks/email-dana-offer-letter-77b1e2.md
  spaces/home-reno.md               colour, description, pinned sites; body = space notes
  spaces/home-reno.board.json       board layout (references item ids; deleted items show a placeholder)
  views/*.json                      saved Library views (filters, layout, sort)
  settings/filing-rules.json        source → space rules, Pinterest board → space, …
  assets/8d2k1a/preview.jpg         downloaded images: CDN links expire, files don't
  .memex/changes/2026-10.jsonl      the applied change history (audit trail, undo)
```

```md
---                                   # links/frank-chimero-desk-8d2k1a.md
schema: 1
id: lnk_8d2k1a
url: https://x.com/frankchimero/status/1850…
title: "The best interfaces feel like a desk…"
source: x                             # platform, from the source registry
sourceId: "1850…"                     # dedupe key with source
lists: [bookmarked]                   # bookmarked · liked · saved
capturedBy: extension                 # extension · resync · app · share · api · agent
spaces: [inspiration]
tags: [design]
saved: 2026-10-24T09:40:00-04:00
image: assets/8d2k1a/preview.jpg
capture:                              # pond's Capture shape: what the page said
  author: { name: Frank Chimero, handle: frankchimero }
  text: "The best interfaces feel like a desk you already know…"
  media: [{ type: image, file: assets/8d2k1a/preview.jpg, width: 1200, height: 800 }]
---
Why I saved this (optional, markdown)
```

```md
---                                   # journal/2026/2026-10-24.md
schema: 1
date: 2026-10-24
---
- 09:12 idea: the journal is the front door. everything else is the back office. @memex #product ^j_8f3k2
- 09:40 saved [[links/frank-chimero-desk-8d2k1a]] ^j_9a1x0
- 10:05 [ ] Email Dana re: offer letter → [[tasks/email-dana-offer-letter-77b1e2]] ^j_a01c3
```

The full spec becomes `docs/vault-format.md` in Phase 2, with sample vaults frozen as test fixtures (pond's compatibility-fixture practice).

### 3.4 The walk-away guarantee

What “I can scrap memex any time” means in practice:

- **Complete.** Everything a user made or chose lives in the vault: items, jots, spaces with colours and board layouts, tags, saved views, filing rules, the raw capture of every save, and the images themselves.
- **Readable without memex.** Markdown + YAML frontmatter for content, small JSON files for structured settings, original image files. The mirror folder opens in Obsidian or any editor; a script can parse it in minutes.
- **Documented and versioned.** `docs/vault-format.md`, a `schema` field in every file, and fixtures that freeze what older vaults look like.
- **Backed up three ways.** R2 object versioning (or a nightly snapshot to a second bucket), the desktop mirror in `~/memex` (which Time Machine already covers), and optionally a nightly git commit in the mirror for full history.
- **Proven, not promised.** CI rebuilds the index from a fixture vault and compares the result. Once a quarter, do a walk-away drill: open the mirror in Obsidian and check nothing is missing.
- **True before the backend move too.** A Phase 2 export script writes today's Supabase data in the vault format, so the guarantee holds from early on. The same script becomes the Phase 4 migration.

### 3.5 Desktop app (Tauri)

A thin Tauri shell around the web UI, plus three native jobs:

1. **Mirror.** Keeps `~/memex` identical to the vault (pull the change feed, write files). Later: watch the folder so edits made in Obsidian come back as changes.
2. **Re-sync safety net.** On a schedule (default every 6 hours, jittered, only when online; plus “Check now”), walk your saved lists and send anything new through `POST /api/capture` with `capturedBy: resync`. The server dedupes on `(source, sourceId)`, so the extension and re-sync can overlap freely. Borrowed from pond's sync design:
   - **Watermark + early stop.** Remember the newest id seen per account and list; stop walking after a streak of already-known ids, so a run with nothing new costs one page. A weekly full walk catches anything older that was moved.
   - **Rate governor.** Per-source spacing with human jitter, a rolling budget, back off on 429 and `retry-after`, cooldowns persisted across restarts, and a hard stop on any login challenge or captcha (“X needs you to sign in again”).
   - **Scope per account.** Which lists to walk: X bookmarks (likes off by default), Pinterest saves (optionally specific boards), YouTube likes.
   - **Collections → spaces.** A Pinterest board can map to a space, so saves are filed with no AI and no effort.
   - **Visible.** A status line (“Last checked 2h ago · found 3 the extension missed”) and a small history so you can see the safety net working.
   - **How it reads the sites:** Tauri uses the system webview (WKWebView on macOS, WebView2 on Windows), with its own cookie store separate from Chrome. Tauri 2.4+ can *read* webview cookies, but setting them isn't confirmed shipped, so you **sign in once per site in a memex window** and the session persists. Hidden webviews then load each list page and run a small injected script that calls the site's own list API from inside the page (same origin, your cookies) or scrolls the page, and hands JSON back to Rust. pond's list harvesters (MIT) are the reference for each site. The IPC permission for those remote pages is limited to a single “here are results” command.
3. **Global capture shortcut + tray.** Jot from anywhere on the desktop without opening the window.

### 3.6 Agent access (MCP)

Two ways in, cheapest first:

- **Files (zero code).** Point Claude Code or any agent at the `~/memex` mirror. Markdown + frontmatter are easy for agents to grep, read and analyze, and images are local files they can open. Works from the day the Phase 2 export exists.
- **Remote MCP server on the Worker (`/mcp`).** Works from anywhere: claude.ai and Claude Desktop (custom connector, OAuth), Claude Code (bearer token), other MCP clients. It runs on the same index and vault, with no new storage.
  - **Read tools:** `search` (full text + filters: type, source, space, tag, date range), `get_item`, `get_journal` (date range), `list_spaces`, `space_overview`, `timeline_stats` (counts by day, source, space), `get_images` (thumbnails from R2 as image content, so Claude can *look* at your inspiration).
  - **Semantic tools (v2):** `similar`, `clusters`, `themes`, using embeddings (Workers AI + Vectorize, or local embeddings computed by the desktop app). Embeddings are derived data, rebuildable, and not part of the vault.
  - **Write tools (careful):** `add_jot` writes directly (an agent's insight becomes a jot tagged `capturedBy: agent`). Anything that changes existing data (`file_items`, `create_note`, `tag_items`) becomes a **proposal in the Inbox** that you apply or dismiss. This is pond's review-before-apply rule.
  - **Prompts/resources:** canned analyses like “weekly review”, “what have I been circling lately”, “summarize this space”.

## 4. Difficulty, honestly

Measured 2026-10-24: ~15.6k lines of TS/TSX in `src/`; 45 of 57 `.tsx` files render DOM directly; ~8.7k lines of app CSS (plus 1.8k for `/mocks`); 25 files reference Supabase (~3.5k lines), 16 of them call it directly.

| Requirement | Difficulty | Why | What makes it easier |
| --- | --- | --- | --- |
| Journal-first UI (web) | **Medium** | Mostly recomposition, plus new entry cards, filing UI, inbox, composer syntax | Primitives, cards, journal data and Undo exist; v1 derives the feed from existing tables |
| Walk-away export (early) | **Small** | A script mapping today's tables to vault files, plus downloading images | Format is defined here; becomes the Phase 4 migration |
| Extension: YouTube + richer capture | **Small–medium** | Same interception pattern; pond has working YouTube hooks (`/youtubei/v1/like/like`) | Already goes through `memex-api` |
| Vault backend | **Hard** (the biggest) | Writer + journal, change feed, local replicas, auth, migration | One writer and one user remove most sync complexity; pond shows the files-as-truth pattern working |
| Desktop app shell + mirror | **Small** | Tauri around the existing web build; mirror = apply the change feed to a folder | Reuses web UI and the sync client |
| Desktop re-sync | **Medium, plus upkeep** | One harvester per site per list, a rate governor, sign-in handling. Sites change their internals, so expect occasional fixes | pond's harvesters and governor as reference (MIT); dedupe already exists server-side |
| React Native mobile | **Medium–hard** | Every screen is a rewrite; two UI codebases | Journal-first means ~4 screens; shared core; DOM components for the editor |
| Agent access (MCP) | **Small–medium** | Read tools are thin wrappers over the index; OAuth for claude.ai connectors is the fiddliest part; semantic search is extra | Files path is free; Cloudflare has remote-MCP + OAuth templates; review-before-apply reuses the Inbox |

Rough effort, biggest first: vault backend ≈ 2× mobile v1 ≈ 2× desktop re-sync (all three sites) ≈ 3× journal-first web ≈ 4× MCP v1 ≈ 4× YouTube capture.

## 5. Phases

Each phase ships something usable. Tracks marked **parallel** don't block the main line.

### Releases (2026-11-01)

The phases below were written as one line toward the vault. On 2026-11-01 they were split into two releases (decision 18). The phase text is kept as written; each heading now says where it lands.

| Release | Phases | What it means |
| --- | --- | --- |
| **v1** — on Supabase + Cloudflare Workers | 1 (desktop web), 2, 3, 6 (TestFlight), 7a–7d | Journal-first desktop web · live capture via extension + memex-api · hosted MCP on memex-api (headline: Grok Bots read and store project context) · Expo app on TestFlight · walk-away export |
| **v2** | 4, 5, 6 offline sync, 7e | Vault backend (leave Supabase) · Tauri desktop (re-sync, mirror, shortcut) · offline replicas · embeddings / semantic search |

Done for v1 so far: safety rails ✓ 2026-11-01 (production backups with a tested restore, gitleaks in CI, safety rules for agents in `CLAUDE.md`). Suggested order for the rest, not yet confirmed by Ryan: MCP on memex-api (7a, 7d, the headline) → finish Phase 1 desktop → Phase 2 export → Expo app → TestFlight, with Phase 3 in parallel.

### Phase 0 — Plan ✓ 2026-10-24

### Phase 1 — Journal-first web, on today's stack · **v1 (desktop)**
Validate the product direction before rebuilding the plumbing.
- [x] Round 5 `/mocks` with real data: Journal home (chat order, §8 #1), space board, Library table ✓ 2026-10-24 — picks in §8 #11–16
- [x] Feed derived from existing tables: jots (`self_messages`) interleaved with links/notes/tasks by `created_at`; auto-saves grouped (“3 pins saved on Pinterest”) using `links.source` ✓ 2026-10-25 (`src/utils/journalFeed.ts`, 11D entries in `components/journal/`)
- [x] Journal becomes `/`; current stream becomes `/library`; `/home` redirects ✓ 2026-10-25 (query carried, so the extension's `/home?link=` deep links still land)
- [x] Composer syntax: `@space`, URL → link, `[] ` → task, ⌘↵ → note ✓ 2026-10-25 (`@memex/core` `composer.ts`, `@` picker). `#tag` waits until tags come back (`SHOW_TAGS_UI` is off)
- [x] Filing affordances on entries: space chips ✓, one-press suggestions ✓, “File to…” ✓ (2026-10-25); drag to a sidebar space ✓ 2026-11-01 (Journal entries, Library cards, list and Table rows, Tasks rows; multi-select drags the selection; every filing has Undo; `docs/tasks-view.md`)
- [x] A real Tasks view ✓ 2026-11-01 (`/tasks`: open tasks across spaces by space or due date, Space filter, tick with Undo, Done list, due dates, inline add on the composer's syntax, ⌘K Go to; `docs/tasks-view.md`)
- [x] ~~Back-office rail~~ → decision 12B: Inbox in the sidebar and a header button, both only while suggestions wait; the tray opens beside the feed (`/?inbox=1`); Tasks in the sidebar ✓ 2026-10-25 (its own view since 2026-11-01)
- [ ] Space page becomes a board (pinned sites · tasks · notes · saves) with a scoped Journal column
- [x] Library: Table view and saved views (Unfiled, From X, From YouTube) ✓ 2026-11-02 (decision 15A: tabs over the Library with counts, Save view, Source/Space/Sort, Table with sortable columns; spec `docs/library-views.md`; saved views in `saved_views`, exported to `views/*.json`)
- [ ] Mobile web gets the same Journal-first layout (bridge until Phase 6) — *2026-11-01: not a v1 goal; v1 is desktop web and the phone gets the Expo app. Keep mobile web usable, no new layout work*

### Phase 2 — The seam + walk-away export · **v1**
*2026-11-01: the export script is the v1 walk-away guarantee; `packages/core` is what the Expo app shares with the web. The `Repository` interface keeps Supabase as the only adapter in v1.*
- [x] npm workspaces with `packages/core` ✓ 2026-11-01. The web app stays at the repo root (moving it to `apps/web` is churn with no v1 payoff); `api/`, `scraper/`, `extension/` keep their own installs for now
- [x] Move types, `streamItems`, entry model, composer parsing, filters, source registry into core; Vitest for them (first tests in the repo) ✓ 2026-11-01, CI runs them on every push
- [x] `Repository` interface (`auth`, `links`, `notes`, `tasks`, `tags`, `spaces`, `jots`, space membership, `apiTokens`, legacy `projects`); Supabase is its one adapter (`@memex/core/supabase`) ✓ 2026-11-01; `views` ✓ 2026-11-02 (15A). An in-memory adapter with demo data (`@memex/core/memory`) backs dev fixture mode
- [x] Remove direct `supabase` imports from components into the auth adapter ✓ 2026-11-01 (none left anywhere in `src/` outside `src/data/repository.ts`)
- [x] Design tokens exported as TS from core ✓ 2026-11-01 (`tokens/`; a test keeps them matched to `pastel-sky.css`)
- [ ] `docs/vault-format.md` v1 + fixture vault + a parser in core with a round-trip test
- [ ] **Export script** (`scripts/export-vault.mjs`): Supabase → vault folder, including downloaded images. Run it on demand or nightly. From here on, walk-away is real and agents can analyze the folder (§3.6 files path)

### Phase 3 — Capture: extension (parallel) · **v1**
*2026-11-01: memex-api's first deploy and `GET /api/lookup` landed (commit `28f283c`, guide in `docs/extension-setup.md`).*
- [ ] Ops: deploy v0.2 for real (checklist in `docs/browser-extension-plan.md`)
- [x] Data model ✓ 2026-11-01: `source` (platform) + `source_id` + `lists` + `captured_by` (+ `captured_client`, `url_key`) on links, additive (older rows keep their tag); unique on `(user, source, source_id)`, normalized-URL fallback; rules in `@memex/core/capture` for memex-api and the MCP write tools. Still open: keep the raw `capture` block
- [x] YouTube likes ✓ 2026-11-01 (extension v0.3.0): link with thumbnail, title, “Channel · length” (matching after pond, MIT)
- [ ] Already-saved badge ✓ and post-capture space ✓ (2026-11-01); still open: post-capture tags, per-source and per-board default space
- [ ] Captures appear in the Journal as grouped auto-save entries (falls out of Phase 1)

### Phase 4 — Vault backend (leave Supabase) · **v2**
*2026-11-01: moved to v2. Until then, production backups are `scripts/backup-supabase.sh` → `~/memex-backups/` (restore tested, `docs/backups.md`), which covers 4g's intent for v1.*
- [ ] 4a Spike (time-boxed): custom outbox/change-feed on a Durable Object vs LiveStore, on web + Expo, with 5k fake items. Pick one
- [ ] 4b Writer: Durable Object applies changes in order, journals multi-file writes to R2, emits the change feed, maintains the SQLite/FTS index; “rebuild index from vault” command + CI test
- [ ] 4c `api/` grows into the backend; `/api/capture` keeps its contract so the extension doesn't change
- [ ] 4d Web client on a local replica (OPFS SQLite) + outbox, behind the core `Repository`
- [ ] 4e Auth: passkey sign-in + device pairing; tokens for desktop, phone, extension
- [ ] 4f Migration: the Phase 2 export → import into the vault; verify counts and a sample by eye; run both side by side for a week, then switch
- [ ] 4g Backups: R2 versioning or nightly snapshot; document restore and test it once
- [ ] 4h Retire Supabase: delete the adapter, the migrations folder becomes history, cancel the project

### Phase 5 — Desktop app (Tauri) · **v2**
*2026-11-01: moved to v2, including the re-sync safety net (5b–5d) that could have started after Phase 3.*
Re-sync only needs `/api/capture`, so 5b–5d can start after Phase 3, before the backend move. The mirror needs Phase 4.
- [ ] 5a Tauri shell around the web build; device pairing; tray + global jot shortcut; auto-update from GitHub Releases
- [ ] 5b Re-sync engine: scheduler, per-account scope, watermark + early stop, rate governor with persisted cooldowns, challenge detection, status line + history
- [ ] 5c Harvesters, one site at a time: X bookmarks → Pinterest saves (+ boards) → YouTube likes. Each: sign-in window, list walk, `Capture` mapping, fixtures
- [ ] 5d Collections → spaces mapping (Pinterest board → space)
- [ ] 5e Mirror `~/memex` from the change feed (after Phase 4); optional nightly git commit; later, folder watching for Obsidian edits

### Phase 6 — React Native app (Expo) · **v1 on TestFlight**
*2026-11-01: v1 ships to TestFlight on today's backend; offline replicas + sync wait for the v2 vault backend. It reaches data through `@memex/core`'s Supabase adapter (decision 20, resolved 2026-11-01).*
- [x] App shell: Expo Router tabs (Journal · Library · Spaces · Inbox per decision 16A), theme from core tokens, dark mode — *2026-11-01, `apps/mobile` (`docs/mobile.md`); Journal feed read-only so far*
- [x] Journal feed + composer (keyboard-avoiding, chat-style list), entry cards per type — *2026-11-01 (M6-B): composer on core's syntax, tick / delete with Undo / filing in the feed*
- [ ] Share extension (iOS) / share target (Android) → entry, optional space
- [ ] Library: spaces row + masonry grid; link detail; open in browser — *2026-11-01 (M6-B): masonry of links with source chips and search, link detail, open in the in-app Safari; the spaces row is still to do*
- [ ] Note view/edit via a DOM component wrapping the web `MarkdownEditor`
- [ ] Offline + sync via core (**v2**, needs Phase 4); TestFlight (**v1**)

### Phase 7 — Agents (MCP) · **v1 (7a–7d), v2 (7e)**
The files path works from Phase 2. The server path:
*2026-11-01: this is v1's headline goal: a hosted MCP server on memex-api so Grok Bots (and Claude) can read and store project context. In v1 it runs on memex-api over Supabase rather than the vault index (decision 19). 7b only if a client needs OAuth; Grok Bots and Claude Code use bearer tokens.*
- [x] 7a Remote MCP on the Worker with read tools (§3.6), bearer-token auth ✓ 2026-11-02 (M3-A): `/mcp` on memex-api, per-client agent tokens with scopes, expiry, revocation, rate limit and an audit log; smoke-tested with the MCP SDK client (`docs/mcp.md`). Still to come from §3.6: `get_images` (7c), search filters by tag
- [ ] 7b OAuth so it works as a claude.ai / Claude Desktop custom connector (reuse passkey sign-in). Designed 2026-11-02 in `docs/mcp-auth.md` (M3-C): needed for grok.com and claude.ai connectors, not for the xAI API or CLIs
- [ ] 7c `get_images` returning thumbnails; canned prompts (weekly review, recent themes, space summary)
- [ ] 7d Write tools: `add_jot` direct; everything else lands as Inbox proposals you approve
- [ ] 7e (**v2**) Semantic search: embeddings (Workers AI + Vectorize, or local in the desktop app), `similar` / `clusters` / `themes`

### Later
Encryption at rest for the vault, two-way Obsidian edits, more sources (Are.na, Reddit, Instagram, Cosmos: pond has harvesters for each), new-tab page, opt-in AI filing suggestions powered by the same embeddings.

## 6. Guardrails for work done before each phase lands

- **New data access goes in a hook's `xxxApi` object, never in a component.** No new `supabase` imports in components.
- **Avoid Supabase-only features** (RPC functions, triggers that carry business logic, realtime channels). Each one is something to port.
- **New schema must map to the vault cleanly:** a stable id, plain fields, membership that could live on the item (`spaces: [...]`). If a feature stores something the user made or chose, it needs a home in §3.3, or it breaks the walk-away guarantee.
- **Logic that isn't UI goes in plain TS modules** (`src/utils`), free of React DOM, so it can move to `packages/core` unchanged.
- **The extension and the desktop app talk to `memex-api`, never to Supabase.** The Expo app is the exception (decision 20): it uses `@memex/core`'s Supabase adapter like the web app.
- **Data access goes through the `Repository` in `packages/core`.** Add a method to the interface and the adapter; nothing in `src/` imports supabase-js.
- **UI work on the stream should assume it becomes the Library**, and Journal work should assume it becomes home.
- **Use the words in `CONTEXT.md`** in code, copy and docs.
- **Follow the safety rules in `CLAUDE.md`** (added 2026-11-01): back up before any migration, additive migrations only without Ryan's sign-off, never delete or bulk-modify Ryan's data unless he asks, never commit secrets, label test data.

## 7. What stays true from VISION.md

The primitives (note, link, task), spaces as cross-cutting contexts, one tag vocabulary, two-second capture, markdown notes, single-user, the non-goals (no team features, no block editor, no project management), and the Pastel Sky design system.

## 8. Decisions

| # | Decision | Options | Status |
| --- | --- | --- | --- |
| 1 | Feed direction | Newest at bottom, composer below (chat) · newest at top (today's Journal) | **Newest at bottom, composer below** (2026-10-24) |
| 2 | Where the vault lives | R2 in your Cloudflare account + desktop mirror · synced folder only · git | **R2 + mirror** (2026-10-24). Lands in v2 (2026-11-01) |
| 3 | Desktop app | Browser only · Tauri | **Tauri**, for re-sync, mirror and global shortcut (2026-10-24). Lands in v2 (2026-11-01) |
| 4 | Sync engine | Custom outbox/change feed on the writer · LiveStore | Open, decided in the 4a spike (v2). Leaning custom |
| 5 | Web platform | Keep Vite + React DOM · Expo web | Keep Vite |
| 6 | AI in filing | None · rules · opt-in AI | Rules first; AI later, on the MCP/embeddings work |
| 7 | Tasks tab on mobile | Own tab · saved view in Library | Leaning own tab |
| 8 | Images | Hotlink CDN URLs · download into the vault | **Download** (walk-away needs it) (2026-10-24) |
| 9 | Capture scope | Which lists per site, for the extension and re-sync | **X bookmarks, Pinterest saves, YouTube likes.** No X likes, no Watch later (2026-10-24) |
| 10 | MCP auth order | Token (Claude Code) first, OAuth (claude.ai) second · both at once | **Token first, OAuth second** (2026-10-24) |
| 11 | Journal entry style (round 5 mocks) | 11A rich · 11B quiet · 11C mixed · 11D tuned | **11D tuned**: picture galleries and bubbles for visual saves, compact rows for text-only things (2026-10-24) |
| 12 | Desktop layout | 12A right rail · 12B sidebar as tab bar · 12C no sidebar | **12B**: the sidebar is the desktop tab bar (Journal, Library, Inbox, Tasks, spaces); the Inbox tray appears only when something is waiting (2026-10-24) |
| 13 | Filing | 13A “File to…” menu · 13B inline suggestions · 13C triage | **13B** with five rules (2026-10-24): unfiled is a finished state (no empty chip, no warning); suggest only when likely right, always with its reason; the Inbox counts waiting suggestions, not every unfiled thing; “File to…” on every entry, and each use teaches the guesser; filing one save from a burst lights up its neighbours. Signals: same-site votes, saved within ~20 min of a filed save, similar title words; later Pinterest board → space mapping, X folders, embeddings. Measured on real data: about 2 in 3 filed links would have got a correct guess (website-only: 1 in 5). Tune with usage |
| 14 | Space page | 14A board columns · 14B scoped Journal + board column | **14B** (2026-10-24) |
| 15 | Library views | 15A tabs over the content · 15B nested in the sidebar | **15A**; the Table ships as a toggle in either view (2026-10-24) |
| 16 | Phone layout | 16A tab bar · others | **16A tab bar**: Journal, Library, Spaces, Inbox; composer above the tab bar (2026-10-24) |
| 17 | Desktop Journal layout | 17A as shipped · 17B notebook page + grouped jots · 17C + time gutter · 17D + today column | Open (mocks round 6, `/mocks`, 2026-10-28); recommended **17B** |
| 18 | Release split | One line of phases toward the vault · v1 on today's stack, then v2 | **v1 / v2** (2026-11-01, approved by Ryan). v1 on Supabase + Cloudflare Workers: Journal-first desktop web, live capture (extension + memex-api), hosted MCP on memex-api for Grok Bots (headline), Expo app on TestFlight, walk-away export. v2: vault backend (leave Supabase), Tauri desktop, embeddings. v1 is single-user; its screens go on Ryan's public portfolio |
| 19 | Where v1's MCP server runs | memex-api Worker over Supabase · wait for the vault index | **memex-api over Supabase** (2026-11-01, follows from 18); tools keep the §3.6 shape so they move to the vault index in v2 unchanged |
| 20 | How the v1 Expo app reaches data | Through memex-api (§6: new clients never talk to Supabase) · Supabase adapter in `packages/core` | **Supabase directly via `packages/core`** (2026-11-01, Ryan). Web and Expo share one client factory (`createMemexClient`, injectable auth storage: web storage vs. Expo SecureStore) and the same Repository; RLS protects each user's rows. memex-api stays focused on capture and the hosted MCP |
