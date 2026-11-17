# Memory Cards: shipped

Memory Cards is memex's default look as of **2026-11-17** (web). It was built on `feat/memory-cards-ui` and merged into `main`. The design work it came from is in this folder: `README.md` (brief and coverage table), `REFINEMENT-NOTES.md` (pass 2), the mockups and `app-shots/`, which shows the running app on demo data.

## The classic design is kept

| What | Where |
|---|---|
| The last production build with only the classic (Pastel Sky) design | tag **`classic-design-final`** and branch **`archive/classic-design`**, both at `9d2ccdb` |
| The classic look inside today's app | `?look=classic` on any URL, or Settings → Look → Classic. Either choice is remembered in that browser (localStorage `memex.look`). `?look=cards` switches back. |

A browser that already remembered `classic` (for example from local testing) stays on classic until it is switched back.

## How the look is chosen

`src/look/look.ts` sets `html[data-look="cards" | "classic"]`. From strongest to weakest: `?look=`, then the remembered choice, then `VITE_MEMEX_LOOK` at build time, then `cards`. Everything Memory Cards draws is scoped to `html[data-look="cards"]`, and pages branch on `useCardsLook()`, so the classic look still renders as it did.

- Tokens: `src/styles/cards/tokens.css` (`--mc-*`). Core's `tokens/memoryCards.ts` copies them for the phone, and a test fails if the two drift apart.
- Kit: `src/styles/cards/kit.css` (`.mc-*`) and `src/components/cards/`. Every component is shown in every state at `/styleguide`.
- The cards stylesheet and fonts load as their own chunk.

## Space colours

Spaces can have a chosen colour. Migration `supabase/migrations/20261116120000_add_space_color.sql` adds a nullable `profiles.color` (`#rrggbb`, NULL = automatic). Before the column existed, a chosen colour was kept in the browser only (`utils/spaceColorFallback.ts`). That path stays for databases without the column.

## Run it locally

```bash
VITE_MEMEX_FIXTURES=1 npm run dev                       # demo data, Memory Cards
VITE_MEMEX_FIXTURES=1 VITE_MEMEX_LOOK=classic npm run dev   # demo data, classic
```

Grid performance on either look:

```bash
VITE_MEMEX_FIXTURES=large npx vite build --mode bench --outDir /tmp/memex-bench
npx vite preview --outDir /tmp/memex-bench --port 4173
node scripts/bench-grid.mjs "http://localhost:4173/library?look=cards" cards
node scripts/bench-grid.mjs "http://localhost:4173/library?look=classic" classic
```

## Mobile (Expo): not the default yet

The iPhone app has the same idea of a flag: classic stays the default, and `EXPO_PUBLIC_MEMEX_LOOK=cards` (or the in-app switch) turns on Memory Cards. It runs on demo data, with Metro on port 8090 so it doesn't collide with your usual 8081:

```bash
cd /Users/ratkinson/.t3/worktrees/memex/feat-memory-cards-ui-5528a7b043d59171/apps/mobile
npm install
EXPO_PUBLIC_MEMEX_LOOK=cards EXPO_PUBLIC_MEMEX_FIXTURES=1 npx expo start --port 8090 --clear
# press i for the simulator; leave out EXPO_PUBLIC_MEMEX_LOOK for the classic look
```

To flip on the phone: in the new look, the account button opens a sheet with a **New look** switch. In classic, **dev builds only** add “Try the new look” to the account menu; release builds keep that menu exactly as it is. The choice is saved on the phone (AsyncStorage `memex.look`) and wins over the env variable.

| Phone frame | State |
|---|---|
| m01 Cards and Journal (label-strip cards, hero + count, ⌕ + account, fading pills; “Today” Journal) | Done |
| Tab bar: Journal · Cards · + · Spaces · Inbox (Library renamed Cards) | Done |
| m02 Spaces as colour tiles with a Tasks tile on top (x03-style); space board header band | Done, apart from the “+ new space” tile |
| m03 Inbox and Tasks | Partly done: heroes, counts and band headers. Proposal and suggestion cards only have the shared restyle |
| m07 Account sheet | Partly done: New look, Dark mode, Sign out. No Sounds, Haptics or Font tiles: the phone has no sound, no haptics setting yet, and IBM Plex isn't bundled |
| m04, m05/m06 (share sheet, offline), m08, m09 | Not built as screens. They only pick up the restyled shared pieces (buttons, paper, type) |

`npm run check` passes in `apps/mobile`. No phone screenshots exist: the app has no web target, and running a simulator would have meant taking over yours.


The phone app's default stays classic until the remaining frames are built and a TestFlight build is cut. Nothing builds for TestFlight automatically.

## Choices made along the way (all easy to reverse)

- **Navigation:** the top bar plus space pills on desktop (x01); space tiles on the phone's Spaces tab (x03-style). Past six spaces, the rest fold into a **More** pill.
- **Docked Journal panel:** cut (x04). **J** opens the Journal tab, and ⌘K finds jots. There is no week strip.
- **Space colour:** you choose it (x11 B), with Automatic as the default. Needs the migration in §4.
- **Font:** Nunito, with Plex available in Settings → Font.
- **Sound:** on by default, as today.
- **Library → Cards:** renamed on web and phone.
- **Card captions:** one style, caption below the picture. The setting is gone in the new look (the classic look keeps it).
- **Phone tabs:** Journal · Cards · + · Spaces · Inbox.
- **Pinned sites:** moved off Everything, onto space pages, a Pinned group in ⌘K, and “Pin to top” on a card (with a gold pin badge).
- **Card open:** the centred card sheet, not the in-place expand.
- **What ••• holds:** on Cards, it opens the View panel (layouts, Show, From, Sort, Saved views, then Select cards and Open space page). On a card, it holds Copy link, Pin to top, Refresh preview, Edit… and Delete.
- **One field searches and saves.** Typing filters the cards. **Enter** or **+** opens “Save something” with what you typed, so a search never turns into a card by accident.
- **Jots appear in the Cards grid** (in colour) when the view is the plain date order with no type, source or tag filter. Filtered or re-sorted views show the Library's own items only.
- **Tasks are cards in the grid**, and the task band is gone. Done tasks live on the Tasks page.
- **Picture boxes on cards are capped** at 1.25× their width, so a tall pin can't fill a whole column. The open card shows the whole picture.
- **Inbox “Not now”** hides a suggestion for this browser session only (with Undo). Nothing is written.
- **Agent token sheet** keeps today's “Expires after” choice, which the mockup left out.
