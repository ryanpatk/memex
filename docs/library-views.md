# Library views (decision 15A)

**Status:** built 2026-11-01 (branch `m5a-library-views`). Sources: `ROADMAP.md` §5 Phase 1 (“Library: Table view and saved views (Unfiled, From X, From YouTube)”) and §8 decision 15 (“15A; the Table ships as a toggle in either view”), the round-5 mock 15A on `/mocks`, `TODO.md` (“15A Library view tabs (All · Unfiled · From X · From YouTube · Table)”) and `CONTEXT.md` (**Saved view**: a named set of Library filters with a layout and sort).

## What 15A is

Saved views sit **above the content as a row of tabs with counts**. Filters sit below them. **Save view** turns the current filters into a new tab. The sidebar stays a short map (Journal, Library, Inbox, Tasks, spaces): views live with the content they filter. Gallery (masonry), List and **Table** are one layout switch that works in any view.

## Behaviour

- **Tabs (Library only, `/library`).** Built-in tabs: **Everything · Unfiled · From X · From Pinterest · From YouTube**, then your saved views in the order you made them, then **Save view**. Each tab shows how many items it holds. A source tab with nothing in it stays hidden until it has something.
- **Which tab is lit** is worked out from the filters in the URL: the tab whose filters equal the current ones. Change a filter and no tab is lit; the row then offers **Save view** with a suggested name (“Links from X”, “Unfiled notes”…). Layout and sort never unlight a tab.
- **Opening a tab** applies its filters. A saved view also brings back its layout and sort. Built-ins keep whatever layout you're in.
- **A saved view's menu** (the ··· on the open tab): Rename…, Update view (saves the current layout and sort into it; offered only when they differ), Delete view (gone at once, Undo for 6 seconds, like every other delete).
- **Filters.** The type chips (Notes · Links · Tasks) stay. New beside them: **Source** (X, Pinterest, YouTube, Web) and, in the Library, **Space** (Unfiled or any space). Empty = everything, as before. Capturing while the Space filter holds exactly one space files the new item there, the same rule the space pages follow.
- **Sort** (a menu in the filter row, and the Table's column headers): Recently updated (the default, unchanged), Saved date, Title, Type, Source, Space. Grid and List follow it too; List keeps its Today / This week… groups for date sorts and is one plain list otherwise.
- **Table.** Columns: Title (picture or favicon, or the type glyph), Type, Source, Spaces, Tags (only while tags are shown, `SHOW_TAGS_UI`), Saved, Updated. Click a header to sort, again to flip. Narrow widths drop Type, then Updated, then Source. Done tasks stay in the table, dimmed.
  - Rows behave like the List's: a link row opens its details in place (a row below), a note row opens the editor, a task's check marks it done. Selection, ⌘/Ctrl-click, Shift-click ranges, ⌘/Ctrl A, the selection bar and Undo work exactly as in the grid.
  - Keyboard: ↑/↓ (and Home/End) move between rows, Enter opens, X selects, Delete or Backspace deletes (with Undo).
- **Space pages** (`/spaces/:id`) get the Table, Sort and Source, but no tabs: 14B turns them into boards.

## State and storage

- URL: `?type=`, `?tags=`, `?untagged=1` (unchanged), `?source=x,youtube`, `?space=unfiled,<spaceId>`, `?sort=title:asc` (absent = recently updated), `?view=table` (absent = grid; `list` as before). Every view is a deep link.
- Saved views live in Supabase table `saved_views` (migration `20261101200000_add_saved_views.sql`): `id`, `user_id`, `name`, `definition` (JSON: `{ filters, sort, layout }`), `position`, timestamps, RLS like every other table. Not localStorage, because a saved view is something you made: the walk-away guarantee needs it in the vault (`views/<id>.json`, ROADMAP §3.3) and on every device.
- Logic (definitions, matching, the active tab, counts, suggested names, sorting, columns) is pure TS in `@memex/core` (`stream/views.ts`, `stream/sort.ts`, `stream/table.ts`) with tests. The Repository gained `views`.

## Choices Ryan can reverse

1. **Built-in tabs**: Everything, Unfiled, From X, From Pinterest, From YouTube. Notes and Open tasks (in the mock) are left out: the type chips already do Notes, and Tasks gets its own view in a later thread.
2. **A lit tab is derived from the filters**, not stored, so deep links and the sidebar's Tasks shortcut stay plain URLs. Layout and sort are a view's defaults, saved with **Update view**.
3. **Sort applies to every layout**, default unchanged.
4. **Table shows done tasks** inline (dimmed) instead of in a Done group.
5. **Tabs only in the Library**, not on space pages (until 14B boards).
