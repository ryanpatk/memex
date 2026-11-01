# Connect the memex capture extension

Status 2026-11-01: the server side is done and smoke-tested. You only need to make a
token, load the extension and paste the token in.

| What | Value |
| --- | --- |
| API address | `https://memex-api.joyfulsystems.workers.dev` (the extension's default) |
| App address | `https://memex.joyfulsystems.workers.dev` (default) or `https://memoryextension.app` |
| Extension build | `extension/.output/chrome-mv3` (in whichever checkout you built it) |

## Already done

- [x] **Database up to date.** All 10 repo migrations are applied in production,
      including `20261018120000_add_link_source.sql` (`links.source`). A backup was
      taken first: `~/memex-backups/2026-11-01T223417Z/` (3.1 MB, checksums OK)
- [x] **API connected to the database.** memex-api has its `SUPABASE_SERVICE_KEY`
      secret (the project's `service_role` key, set via `wrangler secret put`)
- [x] **Smoke test.** `GET /api/tags`, `/api/spaces`, `/api/lookup` and
      `POST /api/capture` all pass, with CORS headers for extension and app origins

## 1. Make a token

memex → Settings (sidebar foot) → **Access tokens…** → create one named after this
browser (e.g. `chrome-macbook`). Copy it now; it's shown once. (There's an unused
“Chrome Extension” token from 2026-10-20. Use a new one unless you still have it.)

While you're there, revoke **`agent-smoke-test`**: an agent made it for the smoke test.

## 2. Load the extension

```bash
cd extension && npm install && npm run build
```

Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** →
choose `extension/.output/chrome-mv3`. Pin the memex icon to the toolbar.

## 3. Connect

Right-click the memex icon → **Options** (or **Settings…** in the popup):

1. **API address**: already `https://memex-api.joyfulsystems.workers.dev`
2. **Token**: paste the `mx_…` token
3. **App address**: leave it, or use `https://memoryextension.app`
4. **Test connection** → expect “Connected ✓” → **Save**

Then reload any open X and Pinterest tabs so the content scripts attach.

## 4. Check it on real sites

- [ ] **⌘⇧S** on an article → toast + sound, saved with title/image; it appears at the
      bottom of the Journal. Undo removes it; saving again says “already in memex”
- [ ] Right-click → Save page / Save link
- [ ] **X bookmark** (timeline and post page) → pill on the page; the link has the
      post text, author and image. A plain like saves nothing
- [ ] **Pinterest save** (grid Save, board picker, pin page) → link with image + title
- [ ] Popup's Auto-save switches off → nothing saved on X / Pinterest
- [ ] **Offline queue**: turn Wi-Fi off (or break the token in Options), save a page →
      badge shows a count / `!` and the item is listed in Options. Fix it → **Retry now**
      → it saves and the badge clears

If something fails, `cd api && npx wrangler tail` streams the Worker's logs live.

The Journal also has a link titled “memex capture test (agent smoke test, safe to
delete)” (`https://example.com/memex-capture-test-2026-11-01`) from the smoke test.
Delete it whenever you like.

## Smoke test from the terminal (optional, any time)

With a token in your shell (`read -s MX` then paste it, so it stays out of history):

```bash
B=https://memex-api.joyfulsystems.workers.dev
curl -s $B/api/tags -H "Authorization: Bearer $MX"
curl -s "$B/api/lookup?url=https://example.com/memex-capture-test-2026-11-01" -H "Authorization: Bearer $MX"
```

Both should return `success: true`; the lookup finds the test link.
