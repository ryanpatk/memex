# Pinned sites (super favourites)

**Status:** built 2026-11-18 as design C from the "Pinned sites, restored" canvas: one gold Pinned button beside the Inbox opens a launcher of every pin. This restores the classic look's one-click launcher, which the Memory Cards redesign had reduced to a card badge and ⌘K's Pinned group.

The first build the same day was A + C: up to five pins inside the Journal · Cards · Tasks pill after a divider, with "+N" for the rest. Ryan tried it signed in and found the pill too cluttered, so the pins moved out of the pill and into the launcher. The pill is navigation only again.

## What you see

- **Web top bar.** One gold round pin button sits just left of the Inbox. Nothing else about pins shows in the bar.
  - Clicking it opens the **launcher**: every pin in this scope, in your order, as a three-column grid of round site buttons with their names.
  - The button keeps its open look while the launcher is open, so nothing moves (`docs/popovers.md`).
  - Hovering it shows "Pinned · ⌥1–9".
- **Narrow windows and phone width:** the same button, in the same place. The launcher fits the window.
- **No pins** (or none in this space): the launcher says how to pin one.
- **Which pins.** Inside a space the launcher shows that space's pins: on its page (`/spaces/:id`), and on Cards with one space chosen (`/library?space=<id>`). Everywhere else it shows the global pins. Its title says which ("Pinned in Kitchen reno").
  - A space's board still shows its pins in its left column, in the same order.
  - ⌘K's Pinned group always lists the global pins, in their order.
- **Phone (Expo):** the global pins head the Spaces tab under a "Pinned" label. A space's page shows that space's pins. A press opens the link page.

## Pin, unpin, reorder

| | Web | Phone |
|---|---|---|
| Pin | The open card's ••• → **Pin** (on Cards with one space chosen: **Pin in Kitchen reno**). Or drop a link card on the gold button: while a link is dragged the button gets a dashed ring, which turns solid when you're over it. Or use the pin toggle on a space board's saves. | Not yet (pinning happens on the web) |
| Unpin | ••• → **Unpin**. Or, in the launcher, drag a pin out and drop it anywhere on the page, press Delete on a focused pin, or use **Edit pins…**, which shows an ✕ on each. Every way offers Undo, which puts the pin back in its place. | Long-press → **Unpin**, with Undo |
| Reorder | Drag a pin within the launcher; a blue bar shows where it will land. Shift+← / Shift+→ moves the focused pin. | Long-press → **Move earlier** / **Move later** |
| Open | Click a site in the launcher (new tab). ⌥1 … ⌥9 open the first nine from anywhere (Alt on Windows/Linux), matched by the physical digit key. | Press |

- Every phone menu row is also one of the pin's VoiceOver actions.
- ⌥1–9 is ignored while you type in a field, so ⌥-characters like ¡ and the brackets on non-US keyboards still type.
- Pinning a link into a space it isn't filed in also files it there. This can only happen by dropping a card on the button while you're in that space.
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
  - `src/components/cards/PinnedButton.tsx`: the gold button, ⌥ keys, card drops, toasts.
  - `PinLauncher.tsx`: the launcher (C), on the shared `Popover`, with its empty state.
  - `PinIcon.tsx`: favicon or letter.
  - `pinDrag.ts`: drag to reorder in the launcher, drag out to unpin.
- **CSS:** `src/styles/cards/kit.css` ("Pinned sites"). The button is `.mc-rb.mc-pins-btn`, with `.is-drop-ready` and `.is-drop-over` for card drags. `.mc-pin` is still the gold badge on cards.
- **Styleguide:** `/styleguide#s15`.
- **Checks:** `node scripts/check-pins.mjs <url>` against a demo-data dev server (`VITE_MEMEX_FIXTURES=1`, which has seven global pins, two placed by hand). It runs 27 checks: the plain nav pill, the gold button beside the Inbox, launcher order, fit and focus, Esc, Shift+→, drag reorder, drag-out unpin and Undo, ⌥1, dropping a card on the button, the open card's •••, scope (Cards in a space, the space page, the board, a space with no pins), 1024 and 390 widths, and dark. `SHOTS=<dir>` saves screenshots.

## Choices Ryan can reverse

- **Pins live only in the launcher** (design C). The A + C bar, with five pins in the pill, is in git history (`636946f`) if it's ever wanted back.
- **Dragging a pin out of the launcher unpins it** (with Undo). If that proves too easy to do by accident, require Edit pins instead.
- **The gold button shows even with no pins**, so it can take a dropped card and say how to pin one.
- **Pinning on the phone** isn't built (only reorder and unpin). Adding "Pin" to a link's long-press menu is small.
- **⌘K lists the global pins** even inside a space.
