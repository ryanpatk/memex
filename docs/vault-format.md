# Vault format (schema 1)

The vault is memex as plain files: one folder holding every link, note, task, jot, space and tag, plus the images links point at. It opens in Obsidian (or any editor), an agent can grep it, and a script can read it back without memex. This is the walk-away guarantee in `ROADMAP.md` §3.4, and the format the v2 vault backend starts from (§3.3, Phase 4f).

Today the vault is **written by an export** from Supabase (`scripts/export-vault.mjs`, nightly on Ryan's Mac). It is a one-way copy: memex is still the source of truth, and edits made in the vault don't flow back. A sample vault with fake data lives in [`docs/vault-fixture/`](vault-fixture/); read it alongside this page.

Added 2026-11-01 (ROADMAP Phase 2).

## Layout

```
memex-vault/
  vault.json                          format, schema, vault id, created, timezone
  README.md                           generated index: counts, spaces, recent days
  journal/2026/2026-10-24.md          one daily note per day: jots + what was saved
  links/<title-slug>-<key>.md         one file per link
  notes/<title-slug>-<key>.md         one file per note (body = the note's markdown)
  tasks/<title-slug>-<key>.md         one file per task (body = the task's detail)
  spaces/<name-slug>.md               one index note per space
  spaces/<name-slug>.board.json       the space's membership: which items, order, pinned
  views/<name-slug>.json              a saved Library view: filters, sort, layout
  settings/tags.json                  the tag vocabulary (id, name, slug, colour)
  legacy/projects.json                pre-spaces “projects” every link still points at
  assets/<key>/preview.<ext>          a link's downloaded preview image
  assets/<key>/favicon.<ext>          a link's downloaded favicon
  .memex/manifest.json                machine-readable: every file, hash, count and image download
```

- **`<key>`** is the item's id without dashes, cut to its first 8 hex characters (12, or all 32, if two items would collide). It keeps filenames unique and stable across title changes in the folder you see; the full id is always in the frontmatter.
- **Filenames are cosmetic.** Every file carries its `id`; readers match items by id, never by filename. Slugs are lowercase ASCII, at most 60 characters.
- **Folders starting with `.`** (`.memex/`, and the `.obsidian/` Obsidian creates) are hidden from Obsidian and ignored by readers, apart from the manifest.

## Common rules

- **Frontmatter is YAML** between `---` lines at the top of every Markdown file. The exporter writes a strict subset: strings are always double-quoted (JSON string syntax), so no value is ever read as a date, number or boolean by accident; lists are block lists (`- "x"`); `[]` for empty lists; `null` for no value.
- **`schema: 1`** and **`type`** are in every file (`link`, `note`, `task`, `journal-day`, `space`; JSON files carry them too). A reader that meets a higher schema should refuse or warn, not guess.
- **Timestamps** (`created`, `updated`, …) are ISO 8601 strings exactly as Postgres stores them, with microseconds and offset (`"2026-10-24T13:40:00.123456+00:00"`). Day boundaries and the `HH:MM` times in Journal files use the vault's `timezone` (from `vault.json`, America/New_York on Ryan's Mac).
- **References between files are wikilinks** with a path and a display name: `"[[spaces/home-reno|Home reno]]"`. Obsidian follows them (and updates them if you rename in Obsidian); a reader resolves the path to a file and takes its `id`. Display names have `|`, `[`, `]` and line breaks replaced so the link can't break.
- **Tags** are Obsidian tag slugs (`design`, `to-read`, `tag-2026` for an all-digit name) in a `tags:` list, so Obsidian's tag pane works. `settings/tags.json` maps each slug back to its id, original name and colour.
- **Generated sections.** Link and space bodies are written by the exporter between `<!-- memex:generated (rewritten on every export) -->` and `<!-- /memex:generated -->`. They hold nothing that isn't in the frontmatter; readers skip them. (A later schema may add user text after the end marker.)
- **Readers are forgiving.** Unknown fields are ignored; a missing optional field takes its default (listed below). An unreadable file is reported and skipped, not fatal.

## Links

```yaml
---
schema: 1
type: "link"
id: "1a1f3c9e-0000-4000-8000-000000000001"
title: "The best interfaces feel like a desk you already know (fake post)"   # null if never fetched
url: "https://x.com/example_designer/status/1850000000000000001"
source: "x"                    # platform: x · pinterest · youtube · web (from the URL and sourceTag)
sourceId: "1850000000000000001"  # links.source_id: the post / pin / video id (omitted when null)
capturedBy: "extension"        # app · extension · resync · share · api · agent (links.captured_by, else from sourceTag)
capturedClient: "memex-extension/0.3.0"  # links.captured_client (omitted when null)
lists:                         # which of your lists on the source held it: bookmarked · saved · liked
  - "bookmarked"
sourceTag: "x:bookmark"        # links.source verbatim (omitted when null = saved in the app); "x" on links captured since 2026-11-01
created: "2026-10-24T13:40:00.123456+00:00"
updated: "2026-10-24T13:40:00.123456+00:00"
spaces:
  - "[[spaces/inspiration|Inspiration]]"
pinnedIn:                      # spaces whose header pins this link (omitted when none)
  - "[[spaces/inspiration|Inspiration]]"
tags:
  - "design"
superFavorite: true            # pinned in the Home header (omitted when false)
order: 0                       # order_index
description: "…"               # omitted when null
image: "assets/1a1f3c9e/preview.svg"     # local copy; omitted if there's none or the download failed
imageUrl: "https://pbs.twimg.com/…"      # the original preview URL (kept even when downloaded)
favicon: "assets/1a1f3c9e/favicon.png"
faviconUrl: "https://www.google.com/s2/favicons?…"
legacyProjectId: "9a000000-…"            # links.project_id → legacy/projects.json
---
<!-- memex:generated … --> title, embedded image, description, link <!-- /memex:generated -->
```

Defaults: `title` null, `sourceId` null, `capturedClient` null, `lists` `[]`, `sourceTag` null, `spaces`/`pinnedIn`/`tags` `[]`, `superFavorite` false, `order` 0. A link's image is shown in the body as an Obsidian embed (`![[assets/…/preview.jpg]]`).

## Notes

Frontmatter `schema`, `type: "note"`, `id`, `title` (may be null), `created`, `updated`, `spaces`, `tags`, `order`. **The body is the note's markdown exactly as stored**, byte for byte, starting right after the closing `---` line (no blank line is added; a body without a final newline ends without one).

## Tasks

Frontmatter `schema`, `type: "task"`, `id`, `title`, `done` (boolean), `due` (`"YYYY-MM-DD"` or null), `created`, `updated`, `spaces`, `tags`, `order`. **The body is the task's detail exactly as stored**; an empty body means no detail (null and empty read the same). There's no checkbox in the body on purpose: toggling one in Obsidian would only edit the copy.

## Journal days

One file per local day that has any jot or item: `journal/<year>/<YYYY-MM-DD>.md`. Jots live only here; items (links, notes, tasks) live in their own files and the day only points at them.

```markdown
---
schema: 1
type: "journal-day"
date: "2026-10-24"
timezone: "America/New_York"
jots:
  - ref: "jot-4a1f3c9e"                       # the list item's block id
    id: "4a1f3c9e-0000-4000-8000-000000000001"
    created: "2026-10-24T13:12:00+00:00"
    updated: "2026-10-24T13:12:00+00:00"
    space: null                               # or "[[spaces/home-reno|Home reno]]" for a space's Journal
    legacyId: "…"                             # self_messages.legacy_id (omitted when null)
    text: "…"                                 # only when the list item can't hold the text exactly (below)
---
# Saturday, October 24, 2026

[[journal/2026/2026-10-25|2026-10-25 →]]

- **09:12** idea: the journal is the front door. ^jot-4a1f3c9e

- **09:40** saved link [[links/the-best-interfaces-…-1a1f3c9e|The best interfaces …]]

- **13:45** ^jot-4a2f3c9e
  Multi-line jot:

  - first thought
  - second thought

- **22:15** · [[spaces/home-reno|Home reno]] ^jot-4a3f3c9e
  Filed into Home reno: call the tile shop
```

**Reading jots back.** A jot is a top-level list item whose first line ends in ` ^jot-<key>` (an Obsidian block id, so `[[journal/2026/2026-10-24#^jot-4a1f3c9e]]` links to it):

- *Inline form* `- **HH:MM** <text> ^jot-<key>`: a one-line jot in the Home Journal. The text is everything between `**HH:MM** ` and the final ` ^jot-<key>`.
- *Block form* `- **HH:MM**[ · [[space]]] ^jot-<key>`: used for multi-line jots, empty jots and jots in a space. The text is the following lines up to the next line that starts in column 0 and isn't blank, each with its two-space indent removed, trailing blank lines dropped.
- If the frontmatter entry has `text`, that is the exact text (the exporter adds it when the list item can't reproduce a body exactly, e.g. leading spaces or trailing blank lines). The exporter checks every jot reads back identically before it writes the file.
- Match list items to frontmatter entries by `ref`. Frontmatter is authoritative for `id`, timestamps and space; `HH:MM` is display only.
- Every other line (the heading, the prev/next links, `saved link` / `wrote note` / `added task` pointers) is derived and ignored by readers.

A reference implementation (`parseJournalBody`, `splitFrontmatter`) is exported from `scripts/export-vault.mjs`; `scripts/check-vault.mjs` uses it.

## Spaces

`spaces/<slug>.md`: frontmatter `schema`, `type: "space"`, `id`, `name`, `color` (an OKLCH colour; today the app assigns it from the canvas palette by creation order, so the export records the same value), `created`, `updated`, `board` (the board file's name). The body is a generated index of the space's links, notes and tasks for browsing in Obsidian.

Spaces are index notes, not folders, because an item can be in several spaces. Membership lives on the item (`spaces:` in its frontmatter); the board file adds what the item can't say about itself:

```json
{
  "schema": 1,
  "type": "space-board",
  "space": "5a000000-0000-4000-8000-000000000001",
  "items": [
    { "type": "link", "id": "1a2f3c9e-…", "order": 0, "added": "2026-10-24T15:03:00+00:00" },
    { "type": "link", "id": "1a1f3c9e-…", "order": 0, "pinned": true, "added": "…" }
  ]
}
```

`order` is the item's position in that space, `pinned` (omitted when false) pins a link to the space's header, `added` is when it was filed there. The v2 board layout (ROADMAP §3.3) will extend this file.

## Saved views

`views/<name-slug>.json`, one per saved Library view (decision 15A, `docs/library-views.md`; table `saved_views`):

```json
{ "schema": 1, "type": "view", "id": "…", "name": "Unfiled links, oldest first", "position": 0,
  "filters": { "types": ["link"], "sources": [], "spaces": ["unfiled"], "tagIds": [], "untagged": false },
  "sort": { "field": "saved", "direction": "asc" }, "layout": "table",
  "created": "…", "updated": "…" }
```

`filters.spaces` holds space ids plus `unfiled`; `tagIds` are tag ids. They are references: a space or tag that no longer exists is ignored by readers, never an error. `sort` and `layout` are omitted when the view doesn't set them. Readers are forgiving (`parseViewDefinition` in `@memex/core`): unknown fields are ignored and broken ones fall back to defaults. The built-in tabs (Everything, Unfiled, From X…) live in code, not in the vault.

## Tags, legacy projects

- `settings/tags.json`: `{ schema, type: "tags", tags: [{ id, name, slug, color, created, updated }] }`.
- `legacy/projects.json`: `{ schema, type: "legacy-projects", projects: [{ id, name, description, starred, created, updated, lastModified }] }`. Projects predate spaces and are slated for retirement, but every link row still references one, so they're kept for a lossless round trip.

## `vault.json` and the manifest

`vault.json`: `{ schema, format: "memex-vault", id, created, timezone, spec }`. The `id` is generated on the first export and kept.

`.memex/manifest.json` is for machines; nothing in it is needed to read the vault, but it makes checks and incremental runs cheap:

- `exportedAt`, `source` (`{ kind: "supabase", projectRef }`), `timezone`
- `counts`: files per type as exported (`links`, `notes`, `tasks`, `jots`, `spaces`, `tags`, `legacyProjects`, `views`, `journalDays`)
- `databaseCounts`: `count(*)` per table from the same read-only transaction as the export (the export aborts if they differ)
- `images`: `{ total, ok, failed, skipped }`
- `files`: `{ "<path>": { type, id, sha256 } }` for every file the exporter manages
- `assets`: one entry per image URL: `{ item, role: "preview" | "favicon", url, status: "ok" | "failed" | "skipped", file, bytes, contentType, sha256, fetched }`, or `error` + `attempted` when it failed

## What isn't in the vault (yet)

- **UI preferences** (canvas colour, link card style, dark mode, panel state) live in the browser's localStorage, not the database, so the export can't see them. They're cosmetic; ROADMAP §3.3 gives them a `settings/` home in v2.
- **Accounts and secrets**: `auth.*`, `api_tokens`, `agent_tokens` and the operational `mcp_audit_log` are deliberately left out. Full database backups cover them (`docs/backups.md`).
- **Image files in Supabase Storage**: there are none today; images are remote URLs, downloaded into `assets/`. An image that couldn't be fetched (404, 403, an HTML page instead of an image) keeps its URL in the item and gets a `failed` entry in the manifest; each export retries it.
- **The raw capture** of a save (author, text, media of an X post) isn't stored by memex yet (ROADMAP Phase 3). When it is, it goes in a link's `capture:` frontmatter.

## The exporter

```bash
node scripts/export-vault.mjs                       # → ~/memex-vault
node scripts/export-vault.mjs --out /Volumes/Backup/memex-vault
node scripts/export-vault.mjs --dry-run             # read + render, write nothing
node scripts/export-vault.mjs --no-images           # skip downloads, keep earlier ones
node scripts/check-vault.mjs ~/memex-vault          # verify (no content printed)
scripts/export-vault.sh                             # both, with timestamped log lines
```

**How it reads production.** Through the Supabase CLI: `npx -y supabase@2 db query --linked --project-ref zwgotlojioprtjvrxltc -f <sql>`, the same sanctioned login as `scripts/backup-supabase.sh`. The CLI uses its own access token (from `npx supabase@2 login`, kept in the macOS login keychain) and a temporary login role it manages, so the exporter holds no keys or passwords. No Docker is needed. The whole read is one query inside `begin transaction read only`, so Postgres itself rejects any write, and every table is read from the same snapshot.

**What it guarantees.**

- *Read-only* against production (above).
- *Never inside a checkout.* It refuses an output folder inside this repo or any other git working tree, `/` or your home folder itself, and any non-empty folder that isn't already a memex vault. Only `--from-json` (fake fixture data) may write inside the repo.
- *Idempotent and incremental.* Files are rewritten only when their content changes (a run with no changes rewrites only `README.md`'s timestamp). Images already downloaded are kept if their URL hasn't changed. Files and images belonging to items deleted in memex are removed, but only paths an earlier export recorded in the manifest, so anything you add to the vault yourself is left alone. Don't edit the files it manages: the next export overwrites them.
- *Images never abort a run.* Each download has a 20 s timeout, one retry for timeouts, resets, 429 and 5xx, a 25 MB cap, and a check that the bytes are really an image. Failures are recorded in the manifest.
- *One run at a time* (`.memex/export.lock`), atomic file writes (temp file + rename), and a count check against the database before anything is written.

The vault folder is created `chmod 700`: it holds every note and jot. Keep it off shared drives; Time Machine covering `~` is fine.

## Nightly run (launchd)

A user agent on Ryan's Mac runs the export at **03:30 local time every day** and appends to `~/Library/Logs/memex-export.log`.

```bash
scripts/install-export-agent.sh install     # copy scripts + load the agent
scripts/install-export-agent.sh run         # run now (launchctl kickstart), then check the log
scripts/install-export-agent.sh status      # state, last exit code, end of the log
scripts/install-export-agent.sh uninstall   # unload + remove (vault and log stay)
```

- Label `com.ryanpatk.memex.export-vault`, plist `~/Library/LaunchAgents/com.ryanpatk.memex.export-vault.plist`.
- `install` copies `export-vault.mjs`, `check-vault.mjs` and `export-vault.sh` to `~/Library/Application Support/memex-export/` so the job doesn't depend on a checkout. **Re-run `install` after pulling changes to these scripts.** Change the time with `MEMEX_EXPORT_HOUR=4 MEMEX_EXPORT_MINUTE=15 scripts/install-export-agent.sh install`, the folder with `MEMEX_VAULT_DIR`.
- It records the `node` found on your PATH at install time; re-run `install` if you switch Node versions with nvm.
- Each run logs a `=== … memex export start` line, the export and check summaries (counts only, never content), and `=== … memex export OK` or `… FAILED (exit N)`. A failure also posts a macOS notification.

**What it needs at 03:30.** The Mac awake or asleep (launchd runs a missed job when the Mac wakes; not if it was shut down), you logged in (the CLI's token is in the login keychain, normally readable while your session exists, even with the screen locked; the first launchd run on 2026-11-01 confirmed the agent can use it), a network connection, and a current Supabase CLI login. If the CLI token expires or is revoked, the log shows the CLI's error and a FAILED line: run `npx supabase@2 login` and `scripts/install-export-agent.sh run`. Docker is not needed.

## Fixture vault

[`docs/vault-fixture/`](vault-fixture/) is a complete vault generated from invented data in [`docs/vault-fixture-source/`](vault-fixture-source/): 4 links (an X bookmark, a Pinterest save, a web link whose image fails, an untitled YouTube link), 2 notes, 2 tasks, 5 jots (one-line, multi-line, filed into a space, one needing a `text` override, one after midnight UTC), 2 spaces, 3 tags and a legacy project. It's the reference for readers and the future round-trip test in `packages/core` (ROADMAP Phase 2). Regenerate and check it with:

```bash
node scripts/export-vault.mjs --from-json docs/vault-fixture-source/data.json \
  --out docs/vault-fixture --tz America/New_York --now 2026-11-01T12:00:00.000Z
node scripts/check-vault.mjs docs/vault-fixture
```

If a change to the exporter changes the fixture, the format changed: say how in this file, and bump `schema` if old readers would misread the new files.
