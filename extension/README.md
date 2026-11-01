# memex capture — browser extension

Saves pages to memex through the memex-api worker. Manifest V3, built with
[WXT](https://wxt.dev) + TypeScript. Chrome first; `npm run build:firefox`
produces a Firefox build (untested).
Roadmap and decisions: `docs/browser-extension-plan.md`.

## What it does

- **Toolbar / ⌘⇧S (Ctrl+Shift+S):** the popup opens and saves the active tab.
  It shows the saved title, **Undo**, and **Open in memex**. If the page is
  already saved it says “already in memex” (the API dedupes) and has no Undo.
  After either, an optional **Add to a space** picker files the link
  (`POST /api/links/:id/spaces`); ignore it and the link stays in Home.
- **Already-saved ✓:** the toolbar icon shows a blue ✓ on tabs whose page is
  already in memex (`GET /api/lookup`, read-only, cached 10 min, never in
  incognito). While saves wait in the offline queue, the count shows instead.
  Turn it off in settings (“Mark pages already in memex”) to stop the lookups.
- **Right-click:** “Save page to memex” and “Save link to memex”.
- **X bookmarks:** bookmarking a post on x.com saves it to memex (Home,
  untagged; `source: 'x'`, `sourceId: <post id>`, `list: 'bookmarked'`). Likes are ignored. The post's text,
  author and image are read from the page, because the scraper can't see past
  X's login wall.
- **Pinterest saves:** saving a pin to any board saves
  `pinterest.com/pin/<id>/` (`source: 'pinterest'`, `sourceId: <pin id>`,
  `list: 'saved'`). The image comes from the page; title and description come
  from the scraper.
- **YouTube likes:** liking a video (watch page, Short, mini player) saves
  `youtube.com/watch?v=<id>` (`source: 'youtube'`, `sourceId: <video id>`,
  `list: 'liked'`) with its thumbnail. When the video is on screen, the title
  and “Channel · 12:34” come from the page; otherwise the scraper fills them.
  Dislikes and removing a like save nothing.
- Every capture also sends `capturedBy: 'extension'` and
  `client: 'memex-extension/<version>'`. The server re-derives the platform
  and id from the URL and dedupes on them (`api/README.md`).
- A small pill (“Saved to memex”) confirms background saves on the page.
- **Auto-save switches:** turn X / Pinterest / YouTube on or off from the bottom of the
  popup, or right-click the toolbar icon (doesn't save the current tab). Takes
  effect immediately, no tab reload.
- **Offline / failure queue:** if memex can't be reached, or the token is
  rejected, the save waits in a queue and retries with backoff (1 → 60 min,
  12 tries). The toolbar badge shows the count (`!` = token problem). Settings
  lists waiting and failed saves and has **Retry now**.

## How site watching works

X, Pinterest and YouTube each get two content scripts at `document_start`:

1. `*-watch.content.ts` runs in the page's MAIN world. `utils/intercept.ts`
   wraps `fetch`/`XHR` and watches for the site's own successful save call:
   - X: the GraphQL `CreateBookmark` call; the rotating query id is ignored.
   - Pinterest: `/resource/(Repin|RepinSave|BoardPickerSave|…)Resource/create`.
   - YouTube: `POST /youtubei/v1/like/like` (body `target.videoId`).

   It posts only the item id to the window.
2. `*.content.ts` runs in the isolated world (`utils/bridge.ts`). It accepts
   only a well-formed id for that site (digits for X and Pinterest, 11
   characters for YouTube), so the page can't inject URLs, and builds the URL itself.
   It reads metadata from the DOM (`sources/*.ts`) and sends the capture to
   the background worker, which calls the API.

Matching on the request name instead of buttons survives redesigns and
non-English UIs. If X renames `CreateBookmark`, Pinterest renames its
resources or YouTube moves its like endpoint, the regexes in `sources/*.ts`
are the only things to update (tests: `sources/watchers.test.ts`, run by the
root `npm test`). The
approach and interceptor are adapted from
[pond](https://github.com/raphaelsalaja/pond) (MIT).

## Develop / install

```bash
cd extension
npm install
npm run build          # → .output/chrome-mv3
npm run dev            # WXT dev mode with reload
npm run typecheck
```

1. Deploy `api/` (see `api/README.md`) and apply the migrations.
2. In memex: **Settings → Access tokens** → create a token, copy it.
3. `chrome://extensions` → **Developer mode** → **Load unpacked** →
   `extension/.output/chrome-mv3`.
4. In the extension's settings, paste the API address and token,
   **Test connection**, save. Reload any open X / Pinterest / YouTube tabs.

After `npm run build`, click ↻ on the extension card in `chrome://extensions`
and reload X / Pinterest / YouTube tabs.

## Files

- `wxt.config.ts` — manifest. Permissions: `activeTab`, `storage`, `alarms`,
  `contextMenus`, `tabs` (to read the current tab's URL for the ✓). Host
  access is limited to x.com, twitter.com, pinterest.com and youtube.com.
- `entrypoints/background.ts` — the single capture path: API call, queue,
  badge, context menus.
- `entrypoints/popup/`, `entrypoints/options/` — popup and settings pages.
- `entrypoints/{x,pinterest,youtube}{,-watch}.content.ts` — site watchers.
- `sources/` — per-site request matching and DOM metadata.
- `utils/` — API client, settings (in `storage.local`, so the token isn't
  synced across devices), queue, badge, already-saved mark (`savedMark.ts`),
  toast, sound, interceptor.
