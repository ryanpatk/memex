# Connect the memex capture extension

Status 2026-11-01 (evening): server side done and smoke-tested, now with capture
provenance (M2): `source` / `source_id` / `lists` / `captured_by` on links, dedupe on
the post / pin / video id, YouTube likes, an already-saved ✓ and a space picker in the
popup. Extension **v0.3.0**. You only need to make a token, load the extension and
paste the token in.

| What | Value |
| --- | --- |
| API address | `https://memex-api.joyfulsystems.workers.dev` (the extension's default) |
| App address | `https://memex.joyfulsystems.workers.dev` (default) or `https://memoryextension.app` |
| Extension build | `extension/.output/chrome-mv3` (in whichever checkout you built it) |

## Already done

- [x] **Database up to date.** All 11 repo migrations are applied in production,
      including `20261018120000_add_link_source.sql` (`links.source`) and
      `20261101120000_add_capture_provenance.sql` (`source_id`, `lists`, `captured_by`,
      `captured_client`, `url_key`; unique on user + source + source id). Backups
      were taken first: `~/memex-backups/2026-11-01T223417Z/` and
      `~/memex-backups/2026-11-01T233734Z/`
- [x] **API connected to the database.** memex-api has its `SUPABASE_SERVICE_KEY`
      secret (the project's `service_role` key, set via `wrangler secret put`)
- [x] **Smoke test.** `GET /api/tags`, `/api/spaces`, `/api/lookup`,
      `POST /api/capture` (new, duplicate, X / Pinterest / YouTube shapes),
      `POST /api/links/:id/spaces` (validation) and `DELETE /api/links/:id` all pass,
      with CORS headers for extension and app origins (memex-api version
      `151d132d-2b60-4a7a-9f57-79e3ba33abb6`)

## 1. Make a token

memex → Settings (sidebar foot) → **Access tokens…** → create one named after this
browser (e.g. `chrome-macbook`). Copy it now; it's shown once. (There's an unused
“Chrome Extension” token from 2026-10-20. Use a new one unless you still have it.)

While you're there, revoke **`agent-smoke-test`** and **`[test] agent-smoke-test-m2`**:
agents made them for the smoke tests.

## 2. Load the extension

```bash
cd extension && npm install && npm run build
```

Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** →
choose `extension/.output/chrome-mv3`. Pin the memex icon to the toolbar.

Already loaded v0.2? Rebuild, then click ↻ on the extension's card. v0.3.0 adds the
`tabs` permission (for the ✓) and YouTube site access; if Chrome asks, accept.
Anything still waiting in v0.2's offline queue keeps working (the API accepts the old
payloads).

## 3. Connect

Right-click the memex icon → **Options** (or **Settings…** in the popup):

1. **API address**: already `https://memex-api.joyfulsystems.workers.dev`
2. **Token**: paste the `mx_…` token
3. **App address**: leave it, or use `https://memoryextension.app`
4. **Test connection** → expect “Connected ✓” → **Save**

Then reload any open X, Pinterest and YouTube tabs so the content scripts attach.

## 4. Check it on real sites

- [ ] **⌘⇧S** on an article → toast + sound, saved with title/image; it appears at the
      bottom of the Journal. Undo removes it; saving again says “already in memex”
- [ ] Right-click → Save page / Save link
- [ ] **X bookmark** (timeline and post page) → pill on the page; the link has the
      post text, author and image. A plain like saves nothing
- [ ] **Pinterest save** (grid Save, board picker, pin page) → link with image + title
- [ ] **YouTube like** (watch page and a Short) → link with thumbnail, title and
      “Channel · length”; it appears in the Journal as a YouTube save. Disliking or
      un-liking saves nothing
- [ ] **Same thing twice**: bookmark a post, then open it as `twitter.com/…/status/<id>`
      and press ⌘⇧S → “already in memex”, no second link. Same for a video opened as
      `youtu.be/<id>`
- [ ] **Already-saved ✓**: open a page you've saved → blue ✓ on the toolbar icon; a page
      you haven't → no ✓. Turn off “Mark pages already in memex” in Options → the ✓ goes
- [ ] **Add to a space**: after ⌘⇧S, pick a space under “Add to a space” → “Added to
      … ✓”, and the link shows under that space in memex
- [ ] Several X bookmarks in a row (or YouTube likes) fold into one run in the Journal
      (“3 posts saved on X”)
- [ ] Popup's Auto-save switches off → nothing saved on X / Pinterest / YouTube
- [ ] **Offline queue**: turn Wi-Fi off (or break the token in Options), save a page →
      badge shows a count / `!` and the item is listed in Options. Fix it → **Retry now**
      → it saves and the badge clears

If something fails, `cd api && npx wrangler tail` streams the Worker's logs live.

Test links from the smoke tests, all safe to delete (titles start with `[test]` except
the first):

| Link | id |
| --- | --- |
| “memex capture test (agent smoke test, safe to delete)” · `https://example.com/memex-capture-test-2026-11-01` | `fe344d62-87ee-4699-adcc-e524c66c332c` |
| `[test] … (web)` · `https://example.com/memex-capture-test-m2-2026-11-01` | `a52b6de4-21e0-4316-a28b-79c13b34e7d1` |
| `[test] … (X-shaped)` · `https://x.com/memex_test/status/1000000000000000001` | `6a3a0ba2-39b7-42e5-8fe0-311e24022384` |
| `[test] … (Pinterest-shaped)` · `https://www.pinterest.com/pin/1000000000000000002/` | `f59261ff-407c-4b0c-a27a-373555ba9157` |
| `[test] … (YouTube-shaped)` · `https://www.youtube.com/watch?v=memexTest01` | `c342bf54-15d7-4bf6-b0e6-ceb1477492af` |

## Smoke test from the terminal (optional, any time)

With a token in your shell (`read -s MX` then paste it, so it stays out of history):

```bash
B=https://memex-api.joyfulsystems.workers.dev
curl -s $B/api/tags -H "Authorization: Bearer $MX"
curl -s "$B/api/lookup?url=https://example.com/memex-capture-test-2026-11-01" -H "Authorization: Bearer $MX"
```

Both should return `success: true`; the lookup finds the test link.
