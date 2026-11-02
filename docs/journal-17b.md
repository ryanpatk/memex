# Desktop Journal: 17B notebook page + grouped jots (M5-D)

**Status:** built 2026-11-01 (branch `m5d-journal-17b`). Closes decision 17 (Ryan chose **17B** on 2026-11-01 from the round-6 mock on `/mocks`) and the Journal polish items in `TODO.md`: edit a jot in place, move a jot between spaces, jots in ⌘K. No schema change and no migration: jots already had `body`, `profile_id` and an RLS update policy; the Repository just never used it.

## What changed

Both the home Journal (`/`) and every space page (`/spaces/:id`) render the shared `components/journal/JournalFeed.tsx`, so everything below applies to both.

### 17B: the notebook page

- **The paper shrinks to the writing.** The feed's surface is a 760px page centred on the canvas (`--jr-page` in `styles/journal.css`); the canvas shows on both sides, so the Journal reads as an object on a desk instead of a column floating in a window-wide panel. The feed and composer use the whole page width (24px inner margin); bubbles still stop at 520px.
- **The title sits over the page.** The header row (“Journal · 11 today”, Inbox button) lines up with the page's edges, and widens to cover whatever opens beside it: the Inbox tray on home (page + 320px), the board on a space page (page + 340px). Below 1180px the space board folds behind its button and the title goes back to the page's width.
- **Phones (< 900px)** are unchanged: the page fills the column.

### 17B: grouped jots

- Jots written **within 5 minutes** of the one before stack into **one thought**: they sit tight together (the joining corners square off), and the **time and the filing row show once, at the end** of the thought.
- A thought only continues when nothing else (a link, task, note, a day break) sits between, the jots are **in the same place** (same space, or both unfiled) and **by the same hand** (you, or the same agent). So the space chip and the “via <client>” label at the end of a thought are true for every jot in it.
- Rules live in `@memex/core` `journal/jots.ts` (`groupJots`, `continuesThought`, `JOT_GROUP_MS`), with tests.

### Edit a jot in place

- **Edit** is the first item in the jot's ··· menu; **double-click** a bubble does the same.
- The bubble becomes its own field (same type, focus ring). **Enter saves**, **⇧↵ adds a line**, **Esc cancels**, clicking away saves.
- Saving shows “Jot edited.” with **Undo** (puts the old text back). Clearing the text and pressing Enter keeps the field open with a hint (“A jot needs words…”); clicking away from an empty field keeps the old text. Deleting stays in the menu, with its own Undo.
- After Enter/Esc, focus returns to the jot's ··· button.

### Move a jot between spaces, or out of one

- Jots now have **File to…** (folder button) like links, notes and tasks. A jot lives in **one** place, so the menu items are radio-style: choosing a space **moves** it (“Moved the jot to “Kyoto trip”.” → Undo moves it back); choosing the ticked space **takes it out** to the Journal (unfiled), with Undo.
- **Drag a jot onto a sidebar space** to move it there, as with every other item; the sidebar shows “All in” for the space it's already in.
- On a space page, a jot moved elsewhere leaves that feed (Undo brings it back).
- Data: `repository.jots.update(id, { body?, profile_id? })` (Supabase adapter and the in-memory demo adapter, both tested); move planning and its Undo are core's `planJotMoves` / `undoMoves`. The web wires them into `useAddToSpace` / `useRemoveFromSpace` (`hooks/useMoveJots.ts`), so the selection bar, drag and “File to…” share one path.

### Jots in ⌘K

- The Go to palette (⌘/Ctrl K, every signed-in page) now also lists **Jots** once you type two letters: every word must appear (any order; case and accents ignored), newest first, at most 6, shown as a snippet around the match with the space and date.
- **Enter** opens the home Journal at that jot (`/?jot=<id>`): it loads far enough back, centres the jot in the feed, focuses it and washes it in the accent colour for ~2 s (no animation with reduced motion). The `jot` parameter is cleared once shown, so Back/refresh don't repeat it.

### Also

- `StreamPage` lost its dead `/spaces/:spaceId` code (the space route has rendered `SpacePage` since 14B): ~100 lines, no behaviour change; the Library's `?space=` filter is untouched.
- Fixture mode (`VITE_MEMEX_FIXTURES=1 npm run dev`) has three follow-up jots so grouped thoughts show in screenshots.

## Choices for Ryan to confirm (all reversible)

1. **Page width 760px** (the mock's value), title aligned over page + tray/board.
2. **Grouping window 5 minutes**, measured from the previous jot (a chain can run longer than 5 minutes overall); only same place + same author; never across another entry.
3. **One time and one filing row per thought**, at the end (the mock hid only the times; showing the shared chip once follows from the same-place rule).
4. **Double-click a bubble edits** (in addition to the menu). It stops double-click from selecting a word inside a jot.
5. **Edits keep the jot's original time** (no “edited” mark). `updated_at` changes, so one can be added later.
6. **Clicking away saves** the edit; only Esc cancels. An emptied jot is never saved (use Delete).
7. **Filing a jot moves it** (one place per jot, as stored today: `self_messages.profile_id`). Choosing its current space takes it out.
8. **⌘K jot results**: from 2 letters, all words must match, newest 6, opening the **home** Journal even for a jot in a space (home shows every jot).

## Signed-in checklist for Ryan

On https://memex.joyfulsystems.workers.dev, signed in, on a desktop window (1280px or wider):

1. Open the Journal. The feed is a page about 760px wide in the middle of the canvas; “Journal” and the Inbox button line up with its edges. Open the Inbox: the title row now spans the page and the tray.
2. Write `[test] 17b one`, Enter, then `[test] 17b two`, Enter. They stack into one thought with one time at the end.
3. Hover the second jot → ··· → **Edit** (or double-click it). Change the text, press Enter: “Jot edited.” → **Undo** restores it. Edit again and press **Esc**: nothing changes.
4. On the first test jot, press the folder button (**File to…**) and choose a space: the toast says it moved; **Undo** moves it back. Move it to a space, then choose that (ticked) space again: it's taken out; Undo puts it back.
5. Drag a test jot onto a sidebar space; open that space: the jot is in its feed. Use its File to… to take it out: it leaves the space's feed.
6. Press ⌘K and type `17b`: both test jots are under **Jots**. Press Enter on one: the Journal scrolls to it and highlights it.
7. Open a space with a board (1280px+): page and board sit side by side under one title row. Narrow the window below ~1180px: the Board button returns and the title lines up with the page.
8. Dark mode (Settings): repeat a glance at 1 and 7.
9. Check an agent jot still shows “via <client>” (any MCP-written jot).
10. Delete the `[test] 17b` jots (··· → Delete) when done.
