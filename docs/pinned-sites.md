# Pinned sites (super favourites)

**Status:** built 2026-11-18. Ryan chose design directions A + C from the "Pinned sites, restored" canvas: pins inside the nav pill, with a launcher for the rest. This restores the classic look's one-click launcher, which the Memory Cards redesign had reduced to a card badge and ⌘K's Pinned group.

## What you see

- **Web top bar.** After a divider in the Journal · Cards · Tasks pill come up to five round site buttons (each shows the site's icon, or its first letter). Past five, a **+N** button opens the **launcher**: every pin in a three-column grid with its name.
  - Hovering a pin shows its name and its key (⌥1 … ⌥5) after a short wait.
  - An open trigger keeps its hover look, so nothing moves (`docs/popovers.md`).
- **Narrow windows** (under 1100px): the pins fold into one gold pin button in the pill, which opens the same launcher. At phone width the pill becomes the bottom tab bar and the pin button sits at its end. The launcher opens above it.
- **No pins:** the pill is exactly the three words, with no divider and no hint.
- **Which pins.** Inside a space you see that space's pins: on its page (`/spaces/:id`), and on Cards with one space chosen (`/library?space=<id>`). Everywhere else you see the global pins. The group's label says which ("Pinned sites in Kitchen reno").
  - A space's board still shows its pins in its left column, in the same order.
  - ⌘K's Pinned group always lists the global pins, in their order.
- **Phone (Expo):** the global pins head the Spaces tab under a "Pinned" label. A space's page shows that space's pins, as before. A press opens the link page.

## Pin, unpin, reorder

| | Web | Phone |
|---|---|---|
| Pin | The open card's ••• → **Pin to the bar** (on Cards with one space chosen: **Pin in Kitchen reno**). Or drag a link card onto the bar: while a link is dragged, a dashed slot appears at the end of the pins. Or use the pin toggle on a space board's saves. | Not yet (pinning happens on the web) |
| Unpin | ••• → **Unpin from the bar**. Or drag a pin off the bar and drop it anywhere on the page. Or press Delete on a focused pin. Or use **Edit pins…** in the launcher, which shows an ✕ on each. Every way offers Undo, which puts the pin back in its place. | Long-press → **Unpin**, with Undo |
| Reorder | Drag a pin within the bar or the launcher; a blue bar shows where it will land. Shift+← / Shift+→ moves the focused pin. | Long-press → **Move earlier** / **Move later** |
| Open | Click (new tab). ⌥1 … ⌥9 open the first nine (Alt on Windows/Linux), matched by the physical digit key. | Press |

- Every phone menu row is also one of the pin's VoiceOver actions.
- ⌥1–9 is ignored while you type in a field, so ⌥-characters like ¡ and the brackets on non-US keyboards still type.
- Pinning a link into a space it isn't filed in also files it there. This can only happen by dropping a card on the bar while you're in that space.
- Pressing Esc mid-drag cancels the drag and doesn't unpin. Dropping a pin outside the browser window does nothing.

## Data

- `links.is_super_favorite` (global pin) and `profile_links.is_super_favorite` (a space's pin), as before.
- **New:** `links.pin_position` and `profile_links.pin_position`, nullable integers. Lower comes first. NULL means unpinned, or pinned without a place yet; those sort after the numbered ones, by name.
  - Migration `supabase/migrations/20261118120000_add_pin_positions.sql`: additive. It numbers today's pins by name (what the app showed before), per user and per space. It writes only the new columns of pinned rows, and pauses the `links` triggers so no `updated_at` or project `last_modified` changes.
  - Tests: `supabase/tests/pin_positions.test.sql`.
- **Order logic** lives in `@memex/core` `pins.ts`:
  - `globalPins`, `spacePins` and `pinsFor` give the order.
  - `nextPinPosition` gives a new pin's place, at the end.
  - `movePin` and `pinPositionUpdates` handle a move: it renumbers the scope 1…n but writes only the rows whose number changed.
  - Also `pinLabel` and `pinShortcutIndex`.
  - The web (`src/hooks/usePins.ts`) and the phone (`apps/mobile/src/spaces/usePinMenu.ts`, `actions.setPins`) both use them.
- **Vault:** a link's frontmatter has `superFavoritePosition`; a space's board items have `pinPosition` (`docs/vault-format.md`).
- **If the migration isn't applied,** the adapter falls back: it reads without `pin_position` (pins sort by name) and pins without a place.
- **Known quirk:** pinning, unpinning or moving a *global* pin updates that link's `updated_at`, through the existing `links` trigger. Pinning always did this. It means "Sort: Edited" on Cards counts a reorder as an edit. Space pins live on `profile_links`, which has no such trigger.

## Code

- **Components:**
  - `src/components/cards/PinBar.tsx`: the bar, ⌥ keys, drops, toasts.
  - `PinLauncher.tsx`: the launcher (C), on the shared `Popover`.
  - `PinIcon.tsx`: favicon or letter.
  - `pinDrag.ts`: drag to reorder, drag off to unpin.
- **CSS:** `src/styles/cards/kit.css` ("Pinned sites in the top bar"), plus `shell.css` (the fold under 1100px, the tab bar under 760px). The bar's buttons are `.mc-pinbtn`; `.mc-pin` is the gold badge on cards.
- **Styleguide:** `/styleguide#s15`.
- **Checks:** `node scripts/check-pins.mjs <url>` against a demo-data dev server (`VITE_MEMEX_FIXTURES=1`, which has seven global pins, two placed by hand). It runs 32 checks: order, hover, launcher fit and focus, Shift+→, drag reorder, drag-off unpin and Undo, ⌥1, card drop, the open card's •••, scope (Cards in a space, the space page, the board), 1024 and 390 widths, dark, and no pins. `SHOTS=<dir>` saves screenshots.

## Choices Ryan can reverse

- **Five pins in the bar** (`PINS_IN_BAR` in core). The launcher always shows all of them, including the first five, so you can reorder across the cut.
- **Drag off the bar unpins** (with Undo). If that proves too easy to do by accident, require Edit pins instead.
- **Pinning on the phone** isn't built (only reorder and unpin). Adding "Pin" to a link's long-press menu is small.
- **⌘K lists the global pins** even inside a space.
