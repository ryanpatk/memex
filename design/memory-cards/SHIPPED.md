# Memory Cards: shipped

Memory Cards became memex's default look on **2026-11-17** (web) and its **only** look the same day, when the classic Pastel Sky look was retired (below). It was built on `feat/memory-cards-ui` and merged into `main`. The design work it came from is in this folder: `README.md` (brief and coverage table), `REFINEMENT-NOTES.md` (pass 2), the mockups and `app-shots/`, which shows the running app on demo data.

## Release record (2026-11-17)

| Step | Result |
|---|---|
| Classic design archived | tag `classic-design-final` and branch `archive/classic-design` at `9d2ccdb` |
| Backup before the migration | `~/memex-backups/2026-11-17T124353Z` (3.1 MB, checksums OK) |
| Migration `20261116120000_add_space_color.sql` | Applied with `supabase db push`. All 50 tables have the same row counts before and after. The 11 `profiles` rows are unchanged, with `color` NULL. A second dump: `~/memex-backups/2026-11-17T124510Z` |
| Web deploy | Cloudflare Workers version `40eb7aba-5b5c-49e9-9cb7-642a4b2f4d6a`, https://memex.joyfulsystems.workers.dev |
| Checked after deploy | Memory Cards by default, `?look=classic` shows the old look, no console errors (signed out) |

## Retiring the classic look (2026-11-17, web)

Ryan: “We can deprecate the classic view… I'm all in on the new design.” Built on `feat/retire-classic-look`, fast-forwarded into `main`.

| Step | Result |
|---|---|
| Look flag removed | `html[data-look]`, `VITE_MEMEX_LOOK`, `?look=`, Settings → Look and the account menu's “Back to the classic look” are gone. Old `?look=classic` URLs are ignored. A browser's leftover `memex.look` (and the other classic-only keys: `memex.link-captions`, `memex.self-notes-open`, `memex.library.hadPinned`) is removed once on load (`src/utils/retiredSettings.ts`) |
| Stylesheet | The Memory Cards CSS is a normal import in `main.tsx` (no lazy chunk, no wait before the first paint). Its rules moved from `html[data-look='cards']` to `html:root`, which has the same specificity, so nothing in the cascade changed |
| Code removed | 64 files deleted (17.5k lines): the classic styleguide, `/mocks` and its components, the sidebar, filter bar, command bar, docked Journal panel, task band, classic cards, rows, modals, the Journal's classic entries and Inbox tray, `LinkEditModal`, `ProjectPage` and `ProtectedPage` (`/project/:id` and `/protected` now land in Cards), plus their hooks and utils. TS/TSX in `src/`: 32.4k → 17.9k lines |
| CSS removed | Base CSS (`index.css`, `styles/*.css`, the mocks CSS) 16.6k → 2.8k lines: every rule whose selector names a class no source file can produce (read from string, template and JSX literals with the TypeScript parser), then unreferenced custom properties, keyframes and empty blocks. `tasks.css` and `space.css` were left empty and are gone |
| Checked | Computed styles of every element on 28 screens and states (Journal, Cards grid/list/table, open note and card, a space filter, Tasks by space/date/done, Inbox, space board, styleguide, 404, dark mode, the View panel, Settings, Keys, ⌘K, the capture sheet, phone width) diffed before and after on demo data: no differences beyond run-to-run timing noise, and no console errors. Typecheck, lint, 659 web tests and the build pass |
| Bundle | JS 1,508 → 1,223 KiB (gzip 448 → 378); main chunk 1,191 → 900 kB. CSS 400 → 153 KiB (gzip 59 → 28). Fonts unchanged (641 KiB) |
| Grid benchmark | `large` fixture, production bundle: 60fps and 0 dropped frames scrolling at 3,000, 8,400 and 6,000px/s; 0 long tasks; load blocking 28ms, CLS 0.0006 |
| Web deploy | Cloudflare Workers version `a8db2e92-26c1-4311-a3c2-a16c1989af79`. Checked live (signed out, fresh browser): sign-in, sign-up, 404 and protected routes render in Memory Cards; `?look=classic` changes nothing and a stored `memex.look=classic` is cleared; no console errors |
| Database | Untouched. `profiles.color` stays |

## The classic design is kept

| What | Where |
|---|---|
| The last production build with only the classic (Pastel Sky) design | tag **`classic-design-final`** and branch **`archive/classic-design`**, both at `9d2ccdb` |
| The classic look inside today's app | Gone since 2026-11-17. Check out the tag (or the branch) to run it: `git checkout classic-design-final && npm ci && VITE_MEMEX_FIXTURES=1 npm run dev` |

## One look

There is no look switch any more. `src/main.tsx` imports `src/styles/cards` after the base styles; the rules that re-dress shared base classes (the Journal's `jr-*`, List and Table rows) are scoped to `html:root` so they keep winning over the base styles. The heading font is still a choice: Nunito or IBM Plex, `html[data-cards-font]`, Settings → Font (`src/utils/cardsFont.ts`).

- Tokens: `src/styles/cards/tokens.css` (`--mc-*`). Core's `tokens/memoryCards.ts` copies them for the phone, and a test fails if the two drift apart.
- Kit: `src/styles/cards/kit.css` (`.mc-*`) and `src/components/cards/`. Every component is shown in every state at `/styleguide`.

## Space colours

Spaces can have a chosen colour. Migration `supabase/migrations/20261116120000_add_space_color.sql` adds a nullable `profiles.color` (`#rrggbb`, NULL = automatic). Before the column existed, a chosen colour was kept in the browser only (`utils/spaceColorFallback.ts`). That path stays for databases without the column.

## Run it locally

```bash
VITE_MEMEX_FIXTURES=1 npm run dev     # demo data
```

Grid performance:

```bash
VITE_MEMEX_FIXTURES=large npx vite build --mode bench --outDir /tmp/memex-bench
npx vite preview --outDir /tmp/memex-bench --port 4173
node scripts/bench-grid.mjs http://localhost:4173/library
```

## Mobile (Expo): the only look

Since **2026-11-17** Memory Cards is the iPhone app's only look. The classic look, its flag (`EXPO_PUBLIC_MEMEX_LOOK`, the account sheet's New look switch, the dev-only “Try the new look”) and the classic-only components are gone from `apps/mobile`. A `memex.look` value a phone saved while the flag existed is removed once on startup (`src/theme/legacyLook.ts`) and ignored either way. Nothing has been built for TestFlight yet.

Run it on demo data, with Metro on a port of its own:

```bash
cd apps/mobile
npm install
EXPO_PUBLIC_MEMEX_FIXTURES=1 npx expo start --port 8092
# press i for the simulator
```

| Phone frame | State |
|---|---|
| m01 Cards and Journal (label-strip cards, hero + count, ⌕ + account, fading pills; “Today” Journal) | Done |
| Tab bar: Journal · Cards · + · Spaces · Inbox (Library renamed Cards) | Done. The + opens Save something (m05) over whichever tab is showing |
| m02 Spaces as colour tiles with a Tasks tile on top; space board header band; pinned sites as round buttons | Done, apart from the “+ new space” button: the phone can't make spaces (they're made on the web) |
| m03 Inbox and Tasks | Done: proposal cards (agent badge, inline diff, reason, label strip), suggestion cards (picture, reason, filled File in pill), one paper row per task, Space · Date in the header, space pills as the filter, the Due sheet (Pick a date… opens the calendar sheet) |
| m04 Open card and note | Done: picture with Back on it, space pills + “+ Space”, Open / Share / •••; the note under its space's label strip with Saved / Editing. Edit sits beside Back (the mockup has no edit control) |
| m05 Save something and the share sheet | Done: Jot · Note · Task, the text well, space pills, Save; the share sheet shows the card it will become |
| m06 Share signed out, offline | Done: the card waits with Sign in; a save kept on the phone is a card with a “Not sent yet” strip (red “Couldn’t save” once refused), Retry and Discard |
| m07 Sign in and account sheet | Done: sign in as in the mockup; the account sheet has Dark (it follows the system) and Sign out. No Sounds, Haptics or Font tiles: the phone has no sound, no haptics setting, and IBM Plex isn't bundled |
| m08 Long-press File in and the toast | Done: one menu for every long-press (File in with each space's dot, ticked where it's filed, then Open / Mark done / Delete); the dark toast with a disc in the space's colour and Undo. No Copy link: the app has no clipboard module |
| m09 Search, empty, loading, error | Done: ⌕ swaps the pills for the field, “N cards”, “Save “…” as a jot”; blank-card loading; the dashed empty slot, red with “!” for errors (with Try again, since not every screen can be pulled) |

`npm run check` and `npm run check:release` pass in `apps/mobile`. The Cards tab lists saved links only (as the Library did), and the old Library's source filter (From X, Pinterest, YouTube) isn't on the phone any more: the mockups put it behind •••, which the phone doesn't have yet.

## Choices made along the way (all easy to reverse)

- **Navigation:** the top bar plus space pills on desktop (x01); space tiles on the phone's Spaces tab (x03-style). Past six spaces, the rest fold into a **More** pill.
- **Docked Journal panel:** cut (x04). **J** opens the Journal tab, and ⌘K finds jots. There is no week strip.
- **Space colour:** you choose it (x11 B), with Automatic as the default. Needs the migration in §4.
- **Font:** Nunito, with Plex available in Settings → Font.
- **Sound:** on by default, as today.
- **Library → Cards:** renamed on web and phone.
- **Card captions:** one style, caption below the picture. The setting is gone.
- **Phone tabs:** Journal · Cards · + · Spaces · Inbox.
- **Pinned sites:** moved off Everything, onto space pages, a Pinned group in ⌘K, and “Pin to top” on a card (with a gold pin badge). **2026-11-18:** back in the top bar on every page (Ryan picked A + C from the “Pinned sites, restored” canvas): up to five pins in the nav pill after a divider, +N opens the Pinned launcher, one gold pin button under 1100px, a space's pins inside a space, ⌥1–9, drag to reorder (new `pin_position`), and the phone's Spaces tab. “Pin to top” became “Pin to the bar”. See `docs/pinned-sites.md`.
- **Card open:** the centred card sheet, not the in-place expand.
- **What ••• holds:** on Cards, it opens the View panel (layouts, Show, From, Sort, Saved views, then Select cards and Open space page). On a card, it holds Copy link, Pin to top, Refresh preview, Edit… and Delete.
- **One field searches and saves.** Typing filters the cards. **Enter** or **+** opens “Save something” with what you typed, so a search never turns into a card by accident.
- **Jots appear in the Cards grid** (in colour) when the view is the plain date order with no type, source or tag filter. Filtered or re-sorted views show the Library's own items only.
- **Tasks are cards in the grid**, and the task band is gone. Done tasks live on the Tasks page.
- **Picture boxes on cards are capped** at 1.25× their width, so a tall pin can't fill a whole column. The open card shows the whole picture.
- **Inbox “Not now”** hides a suggestion for this browser session only (with Undo). Nothing is written.
- **Agent token sheet** keeps today's “Expires after” choice, which the mockup left out.
