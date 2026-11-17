# Memory Cards: design brief

> **Status, 2026-11-17: shipped.** Memory Cards is memex's only look on the web (the classic Pastel Sky look was retired the same day; its last build is tag `classic-design-final`). What was built, the choices made along the way and the state of each phone frame: [`SHIPPED.md`](SHIPPED.md). The text below is the design brief as written before implementation.

This folder holds **design work only**: HTML/CSS mockups, tokens, component sheets and rendered PNGs for **Memory Cards**, a simplified look for memex that Ryan picked from three directions. The mockups here are the design source; the app's code lives in `src/` (web) and `apps/mobile/` (phone).

- Design Page with every sheet and screen, the coverage table and the appendix: https://cursor.com/canvas/store-de911770-a135-4fc8-8342-45c4d4c702bf/3b4cf03c-7b1a-4baf-97fe-fc34d80bb1b7
- Overview image: [`overview.png`](overview.png)
- **Pass 2 (Nov 16, 2026):** [`REFINEMENT-NOTES.md`](REFINEMENT-NOTES.md) has the critique, every change with before/after paths, token changes, the alternatives explored (`x01`–`x12`) and the decisions still open. First-pass renders are kept in `png-before/`; side-by-sides are in `compare/`.
- All content in the mockups is made up (demo spaces Kitchen reno, Kyoto trip, Reading and Studio; `demo@example.com`).

## Ryan's direction

On Nov 16, 2026 Ryan described the direction he wants for memex, and for Joyful Systems overall:

> "Please look at the following pins, and note the relative proportions of elements. Items are large, options are sparing... it feels like interfaces so simple a child could use them. This is the direction I want to take memex. (And ultimately Joyful Systems)."

After reviewing three directions he picked **A: Memory Cards**, asked for components covering every current feature, and then said of the first full pass: "These are a really good start; let's kick it over to T3 to keep refining the designs." So this is still **design exploration, not implementation**.

## Joyful Systems framing

memex is part of the Joyful Systems brand ("Make work feel like play"). It should feel like a **memory toy**, not just a pleasant tool. Its game metaphor is **memory cards and save files**: each save is a chunky card with a coloured label strip, every space is a cartridge-like pill, and saving reads as *writing a card* (a short card-write blink). memex is also a shared memory bank that Ryan and many agents read and write, so agent-written cards get a visible badge and agent edits arrive as proposals in the Inbox. So far this framing is only a design idea; no product decisions have been made from it.

Joyful Systems rules that touch this work: IBM Plex is the brand typeface (memex currently uses Nunito in the wordmark), and sound should be off by default (memex has sound on by default today). Both are open decisions below.

## What the references do

The five reference pins were measured from each image and scaled to a 1440 px-wide frame, so they can be compared with memex screenshots.

| Reference | Main item | Largest type | Body | Largest ÷ body | Controls on screen | Radius | Colour |
|---|---|---|---|---|---|---|---|
| 1 · Wallet widgets ([pin](https://www.pinterest.com/pin/550424385731413542/), `refs/pin1.jpg`) | Cards 10–22% of width, one idea each | 49 px number | 14 px | 3.5× | About 1 per card | 15 px | 6 full-card saturated fills plus white |
| 2 · Social feed ([pin](https://www.pinterest.com/pin/550424385731413545/), `refs/pin2.png`) | Feed card 44% of width, photos fill 60% of it | 21 px | 17 px | 1.3× | About 30, the busiest pin | 22 px card, 42 px window | A pastel tint per post |
| 3 · Audio Lessons ([pin](https://www.pinterest.com/pin/550424385731412696/), `refs/pin3.jpg`) | Two tiles 63% of the panel | 74 px word | 13 px | 5.7× | About 25, grouped as letter tokens | 17 px window, square tiles | One yellow, black and grey, token colours |
| 4 · Misso dashboard ([pin](https://www.pinterest.com/pin/550424385731412694/), `refs/pin4.png`) | Task cards 30% of width | 100 px "85%" | 15 px | 6.7× | About 15, 1 button per card | 27 px | Sky photo, white cards, one yellow tile |
| 5 · Creatie portfolio ([pin](https://www.pinterest.com/pin/550424385731412648/), `refs/pin5.png`) | Headline 41% of width, 4 lines | 94 px | 14 px | 6.7× | 6 (a 4-icon dock and 2 cards) | About 20 px glass | Photo, white type, 3 pastel stickers |
| **memex today** (Library grid) | Cards 20% of width, 4 columns | 24 px "Library" | 14 px | 1.7× | 44 before the first card | 12 px | Neutral grey, one swatch accent |

What they have in common:

- Each card holds one idea and at most one action, usually a full-width pill.
- One hero number or word sits at 3.5–7× the body size. memex tops out at 1.7×.
- Colour fills whole surfaces (card fills, bands, photos), never just trim.
- Targets are big and round: pills and circles 44–60 px tall at 1440.
- Navigation shrinks to a few words or a dock, and filters become a few tokens.
- Pin 2 is the exception, with about 30 controls. Its lesson is the soft tinted cards and the photo-first posts, not sparseness.

Where memex departs today: the Library shows 44 controls before the first card and cards start 453 px down; link detail adds 7 more controls with a ~24 px title; the Journal teaches syntax instead of offering one obvious action; Settings piles up options; mobile cards are small and filter chips scroll off screen; Spaces show dense stats where a colour tile and one number would do; there is no hero size and colour never fills a surface.

The reference images in `refs/` belong to their creators on Pinterest and are here only as design references.

## Memory Cards in one paragraph

Every save is a chunky card (28 px radius, 16 px inset picture, a 26 px Nunito title, and a 44 px **label strip** at the bottom that names its space on the space's own colour, with the source or kind on the right). Text-only cards wear their space's colour: jots fill with it, notes tint from it. Every space is a round cartridge pill that fills with its colour when chosen. One field both saves and searches. Everything else lives behind one ••• menu. Page heroes carry their count as a superscript (Everything²⁴⁸). Type runs hero 80 (phone 52) / h1 44 / h2 32 / h3 26 / body 18 / labels 16 (nothing smaller). Spacing is 4/8/12/16/24/32/40/48/64, radii 12/16/28/40/pill, controls 60 (small 48, never under 44), motion 120/200/280 ms. (Pass 1 was hero 72, h2 28, h3 24, a 20 px picture radius and a 10 px strip.)

## Files

| Path | What |
|---|---|
| `mc_css.ts` | All tokens and component CSS, scoped to `.mc`. `.mc.plex` switches the font pair to IBM Plex; `.mc.dark` holds dark tokens. |
| `tokens.css`, `tokens.json`, `tokens.mjs` | The tokens extracted from `mc_css.ts` by `node tokens.mjs` (`make.sh` runs it). Edit `mc_css.ts`, never these. |
| `mc_lib.ts` | Component helpers that return HTML strings: button, round button, pill, field, card (link, plain, note, img, jot, task and states), menu, toast, empty state, sheet, rows, top bar, phone frame, tab bar and the demo data. |
| `mc_sheets.ts` | The 14 component sheets, `s01`–`s14`. |
| `mc_screens.ts` | 45 desktop screens `d01`–`d45` (1440×900), 9 phone frames `m01`–`m09` (2 phones each, 880×900) and 12 labelled alternatives `x01`–`x12` for open decisions. |
| `make.sh`, `build.mjs` | Render script: `./make.sh` renders everything, `./make.sh d01 m01` renders just those. Writes `html/<id>.html` and `png/<id>.png`. Needs Node 22+ (native TS stripping), `playwright-core` (`npm i --no-save playwright-core`, or set `PLAYWRIGHT_CORE`) and Chrome (`CHROME_PATH` if not in the usual place). Fonts load from the repo's `node_modules` (`@fontsource-variable/inter`, `@fontsource/nunito`); IBM Plex Sans is vendored in `fonts/` (SIL OFL). |
| `ptest.mjs` | Checks every item's markup is balanced (the design Page re-renders the same strings with a small parser). |
| `contact.py` | Makes contact sheets: `python3 contact.py out.png png/d0*.png`. |
| `compare.py`, `compare/` | Before/after side-by-sides: `python3 compare.py d01 d06` writes `compare/d01.png`… from `png-before/` and `png/`. |
| `html/`, `png/` | 80 rendered mockups. `overview.png` is a composite of 12 key ones. `png-before/` keeps the 64 first-pass renders. |
| `refs/` | The five reference pins. |

## Component library (14 sheets)

| Sheet | Components | States shown |
|---|---|---|
| s01 Tokens | Type scale, label strip in all 8 space colours, spacing, radii, system colours, targets, motion, Nunito/Plex switch | Light, dark (s13, d42), Plex (s13, d43) |
| s02 Buttons | Button (primary, secondary, danger, quiet, small), round icon button, count badge | Default, hover, pressed, focus, loading, error, disabled |
| s03 Space pills | Space pill, All, New space slot, More, space strip, suggestion strip | Seven states plus selected (filled), drop target, already in |
| s04 Save / search field | Field, @ space picker, key cap, + button | Default, hover, typing, link, loading, error, task, disabled |
| s05 Cards: variants | Memory card: link, picture save, link without picture, unfiled, note (tinted), jot (full colour), task, in two spaces | n/a |
| s06 Cards: states | Selection tick, pin badge, agent badge, saved blink | Default, hover, pressed, focus, loading, error, selected, dragging, just saved |
| s07 Menus and sheets | ••• menu (item, header, separator), view menu, confirm sheet, form sheet, text input, field error | Hover, focus, disabled, danger, error, loading |
| s08 Toasts and states | Toast (done, undo, error, offline), empty state (empty, no results, error) | n/a |
| s09 Rows | Task row, due chip, list row, table, Journal bubble | Default, hover, focus, overdue, done |
| s10 Inbox cards | Agent proposal with diff, filing suggestion | n/a |
| s11 Mobile nav | Tab bar with centre +, + button, header search and account, bottom sheet | Active tab, pressed, focus |
| s12 Controls: states | Switch, checkbox, swatch, toggle group, text input, menu item, phone tab | Default, hover, pressed, focus, loading, error, disabled, on/selected (n/a marked) |
| s13 Themes | The same kit (pills, cards, buttons, task row, switch, checkbox) in light, dark and Plex | Light, dark, Plex |
| s14 Card write | The save moment frame by frame: Enter → blank card → label stamps in → settled → toast | 0 / 120 / 280 ms, reduced motion |

Built inside screens: top bar, selection bar, capture sheet with live card preview, View panel, settings tiles, settings row, Go-to palette, key caps, note document, space header band, space tile, task-group band, slim rail and cartridges (x02), week strip and folded day rows (x05).

## Coverage: every current feature

Inventory taken from `main` at `9d2ccdb` (Nov 12, 2026): web app, Expo app and browser extension. `d` = desktop screen, `m` = phone frame, `s` = component sheet.

| # | Feature today | Memory Cards screens | Components | Status |
|---|---|---|---|---|
| 1 | Library grid, virtualized masonry (/library) | d01, d02, m01, x01–x03 | Memory card, space pills, field | Kept, 3 columns |
| 2 | List layout (?view=list) | d07 | List row, view menu | Behind ••• |
| 3 | Table layout, sortable columns (?view=table) | d08 | Table, view menu | Behind ••• |
| 4 | Saved-view tabs: Everything, Unfiled, From X, Pinterest, YouTube, your views; save, rename, update, delete view | d06 | View panel | Behind ••• (Everything becomes the All pill; rename, update, delete in a saved view's chip menu) |
| 5 | Type filter: links, notes, tasks | d06 | View panel chips | Behind ••• |
| 6 | Source filter: X, Pinterest, YouTube, Web | d06 | View panel chips | Behind ••• |
| 7 | Space filter, including Unfiled | d02, d06, x02, x03 | Space pills (filled when chosen); Unfiled in the View panel | Kept as pills |
| 8 | Sort: updated, saved, title, type, source, space | d06, d08 | View panel (Updated · Saved · Title · More…), table headers | Behind ••• |
| 9 | Search (/ in Library) with live results | d04, d05, m09 | Field, empty state | Kept, merged with capture |
| 10 | ⌘K Go to: modules, spaces, jots, pinned | d33 | Go-to palette, menu | Kept |
| 11 | Pinned sites row | d03, d12, d33, m02 | Round buttons, menu | Moved off Everything to space pages and ⌘K |
| 12 | Library task band | d01, d27 | Task card, task row | Moved: tasks are cards, the full list is Tasks |
| 13 | Capture a link (lone URL, preview) | d18, d44, m05 | Capture sheet, card | Kept |
| 14 | Capture a jot | d18, d23, m05 | Field, capture sheet | Kept |
| 15 | Capture a note (⌘↵) | d19, m05 | Capture sheet, Jot · Note · Task switch | Kept |
| 16 | Capture a task (`[] `, due date) | d20, d27 | Capture sheet, task row | Kept |
| 17 | @Space filing while typing | s04, d18 | @ picker, pills | Kept |
| 18 | Pictures (Pinterest and X saves, link previews) | s05, d16 | Image card; source in the label strip | Kept. No upload exists today, none designed |
| 19 | Browser extension popup, ⌘⇧S, context menu, X and Pinterest auto-capture | d44 | Card, pills, button | Popup restyled; options page not mocked |
| 20 | iOS share sheet, including signed out | m05, m06 | Bottom sheet, card, pills | Kept |
| 21 | Offline outbox: Not sent yet, Retry, Discard | m06, d21 | Card, field error, toast | Kept; desktop error state added |
| 22 | Link detail: Open, Copy link, Pin, Refresh preview, Edit URL, spaces | d11, d12, m04, x07, x10 | Centred card sheet, ••• menu, pills | Changed: centred card replaces the 3C in-place expand (x10 shows a bigger in-place expand). Move to… on the card is replaced by its pills and + Space |
| 23 | Edit link: URL, title, description | d13 | Form sheet, inputs | Kept; tag field stays hidden |
| 24 | Note editor, live preview, Saving… / Saved | d15, m04 | Note document | Kept |
| 25 | File into spaces: multi-space, take out, Undo | d14, m08 | Move sheet of space tiles, pills, toast | Kept |
| 26 | Drag cards to a space | d10 | Pill drop state, dragging card | Kept; drop on pills, not the sidebar |
| 27 | Multi-select: ⌘-click, ⇧-click, ⌘A, Esc; Add to space, Delete | d09 | Selection bar, selected card | Kept; the Select button goes, the keys stay; the bar's Done becomes ✕ |
| 28 | Delete with 6 s Undo | d17, s07, s08 | Toast, confirm sheet | Kept |
| 29 | Tags (`SHOW_TAGS_UI = false`) | s07 | Menu item, disabled | Hidden, as today |
| 30 | Journal 17B: jots, day groups, edit, file, make note or task, delete | d23, d24, m01, x04–x06, x09 | Bubble, strip, menu, field | Kept; the page hero reads “Today” with the count |
| 31 | Journal filing suggestions | d23, s03, s09 | Suggestion strip (“File in Kyoto trip?”, 44 px) | Kept |
| 32 | Docked Journal panel in the Library (J), day summaries, calendar jump | d23, x04, x05, x06 | Week strip, folded day rows, drawer | Still cut in d23 (x04); x05 brings back the calendar jump and day summaries in the Journal header; x06 keeps a slide-over drawer. Open decision 6 |
| 33 | Inbox: agent proposals with diff, Approve, Reject | d25, m03, s10 | Proposal card (label strip names the target space) | Kept; Reject is a quiet button |
| 34 | Inbox: filing suggestions, File, Not now | d25, m03, s10 | Suggestion card (Unfiled label, filled File in pill) | Kept |
| 35 | Inbox empty | d26 | Empty state | Kept |
| 36 | Tasks: by space or date, Done list, due dates, rename, file, delete, N to add | d27, d28, m03, x08 | Task row, due chip, task-group band, menu, toggle group, sheet | Kept |
| 37 | Spaces list (desktop sidebar, phone Spaces tab) | d01, m02, x02, x03 | Space pills, space tiles, rail cartridges | Moved: sidebar becomes the pill row, More past 6 (x02 rail and x03 bento are the alternatives) |
| 38 | Space page 14B: Journal plus board (pinned, tasks, saves, notes) | d03, m02 | Space header band, Board · Journal toggle | Kept |
| 39 | New space | d29, x11 | Form sheet, swatches; empty-slot + at the end of the pill row | Kept; colour choice is new (x11 shows automatic vs chosen) |
| 40 | Space details: rename, contents, delete | d30 | Form sheet | Kept |
| 41 | Settings: canvas colour, dark mode, sound, link-card style, sign out | d31, m07 | Settings tiles, switch, toggle group, swatch | Kept; link-card style renamed Card captions; Sounds shown off (decision 11) |
| 42 | Access tokens, agent tokens (MCP URL, read only, revoke) | d31, d32, d45 | Sheet, token rows, choice tiles | Kept; creating a token moves to its own sheet (d45); Revoke moves into each token's •••; access tokens reuse the layout |
| 43 | Dark mode | d42, s13 | Dark tokens | Kept |
| 44 | Keyboard shortcuts | d34 | Keys sheet (Go · Make · Pick, chunky key caps) | Kept; ? help sheet is new |
| 45 | Sign in, sign up, GitHub, errors | d35–d37, m07 | Form sheet, inputs | Kept |
| 46 | Empty, loading skeleton, load error, 404 | d38–d41, m09, s06, s08 | Empty card slot, loading card, loading pill | Kept |
| 47 | Toasts with Undo or Open | d17, d22, m08, s08, s14 | Toast | Kept |
| 48 | Phone tabs: Journal, Library, Spaces, Inbox; Tasks pill; account | m01–m03, m07, s11, x12 | Tab bar, + button, header | Kept; Library renamed Cards, + added in the centre. The Tasks header pill moves to the Tasks tile at the top of Spaces (m02); search becomes a ⌕ button. x12 shows three tabs instead |
| 49 | Phone long-press File in…, pull to refresh, infinite scroll | m08, m09 | Menu, toast | Kept |
| 50 | /styleguide | s01–s14 | Component sheets | Replaced by the sheets (built: `/styleguide` is the live kit) |
| 51 | /mocks, legacy routes (/dashboard, /project/:id, /links, /notes), MissingEnv | None | None | Not redesigned (dev-only or redirects). 2026-11-17: `/mocks` deleted with the classic look; `/project/:id` and `/protected` now redirect to Cards |

## Hidden, moved, cut or new

**Hidden behind the Library ••• menu (d06)**
- List and Table layouts
- Saved-view tabs, with Save, Rename, Update and Delete view
- Type filter, Source filter and the Unfiled filter
- Sort
- The Select button (⌘-click, ⇧-click and ⌘A still select, d09)
- Tags stay switched off, as today (`SHOW_TAGS_UI = false`; a disabled "Show tags" item in s07)

**Removed, moved or renamed**
- (pass 2) The card meta row (space dot, space name, source, time) → the label strip: space name on the left, source, kind or time on the right. Saved dates stay in card open, List and Table.
- (pass 2) Counts on space pills → the hero superscript for the current view, the phone and bento space tiles, and ⌘K.
- (pass 2) “+ New space” pill → an empty-slot “+” at the end of the pill row (the text pill stays on first run, d38).
- (pass 2) “Move to…” on an open card → its space pills and “+ Space” (Move to… stays in the selection bar and the long-press menu).
- (pass 2) Agent-token form inline under the list → its own sheet (d45); Revoke → each token's •••.
- (pass 2) Phone Tasks header pill → the Tasks tile at the top of the Spaces tab (m02); phone search field → a ⌕ header button (m01, m09).
- (pass 2) The selection bar's Done and Esc key cap → one ✕ button (Esc still works).
- Desktop sidebar → a top bar (Journal · Cards · Tasks, Inbox, account) plus a space pill row that keeps drag-and-drop; past 6 spaces the rest fold into a "More" pill.
- Pinned-sites row → off Everything, onto space pages (d03, m02), a Pinned group in ⌘K (d33) and "Pin to top" on a card (d12).
- Library task band → task cards in the grid, the Tasks view and space boards.
- 3C in-place link expand → a centred card sheet (d11).
- Desktop Space page → its Journal moves behind a Board · Journal toggle (d03).
- "Library" → "Cards", on web and phone.
- Link-card style (Hover / Overlay / Inset) → Settings "Card captions: Below / Overlay / Inset".

**Cut**
- The docked Journal panel in the Library. J now opens the Journal tab and ⌘K finds jots; its day summaries and calendar jump are not carried over in the main screens. Pass 2 draws two ways to keep them: in the Journal header (x05) or as a slide-over drawer (x06).

**Not redesigned or not mocked**
- `/mocks`, legacy routes (`/dashboard`, `/project/:id`, `/links`, `/notes`), the missing-environment screen, the extension options page.
- The Access tokens sheet (reuses the Agent tokens layout in d32).
- `/styleguide` is replaced by the component sheets.

**New, not in the app today**
- (pass 2) The label strip, full-colour jots and space-tinted notes (s05), the live card preview in the capture sheet (d18–d20), settings tiles (d31), the empty card slot (s08), task-group bands (d27).
- Choosing a space colour (d29, d30). Colours are automatic today; choosing one would need a `profiles.color` column.
- Font switch (d31, d43), a "?" shortcut sheet (d34), the card-write blink (d22), an agent-written badge (s06), a centre + tab on the phone (s11).
- Phone Sounds and Haptics switches (m07); the phone uses haptics but has no switch.
- Not included: image upload or capture (pictures still arrive via link previews and Pinterest/X saves), and archive (delete keeps its 6 s Undo).

## Open decisions for Ryan (13)

Pass 2 marks which of these the new mockups answer or reframe: see `REFINEMENT-NOTES.md` § 5.

1. The Nov 4 hold: design exploration is unblocked; does that also unblock implementation, or does it wait for the v1 sign-off?
2. Font: Nunito (rounded, already in the wordmark) or IBM Plex, as the Joyful Systems rules say? It's one token either way (d43).
3. Drop the desktop sidebar for the top bar and space pills?
4. Replace the 3C in-place expand with the centred card (d11)?
5. Keep List, Table, saved views, filters and sort behind ••• (d06), or remove some of them?
6. Cut the docked Journal panel? If its calendar jump or day summaries matter, they could go in the Journal header.
7. Pinned sites: off Everything, onto space pages and ⌘K?
8. Rename Library to Cards on web and phone?
9. Phone tabs: Journal, Cards, +, Spaces, Inbox, with Tasks staying a header pill?
10. Space colour choice (d29, d30) needs a `profiles.color` migration. Approve it, or keep automatic colours?
11. Sound is on by default today, but Joyful Systems says off by default. Which? And should the phone get Sounds and Haptics switches?
12. Keep the Card captions setting, or pick one caption style and drop the setting?
13. Is image upload a new feature to design next, or out of scope?

## Where this goes next

Implementation is **not** started. When Ryan signs off, a phased plan is on the design Page: tokens and a `html[data-look=cards]` flag, a component kit, the shell, the Cards view, card open and editing, capture, Journal/Inbox/Tasks/Spaces/Settings, the Expo app, then switch-over and cleanup. Until then, refinement happens here, as mockups.
