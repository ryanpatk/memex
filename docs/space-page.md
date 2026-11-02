# Space page: scoped Journal + board (M5-C, decision 14B)

**Status:** built 2026-11-01 (branch `m5c-space-board`). Closes the ROADMAP Phase 1 item “Space page becomes a board (pinned sites · tasks · notes · saves) with a scoped Journal column”. No schema change and no migration: everything comes from existing tables (jots' `profile_id`, the `profile_links` / `profile_notes` / `profile_tasks` joins, and `profile_links.is_super_favorite` for per-space pins).

## What `/spaces/:id` shows now

Before: the Library's grid filtered to the space, with the old Journal panel (J) docked beside it. Now (14B, “Journal-led”):

- **Left: the space's own Journal.** Every jot written in the space and every link, note and task filed in it, in time order, newest at the bottom, composer below. It is the home Journal's own component (`components/journal/JournalFeed.tsx`), so entries, runs of saves, day separators, filing chips and the jot menu are identical, and decision 17B (2026-11-01, `docs/journal-17b.md`: notebook page, grouped jots) applies here too.
  - Entries leave out the space's own chip (every entry would carry it); chips for *other* spaces still show.
  - **Composer defaults to the space.** Same syntax as the Journal (jot, lone URL → link, `[] ` → task, ⌘/Ctrl↵ → note). With no `@`, the result is filed in this space; the hint under the field says “→ Kitchen reno”. An explicit `@Other` **wins and replaces** the default (it does not add to it), so you can write from one space into another; the toast then says where it went (“Jotted in Kyoto trip.”). Logic: `withDefaultSpace` in `@memex/core` `journal/space.ts`.
- **Right: the board column** (340px, paper). Sections, each with a count:
  1. **Pinned**: sites pinned in this space, as launch chips (open in a new tab). Pin or unpin from the pin button on any save tile.
  2. **Open tasks**: the Tasks view's own rows (tick, due date, rename, file in other spaces, delete), soonest due first, six at most, then “All N open in Tasks” (`/tasks?space=<id>`). **Add** puts `[] ` in the composer and focuses it.
  3. **Saves**: the six newest links filed here as picture tiles (text tiles when there's no picture); **Open in Library** goes to `/library?space=<id>`.
  4. **Notes**: the four most recently edited, opening in the note editor; more → the Library filtered to notes in the space.
- **Header**: space dot and name, “12 entries · 3 today”, **Open in Library**, **Edit space** (rename / delete, the existing dialog).
- **Narrow windows** (< 1180px): the board folds behind a **Board** button in the header (`?board=1`) and opens over the feed; on phones it takes the whole column, like the Inbox.

## Interactions (all with Undo)

| Action | Where | Undo |
| --- | --- | --- |
| Tick a task | board rows, feed task lines | toast “Done: …” → Undo (the board row holds a beat, then leaves) |
| Delete a task | board row ··· menu, Delete/Backspace on a row | 6 s, then commits (leaving the page commits it) |
| Delete a jot | feed jot menu | 6 s |
| File elsewhere | “File to…” on any entry, board row menu, drag onto a sidebar space | toast → Undo |
| **Take out of a space** (new) | “File to…”: press a space that's already ticked (here: this space) | toast → Undo puts it back, pin included |
| Pin / unpin a site | pin button on a save tile | press again |

Ticking a task in the **home** Journal now also offers Undo (it used to tick silently), and “File to…” there can take items out of spaces too: both come from the shared feed.

**Keyboard:** Tab reaches everything; menus move with ↑/↓ and close with Esc; on board task rows ↑/↓ (Home/End) move between rows, Space ticks, Enter on a title renames, Delete deletes; ⌘/Ctrl K (Go to) reaches every space; Enter sends from the composer.

**Drag:** feed entries, board task rows, save tiles, pinned chips and note rows all drag onto sidebar spaces (`dragAttrs`), like the rest of the app.

**Empty states:** a new space shows “A fresh space” (a raised disc in the space's colour) in the feed, and each board section has one line saying what to do next. Done-only tasks show an “All clear” disc (glossy: an “on” state).

## Choices for Ryan to confirm (all reversible)

1. **Board contents** = Pinned · Open tasks · Saves · Notes, in that order, as in the 14B mock. No “recently done” section; done tasks are a link to the Tasks view.
2. **Caps**: 6 tasks, 6 saves, 4 notes, with a link to the full list.
3. **`@Other` replaces** the space default rather than adding to it.
4. **Pins are toggled from save tiles** on the board (the same per-space pin the Library's expanded card sets).
5. **Narrow breakpoint** at 1180px; the board is a header-button tray below it.
6. The space's **Library grid** is no longer at `/spaces/:id`; it's one click away at `/library?space=<id>`. The old Journal panel (J) remains in the Library only.
7. ~~**Jots can't be taken out of a space**~~ *2026-11-01 (M5-D): they can now. “File to…” on a jot moves it to another space or takes it out, with Undo, through `repository.jots.update` (`docs/journal-17b.md`).*
8. Header count says **entries** (jots included), so it can differ from the sidebar's item count (no jots).

## Code

- Model (`@memex/core`, tests in `journal/space.test.ts`): `entriesInSpace` (the scoped feed), `withDefaultSpace` (composer filing), `spaceBoard` (pinned, open/done tasks, saves, notes, counts), `isPinnedInSpace`.
- Page: `src/pages/SpacePage.tsx`; board `src/components/space/SpaceBoard.tsx`; styles `src/styles/space.css`.
- Shared with the home Journal: `components/journal/JournalFeed.tsx` (feed + composer + writes), `JournalComposer` (`defaultSpace`, a focus handle), `JournalParts` (`scopeSpaceId`, unfile from “File to…”), `hooks/useRemoveFromSpace.ts`.
- Shared with the Tasks view: `components/tasks/TaskRow.tsx`, `components/tasks/taskList.ts` (row keys, focus), `hooks/useTaskActions.ts` (tick/settle, delete, file, rename, due, with Undo).

## Signed-in checklist for Ryan

On https://memex.joyfulsystems.workers.dev, signed in:

1. Open a space from the sidebar. The feed shows only that space's jots and filed items; the board shows its pins, open tasks, saves and notes; the title bar says “<Space> · memex”.
2. Type a jot and press Enter: it appears at the bottom, and the sidebar count / Home Journal show it filed in the space.
3. Type `[] [test] board task` and Enter: it lands in Open tasks. Tick it → “Done” toast → Undo brings it back. Delete it from the row's ··· menu (Undo once, then let it go).
4. Type `[test] elsewhere @<another space>`: the toast says it went there and it doesn't appear here. Delete that jot from the other space afterwards.
5. On a save, open “File to…” and press this space (ticked): it leaves the feed; Undo puts it back (pinned saves stay pinned).
6. Pin a save from its tile, then unpin it.
7. Drag a board task or save onto another space in the sidebar; Undo from the toast.
8. Narrow the window below ~1180px: the **Board** button opens and closes the board; ⌘K → type a space name → Enter.
9. Dark mode (Settings): check the board, tiles and empty states.
10. Create a new space: the feed shows “A fresh space”, each board section its hint. Delete the space when done.
11. Check `/tasks` still ticks, deletes and renames with Undo (its rows were moved into shared components).
