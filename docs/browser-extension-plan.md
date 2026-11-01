# memex Browser Extension — Plan & Tracker

The living plan for the capture extension (`extension/`) and the API behind it
(`api/`). Check items off as they land and record decisions here.
Cross-project ops steps also appear in `TODO.md`.

**Status (2026-10-18):** v0.2 is built and passes an end-to-end test in
Chromium against a stub API, but it has **never been deployed or used for
real**. Next step: the ops checklist below.

## Goal

Save anything to memex without copy-paste:

1. One click, a shortcut or right-click on any page.
2. Automatically when you use a site's own save button (bookmark on X, save on
   Pinterest), so memex becomes the one place those saves end up.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Backend contact | Through the `memex-api` worker with a personal access token, never Supabase directly | A small credential; the extension doesn't change when we leave Supabase |
| Tooling | WXT + TypeScript (moved from vanilla on 2026-10-18) | Content scripts in the page's MAIN world, a background worker and a Firefox build; same stack as pond |
| X trigger | **Bookmarks only** — likes ignored | User decision 2026-10-18 |
| Where automatic saves land | **Home, untagged** | User decision 2026-10-18 |
| Provenance | `links.source` column (`extension`, `x:bookmark`, `pinterest:save`; NULL = saved in the app) | Lets us filter by origin later; user OK'd the migration |
| Provenance, v0.3 (2026-11-01) | `links.source` = platform (`x` · `pinterest` · `youtube` · `web`) plus `source_id`, `lists`, `captured_by`, `captured_client`, `url_key` (additive migration `20261101120000`). Unique on (user, source, source_id); normalized-URL fallback. Older rows keep their tag; readers understand both | ROADMAP Phase 3 data model; the same rules (`@memex/core/capture`) serve the MCP write tools |
| YouTube | **Likes only** (`/youtubei/v1/like/like`), no Watch later | Decision 9 |
| Duplicates | Server-side: return the existing link (`duplicate: true`) instead of inserting. X/Pinterest match on post/pin id | Passive capture would otherwise create duplicates; Undo must never delete an older link |
| Detecting saves | Watch the site's own network call (`CreateBookmark`, `*Resource/create`), not its buttons | Survives redesigns and non-English UIs; borrowed from pond |
| Metadata for pages behind a login | Read from the page by the extension; client values win over the scraper | The scraper hits X's login wall |
| Unsave / unbookmark | Does **not** remove the link from memex | memex keeps what you saved |
| Token storage | `chrome.storage.local`, not `sync` | Don't copy the token to every browser on the Google account |
| Browsers | Chrome first; a Firefox build exists but is untested; Safari only if asked | Safari needs an Xcode wrapper |
| Phone capture | Later, together with the mobile / React Native work (`ROADMAP.md` Phase 6) | User decision 2026-10-18 |
| Account sync (pond-style walk of your saved lists using your login) | ~~Not doing it~~ **Reversed 2026-10-24:** the Tauri desktop app does it as a periodic re-sync safety net, not the extension (`ROADMAP.md` §3.5, Phase 5). The extension stays the instant path; the server dedupes on `(source, sourceId)` | Catches saves the extension missed (browser closed, other device, phone app) without giving the extension `<all_urls>` + cookies |

## Ops checklist — get v0.2 running (needs your accounts)

Server side done 2026-11-01 (API at `https://memex-api.joyfulsystems.workers.dev`); the rest, step by step: `docs/extension-setup.md`.

- [x] `supabase db push` — applies `20261018120000_add_link_source.sql` (and anything else pending)
- [x] Deploy the API worker:
  - [x] `cd api && npm install && npx wrangler login`
  - [x] `npx wrangler secret put SUPABASE_SERVICE_KEY` (service-role key)
  - [x] Set `SCRAPER_URL` in `api/wrangler.jsonc` → `https://memex-scraper.joyfulsystems.workers.dev`
  - [x] `npm run deploy` → note the `memex-api.<account>.workers.dev` URL
- [ ] memex → Settings → Access tokens → create a token (name it after the device)
- [ ] `cd extension && npm install && npm run build` → `chrome://extensions` → Developer mode → Load unpacked → `extension/.output/chrome-mv3`
- [ ] Extension settings: API address + token (+ app address if not the workers.dev one) → Test connection → Save
- [ ] Reload open X / Pinterest tabs

## Verify on the real sites

- [ ] ⌘⇧S on an article → saved with title/image; Undo removes it; saving again says “already in memex”
- [ ] Right-click → Save page / Save link
- [ ] Bookmark a post on X (timeline **and** post page) → pill on the page; the link in memex has the post text, author and image
- [ ] Bookmark a post with a quoted tweet → text is the outer post, not the quote
- [ ] Like on X → nothing saved
- [ ] Save a pin on Pinterest (grid Save button **and** board picker **and** from the pin's own page) → link with image + scraped title
- [ ] Turn X / Pinterest off from the popup's Auto-save switches (and from right-click on the toolbar icon) → nothing saved, no tab reload needed; the settings page and menu checkmarks follow
- [ ] Stop the API / break the token → badge count / `!`, entry in settings; fix it → Retry now → saved
- [ ] The links show up in the app normally (the `source` column doesn't break anything)

## Built

- [x] **Phase 1 (2026-09-06):** `api/` worker (token auth, `POST /api/capture`, `DELETE /api/links/:id`, spaces/tags), `api_tokens` migration + Settings UI, vanilla MV3 popup extension
- [x] **v0.2 (2026-10-18):**
  - WXT + TypeScript rewrite; a background service worker is the single capture path
  - Automatic capture of X bookmarks + Pinterest saves (MAIN-world fetch/XHR interception), with metadata read from the page and per-site toggles
  - In-page toast + sound; toolbar badge flash
  - Context menu: save page / save link
  - Offline / failure queue with backoff, badge count, and waiting/failed lists + Retry now in settings
  - API: server-side dedupe (id-aware for X/Pinterest), client metadata (`description`, `image`, `favicon`), `source`
  - `links.source` migration; settings moved to `storage.local` (one-time move of v0.1 settings out of `sync`)
  - Popup: “already in memex” state (no Undo), “saved for later” state, Open in memex (`/home?link=<id>`)
- [x] **Auto-save switches up front (2026-10-19):** X / Pinterest switches at the bottom of the popup, plus checkbox items on the toolbar icon's right-click menu (to flip them without the popup's save-on-open). All three surfaces stay in sync; changes apply to open tabs immediately. Also fixed every popup state showing at once (`.state` overrode `hidden`)

## Next

- [x] **Already-saved badge** ✓ 2026-11-01 (v0.3.0) — blue ✓ on the toolbar icon for tabs already in memex (`GET /api/lookup`, cached, off in incognito, toggle in Options). The popup still opens to “already in memex” via the deduping capture
- [x] **Post-capture space** ✓ 2026-11-01 (v0.3.0) — “Add to a space” picker in the popup after a save (`POST /api/links/:id/spaces`). Tags after the fact still need a route
- [x] **YouTube likes** ✓ 2026-11-01 (v0.3.0) — thumbnail, title, “Channel · length”
- [x] **Source ids** ✓ 2026-11-01 — X / Pinterest / YouTube captures send `source` + `sourceId` + `list`; the server dedupes on them
- [ ] **“Why I saved this” note** in the popup — needs the `links.note` column (see `TODO.md`); until then `note` is stored as the description
- [ ] **Show `source` in the app** — a small “from X” / “from Pinterest” mark on cards, and possibly a filter
- [ ] **Save the selection as a note** (right-click on selected text → markdown note with the source URL) — needs a `POST /api/notes` route
- [ ] **Save image** context-menu item (save the image URL as a link with that preview, or later as an image primitive)
- [ ] **App-side dedupe** — the web app's own “Add link” still inserts duplicates; make it use the same lookup (or a unique `(user_id, url)` index once existing duplicates are cleaned up)
- [ ] **Better X metadata** — videos (currently the poster frame only), multi-image posts (first image only), long posts truncated by “Show more”, X Articles
- [ ] **Store distribution** — Chrome Web Store listing (privacy policy, screenshots); a pinned extension `key` so the ID stays stable

## Later / maybe

- [ ] More sites, cheapest first: Are.na, Cosmos, Reddit save — pond has working matchers for each (`apps/extension/sources/*` in raphaelsalaja/pond, MIT)
- [ ] Instagram / Threads save — pond supports them, but they rely on Meta's internal operation names and English labels; brittle
- [ ] One-time import of existing X bookmarks / Pinterest boards from the sites' data exports
- [ ] Popup search across links/notes/tasks (mini command palette)
- [ ] New-tab page option showing the memex dashboard
- [ ] Turn this page into a task
- [ ] Firefox: test the `build:firefox` output, AMO listing
- [ ] Phone capture (iOS Shortcut / Android share target / React Native share extension) → `POST /api/capture` — with the mobile work

## Known limits / fragility

- Detection depends on X's `CreateBookmark` operation name and Pinterest's `*Resource/create` endpoints. If saves stop arriving, check those regexes first (`extension/sources/*.ts`).
- X metadata depends on `data-testid` hooks (`tweetText`, `User-Name`, `tweetPhoto`). If they change, saves still arrive, just with less metadata; the scraper fills what it can.
- Pinterest's `id` fallback in the request body could, in theory, pick up a non-pin id on unusual create calls; the scraper would then fail and the link would have no title.
- After installing or updating the extension, already-open X/Pinterest tabs need a reload before they're watched.
- The MAIN-world interceptor is installed even when a site toggle is off; the toggle is checked before anything is sent. Switch to dynamic `scripting.registerContentScripts` if that ever matters.
