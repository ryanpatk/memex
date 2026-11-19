# The spaces row: sticky bar, drop tray, Edit spaces

**Status:** built 2026-11-19 from the "Cards grid and spaces" canvas. Ryan picked:

- **A**, the compact sticky bar.
- **C**, the drop tray.
- **B**, the Edit spaces sheet, with a way to hide a space from the row.

He also decided:

- the bar shows on Cards, space boards and Tasks;
- the row fits as many spaces as the window allows;
- the tray opens on every card drag;
- space order drives the phone too.

## What you see

### The sticky bar

It shows on Cards, a space's board and Tasks. Once the page's own space pills scroll out of view (on Cards), or the band or heading does (a space board, Tasks), one slim bar sticks to the top. It holds:

- **↑ <page name> <count>**, which takes you back to the top and focuses the page's heading. It jumps when you're far down, glides when you're close, and never animates with reduced motion. Under 1100px it's just the ↑ disc.
- **The space pills**, in their compact 48px size: as many as fit, then More.
  - On Cards, a pill filters Cards.
  - On a space board it opens that space (All is "Cards").
  - On Tasks it filters Tasks.
  - Pills stay drop targets, and while cards are selected they read "Add N to…", as the full row does.
- **The gold Pinned button.**

The top bar's nav words, Inbox and account scroll away with the page. ↑ brings them back. Pressing the page you're on in the nav (Journal, Cards, Tasks) while scrolled down also goes back to the top, like a tab bar.

The bar slides in and out; it never pushes the page. Dark mode uses the dark page colour. At phone width it's 68px tall and fits beside the bottom tab bar.

### The space pill row fits the window

The row shows All, then your spaces in your order, as many as fit the row's width. It measures the real pills, re-measures when the window or the spaces change, and never clips a pill. Everything else goes into **More**, in order, with hidden spaces last (marked "hidden"), then **Edit spaces…**.

- If not even one space fits beside More, the row shows All and More only, so More is never clipped.
- The chosen space always gets a pill, taking the last place if needed. This holds even for a hidden space.

### The drop tray

The moment a card starts moving (a card, a selection, a task row or a Journal entry, on any page) a tray opens over the top of the window. It holds:

- every space, in your order, including those in More and hidden ones;
- **+ New space**, which opens the New space sheet; the card is filed there once you've named it;
- for links, the gold **Pin**: "Pin" or "Pin in <space>", following the launcher's scope (`docs/pinned-sites.md`).

Dropping files the card through the same path as the pills, with a toast and Undo. The tray folds away when the drag ends, whether you dropped, pressed Esc or let go elsewhere. It sits above the bars and the selection bar, and below toasts and popovers.

**Reliability (2026-11-19):**

- The tray opens on the first animation frame after `dragstart`, or after 80ms if a browser holds frames back during its drag session.
- A pointer move ends a drag only when no button is held (`utils/itemDrag.ts` `endsItemDrag`). A browser that still sends a pointer move mid-drag used to close the tray the moment it opened.
- `check-spaces.mjs` drags for real: mouse down, move past the threshold, and Chrome fires `dragstart` itself (`Input.setInterceptDrags`). It covers Grid, List, Table, Tasks, a board and the Journal, scrolled, at 1440 and 390px.

Pinning by drag happens on Pin in the tray. The gold button's own drop target was retired, because the tray covers it.

### Edit spaces

It opens from **More → Edit spaces…** and from **Settings → Spaces: order and hiding**. It shows every space in your order, each row with a grip, a colour dot, the name, ↑ ↓ (on hover or focus), and an **In the row** switch. Every change saves at once.

- **Reorder:** drag a row (a blue line shows where it lands), use ↑ ↓, or press Alt+↑ / Alt+↓ anywhere in a row. Focus stays on the moved row, and a live region announces its new place.
- **"In More at this window width":** the line shows where the Cards row runs out at the width last measured (the store's `spaceRowFit`). With a wider window more spaces fit, so the line moves.
- **Hide:** turn **In the row** off. A hidden space leaves every pill row (Cards, the sticky bar on all three pages, the phone's Cards and Tasks pills). It stays everywhere else: More, Move to…, File to…, ⌘K, the drop tray and the phone's Spaces tab. Hiding doesn't move it in the order.
- **Colours never change.** Automatic space colours are assigned by creation date (core `buildSpaceColors`), not by order.

### The phone (Expo)

The Spaces tab tiles and the Cards and Tasks pills follow the same order. The pill rows leave hidden spaces out.

Long-press a space tile for **Move earlier**, **Move later** and **Hide from the Cards row** (or Show in the Cards row). The same rows are its VoiceOver actions, and a hidden tile says "Hidden from Cards". These changes ship with the next TestFlight build.

## Data

- Migration `supabase/migrations/20261119120000_add_space_order.sql`. Both changes are additive:
  - **`profiles.position`:** nullable integer; lower comes first. NULL sorts after the numbered spaces, by created_at, so a new space lands at the end.
  - **`profiles.hidden`:** boolean, NOT NULL, default false.
- **The backfill** numbers each user's spaces 1…n by created_at (today's order), continuing after any number a user already has. It writes only the new column, with the `updated_at` trigger paused.
  - Rehearsed on a throwaway database seeded with fake spaces: correct numbering, a no-op when run again, and `updated_at` and `color` unchanged.
  - Tests: `supabase/tests/space_order.test.sql` (columns, default, trigger back on, RLS own vs other).
- **Order logic** lives in `@memex/core` `spaceOrder.ts`:
  - `orderSpaces` gives the order.
  - `fitPillCount` gives how many pills fit.
  - `spaceRow` decides what shows and what goes into More.
  - Moves reuse `pins.ts`' `movePin` and `pinPositionUpdates`, so only the spaces whose number changes are written.
- **Ordering happens in the repositories.** `spaces.getAll` returns spaces in order (Supabase and the in-memory demo repository), and `toJournalSpaces` follows it. That makes every list follow: pills, More, Move to…, File to…, ⌘K, Tasks groups and filters, the tray, and the phone.
- **Writes:**
  - Web: `src/hooks/useSpaceOrder.ts` (`move`, `setHidden`), which patches the cache first.
  - Phone: `actions.setSpaces`.
- **Vault:** each space file gets `position` and `hidden` (`docs/vault-format.md`).
- **Before the migration:** spaces read in creation order, and saving an order says the migration is needed.
- **Not changed:** memex-api's `GET /spaces` (the extension's list) is still ordered by name.

## Code

- **Bar:**
  - `src/components/cards/StickyBar.tsx`.
  - `stickyScroll.ts`: `useScrolledPast` (an IntersectionObserver on the shell's scroll area) and `scrollShellToTop`.
  - Used by `StreamPage`, `SpacePage` (board view) and `TasksPage`.
- **Row:** `SpacePillRow.tsx`:
  - It measures pills off screen in `.mc-pills-measure`.
  - `compact` is the bar's version.
  - `allLabel` sets the All pill's label.
  - `onNewSpace` is optional.
- **Tray:** `DropTray.tsx`, mounted once in `MemexShell`.
- **Sheet:** `EditSpacesSheet.tsx`, mounted in `MemexShell`. It opens through the store (`editSpacesOpen`).
- **CSS:** `kit.css` ("The sticky bar, the drop tray, Edit spaces"), `shell.css` (`--mc-page-x`, narrow and phone rules), and the new tokens `--mc-z-stick` and `--mc-z-tray`.
- **Styleguide:** `/styleguide#s16`.
- **Checks:** `node scripts/check-spaces.mjs <url>` against a demo-data dev server. It runs 22 checks:
  - **Bar:** hidden at the top; sticky on Cards, a board and Tasks; ↑ and re-pressing Cards both go back to the top.
  - **Fit:** at 1024, 1440 and 1920, nothing past the edge, and More in order with Edit spaces….
  - **Edit spaces:** Alt+↓ and focus, hiding, the row following, colours unchanged, and hidden spaces in More.
  - **Tray:** every space plus New space and Pin; filing into a space from More; Pin; + New space; folding away.
  - **Phone width:** the bar fits at 390.
- `check-popovers.mjs` and `bench-grid.mjs` now target the page's own row (`.mc-pills:not(.is-compact)`).

## Choices Ryan can reverse

- **The tray covers the top of the window during a drag**, including the page's own pills. Its pills are the drop targets.
- **On a space board, the bar's All pill says "Cards"** and opens Cards; a space pill opens that space's board.
- **The bar isn't on a space's Journal view (`?show=journal`),** only its board, as asked.
- **Edit spaces' line uses the width last measured on Cards.** Opened from Settings before visiting Cards, it guesses six.
