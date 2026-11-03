# memex for iPhone (Expo)

The native app lives in `apps/mobile`: React Native on **Expo SDK 58** with Expo Router. ROADMAP Phase 6, v1 on TestFlight. Following decision 20, it reads data straight from Supabase through `@memex/core`, using the same Repository and adapter as the web app. RLS limits every query to the signed-in user.

**Status (2026-11-01, threads M6-A to M6-D):** four tabs (Journal, Library, Spaces, Inbox) plus pushed screens for Tasks, a space's board, a note and a link, a sign-in screen with email + password and GitHub OAuth, the iOS share extension with its share sheet, and saves that wait on the phone while it's offline. Light and dark follow the system. Next: TestFlight, which needs Ryan's Apple accounts (checklist below).

- **Journal** (M6-B): the feed plus a composer above the tab bar with the web's syntax, from core: plain text saves a jot, a lone URL saves a link, `[] ` starts a task, `@Space` files it, and the page button makes a note (phones have no ⌘↵). Saves appear at once and roll back if they fail. Tick tasks in place, tap a link for its detail, press a dashed suggestion chip to file an entry, long-press anything for its menu (Open, Mark done, File in…, Delete). Deleting and filing show a toast with Undo. Pull to refresh.
- **Link detail** (M6-B): picture, title, description, source and date; spaces as toggles; Open in Safari (in-app browser), Share, Delete with Undo.
- **Library** (M6-B): every saved link as a two-column masonry, newest saved first, with source chips, search and infinite scroll.
- **Spaces** (M6-C): every space in its own hue with how many items it holds, its open tasks, when something last landed there and its three newest entries; Tasks across all spaces sits on top. Pull to refresh.
- **A space's board** (M6-C, decision 14B in phone form): the space's pinned sites, then its own Journal (jots written there and everything filed there, newest at the bottom), with the composer filing into the space unless the text names another `@Space`. The header's Tasks pill opens Tasks filtered to the space.
- **Inbox** (M6-C): agents' proposals first (who, what, the item, the reason, and the change as a line diff or before → after; **Approve** applies it, **Reject** keeps the record), then filing suggestions (the item, the likely space with its reason, **File in …** and **Not now**, both with Undo). The tab's badge counts both, like the web's Inbox button.
- **Tasks** (M6-C, `docs/tasks-view.md` on the phone): reached from the Tasks pill in the Journal's header (open count, red dot when something is overdue), the top of the Spaces tab and a space's header. Grouped by space or by due date, a space filter (Every space · each space · Unfiled, with open counts), an add field on the composer's syntax, tick with Undo (the row holds a beat checked, then moves to Done), due dates from the chip (Today, Tomorrow, Next week, Pick a date… with the system calendar, No due date), long-press for Mark done, Due date…, Rename…, Spaces… and Delete (with Undo), and a folded Done list, 50 at a time.
- **Share sheet** (M6-D): share a link or text from Safari, X, YouTube or any app, pick **Save to memex**, and the app opens on its share sheet (section below). Pick a space or type `@Space` in the note, press Save, and it's in your Journal.
- **Offline** (M6-D): a save from the composer or the share sheet that can't reach Supabase is kept on the phone and shows at the bottom of the Journal as not sent yet, with **Retry** and **Discard**. It sends on its own when the connection comes back (section below).
- **Notes** (M6-C): tap a note in any feed. Its title, date, spaces and markdown rendered on paper (headings, lists, task boxes, quotes, code, links that open in Safari). **Edit** shows the stored markdown as plain text with its title; Save writes through the Repository. If the note changed elsewhere while you edited, Save asks before overwriting; Back and Cancel ask before dropping unsaved changes.

| | Light | Dark |
| --- | --- | --- |
| Sign in | ![](mobile/sign-in-light.png) | ![](mobile/sign-in-dark.png) |
| Journal, composer empty | ![](mobile/journal-light.png) | ![](mobile/journal-dark.png) |
| Typing a task with `@Ky…` (the space picker) | ![](mobile/journal-task-light.png) | ![](mobile/journal-task-dark.png) |
| A draft task with the filer's suggestion | ![](mobile/journal-suggestion-light.png) | ![](mobile/journal-suggestion-dark.png) |
| After sending a jot, a link `@Studio` and a task `@Kyoto trip` | ![](mobile/journal-sent-light.png) | ![](mobile/journal-sent-dark.png) |
| Link detail | ![](mobile/link-light.png) | ![](mobile/link-dark.png) |
| Library | ![](mobile/library-light.png) | ![](mobile/library-dark.png) |
| Spaces | ![](mobile/spaces-light.png) | ![](mobile/spaces-dark.png) |
| A space's board (Reading: pinned sites, its Journal, the composer filing there) | ![](mobile/space-light.png) | ![](mobile/space-dark.png) |
| Inbox: agents' proposals (filing, an append with its diff), then filing suggestions | ![](mobile/inbox-light.png) | ![](mobile/inbox-dark.png) |
| Tasks by space | ![](mobile/tasks-light.png) | ![](mobile/tasks-dark.png) |
| Tasks by due date | ![](mobile/tasks-date-light.png) | ![](mobile/tasks-date-dark.png) |
| A note | ![](mobile/note-light.png) | ![](mobile/note-dark.png) |

The signed-in screenshots use the dev-only demo data, not real data. They come from an iPhone 17 Pro simulator on iOS 26.4 running Expo Go 58.0.7. The simulator couldn't be tapped from scripts, so the composer states were reached with `?draft=` deep links and the saves with the dev-only `&send=1` (below), and the M6-C screens with deep links (`/spaces`, `/space/reading`, `/inbox`, `/tasks`, `/tasks?group=date`, `/note/n2`). Taps (approve, reject, file, not now, tick, Undo, due dates, editing a note) are covered by component tests instead.

## Share extension (M6-D)

**How it works.** The share extension is a small native target that [expo-share-intent](https://github.com/achorein/expo-share-intent) 9 (the version for SDK 58) generates at prebuild. It accepts one URL, one web page (Safari also sends the page title) or text. It writes the item to the App Group's shared `UserDefaults` and opens `memex://dataUrl=memexShareKey#…`. `src/app/+native-intent.tsx` turns that link into `/share`, and the share screen reads the item from the plugin's native module (`ShareIntentProvider` in `_layout.tsx`, with `resetOnBackground: false` so a GitHub sign-in doesn't drop it).

The sheet is a screen in the app (`src/app/share.tsx`, presented as a form sheet), not a React Native view inside the extension. The Supabase session stays in the app's keychain and never crosses the App Group. Two processes refreshing one rotating refresh token would sign each other out, and an extension bundle would carry a second copy of React Native under the extension's memory limit. The cost: sharing switches to memex (iOS shows “◀ Safari” in the status bar to go back). The plugin's author decided the same; an in-host sheet would mean `expo-share-extension` and a separate bundle with keychain sharing (Known gaps).

**The sheet** (`src/share/ShareSheet.tsx`, logic in `src/share/shareModel.ts`):

- **A link** shows its site (with the platform for X, YouTube and Pinterest), the page title when the app sent one, and the URL. The **Note** field is optional: its words become the link's description (core's capture rule: “why I saved this” wins), and `@Space` in it files the link, with the composer's @ picker.
- **Text** is editable and follows the composer exactly (`parseComposer`): a jot, `[] ` for a task, a lone URL for a link, the page button for a note.
- **Space**: a row of chips, the spaces you filed in most recently first, then the rest; **Journal** means unfiled. One chip at a time (a jot lives in one space); `@Space`s typed in the text are added to it. The header says where it'll land.
- **Save** goes through the same path as the composer: `useEntryActions().compose` → `saves.save` → `actions.compose` → core's capture service for links, so a shared link dedupes like the extension's and the composer's (same post, same platform id, same normalized URL). Shared links are stored with `captured_by: 'share'` (in core's vocabulary and the database's check constraint) and `captured_client: 'memex-ios/<version>'`. Jots, notes and tasks from the sheet are stored like the composer's.
- **Signed out**, the sheet keeps the preview, says “You're signed out of memex”, and offers **Sign in**. The item waits in memory (`src/share/shareDraft.ts`) and the sheet reopens after sign-in. It isn't kept across launches.
- What arrived is decided by core: `parseSharedContent` (`@memex/core/capture`). One http(s) URL with at most a short line around it (≤ 200 characters) is a link, and the line becomes the note. Several URLs or longer text stay text. Files and images aren't accepted (the extension doesn't offer itself for them).
- `memex://share?url=…&title=…&text=…` opens the same sheet (nothing is saved until you press Save). That's how the screenshots below were made, and it also works from Shortcuts. Only in a dev build on demo data, `&send=1` also presses Save (like the Journal's `?draft=…&send=1`).
- Signed in, the sheet is an iOS page sheet over the Journal (`unstable_settings.anchor = '(tabs)'`, so a cold start from the extension has the Journal under it). Signed out it's a full screen, since there's nothing to sit over.

| | Light | Dark |
| --- | --- | --- |
| Share sheet: a link from Safari, filed in a space | ![](mobile/share-light.png) | ![](mobile/share-dark.png) |
| Share sheet: signed out | ![](mobile/share-signed-out-light.png) | ![](mobile/share-signed-out-dark.png) |

**Verified in the simulator** (2026-11-01, a local dev build of this app with the extension, `npx expo run:ios` on an iPhone 17 simulator, iOS 26.4, on demo data): prebuild generates the `Savetomemex` target; the build installs with both targets signed for the simulator; the App Group container `group.com.joyfulsystems.memex` exists on the device. The extension's last step was reproduced exactly: its item (a URL and Safari's page metadata, encoded as the extension encodes it) written to the App Group's `memexShareKey`, then `memex://dataUrl=memexShareKey?nonce=…#weburl` opened. The app went from a cold start to the share sheet with the URL and the page title, read through the plugin's native module. Saving was proven with the dev-only `&send=1` (below): a new link landed in the Journal with “Saved to your Journal.”, and an already-saved URL answered “Already saved.” **Not verified:** pressing Share → Save to memex inside Safari itself, because the simulator can't be tapped from scripts here; that's step 11 of the TestFlight checklist. Taps in the sheet (note, `@` picker, chips, Save, offline, signed out, Close) are covered by component tests (`src/share/ShareSheet.test.tsx`, `src/screens/share.test.tsx`).

**Identifiers** (set in `app.json` → `plugins` → `expo-share-intent`; nothing is registered with Apple yet):

| | Value |
| --- | --- |
| App bundle id | `com.joyfulsystems.memex` (unchanged) |
| Share extension bundle id | `com.joyfulsystems.memex.share-extension` |
| Extension target / name in the share sheet | `Savetomemex` / “Save to memex” (the target name is the display name minus spaces; plain “memex” would clash with the app target) |
| App Group (both targets' entitlements) | `group.com.joyfulsystems.memex` |
| URL scheme the extension opens | `memex` (the app's `scheme`) |
| Activation rules | `NSExtensionActivationSupportsWebURLWithMaxCount` 1, `…WebPageWithMaxCount` 1, `…Text` |
| Android | `text/*` share intent on the main activity (configured, not tested) |

`npx expo prebuild --platform ios` writes the target under `ios/Savetomemex/` (Swift view controller, Info.plist, entitlements, the Safari preprocessing script that reads the page title) and adds an `extra.eas.build.experimental.ios.appExtensions` entry to the resolved config, so EAS creates credentials for the extension too. `ios/` stays gitignored (CNG).

## Offline (M6-D)

**What happens.** Every save from the composer and the share sheet runs through `src/data/saves.ts`. It's tried straight away, as before (optimistic row, rollback on failure). If the failure is one worth retrying (core's `isTransientError`: no connection, a dropped connection, a timeout, HTTP 408 / 429 / 5xx), the save goes into core's outbox (`createOutbox`, `@memex/core`) instead of being lost. The composer's text is cleared and a toast says “No connection. Kept on this phone; it'll send when you're back online.” Anything else (the server said no) fails as before and the text goes back in the box.

**On the phone.** The outbox is stored with the session's encryption (`src/data/outboxStorage.ts`: a fresh AES key per write in the keychain, ciphertext in AsyncStorage), so it survives the app being killed. Each item belongs to the signed-in user and is only sent while they're signed in. Demo data uses its own key.

**In the Journal.** Waiting saves sit at the newest end of the feed, above the composer (`src/journal/PendingSaves.tsx`): paper with a dashed edge, the kind, site and spaces, the text, and where it stands (“Waiting for a connection · tried 3 times”, or “Couldn't save: …” in red if the server refused it). **Retry** sends it now. **Discard** drops the copy on the phone, with Undo, and never touches anything already saved. While a save is being sent it shows as a normal entry in the feed instead.

**When it sends** (`src/data/useOutboxSync.ts`): at launch (once the stored queue is read), when the app comes back to the foreground, when the connection comes back (`@react-native-community/netinfo`), and after each backoff while the app is open (5 s doubling to 10 min, ±25%). A round stops at the first offline failure. A refused save stops retrying until you press Retry. A toast says “Sent 2 saves kept on this phone.”

**Never twice.** The save's id is chosen on the phone before the first try (`expo-crypto` `randomUUID`), and jots, notes and tasks are created with it. If the first try reached Supabase but the answer was lost, the retry hits the primary key and core's adapter returns the saved row instead of making another. A link retry looks for an earlier copy on the server, not in the cache (the capture service's dedupe), so it comes back as “already saved”. Jots, notes and tasks keep the time they were written (`created_at` = when first tried), so an offline jot sits in the Journal where you wrote it. Links are dated when they reach the server.

**Proven by tests**, on the demo repository behind a network switch (`src/testing/network.ts`): `src/data/saves.test.ts` (offline → kept and stored → sent once when online; a lost answer for a jot and for a link → still one copy; refused saves aren't kept; only the owner's saves send; discard asks nothing of the server), `src/journal/PendingSaves.test.tsx` (the pending row, Retry offline and online, sending on its own after the backoff, Discard with Undo, a refused save's reason) and core's `outbox/outbox.test.ts` and `supabase/creates.test.ts`.

## When something fails (M7)

A load that fails, offline or refused by the server, says so instead of looking like an empty account. Spaces, Inbox, Tasks, a space's board, a note and a link show “You're offline” or “Couldn't load your …” with **Try again**, and never “No spaces yet” or “isn't here anymore”. They refetch when the connection returns (React Query's `onlineManager` on NetInfo). The Journal keeps its composer, so saves still queue offline. A root `ErrorBoundary` (`src/ui/ErrorScreen.tsx`) catches render errors. Failed pull-to-refresh, sign-in, sign-out and link opens show a message. Tests: `src/screens/errors.test.tsx`, `src/screens/auth.test.tsx`.

## Run it

You need Node 22+, Xcode with an iOS Simulator runtime, and the Xcode license accepted once (`sudo xcodebuild -license accept`; done on Ryan's Mac as of 2026-11-01). Without the license, Expo CLI can't drive the simulator (`xcrun simctl … exited with code 69`).

Expo Go runs everything except the share extension (it has no native targets of its own; the app treats the module as absent). For the extension, make a local dev build: `npx expo prebuild --platform ios` (CocoaPods 1.17 is on the mise Ruby, so run it from a login shell), then `npx expo run:ios`. `ios/` is generated and gitignored. Prebuild also rewrites `package.json`'s `ios` script to `expo run:ios`; don't commit that.

```bash
cd apps/mobile
npm install
cp .env.example .env      # then fill in the web app's VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY values
npm run ios               # starts Metro and opens the app in Expo Go on the simulator
```

- **Demo data:** `npm run fixtures` (then press `i`) runs on built-in invented data with a signed-in demo user. Use `EXPO_PUBLIC_MEMEX_FIXTURES=signed-out npx expo start` to start at the sign-in screen instead, where any credentials sign in. Demo mode is dev-only. The flag is ignored when `__DEV__` is false, and `npm run check:release` (also in CI) fails if any fixture code reaches a release bundle. Demo data is core's in-memory Repository (`@memex/core/memory`) over the app's demo rows, so writes work and vanish when the app reloads; nothing reaches Supabase, and link metadata isn't scraped.
- **Deep links:** `memex:///?draft=<text>` (in Expo Go, `exp://127.0.0.1:8081/--/?draft=…`) opens the Journal with text in the composer; nothing is saved until you send. Only in a dev build on demo data, `&send=1` also sends it. That's how the simulator screenshots were made, and it can't write anywhere else. `…/--/link/<id>` opens link detail, `…/--/library` the Library, `…/--/spaces` and `…/--/inbox` those tabs, `…/--/space/<id>` a space's board, `…/--/note/<id>` a note, and `…/--/tasks` Tasks (with `?group=date`, `?space=<id>|unfiled` and `?done=1`; the screen keeps these in its URL as you change them).
- **Link metadata:** set `EXPO_PUBLIC_SCRAPER_URL` (the web's `VITE_SCRAPER_URL`) to fill titles, descriptions and pictures when a link is saved from the composer. Without it, links save with what the URL says, and the favicon comes from Google's favicon service, as on the web.
- **On your phone:** install Expo Go, run `npx expo start`, scan the QR code.
- **Checks:** `npm run check` (typecheck, lint, then `npm test`: Vitest for the plain-TS `*.test.ts`, Jest with React Native Testing Library for the component `*.test.tsx`) and `npm run check:release` (release iOS bundle, no fixture code). CI runs both in the `mobile` job of `.github/workflows/ci.yml`, next to the web job.

## Architecture

```
apps/mobile/
  app.json                 name, scheme `memex`, bundle id, splash, plugins
  metro.config.js          watches ../../packages/core; core's imports resolve from this app's node_modules
  jest.config.js, jest.setup.js   component tests (jest-expo); native modules the tests touch are mocked
  src/app/                 Expo Router routes (no tests in here: every file is a route)
    _layout.tsx            providers (theme, React Query, toast, data), fonts, Stack.Protected
    sign-in.tsx            email + password, Continue with GitHub
    auth/callback.tsx      memex://auth/callback (cold-start OAuth redirect)
    (tabs)/                index (Journal + composer), library (masonry), spaces, inbox
    link/[id].tsx          link detail
    note/[id].tsx          note view + plain-markdown editing
    space/[id].tsx         a space's board (scoped Journal + composer)
    tasks.tsx              Tasks
    share.tsx              the share sheet's screen (form sheet; signed in or out)
    +native-intent.tsx     memex://dataUrl=… from the share extension → /share
  src/auth/                encryptedStorage (session at rest), oauth (redirect parsing), signInWithGitHub, SessionProvider
  src/data/                config, client (captured_client), keys (React Query), repository, DataProvider,
                           actions (the writes), deleteQueue (Undo), journal (core model → feed, space summaries
                           and boards), useJournal, library + useLibrary, scraper, tasks (core's Tasks view),
                           inbox + useInbox (proposals), dismissals (Not now, on this phone),
                           saves (every save; offline → core's outbox), outboxStorage, useOutboxSync
  src/data/fixtures/       DEV-ONLY demo rows + the memory Repository over them
  src/journal/             Composer + composerModel, the feed and its entry renderers, entryMenu, useEntryActions,
                           PendingSaves (saves waiting on the phone)
  src/share/               ShareSheet, shareModel (what arrived, recent spaces, what Save makes), shareDraft
  src/library/             LibraryCard
  src/spaces/              SpaceCard, PinnedSites
  src/inbox/               ProposalCard, SuggestionCard
  src/tasks/               TaskRow, TaskAdd, TasksButton, DueDateSheet, dueMenu, taskMenu, useTaskActions
  src/notes/               markdown (block + inline parser, tested), MarkdownView
  src/screens/             screen tests (Library, link detail, Spaces, a space, Inbox, Tasks, notes)
  src/testing/             renderWithData: the app's providers over the demo repository; withNetwork (an offline switch)
  src/theme/               palette (core tokens → hex) and theme (type roles, paper / object depth)
  src/ui/                  Text, Paper, Button (objects), RoundButton, Segmented, TextField, FilterChip, Toast, Canvas,
                           ScreenHeader / StackHeader, Wordmark, chips, placeholders
```

**A separate npm project, not a workspace member.** Expo SDK 58 pins React 19.3 and React Native 0.88. The web app is on React 19.1, and joining the root workspace would hoist two Reacts into one tree. So `apps/mobile` has its own `package-lock.json`, like `api/` and `extension/`, and depends on core with `"@memex/core": "file:../../packages/core"`. The web's install, lockfile, build and deploy are untouched; root ESLint ignores `apps/`. Two settings make core resolve its own imports from this app:

- `metro.config.js` watches `packages/core` and resolves core's bare imports (`@supabase/supabase-js`) as if the app had made them, so one copy gets bundled.
- `tsconfig.json` maps `@supabase/supabase-js` to `./node_modules/…` for the same reason. supabase-js stays on `~2.49` to match the web, because newer typings reject core's `Database` type.

**The data layer.** React Query hooks over the Repository live in the app (`src/data/useJournal.ts`), one query per resource, with keys that match the web's hooks. They have no web dependencies, so they can move into a shared `@memex/react` package when the web adopts them. That move was out of scope here: this thread didn't change the web's hooks. `src/data/journal.ts` turns rows into core's Journal model (`buildEntries` → `toParts` for day separators and runs of platform saves, `createFiler` and `inboxOf` for the Inbox) and converts space colours to hex.

**Writes (M6-B).** `src/data/actions.ts` (`createJournalActions`) holds every write as plain functions over the Repository and the React Query cache, so they're unit-tested without React. Each one puts an optimistic row (`temp-` id) in the cache, swaps in the saved row when the Repository answers, and rolls back on failure. That's the same pattern as the web's hooks, which the app can't import (they live in the web app and depend on its store).

- **Composer:** core's `parseComposer` decides what the text is, exactly as on the web (`src/journal/Composer.tsx` adds only the phone UI, and `composerModel.ts` the picker maths). A jot goes in its first `@space` (`profile_id`); tasks and notes are created, then filed in every `@space`. If only the filing fails, the item stays saved and a toast says which spaces failed.
- **Links go through core's capture service** (`createCaptureService` over the new `createRepositoryCaptureStore`, `@memex/core/capture`), so a phone save dedupes exactly like the extension's: same platform id, the same post under another URL, or the same normalized URL. A duplicate isn't saved twice; the toast says “Already saved” and the requested spaces are still applied. New links get `source` / `source_id` / `url_key` from `identifySource`, `captured_by: 'app'` and `captured_client: 'memex-ios/<app version>'`. The web's own composer still saves links without these provenance fields; the phone follows the capture rules instead, since the schema already allows `app`.
- **Delete with Undo:** `deleteQueue.ts` hides the entry at once and deletes it after 6 seconds unless Undo is pressed. If the delete fails, the entry comes back with an error toast. Pending deletes run straight away when the app goes to the background.
- **Filing:** suggestion chips, the long-press “File in…” menu and the link detail toggles all go through `actions.file` / `unfile`, with Undo on the toast.
- **Tasks (M6-C):** `setTaskDone`, `setTaskDue` and `renameTask` patch the cached row and put back only the changed fields if the write fails. Ticking moves `updated_at` too, so the task sorts first in Done (core's `compareDoneTasks`) before the refetch.
- **Notes (M6-C):** `updateNote` saves the title (an empty one is stored as null, as on the web) and the markdown with `notes.update`, optimistic with rollback.
- **Agent proposals (M6-C):** `decideProposal` calls core's `applyProposal` / `rejectProposal` (`@memex/core/agent`), the web Inbox's path. The proposal leaves the list at once and comes back if that fails; approving refetches the item it changed. Proposals refetch every minute while the app is open, like the web's.
- **Not now (M6-C):** dismissing a filing suggestion stores the entry id on the phone (`src/data/dismissals.ts`, AsyncStorage, pruned after 90 days and capped at 500). The Journal model wraps core's filer so a dismissed entry gets no suggestion anywhere: the Inbox, the feed's dashed chip, link detail. Nothing about the item changes, and nothing syncs (see Known gaps).
- **Library:** `src/data/library.ts` runs core's `linkToItem`, `matchesLibraryFilters` (source), `itemMatchesSearch` and `sortItems` (newest saved), the same functions as the web Library. `useLibrary` hands FlashList one page of 24 at a time.

**Reused from core (M6-C).** Spaces: `entriesInSpace` + `toParts` for a space's feed, `spaceBoard` for its counts, tasks and pinned sites, `withDefaultSpace` for its composer. Tasks: `taskSpaceMap`, `filterTasksBySpace`, `splitTasks`, `groupTasks`, `countOpenTasksBySpace`, `dueBucket`, `dueLabel`, `isOverdue`, `daysUntilDue`, `dueShortcuts`, `parseTaskGrouping`, `parseTaskInput`, `toDayKey` / `fromDayKey`. Inbox: `inboxOf` + `createFiler`, `proposalFields`, `changedSinceProposed`, `compactDiff`, `applyProposal`, `rejectProposal`. New in the app: the phone's one-beat hold before a ticked task moves to Done (`toTasksView`), the dismissals store, `proposalTarget` (the same eight lines as the web's `components/journal/proposalTarget.ts`; it can move to core once M3-B settles), and a small markdown parser for reading notes (the web uses react-markdown). Core wasn't changed in this thread.

**Reused from core (M6-D).** `parseSharedContent` / `urlsInText` (new, `capture/share.ts`), `parseComposer`, `extractMentions`, `identifySource` and `SOURCES` in the sheet; `parseCaptureInput` + `createCaptureService` for shared links (as for the composer's); `createOutbox` and `isTransientError` (new) for offline saves; the Repository's new optional `id` and `created_at` on jot, note and task creates. Core changes are additive and tested; the web doesn't use them yet and behaves as before. New in the app: the share sheet UI and its glue (`shareModel`), the save path over the outbox (`saves`), the sync triggers and the pending rows.

**Two new dependencies (M6-D):** `expo-share-intent` 9.0 (config plugin + a small native module; not in Expo Go, where the app treats it as absent) and `@react-native-community/netinfo` (in Expo Go). Both added with `npx expo install`.

**One new dependency (M6-C):** `@react-native-community/datetimepicker` (the SDK 58 version, added with `npx expo install`, config plugin in `app.json`) for Tasks' Pick a date… sheet, the system's inline calendar. It ships in Expo Go; EAS builds include it like any other native module.

**Feel.** The composer and its chips are objects: they settle when pressed and tick with haptics. Send gets a medium impact and success or error haptics when the save resolves. The feed, link detail and Library cards are paper: they tint when pressed but never move. The suggestion chip is dashed and carries its reason (web: `.jr-chip.is-suggested`). Toasts are announced to VoiceOver. Every entry's menu is also exposed as VoiceOver actions, and every control has a text label.

**Auth.** `createMemexClient` is called with `flowType: 'pkce'`, `detectSessionInUrl: false` and an encrypted `AuthStorage`. SecureStore caps values at 2 KB, so each write encrypts the session with a fresh AES-256 key (CTR mode via `aes-js`, random bytes from `expo-crypto`). The key goes to the keychain (`AFTER_FIRST_UNLOCK`) and the ciphertext to AsyncStorage. GitHub sign-in calls `auth.signInWithOAuth('github', { redirectTo, skipBrowserRedirect: true })` and opens the URL with `WebBrowser.openAuthSessionAsync`, then passes the `code` from the redirect to `auth.exchangeCodeForSession`. Token refresh runs only while the app is in the foreground (`auth.setAutoRefresh`). Those three auth additions were made to core in this thread; they're additive and tested.

**Design.** The palette comes from `PASTEL_SKY_COLORS`, and the accent roles from the canvas swatch, using the same `buildThemeSurfaceColors` maths as the web. `oklchToHex` converts them, since React Native has no OKLCH. The default is the web's default swatch (grey), and a Settings picker can change it later. Joyful Utility in native terms: **paper** (rows, cards, the tab bar) gets a lit top edge and a layered shadow tinted toward the canvas hue, and never moves. **Objects** (buttons, the account disc, task checks) get the raised gradient and bevel, settle to 0.97 when pressed over 80 ms and spring back, with a light haptic tick. Gloss is kept for the primary button (and the placeholders' icon disc); a glow in its own colour marks the primary button and checked tasks. Reduced motion drops the travel. Type is Inter on core's `TYPE_SCALE` (size, line height and tracking together); the wordmark is Nunito Black. Icons are Lucide.

**Hermes notes.** Hermes has no `Intl.RelativeTimeFormat`, so core now creates it lazily and falls back to English (`formatRelativeFallback`, tested against Intl). Anything new in core that uses less common `Intl` APIs needs the same care.

## Supabase Auth redirect URL (Ryan adds this; nothing was changed in Supabase)

Supabase dashboard → Authentication → URL Configuration → **Redirect URLs** → add:

| URL | Used by |
| --- | --- |
| `memex://auth/callback` | TestFlight / App Store builds (the app's `scheme` in `app.json`) |
| `exp://**` | Optional, development only: GitHub sign-in inside Expo Go, whose URL is `exp://<host>:8081/--/auth/callback` |

Email + password sign-in needs no redirect URL. The GitHub OAuth app keeps its existing callback (`https://<project-ref>.supabase.co/auth/v1/callback`). If `memex://auth/callback` isn't on the list, Supabase falls back to the Site URL and GitHub sign-in returns to the website instead of the app.

## TestFlight checklist (what Ryan provides)

Nothing below has been created yet; this thread made no Apple, App Store Connect or EAS records. In order:

1. **Apple Developer Program** membership (individual or organization, US$99/year) on the Apple ID you want to publish under. Note the **Team ID** (developer.apple.com → Membership).
2. **Bundle identifiers and the App Group.** Confirm `com.joyfulsystems.memex` (set in `apps/mobile/app.json` → `ios.bundleIdentifier`) or pick another. It's permanent once the app record exists. The share extension adds two more (M6-D, `app.json` → `plugins` → `expo-share-intent`): the extension's App ID `com.joyfulsystems.memex.share-extension` (`iosShareExtensionBundleIdentifier`) and the App Group `group.com.joyfulsystems.memex` (`iosAppGroupIdentifier`), which both App IDs need the **App Groups** capability for. If you change the app's bundle id, change these two to match. EAS can register both App IDs, enable App Groups and make both provisioning profiles on the first build; if it can't create the group, add it once at developer.apple.com → Identifiers → App Groups → + (`group.com.joyfulsystems.memex`) and tick it on both App IDs.
3. **App Store Connect app record**: Apps → + → New App → iOS. Fill in name (must be unique on the App Store; “memex” may be taken, so have a fallback such as “memex — working memory”), primary language, the bundle id from step 2, and a SKU (e.g. `memex-ios`). Note the numeric **Apple ID** of the app (App Information); EAS Submit's `ascAppId` uses it.
4. **Credentials for EAS** (pick one):
   - Preferred: an **App Store Connect API key**. Users and Access → Integrations → App Store Connect API → Team Keys → generate a key with the *App Manager* (or *Admin*) role. Send the **Issuer ID**, the **Key ID** and the **`.p8` file** through a secret channel (T3 `request_secret` or a local file), never in chat or git. With it, EAS builds and submits non-interactively.
   - Or: your **Apple ID + an app-specific password**, with 2FA prompts during `eas build` / `eas submit` (interactive, so you run those commands yourself).
5. **Expo account** at expo.dev (free tier is fine for TestFlight builds). Either run `npx eas login` once on this Mac, or create an access token (expo.dev → Account settings → Access tokens) and hand it over as `EXPO_TOKEN`. The next thread then runs `eas init` (creates the EAS project and writes `extra.eas.projectId` into `app.json`) and adds `eas.json`. With the share extension, `eas build` asks for (or makes) credentials for two targets, `memex` and `Savetomemex`; keep exactly one extension entry under `extra.eas.build.experimental.ios.appExtensions` (the plugin adds it at prebuild, so don't add another by hand; the plugin's README warns that a second entry breaks credential setup).
6. **EAS environment variables.** EAS builds from git and `.env` is gitignored, so `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` must be set as EAS environment variables (`eas env:create`, environment *production*). These are the same public values the web app uses.
7. **Internal tester**: App Store Connect → Users and Access, where your Apple ID needs at least the *Developer* or *Marketing* role (the account holder already qualifies). Then TestFlight → Internal Testing → create a group and add yourself. Install the **TestFlight** app on the iPhone. Internal testing needs no App Review.
8. **Supabase redirect URL** `memex://auth/callback` (section above).
9. **Export compliance**: `app.json` sets `ITSAppUsesNonExemptEncryption = false`, because the app only uses HTTPS and encrypts its own session at rest. Confirm this matches your reading; App Store Connect asks on every build otherwise.
10. **Before external testers or the App Store** (not needed for internal TestFlight): the App Privacy questionnaire (email address and user content, linked to the user, not used for tracking), a privacy policy URL, and the final app icon. `apps/mobile/assets/icon.png` is a placeholder (blue gloss with a white Journal bubble; source `assets/icon.svg`).
11. **Check the share extension on the TestFlight build**: in Safari, Share → (More…) → turn on **Save to memex** and move it up; share a page, pick a space, Save, and the link appears in the Journal filed there. Then share from the X and YouTube apps, and once in Airplane Mode (the save waits at the bottom of the Journal and sends when you turn it off).
12. **Local builds only:** the Xcode license on this Mac is accepted (2026-11-01), so `npx expo run:ios` works; EAS cloud builds don't need it. A local build for a real iPhone needs your Team ID in Xcode's signing settings for both targets (prebuild leaves `DEVELOPMENT_TEAM` empty).

The next thread's commands, once 1–8 are in place: `npx eas-cli init` → `eas build:configure` → `eas build -p ios --profile production` → `eas submit -p ios --latest`.

## Known gaps

- **Notes:** editing is plain text (the stored markdown in a text field), not the web's live-preview editor (ROADMAP: a DOM component around `MarkdownEditor`). Task boxes in a note show their state but don't tick from the reading view. (Italics render since M6-D: Inter's italic faces load.)
- **Not now is per phone:** a dismissed filing suggestion is remembered on this device only (no schema change in v1), and the web still suggests it. A shared “dismissed” field would need a home in the vault format.
- **Rename** in the Tasks menu uses the iOS text prompt (`Alert.prompt`); Android would need its own sheet.
- Jots can't be turned into notes or tasks yet (the web has both).
- A space's board on the phone is its Journal plus pinned sites; the web's board column (open tasks, saves, notes) isn't a separate section here. Tasks filtered to the space is one press away instead. Pinning and taking items out of a space happen on the web.
- The canvas swatch is fixed to the default until a Settings screen exists. The web keeps its choice in localStorage, so it can't sync without a stored setting.
- No end-to-end tests: Vitest covers the plain-TS parts (writes, Undo queue, composer model, Library model, encrypted storage, OAuth parsing, palette, fixtures) and Jest + React Native Testing Library covers the screens (composer, tick, delete and Undo, filing, link detail, Library; M6-C: Spaces, a space's board and its composer, Inbox approve / reject / file / not now with Undo, Tasks grouping, filter, add, tick with hold and Undo, due dates from the menu and the calendar, Done, the note view, editing, the overwrite and discard prompts). Maestro flows on a simulator that can be tapped would be the next step.
- **Share sheet:** it opens the app rather than showing inside Safari or X (see “How it works”). An in-host sheet needs `expo-share-extension`, a second JS bundle and a safe way to share the session. Images and files aren't accepted yet. A share made while signed out waits in memory only. The Android share intent is configured but untested.
- **Offline:** only new saves wait offline. Ticking, filing, editing and deleting still need a connection, and nothing is readable offline (no persisted cache; that's v2's local replica). Links saved offline are dated when they reach the server. A save that hangs rather than failing (a very weak connection) waits for iOS's 60-second request timeout before it's kept. The outbox is per phone, and Discard can't take back a save that already reached the server.
- `npx expo start` may rewrite `tsconfig.json`'s `include`; that's expected and harmless.
