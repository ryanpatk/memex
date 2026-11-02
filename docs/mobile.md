# memex for iPhone (Expo)

The native app lives in `apps/mobile`: React Native on **Expo SDK 58** with Expo Router. ROADMAP Phase 6, v1 on TestFlight. Following decision 20, it reads data straight from Supabase through `@memex/core`, using the same Repository and adapter as the web app. RLS limits every query to the signed-in user.

**Status (2026-11-01, thread M6-A):** the app shell has four tabs (Journal, Library, Spaces, Inbox) and a sign-in screen, with email + password and GitHub OAuth. The Journal is a read-only feed built on core's model, with pull to refresh. Library, Spaces and Inbox are placeholders that already show real counts, the space list and the waiting Inbox items. Light and dark follow the system. Writing (composer, filing, task checks), the share extension and TestFlight come in later M6 threads.

| | Light | Dark |
| --- | --- | --- |
| Sign in | ![](mobile/sign-in-light.png) | ![](mobile/sign-in-dark.png) |
| Journal | ![](mobile/journal-light.png) | ![](mobile/journal-dark.png) |
| Library | ![](mobile/library-light.png) | ![](mobile/library-dark.png) |
| Spaces | ![](mobile/spaces-light.png) | ![](mobile/spaces-dark.png) |
| Inbox | ![](mobile/inbox-light.png) | ![](mobile/inbox-dark.png) |

The signed-in screenshots use the dev-only demo data, not real data. They come from an iPhone 17 Pro simulator on iOS 26.4 running Expo Go 58.0.7.

## Run it

You need Node 22+, Xcode with an iOS Simulator runtime, and the Xcode license accepted once (`sudo xcodebuild -license accept`). Without the license, Expo CLI can't drive the simulator (`xcrun simctl … exited with code 69`).

```bash
cd apps/mobile
npm install
cp .env.example .env      # then fill in the web app's VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY values
npm run ios               # starts Metro and opens the app in Expo Go on the simulator
```

- **Demo data:** `npm run fixtures` (then press `i`) runs on built-in invented data with a signed-in demo user. Use `EXPO_PUBLIC_MEMEX_FIXTURES=signed-out npx expo start` to start at the sign-in screen instead, where any credentials sign in. Demo mode is dev-only. The flag is ignored when `__DEV__` is false, and `npm run check:release` (also in CI) fails if any fixture code reaches a release bundle. Demo writes always fail, so nothing pretends to save.
- **On your phone:** install Expo Go, run `npx expo start`, scan the QR code.
- **Checks:** `npm run check` (typecheck, lint, Vitest) and `npm run check:release` (release iOS bundle, no fixture code). CI runs both in the `mobile` job of `.github/workflows/ci.yml`, next to the web job.

## Architecture

```
apps/mobile/
  app.json                 name, scheme `memex`, bundle id, splash, plugins
  metro.config.js          watches ../../packages/core; core's imports resolve from this app's node_modules
  src/app/                 Expo Router routes
    _layout.tsx            providers, fonts, Stack.Protected (signed in → tabs, signed out → sign-in)
    sign-in.tsx            email + password, Continue with GitHub
    auth/callback.tsx      memex://auth/callback (cold-start OAuth redirect)
    (tabs)/                index (Journal), library, spaces, inbox
  src/auth/                encryptedStorage (session at rest), oauth (redirect parsing), signInWithGitHub, SessionProvider
  src/data/                config (EXPO_PUBLIC_*), repository, queryClient, journal (core model → feed), useJournal
  src/data/fixtures/       DEV-ONLY demo data + read-only Repository
  src/journal/             the feed and its entry renderers
  src/theme/               palette (core tokens → hex) and theme (type roles, paper / object depth)
  src/ui/                  Text, Paper, Button (objects), TextField, Canvas, Wordmark, chips, placeholders
```

**A separate npm project, not a workspace member.** Expo SDK 58 pins React 19.3 and React Native 0.88. The web app is on React 19.1, and joining the root workspace would hoist two Reacts into one tree. So `apps/mobile` has its own `package-lock.json`, like `api/` and `extension/`, and depends on core with `"@memex/core": "file:../../packages/core"`. The web's install, lockfile, build and deploy are untouched; root ESLint ignores `apps/`. Two settings make core resolve its own imports from this app:

- `metro.config.js` watches `packages/core` and resolves core's bare imports (`@supabase/supabase-js`) as if the app had made them, so one copy gets bundled.
- `tsconfig.json` maps `@supabase/supabase-js` to `./node_modules/…` for the same reason. supabase-js stays on `~2.49` to match the web, because newer typings reject core's `Database` type.

**The data layer.** React Query hooks over the Repository live in the app (`src/data/useJournal.ts`), one query per resource, with keys that match the web's hooks. They have no web dependencies, so they can move into a shared `@memex/react` package when the web adopts them. That move was out of scope here: this thread didn't change the web's hooks. `src/data/journal.ts` turns rows into core's Journal model (`buildEntries` → `toParts` for day separators and runs of platform saves, `createFiler` and `inboxOf` for the Inbox) and converts space colours to hex.

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

- Read-only: no composer, filing, task checks or note editing yet (ROADMAP Phase 6 items 2–5).
- The canvas swatch is fixed to the default until a Settings screen exists. The web keeps its choice in localStorage, so it can't sync without a stored setting.
- Library, Spaces and Inbox are placeholders.
- No component or E2E tests yet: Vitest covers the plain-TS parts (encrypted storage, OAuth redirect parsing, palette, the Journal model on demo data, the fixture repository), and CI builds a release bundle. Maestro or Detox flows would be the next step.
- `npx expo start` may rewrite `tsconfig.json`'s `include`; that's expected and harmless.
