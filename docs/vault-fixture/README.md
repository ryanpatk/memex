# memex vault

Everything in memex as plain files: 4 links, 2 notes, 2 tasks, 5 jots across 3 Journal days, 2 spaces and 3 tags. Images links pointed at are in `assets/`.

Last export: 2026-11-01T12:00:00.000Z. This folder is rewritten by `scripts/export-vault.mjs`; files it manages are overwritten, so keep your own notes in other folders. Format: https://github.com/ryanpatk/memex/blob/main/docs/vault-format.md

## Spaces

- [[spaces/home-reno|Home reno]]
- [[spaces/inspiration|Inspiration]]

## Recent Journal days

- [[journal/2026/2026-10-26|Monday, October 26, 2026]]
- [[journal/2026/2026-10-25|Sunday, October 25, 2026]]
- [[journal/2026/2026-10-24|Saturday, October 24, 2026]]

## Folders

- `journal/YYYY/YYYY-MM-DD.md`: one daily note per day with jots and what was saved
- `links/`, `notes/`, `tasks/`: one file per item
- `spaces/`: one index note per space, plus its `.board.json` (membership and order)
- `views/`: saved Library views (filters, sort, layout), one JSON file each
- `settings/tags.json`, `legacy/projects.json`: structured data
- `assets/<item key>/`: downloaded preview images and favicons
- `.memex/manifest.json`: machine-readable list of every file, count and image download
