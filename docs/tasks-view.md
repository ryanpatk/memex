# Tasks view and drag to a space (M5-B)

**Status:** built 2026-11-01 (branch `m5b-tasks-drag`). Closes two ROADMAP Phase 1 items: “a real Tasks view” and “drag to sidebar space”. No schema change: tasks already had `is_done`, `due_date` (a calendar day) and space membership (`profile_tasks`).

## Tasks (`/tasks`)

Reached from the sidebar (Tasks, under Inbox), from ⌘/Ctrl K (Go to), and from the old `/tasks` address, which used to redirect into the Library filtered to tasks.

- **What's listed:** every open task, across all spaces. Done tasks sit in a folded **Done** list underneath (most recently done first, 50 at a time).
- **Grouping** (segmented control in the header): **By space** (default): one group per space in sidebar order, then **Unfiled**. A task filed in two spaces shows once, under the first, with the other space as a chip. **By due date**: Overdue, Today, Tomorrow, Next 7 days, Later, No due date.
- **Order inside a group:** dated tasks first, soonest due first; then your manual order (new tasks at the top).
- **Space filter** (chip with a menu, like the Library's): Unfiled and each space, with open counts. Empty = every space.
- **Tick:** the check fills, the title strikes through, and the row holds for about a second before moving to Done. The toast says “Done: …” with **Undo** (6 s). Unticking a done task reopens it.
- **Due dates:** the chip on the right (Today, Tomorrow, Fri, Nov 12; Overdue in red with an icon) opens the native date picker; with no date it appears on hover as “Due”. The ··· menu has Today, Tomorrow, Next week (the coming Monday), No due date, and Pick a date….
- **The ··· menu** also has every space as a checkbox (file in or take out, each with Undo), Rename… and Delete.
- **Rename:** click the title (or Enter on it), type, Enter or click away to save, Esc to cancel.
- **Delete:** hides at once, Undo for 6 s, then commits (leaving the page commits it), like the Library.
- **Add field** (top): the Journal composer's syntax. `@Space` files the task and opens the same space picker; a leading `[] ` is accepted but not needed. When the Space filter holds exactly one space, a task without `@Space` is filed there (the hint under the field says where it's going).
- **Keyboard:** N focuses the add field; ↑/↓ (Home/End) move between rows and keep the column (check, title, due); Space ticks; Enter on a title renames; Delete or Backspace deletes; ⌘/Ctrl K opens Go to.
- **Empty states:** “Nothing to do yet” (no tasks at all), “All clear” (everything done; the disc is glossy, it's an “on” state), and “Nothing open in Kitchen” with **Show every space** when the filter hides everything.
- **URL:** `?group=date`, `?space=<id>,unfiled`, `?done=1`. Every state is a deep link.
- **Code:** `src/pages/TasksPage.tsx`, `src/components/tasks/TaskComposer.tsx`, `src/styles/tasks.css`; model in `@memex/core` `tasks/tasks.ts` (grouping, sorting, filter, counts, due-date maths and labels, add-field parsing) with tests.

## Go to (⌘/Ctrl K)

A small palette on every signed-in page: Journal, Library, Tasks (with the open count), Inbox (while something waits) and every space. Type to narrow, ↑/↓, Enter to go, Esc or ⌘K again to close. The Library's search-and-capture palette stays on “/”. Code: `src/components/GoToPalette.tsx`.

## Drag to a space

- **What drags:** Library cards (grid), List rows, Table rows, the Library's task band rows, Tasks rows, and Journal links, notes and tasks (a gallery of saves drags all of its saves). Jots don't drag: they aren't filed through spaces membership.
- **Multi-select:** dragging an item that is part of the Library selection drags the whole selection; dragging an unselected item drags just that item.
- **Drop targets:** while dragging, every sidebar space becomes a dashed slot in its own hue and the header reads “Add N to…”. The space under the pointer lights up with its “+” disc. A space that already holds everything you're dragging reads “All in”. The dragged items fade; the ghost is a small paper label with the title, or a stack with the count.
- **Filing** goes through `useAddToSpace`, the path the selection bar already used (`spaceLinks.addLinks` / `spaceNotes.addNotes` / `spaceTasks.addTasks`). No new bulk path. The toast has **Undo**, which removes only what that drop newly filed (one `remove…` call per item, the existing removal methods).
- **Undo everywhere:** the same Undo now comes with every filing: the selection bar, sidebar targets while selecting, the Journal's “File to…” and suggestion chips, and the Tasks menu.
- **Without a mouse:** select items (⌘/Ctrl-click, Shift-click, ⌘/Ctrl A, or X in the Table) and use the selection bar's **Add to space** menu; in the Journal, every entry's **File to…** menu; in Tasks, the row's ··· menu.
- Native link and image drags still carry their URL, so dragging a link card to another app works as before.
- **Code:** `src/utils/itemDrag.ts` (pure, tested), `src/hooks/useItemDragSource.ts` (one document listener, mounted by `MemexShell`), drop handling in `src/components/MemexSidebar.tsx`.

## Choices Ryan can reverse

1. **Default grouping is by space**; by due date is one press away and stays in the URL.
2. **A task in several spaces appears once**, under the first space in sidebar order, with chips for the others (rather than repeated in each group).
3. **Ticked tasks linger ~1 s** in place before moving to Done.
4. **“Done when”** is the task's `updated_at` (there's no `completed_at` column; renaming a done task moves it to the top of Done). An additive `completed_at` column would fix this if it matters.
5. **No due-date syntax in the composer** yet. Dates are set from the row (chip or menu). A syntax such as `^fri` is easy to add to `parseTaskInput` and the Journal composer once you pick one.
6. **Filtered add:** with exactly one space in the filter, new tasks without `@Space` go to that space.
7. **Undo on every filing**, not only drags.
8. **⌘K is “Go to”**, a navigation palette; search stays on “/” in the Library.
9. **Drops copy into a space** (filing adds membership); dragging never removes an item from the space it's in.

## Verified

- Unit tests: `packages/core/src/tasks/tasks.test.ts` (grouping, sorting, filtering, counts, due dates incl. DST and year roll-over, add-field parsing), `src/utils/itemDrag.test.ts` (which keys a drag carries, payload parsing), and a memory-adapter regression test (an update that doesn't mention `due_date` keeps it).
- In a browser on local dev with demo data (`VITE_MEMEX_FIXTURES=1`, nothing real touched): grouping both ways, Space filter, tick → settle → Done, Undo, rename, keyboard moves and Delete with Undo, add with `@Kyoto trip`, ⌘K navigation; a real pointer drag of a task onto a sidebar space (count went up, chip appeared, toast with Undo); synthetic drags of a selected pair of Library items (both travel), an unselected item (alone), Table rows and Journal entries; “All in”, drop-over and Undo; dark mode; phone width (no overflow).

## Signed-in checklist (production)

Use only items you make for this, titled with `[test]`.

1. Open `/tasks`. Your open tasks are grouped by space; counts match the sidebar. Switch to **By due date**, then back.
2. In the add field type `[test] drag me @` and pick a space from the picker; Enter. It appears under that space.
3. Set its due date from the chip (picker) and from the ··· menu (Tomorrow). It moves to the right group when grouped by date.
4. Tick it: it strikes through, then moves to **Done**. Press **Undo** in the toast: it's back. Tick it again and open **Done**.
5. Reopen it from Done. Rename it with Enter on the title.
6. Drag it onto a different sidebar space: the spaces turn into dashed targets, the one under the pointer lights up, the toast says “Added 1 item to …” with **Undo**. Press Undo: the chip goes away.
7. In the Library, ⌘-click two `[test]` items and drag one onto a space: both are filed. Undo.
8. In the Journal, drag a `[test]` link or note onto a space. Undo.
9. Press ⌘K anywhere, type a space's name, Enter.
10. Delete the `[test]` task from its ··· menu (or leave it for cleanup later).
