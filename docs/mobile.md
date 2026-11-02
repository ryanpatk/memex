# memex for iPhone (Expo)

The native app lives in `apps/mobile`: React Native on **Expo SDK 58** with Expo Router. ROADMAP Phase 6, v1 on TestFlight. Following decision 20, it reads data straight from Supabase through `@memex/core`, using the same Repository and adapter as the web app. RLS limits every query to the signed-in user.

**Status (2026-11-01, threads M6-A and M6-B):** the app shell has four tabs (Journal, Library, Spaces, Inbox) and a sign-in screen, with email + password and GitHub OAuth. Light and dark follow the system.

- **Journal** (M6-B): the feed plus a composer above the tab bar with the web's syntax, from core: plain text saves a jot, a lone URL saves a link, `[] ` starts a task, `@Space` files it, and the page button makes a note (phones have no ⌘↵). Saves appear at once and roll back if they fail. Tick tasks in place, tap a link for its detail, press a dashed suggestion chip to file an entry, long-press anything for its menu (Open, Mark done, File in…, Delete). Deleting and filing show a toast with Undo. Pull to refresh.
- **Link detail** (M6-B): picture, title, description, source and date; spaces as toggles; Open in Safari (in-app browser), Share, Delete with Undo.
- **Library** (M6-B): every saved link as a two-column masonry, newest saved first, with source chips, search and infinite scroll.
- Spaces and Inbox are still placeholders that show real counts. The share extension, Spaces/Inbox and TestFlight come next.

| | Light | Dark |
| --- | --- | --- |
| Sign in | ![](mobile/sign-in-light.png) | ![](mobile/sign-in-dark.png) |
| Journal, composer empty | ![](mobile/journal-light.png) | ![](mobile/journal-dark.png) |
| Typing a task with `@Ky…` (the space picker) | ![](mobile/journal-task-light.png) | ![](mobile/journal-task-dark.png) |
| A draft task with the filer's suggestion | ![](mobile/journal-suggestion-light.png) | ![](mobile/journal-suggestion-dark.png) |
| After sending a jot, a link `@Studio` and a task `@Kyoto trip` | ![](mobile/journal-sent-light.png) | ![](mobile/journal-sent-dark.png) |
| Link detail | ![](mobile/link-light.png) | ![](mobile/link-dark.png) |
| Library | ![](mobile/library-light.png) | ![](mobile/library-dark.png) |
| Spaces (placeholder) | ![](mobile/spaces-light.png) | ![](mobile/spaces-dark.png) |
| Inbox (placeholder) | ![](mobile/inbox-light.png) | ![](mobile/inbox-dark.png) |

The signed-in screenshots use the dev-only demo data, not real data. They come from an iPhone 17 Pro simulator on iOS 26.4 running Expo Go 58.0.7. The simulator couldn't be tapped from scripts, so the composer states were reached with `?draft=` deep links and the saves with the dev-only `&send=1` (below); taps are covered by component tests instead.

## Run it

You need Node 22+, Xcode with an iOS Simulator runtime, and the Xcode license accepted once (`sudo xcodebuild -license accept`). Without the license, Expo CLI can't drive the simulator (`xcrun simctl … exited with code 69`).

```bash
cd apps/mobile
npm install
cp .env.example .env      # then fill in the web app's VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY values
npm run ios               # starts Metro and opens the app in Expo Go on the simulator
```

- **Demo data:** `npm run fixtures` (then press `i`) runs on built-in invented data with a signed-in demo user. Use `EXPO_PUBLIC_MEMEX_FIXTURES=signed-out npx expo start` to start at the sign-in screen instead, where any credentials sign in. Demo mode is dev-only. The flag is ignored when `__DEV__` is false, and `npm run check:release` (also in CI) fails if any fixture code reaches a release bundle. Demo data is core's in-memory Repository (`@memex/core/memory`) over the app's demo rows, so writes work and vanish when the app reloads; nothing reaches Supabase, and link metadata isn't scraped.
- **Deep links:** `memex:///?draft=<text>` (in Expo Go, `exp://127.0.0.1:8081/--/?draft=…`) opens the Journal with text in the composer; nothing is saved until you send. Only in a dev build on demo data, `&send=1` also sends it. That's how the simulator screenshots were made, and it can't write anywhere else. `…/--/link/<id>` opens link detail and `…/--/library` the Library.
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
  src/auth/                encryptedStorage (session at rest), oauth (redirect parsing), signInWithGitHub, SessionProvider
  src/data/                config, client (captured_client), keys (React Query), repository, DataProvider,
                           actions (the writes), deleteQueue (Undo), journal (core model → feed), useJournal,
                           library + useLibrary, scraper
  src/data/fixtures/       DEV-ONLY demo rows + the memory Repository over them
  src/journal/             Composer + composerModel, the feed and its entry renderers, entryMenu, useEntryActions
  src/library/             LibraryCard
  src/screens/             screen tests (Library, link detail)
  src/testing/             renderWithData: the app's providers over the demo repository
  src/theme/               palette (core tokens → hex) and theme (type roles, paper / object depth)
  src/ui/                  Text, Paper, Button (objects), TextField, FilterChip, Toast, Canvas, Wordmark, chips, placeholders
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
- **Library:** `src/data/library.ts` runs core's `linkToItem`, `matchesLibraryFilters` (source), `itemMatchesSearch` and `sortItems` (newest saved), the same functions as the web Library. `useLibrary` hands FlashList one page of 24 at a time.

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
2. **Bundle identifier.** Confirm `com.joyfulsystems.memex` (set in `apps/mobile/app.json` → `ios.bundleIdentifier`) or pick another. It's permanent once the app record exists. EAS can register the App ID for you on the first build.
3. **App Store Connect app record**: Apps → + → New App → iOS. Fill in name (must be unique on the App Store; “memex” may be taken, so have a fallback such as “memex — working memory”), primary language, the bundle id from step 2, and a SKU (e.g. `memex-ios`). Note the numeric **Apple ID** of the app (App Information); EAS Submit's `ascAppId` uses it.
4. **Credentials for EAS** (pick one):
   - Preferred: an **App Store Connect API key**. Users and Access → Integrations → App Store Connect API → Team Keys → generate a key with the *App Manager* (or *Admin*) role. Send the **Issuer ID**, the **Key ID** and the **`.p8` file** through a secret channel (T3 `request_secret` or a local file), never in chat or git. With it, EAS builds and submits non-interactively.
   - Or: your **Apple ID + an app-specific password**, with 2FA prompts during `eas build` / `eas submit` (interactive, so you run those commands yourself).
5. **Expo account** at expo.dev (free tier is fine for TestFlight builds). Either run `npx eas login` once on this Mac, or create an access token (expo.dev → Account settings → Access tokens) and hand it over as `EXPO_TOKEN`. The next thread then runs `eas init` (creates the EAS project and writes `extra.eas.projectId` into `app.json`) and adds `eas.json`.
6. **EAS environment variables.** EAS builds from git and `.env` is gitignored, so `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` must be set as EAS environment variables (`eas env:create`, environment *production*). These are the same public values the web app uses.
7. **Internal tester**: App Store Connect → Users and Access, where your Apple ID needs at least the *Developer* or *Marketing* role (the account holder already qualifies). Then TestFlight → Internal Testing → create a group and add yourself. Install the **TestFlight** app on the iPhone. Internal testing needs no App Review.
8. **Supabase redirect URL** `memex://auth/callback` (section above).
9. **Export compliance**: `app.json` sets `ITSAppUsesNonExemptEncryption = false`, because the app only uses HTTPS and encrypts its own session at rest. Confirm this matches your reading; App Store Connect asks on every build otherwise.
10. **Before external testers or the App Store** (not needed for internal TestFlight): the App Privacy questionnaire (email address and user content, linked to the user, not used for tracking), a privacy policy URL, and the final app icon. `apps/mobile/assets/icon.png` is a placeholder (blue gloss with a white Journal bubble; source `assets/icon.svg`).
11. **Local builds only:** accept the Xcode license on this Mac (`sudo xcodebuild -license accept`). EAS cloud builds don't need it.

The next thread's commands, once 1–8 are in place: `npx eas-cli init` → `eas build:configure` → `eas build -p ios --profile production` → `eas submit -p ios --latest`.

## Known gaps

- **Notes:** you can write a note, but you can't open or edit one on the phone yet (ROADMAP: a DOM component around the web's `MarkdownEditor`). Tapping a note does nothing; long-press still offers its menu.
- Jots can't be turned into notes or tasks yet (the web has both).
- Spaces and Inbox are placeholders. The Inbox's count is real, and its suggestions show as chips in the feed.
- The canvas swatch is fixed to the default until a Settings screen exists. The web keeps its choice in localStorage, so it can't sync without a stored setting.
- No end-to-end tests: Vitest covers the plain-TS parts (writes, Undo queue, composer model, Library model, encrypted storage, OAuth parsing, palette, fixtures) and Jest + React Native Testing Library covers the screens (composer, tick, delete and Undo, filing, link detail, Library). Maestro flows on a simulator that can be tapped would be the next step.
- `npx expo start` may rewrite `tsconfig.json`'s `include`; that's expected and harmless.
