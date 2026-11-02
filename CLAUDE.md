# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EX_P02 is the codebase for **memex**, a personal working-memory system built as a React web app with a Supabase backend. The app is a single **mixed stream** of notes, links, and tasks rendered as one grid of cards inside a frosted-glass stack, with element-type and tag filter chips above the grid and omnibar capture. The left sidebar is **Home** (everything) followed by the list of **spaces**; selecting a space scopes the stream and the header's super favorites to that space. Notes/links/tasks are data primitives; spaces are the cross-cutting contexts that filter and compose them (see `VISION.md`).

## Safety rules for agents

memex holds Ryan's real data in one production Supabase project; there is no staging copy. These rules apply to every agent and every task, whatever the permission mode:

1. **Back up before any migration.** Run `scripts/backup-supabase.sh` and confirm it finished (folder path + row counts) before `supabase db push` or any SQL against production. Restore steps: `docs/backups.md`.
2. **Only additive migrations without Ryan's sign-off.** New tables, columns, indexes and policies are fine. Dropping or renaming anything, changing a column's type, rewriting rows, or tightening a constraint that existing rows might break needs Ryan's explicit OK in the conversation first.
3. **Never delete or bulk-modify Ryan's data unless he asks.** That covers the app, scripts, the SQL editor and the API. Backfills and data fixes run with `--dry-run` first, and the real run needs his go-ahead.
4. **Never commit secrets.** Keys, tokens and passwords live in gitignored env files (`.env`, `.env.*`, `.dev.vars`) or `wrangler secret`, never in code, docs or commit messages. Inspect env files by variable name only; don't print values. CI runs gitleaks on every push and PR; run `gitleaks git --redact --log-opts="--all" .` locally when unsure (`SETUP.md` → “Secrets and backups”).
5. **Label any test data clearly.** Anything an agent creates in production (jots, links, notes, tasks, spaces, tokens) starts with `[test]` in its title or text so Ryan can find and remove it, and the agent says what it created in its report. Prefer a local Supabase stack for anything heavier.

## Documentation Map

- `TODO.md` — living checklist: the user's pending ops steps (deploys, migrations, secrets) and next build tasks. Check it at session start; update it as work lands.
- `ROADMAP.md` — **the north star; read it before any non-trivial task.** memex closes a loop: total capture → visual display → agent analysis. Requirements: Journal as home (Library and space boards behind it); a markdown vault you own as the source of truth, written by one Durable Object and synced to local replicas (Supabase goes away); a walk-away guarantee (everything, images included, lives in files); a React Native app; rich automatic capture; a Tauri desktop app with a re-sync safety net and the `~/memex` mirror; agent access via MCP. Also: phases, difficulty, guardrails for interim work (§6), decisions (§8). Wins over `VISION.md` where they disagree. UI mockups: `docs/mocks/2026-10-24-journal-first.html`.
- `CONTEXT.md` — domain language (Journal, Entry, Jot, Item, Space, Library, Source, Capture, Vault, Writer…) with words to avoid. Use these terms in code, copy and docs.
- `VISION.md` — production vision: primitives, spaces model, non-goals. Its shell and data-model sections are superseded by `ROADMAP.md`.
- `PRODUCT.md` — positioning, users, brand personality, design principles.
- `DESIGN.md` — design-system truth. The live Links dashboard is the canonical surface and the template every new module inherits. When code and `DESIGN.md` diverge, the dashboard implementation wins; update the doc.
- `JOYFUL_SYSTEMS.md` — the abstract JOYFUL_SYSTEMS design language (palette, spacing, radius, contrast, motion, sound). Product-agnostic; memex's canvas swatches and future color decisions derive from it.
- `GUI.md` + `gui/` — "Pastel Sky" Graphical theme guidance (theme values, component assignments, font/icon setup). For UI work, follow GUI.md and use the graphical-ui, graphical-convert, or graphical-audit skills in `.agents/skills/` as appropriate.
- `SETUP.md` — local development setup.
- `docs/ex_p02_prd.md` — original PRD, superseded by `VISION.md` (kept for history).
- `docs/library-views.md` — decision 15A as built: saved-view tabs, Source/Space/Sort, the Table, URL params, `saved_views` storage, and the product choices Ryan can reverse.
- `docs/database-migrations.md` — Supabase CLI migration workflow.
- `docs/vault-format.md` — the vault format (schema 1: Markdown + YAML frontmatter, daily Journal notes, spaces, assets, manifest), the walk-away export (`scripts/export-vault.mjs` → `~/memex-vault/`, read-only through the Supabase CLI) and its nightly launchd job. Fixture vault with fake data: `docs/vault-fixture/`.
- `docs/backups.md` — production backups (`scripts/backup-supabase.sh` → `~/memex-backups/`) and tested restore commands.
- `docs/browser-extension-plan.md` — planned browser extension (one-click capture) and the `memex-api` worker/token auth approach that decouples it from Supabase.
- `scraper/README.md` — memex-scraper Cloudflare Worker (link metadata: title/description/preview image); deploy + backfill instructions.
- `api/README.md` — memex-api Cloudflare Worker: token-authenticated capture API for the extension (routes, deploy, security model). Tokens are managed in Settings → Access tokens (`api_tokens` migration).
- `packages/core/README.md` — `@memex/core`: what's shared across clients, its public API, the `Repository` interface and the Supabase adapter (web + Expo setup).
- `extension/README.md` — memex capture browser extension (MV3, WXT + TypeScript): toolbar/⌘⇧S/context-menu save, and automatic capture of X bookmarks and Pinterest saves; install + configure. Its roadmap and open items live in `docs/browser-extension-plan.md`.

## Development Commands

```bash
npm run dev                # Start development server with Vite
npm run build              # Build for production (TypeScript check + Vite build)
npm run lint               # Run ESLint with TypeScript support
npm run typecheck          # tsc for the web app + packages/core (core is checked without DOM types)
npm test                   # Vitest unit tests (packages/core + src/**/*.test.ts); npm run test:watch to iterate
npm run preview            # Preview production build locally
npm run deploy             # Build + deploy to Cloudflare (Workers static assets, root wrangler.jsonc; .env.production overrides .env at build)
VITE_MEMEX_FIXTURES=1 npm run dev   # The whole app on made-up demo data in memory (signed in, no network, nothing saved): UI checks without an account, portfolio screenshots. =signed-out starts signed out. Dev only (@memex/core/memory)

# Environment Setup — create .env with:
# VITE_SUPABASE_URL=your_supabase_url
# VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
# VITE_SCRAPER_URL=your_memex_scraper_worker_url   (optional; enables link metadata + preview images)
```

## Architecture Overview

### Technology Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Custom CSS on the **Pastel Sky** theme — token values in `src/styles/pastel-sky.css`, shared component treatments in `src/styles/components.css`, layout and legacy `--bookmark-*` aliases (now pointing at Pastel Sky tokens) in `src/index.css`
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **State Management**: Zustand global store
- **Data Fetching**: React Query (TanStack Query)
- **Routing**: React Router v7
- **Shared logic**: `packages/core` (`@memex/core`, npm workspace) — see Core Structure

### Core Structure
- **`packages/core` (`@memex/core`)**: the logic the web app, the Expo app (Phase 6) and memex-api's MCP server share (ROADMAP §3.1). Pure TS: no React, no DOM, no Supabase client; source-only (no build step). Domain types (`types.ts`), item types, the Journal model (`journal/feed.ts`) and filing suggester (`journal/filer.ts`), composer syntax (`composer.ts`), the Library's filters (`stream/filters.ts`) and `StreamItem` (`stream/items.ts`), the source registry (`sources.ts`), URL/markdown/link/time helpers, and design tokens (`tokens/`: canvas swatches, OKLCH maths, space colours, Pastel Sky constants). Its README lists the public API
- **Data access**: the `Repository` interface (`packages/core/src/repository.ts`) covers everything the app reads and writes. `@memex/core/supabase` holds the v1 adapter (`createSupabaseRepository`) and `createMemexClient` (one Supabase client factory with injectable auth storage; decision 20: web and Expo both use it, RLS protects rows). The app builds one repository in `src/data/repository.ts`; hooks in `src/hooks/` wrap it in React Query, and `SessionContext` / the auth pages use `repository.auth`. Nothing else in `src/` imports supabase-js
- **Authentication**: Supabase Auth (email/password + GitHub OAuth); session flows through `SessionProvider` / `useSession` (`src/context/SessionContext.tsx`); `AuthProtectedRoute` guards authenticated routes
- **Journal (home, `/`)**: `src/pages/JournalPage.tsx` (2026-10-25, ROADMAP Phase 1) — every jot, link, note and task in one chronological feed, newest at the bottom, composer below. Model in `@memex/core` (`journal/feed.ts`: entries, day separators, runs of saves from one platform; `journal/filer.ts`: the filing suggester and the Inbox), data via `src/hooks/useJournal.ts`, renderers in `src/components/journal/` (11D: jots are bubbles, tasks lines, platform saves with pictures stay big as galleries, plain links and notes compact). Composer syntax in `@memex/core` (`composer.ts`): plain text → jot, lone URL → link, `[] ` → task, ⌘/Ctrl↵ → note, `@Space` files it (picker on `@`). Filing (decision 13): space chips, a dashed one-press suggestion chip with its reason, “File to…” in hover actions. The Inbox (recent unfiled items with a suggestion) shows in the sidebar and as a header button only while non-empty; `?inbox=1` opens its tray. `RootRoute` renders the Journal inside `MemexShell` when signed in, the landing page otherwise
- **Library**: `src/pages/StreamPage.tsx` — the mixed stream; mounted at `/library` (everything) and `/spaces/:spaceId` (one space). Decision 15A (2026-11-02, `docs/library-views.md`): saved-view tabs over the content in `/library` only (`components/library/LibraryViewTabs.tsx`: Everything · Unfiled · From X/Pinterest/YouTube · saved views · Save view; each tab is a link; the lit tab is derived from the URL's filters), and a third layout, the Table (`components/library/LibraryTable.tsx`: sortable columns, row keys ↑/↓/Enter/X/Delete, same selection and Undo). View logic, sort and columns live in `@memex/core` (`stream/views.ts`, `stream/sort.ts`, `stream/table.ts`); saved views in `repository.views` (`useSavedViews`). `/home`, `/links`, `/notes`, `/tasks` redirect into the Library, carrying their query (`src/router/LegacyModuleRedirect.tsx`). Sidebar order (12B): Journal, Library, Inbox (when waiting), Tasks (Library filtered to tasks for now), then spaces
- **Filtering model**: type chips (Notes · Links · Tasks) and tag chips above the grid (`src/components/StreamFilterBar.tsx`, logic in `@memex/core` `stream/filters.ts`), plus Source and (Library only) Space menus and a Sort menu (`components/library/MenuButton.tsx`, logic in `stream/views.ts` / `stream/sort.ts`); empty selection = show all; all live in the URL (`?type=`, `?tags=`, `?untagged=1`, `?source=`, `?space=unfiled,<id>`, `?sort=field:dir`, `?view=grid|list|table`); the open note is `?note=<id>`. A space page's scope comes from its route; a capture while the Space filter holds one space is filed there
- **Journal panel** (the pre-Phase-1 Journal, still in the Library and space pages until the 14B space board replaces it): the labelled "Journal" header button (shortcut J, count of today's jots) opens `src/components/stream/JournalPanel.tsx` docked right of the grid (desktop) or as a slide-over sheet (mobile), scoped to Home or the current space. Jot composer on top, then every jot newest first under day headers; each jot can become a note or task, or be deleted with Undo. Under each day's jots, one folded line sums up that day's activity ("4 links saved · 1 note · 2 done") and opens in place (today's starts open). Search filters jots; the calendar button jumps to a date; older days load as you scroll. Open state persisted in localStorage
- **Multi-select**: selection state lives in the Zustand store. Enter with Select, ⌘/Ctrl-click (or Shift-click for a range) on any card or row, or ⌘/Ctrl A for everything on screen; Esc exits. A floating `SelectionBar` (`src/components/stream/SelectionBar.tsx`) shows the count (plus how many the filters hide; selection survives filter/search changes, not space changes), Add to space (menu) and Delete (one Undo for the batch). Sidebar spaces stay add-to targets (`useAddToSpace`, shared with the bar): the header reads “Add N to…”, hover tints a row in that space's own hue and grows its dot into a “+” disc, a check and “+N” confirm the add, and spaces already holding the whole selection read “All in”. Cards and rows carry `data-item-key` so the page resolves modifier and range clicks in display order
- **Canvas theming**: user-selected OKLCH swatch drives the page canvas and Pastel Sky's accent roles (`--color-1`, `--cte-accent-text`, `--color-1-ink`) at runtime (`src/utils/canvasColor.ts` applies it; swatches and OKLCH maths in `@memex/core` `tokens/`); neutrals and surfaces stay on the theme; dark mode via `data-theme`

### Key Files
- `/src/components/ui/` — shared design-system primitives (FilterChip, ActionChip, FrostedStack, EmptyState, FeedbackToast, InlineCreateForm); compose these for new surfaces
- `/src/pages/StyleguidePage.tsx` — component catalog at `/styleguide` (auth-protected, unlinked); keep it updated when primitives change
- `/src/pages/MocksPage.tsx` — design-direction mocks at `/mocks` (auth-protected, unlinked); static compositions over real data for choosing UX options before building them
- `/src/router/index.tsx` — route definitions with nested protected routes
- `/src/pages/StreamPage.tsx` — the mixed stream (header | frosted stack: omnibar → filter chips → card grid)
- `/src/components/MemexSidebar.tsx` — Home + spaces navigation (also bulk-assign targets)
- `/src/components/StreamCard.tsx` — the text card anatomy; `NoteGridCard` / `LinkGridCard` (links without an image) only fill its slots. Image links use `stream/LinkPreviewCard`; both share one card surface and the `.memex-select-check` selection cue (components.css → “Stream cards”)
- `/src/components/StreamFilterBar.tsx` — type + tag chip rows
- `/src/components/NoteEditor.tsx`, `/src/components/ui/MarkdownEditor.tsx` — the note document column and its live-preview markdown editor (CodeMirror 6, lazy-loaded with the first opened note): the text stays plain markdown but reads rendered on the reading view's type scale; syntax markers show dimmed only on the cursor's lines (heading `#`s hang in the margin so text never moves); ⌘-click opens links, task checkboxes toggle in place. `MarkdownText` (react-markdown) remains the read-only renderer and the editor's loading fallback
- `/src/components/stream/JournalPanel.tsx`, `/src/hooks/useSelfMessages.ts` — Journal (jots + folded daily activity) and jot data
- `/src/components/stream/` — `JournalPanel`, `CommandBar` (search + capture palette), `MasonryLayout`, `LinkPreviewCard`, `LinkExpandedCard`, `TaskBand`, `StreamRow`
- `/packages/core/src/stream/items.ts` — `StreamItem` union, tag merging, search matching
- `/src/constants/modules.ts` — routes and URL param names (item types live in `@memex/core`)
- `/packages/core/src/types.ts` — domain + Supabase schema types
- `/packages/core/src/repository.ts`, `/packages/core/src/supabase/` — the `Repository` interface and its Supabase adapter; `/src/data/repository.ts` — the app's instance
- `/src/Providers.tsx` — provider composition

### Data Schema (current)
All tables user-scoped via RLS:
- **links** — URL + metadata (title, description, favicon, preview image), global super-favorite flag (Home header), ordering, and capture provenance: `source` (platform `x` · `pinterest` · `youtube` · `web`, written by memex-api since 2026-11-01; older captures hold a tag like `x:bookmark`, read with `parseSourceTag`; NULL = saved in the app), `source_id`, `lists` (`bookmarked` · `saved` · `liked`), `captured_by`, `captured_client`, `url_key` (migrations `20261018120000_add_link_source.sql`, `20261101120000_add_capture_provenance.sql`; unique on `(user_id, source, source_id)`). Capture/dedupe rules: `@memex/core/capture`
- **tags** / **link_tags** / **note_tags** / **task_tags** — shared tag vocabulary, many-to-many with each primitive
- **self_messages** — "Notes to Self": short chat-style messages, `profile_id` NULL = Home feed, otherwise one feed per space; `legacy_id` marks rows migrated from the legacy app (migration `20260907150000_add_self_messages.sql`, script `scripts/migrate-self-messages.mjs`)
- **profiles** / **profile_links** / **profile_notes** / **profile_tasks** — spaces (still named profiles in the DB) and their membership joins; `profile_links.is_super_favorite` pins a link to the header inside that space (migration `20260907120000_add_profile_link_super_favorite.sql`)
- **saved_views** — saved Library views (decision 15A): `name`, `definition` jsonb (`{ filters, sort?, layout? }`, read by core's `parseViewDefinition`), `position`; RLS per user (migration `20261101200000_add_saved_views.sql`); exported to `views/*.json`
- **projects** — legacy from the original PRD; superseded by spaces, slated for retirement

Planned (per `VISION.md`): **notes** (markdown body), **tasks**, and per-primitive space/tag join tables mirroring `profile_links` / `link_tags`.

### Design System
- Theme: **Pastel Sky** (Graphical) — see `GUI.md`, `gui/themes/pastel-sky.md` and `gui/themes/pastel-sky-components.md`. User-tinted canvas gradient under opaque Pastel Sky surfaces (stack, cards, popups)
- Typography: **Inter** (`@fontsource-variable/inter`, upright + italic axes) for every role (`--font-ui/brand/editorial/data`); sizes, line heights, and tracking come from `--size-*` / `--line-*` / `--letter-spacing-*` together; code keeps `--font-code`. The one exception is the `memex` wordmark: **Nunito Black** (`@fontsource/nunito`, `--font-wordmark`) in Joyful Systems blue `#2f55d6` with a white keyline, soft blue drop and split-gloss highlight, rendered only through `src/components/ui/Wordmark.tsx` (styles: components.css → “Wordmark”)
- Icons: Lucide outlined (`lucide-react`) via the adapters in `src/components/icons.tsx` / `StreamGlyphs.tsx`
- Color: the canvas swatch is the one intentional exception to the theme — it drives `--color-1` (primary fills, selection tint, focus ring) instead of Pastel Sky's teal; everything else uses the theme's neutrals/status colors
- Sidebar rows speak in their space's own hue (`--space-hue` inline; Home falls back to the canvas accent): hover is a light tint with the dot swelling, the current space a stronger tint with its label in the hue's ink, and add-to targets the loudest tint
- Depth is **Joyful Utility** (DESIGN.md → Elevation & Material): things you press are objects (raised material, hover swell, press settle); things you read are paper (lit edge, hue-tinted shadow, cards lift 2px, no scale). Gloss (`--control-gloss-image`) is reserved for primary and "on" states. Sidebar and list rows stay still. Tokens: `pastel-sky.css` (memex additions)
- Edges are box-shadow rings, never native borders: set `--edge` / `--edge-w` (registered, non-inheriting) and compose them in `box-shadow`
- New surfaces use theme tokens and the shared treatments in `src/styles/components.css` (Button, ghost icon button `.memex-icon-button`, Toggle chips, Navigation sidebar, Text field, Checkbox, Switch, Dialog, Drawer, Menu, Toast, stream cards); don't re-declare their appearance in `index.css` or per surface
- Text rules set the full type role together: `font-size: var(--size-X)` with `line-height: var(--line-X)` and `letter-spacing: var(--letter-spacing-X)`
- Honor `prefers-reduced-motion` and `prefers-reduced-transparency`

## Development Notes

### Current State
On 2026-10-15 the app adopted the **Pastel Sky** theme and a redesigned stream (directions chosen via `/mocks`, recorded in `TODO.md`). `StreamPage` now has: a page header (title, space dot, count, Edit space, Journal) with a labelled pinned-sites launcher row; a command palette (`src/components/stream/CommandBar.tsx`) in place of the omnibar; a masonry ⇄ list view toggle (`?view=`); image-first link preview cards in three styles — caption on hover, always overlaid, or an inset print with the caption beneath (Settings → “Link cards”); links that expand in place inside the grid (`?link=`, `MasonryLayout` animates neighbours); a task checklist band; undoable deletes (toast + Undo, no confirms); and a centered document-column note editor; and the Journal column (every jot by day, with each day's activity folded in). The footer bar is gone; settings live at the sidebar foot (phones: the wordmark opens a drawer). Stream styles are in `src/styles/stream.css`. On 2026-10-16 the legacy stream components (`LinkDetailsPanel`, `Omnibar`/`BookmarkOmnibar`, `TaskGridCard`, the list-row components, `ViewToggleFab`/`useViewMode`, `TagSelector`) and their CSS were removed; `/styleguide` now shows the live stream cards. The same day the dead CSS was pruned (`index.css` 8.6k → 4.6k lines; verified by diffing computed styles across the stream, Journal, palette, settings, selection, expanded link, note editor, list view, dark mode, styleguide and phone width) and a surface audit unified the icon buttons (`.memex-icon-button`, `.is-compact`), put the Journal toggle on `btn-secondary btn-compact`, mapped small outline buttons to the theme's outline colours, completed type roles (size + line + letter-spacing), and moved the note editor's leftover `index.css` rules into `stream.css`.

### Direction of Travel
Set by `ROADMAP.md` (2026-10-24). **2026-11-01: split into v1 and v2** (ROADMAP §5 “Releases”, decision 18). v1, on Supabase + Cloudflare Workers: Journal-first desktop web, live capture (extension + memex-api), a hosted MCP server on memex-api so Grok Bots can read and store project context (the headline), the Expo app on TestFlight, the walk-away export. v2: Phase 4 (leave Supabase), Phase 5 (Tauri), embeddings. The phases as first written:
1. **Phase 1** — Journal-first web on today's stack: the Journal becomes `/`, the stream becomes the Library (`/library`), spaces become working boards
2. **Phase 2** — monorepo + `packages/core` (`Repository` interface, Supabase as one adapter, first Vitest tests) + `docs/vault-format.md` + an export script that writes today's data as a vault folder (walk-away guarantee from here on)
3. **Phase 3** (parallel) — extension: deploy v0.2, `source`/`sourceId`/`lists` data model, YouTube likes, post-capture filing
4. **Phase 4** — leave Supabase: vault in R2 as source of truth, one Durable Object writer with journaled writes and a change feed, local replicas + outbox, passkey + device pairing
5. **Phase 5** — Tauri desktop app: re-sync safety net for X / Pinterest / YouTube (can start after Phase 3), `~/memex` mirror (after Phase 4), global jot shortcut
6. **Phase 6** — Expo React Native app on `packages/core`
7. **Phase 7** — agents: remote MCP server on the Worker (read tools, images, Inbox proposals, semantic search); agents can already read the exported files from Phase 2

Until those land, follow the guardrails in `ROADMAP.md` §6: data access goes through the `Repository` (add a method to the interface and the adapter; never import supabase-js in `src/`), no Supabase-only features, anything the user makes or chooses needs a home in the vault format, keep non-UI logic in plain TS modules.

### Conventions
- New features integrate with existing auth, routing, and React Query patterns; add providers in `src/Providers.tsx`
- Any new item type renders through `StreamCard` (leading slot · meta · title · excerpt · tags · hover actions) and joins the `StreamItem` union; don't invent a second card or list anatomy. Card surface and states live once in components.css (“Stream cards”) — don't re-declare them per card type
- Database changes go through Supabase CLI migrations (`docs/database-migrations.md`)
- Notes are stored as plain markdown text — keep them portable and encryptable
- Logic that isn't UI goes in `packages/core` (no React/DOM imports; `npm run typecheck` enforces no DOM there) with Vitest tests beside it

### Testing Strategy
Vitest (2026-11-01): unit tests sit beside the code as `*.test.ts` — mostly in `packages/core` (composer, Journal feed, filing suggester, filters, sources, URLs, tokens), plus `src/utils/authRedirect.test.ts` and `src/styles/pastelSky.test.ts` (fails if core's Pastel Sky constants drift from `pastel-sky.css`). Fixtures: `packages/core/src/testing/fixtures.ts`. CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and build on every push and PR, next to gitleaks. Playwright E2E later.
