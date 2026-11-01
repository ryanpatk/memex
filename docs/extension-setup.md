# Connect the memex capture extension

Status as of 2026-11-01. The API Worker is deployed but **not yet connected to the
database**: steps 1–2 need your Supabase credentials. After that it's load,
paste a token, test.

| What | Value |
| --- | --- |
| API address | `https://memex-api.joyfulsystems.workers.dev` (the extension's default now) |
| App address | `https://memex.joyfulsystems.workers.dev` (default) or `https://memoryextension.app` |
| Extension build | `extension/.output/chrome-mv3` (in whichever checkout you built it) |

## 1. Bring the database up to date (once)

The API writes `links.source` (migration `20261018120000_add_link_source.sql`,
purely additive: one nullable column + an index). Check, back up, then apply.
Each command asks for the **database password** (Dashboard → Project Settings →
Database), or reads it from `SUPABASE_DB_PASSWORD`.

```bash
cd "<repo>"
supabase migration list --linked          # Remote column empty for 20261018120000 → pending
mkdir -p ~/memex-backups
supabase db dump --linked -f ~/memex-backups/$(date +%Y%m%d-%H%M)-schema.sql
supabase db dump --linked --data-only -f ~/memex-backups/$(date +%Y%m%d-%H%M)-data.sql
supabase db push --linked --dry-run       # should list only additive migrations
supabase db push --linked
```

If `scripts/backup-supabase.sh` (from the safety-rails work) is on `main`, use it in
place of the two `db dump` lines.

## 2. Give the API its database key (once)

```bash
cd api
npx wrangler secret put SUPABASE_SERVICE_KEY   # paste the service_role key when prompted
```

The key is under Dashboard → Project Settings → API → `service_role`. It's the same
value as `SUPABASE_SERVICE_ROLE_KEY` in your gitignored `.env.migrate`. Setting the
secret takes effect right away; you don't need to redeploy.

Check: `curl -s https://memex-api.joyfulsystems.workers.dev/api/tags -H "Authorization: Bearer mx_wrong"`
should now say `Missing or invalid token` (401) instead of `Auth backend unavailable` (502).

## 3. Make a token

memex → Settings (sidebar foot) → **Access tokens…** → create one named after this
browser (e.g. `chrome-macbook`). Copy it now; it's shown once.

## 4. Load the extension

```bash
cd extension && npm install && npm run build
```

Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** →
choose `extension/.output/chrome-mv3`. Pin the memex icon to the toolbar.

## 5. Connect

Right-click the memex icon → **Options** (or **Settings…** in the popup):

1. **API address**: already `https://memex-api.joyfulsystems.workers.dev`
2. **Token**: paste the `mx_…` token
3. **App address**: leave it, or use `https://memoryextension.app`
4. **Test connection** → expect “Connected ✓” → **Save**

Then reload any open X and Pinterest tabs so the content scripts attach.

## 6. Check it on real sites

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

## Optional: smoke test from the terminal

With a token in your shell (`read -s MX` then paste it, so it stays out of history):

```bash
B=https://memex-api.joyfulsystems.workers.dev
curl -s $B/api/tags -H "Authorization: Bearer $MX"
curl -s "$B/api/lookup?url=https://example.com/memex-capture-test-2026-11-01" -H "Authorization: Bearer $MX"
curl -s -X POST $B/api/capture -H "Authorization: Bearer $MX" -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/memex-capture-test-2026-11-01","title":"memex capture test (safe to delete)"}'
```

Expect `success: true` from all three. The capture returns 201 the first time and
200 with `duplicate: true` after that, and the link shows in the Journal. Delete it
whenever you like.
