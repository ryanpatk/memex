# Memory Cards: running the new look locally

The Memory Cards design system and screens are built into the app on the branch **`feat/memory-cards-ui`**, in the worktree:

```
/Users/ratkinson/.t3/worktrees/memex/feat-memory-cards-ui-5528a7b043d59171
```

Nothing is committed, pushed, merged or deployed. Production still runs the classic look. The new look sits behind a flag, and **the classic look stays the default**, so the old app looks exactly as before unless you turn the flag on. I compared classic screenshots from this tree with an untouched checkout of the same base commit (`9d2ccdb`), and they were pixel-identical.

## 1. Run it

```bash
cd /Users/ratkinson/.t3/worktrees/memex/feat-memory-cards-ui-5528a7b043d59171
npm install                      # once (also: cd api && npm install, only for the api tests)

# A. Demo data, no account, nothing saved (the safest way to look around)
VITE_MEMEX_FIXTURES=1 VITE_MEMEX_LOOK=cards npm run dev

# B. Your own account. The worktree has no .env, so copy yours from the main checkout (gitignored)
cp "/Users/ratkinson/Projects - Active/memex/.env" .
VITE_MEMEX_LOOK=cards npm run dev
```

Option B uses your real Supabase data, just as `npm run dev` always has. Anything you do in either look (saves, deletes, filing) writes to your real data, the same as the old app. The one exception is **space colours**. The `profiles.color` column doesn't exist in production yet, so a colour you choose is kept **only in this browser** (localStorage). Nothing about colours is written to the database (see §4).

`VITE_MEMEX_FIXTURES=large` adds about 2,400 generated cards, for checking scrolling.

## 2. Flip between the old and new looks

The look is a per-browser setting: `html[data-look="classic" | "cards"]`, decided in `src/look/look.ts`. From strongest to weakest:

| How | What it does |
|---|---|
| `?look=cards` or `?look=classic` on any URL | Switches looks and remembers the choice in this browser |
| Account button (top right) → **Back to the classic look** | Goes back to classic (new look only) |
| Settings → **Look** tile (Classic · Cards) | Switches either way (new look only) |
| `VITE_MEMEX_LOOK=cards` when starting the dev server | Sets the default for browsers that haven't chosen yet |
| Nothing set | Classic |

To get back to classic from anywhere, add `?look=classic` to the URL.

**Side by side.** The choice is saved per origin, so two dev servers on different ports keep separate looks:

```bash
npm run dev -- --port 5173                          # classic
VITE_MEMEX_LOOK=cards npm run dev -- --port 5174    # Memory Cards
```

Production (the classic look) is the third window to compare against.

## 3. What to try

- **Cards** (`/library`): hero with a count superscript, one field that searches and saves (type to filter; Enter or **+** opens “Save something” with a live card preview), space pills (click to choose; drag cards onto a pill to file them), and **•••** for the View panel (Cards · List · Table, Show, From, Sort, Saved views, Select cards).
- **Open a card**: click a link to get the centred card (Open, ••• → Copy link, Pin to top, Refresh preview, Edit…, Delete; **+ Space** opens the Move sheet).
- **Select**: ⌘-click, ⇧-click, ⌘A. The pills turn into “Add N to…” targets, and the bar at the bottom has Move to…, Delete and ✕.
- **Journal** (`/`, or **J** anywhere), **Tasks** (`/tasks`), **Inbox** (`/inbox`), a **space page** (`/spaces/<id>`, or ••• → Open … page when a pill is chosen), **Settings** and **Keys** (account button, or **?**), **⌘K**.
- **Dark mode** and the **Plex** font: Settings tiles.
- **Kit page**: `/styleguide` in the new look shows every component in every state.

## 4. The space colour migration (NOT applied)

`supabase/migrations/20261116120000_add_space_color.sql` adds a nullable `profiles.color` column (`#rrggbb`, NULL means automatic). It is additive: one new column, no rewrites. **It has not been applied anywhere.** There is no local Supabase stack in this worktree, and nothing was pushed.

Until it is applied:
- every space keeps its automatic colour (now from the Memory Cards palette in the new look),
- a colour you choose in New space or Space details is kept in this browser only (`memex.space-colors.local`),
- creating or renaming a space still works: the adapter retries without `color` when the column is missing.

Applying it to production needs your OK and a backup first:

```bash
scripts/backup-supabase.sh        # confirm the folder path + row counts
supabase db push                  # only after the backup and your go-ahead
```

Once it's applied, chosen colours save to the database and show on every device. Colours already kept in a browser stay there. The vault export writes the chosen colour to each space's frontmatter.

## 5. Checks

```bash
npm run typecheck
npm run lint
npm test
```

Grid performance on both looks (production bundle, ~2,400 generated cards; never point it at your real account):

```bash
VITE_MEMEX_FIXTURES=large npx vite build --mode bench --outDir /tmp/memex-bench
npx vite preview --outDir /tmp/memex-bench --port 4173
node scripts/bench-grid.mjs "http://localhost:4173/library?look=cards" cards
node scripts/bench-grid.mjs "http://localhost:4173/library?look=classic" classic
```

## 6. Mobile (Expo)

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

## 7. Screenshots

`app-shots/` holds screenshots of the running app in the new look, all on demo data:

- **Cards:** `cards`, `cards-space`, `cards-view`, `cards-open`, `cards-capture`, `cards-select`, `cards-list`, `cards-table`, `cards-no-results`, `cards-dark`, `cards-plex`, `cards-phone`, `cards-settings`, `cards-keys`
- **Journal and Inbox:** `journal`, `journal-menu`, `journal-dark`, `journal-phone`, `inbox`, `inbox-empty`
- **Tasks and spaces:** `tasks`, `tasks-by-date`, `tasks-menu`, `tasks-phone`, `space`, `space-journal`, `move-sheet`, `new-space`, `space-details`
- **Settings and the rest:** `settings`, `agent-tokens`, `new-agent-token`, `goto`, `note`, `sign-in`, `sign-in-error`, `not-found`, `kit`, `kit-dark`, `kit-plex`

## 8. Choices made for you (all easy to reverse)

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
