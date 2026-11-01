# @memex/core

The logic every memex client shares: the web app today, the Expo app (Phase 6) and memex-api's MCP server next. See `ROADMAP.md` §3.1.

- **Pure TypeScript.** No React, no DOM, no Supabase client in the main entry point. `npm run typecheck` checks this package against plain ES2022 with no DOM or Node types, so a stray `window` or `document` fails the build. The only platform globals it uses are `URL` / `URLSearchParams` (`src/runtime.d.ts`), which browsers, Workers, Node and Expo SDK 50+ all provide.
- **Source-only.** There's no build step. Consumers import the `.ts` files (Vite, tsc, Metro and wrangler all handle this).
- **Tested.** `*.test.ts` files sit beside the code. Run `npm test` from the repo root. Fixtures live in `src/testing/fixtures.ts`.

## Entry points

### `@memex/core`

| Module | Exports |
| --- | --- |
| `types.ts` | Row types for every primitive (`Link`, `LinkWithTag`, `Note`, `Task`, `SelfMessage` = jot, `Profile` = space, `Tag`, `ApiToken`, membership rows, `Create*`/`Update*` payloads) and the Supabase `Database` schema type |
| `itemTypes.ts` | `ItemType`, `ITEM_TYPES`, `isItemType` |
| `composer.ts` | `parseComposer` (jot / link / `[] ` task / ⌘↵ note, `@Space` filing), `extractMentions`, `mentionQuery` |
| `journal/feed.ts` | `buildEntries`, `toParts` (day separators, runs of platform saves), `dayLabel`, `entriesInSpace`, `entryText`, `isVisualLink`, `toJournalSpaces`; types `Entry`, `Part`, `Run`, `DaySep`, `JournalSpace` |
| `journal/filer.ts` | `createFiler` (the filing suggester, decision 13), `inboxOf`; types `Filer`, `Suggestion` |
| `stream/items.ts` | `StreamItem`, `buildStreamItems`, `linkToItem` / `noteToItem` / `taskToItem`, `mergeTags`, `itemKey` / `parseItemKey`, `itemMatchesSearch`, `byUpdatedDesc`, `isPendingItem` |
| `stream/filters.ts` | The Library's filters: `parseList`, `parseTypeFilter`, `matchesTypeFilter`, `matchesTagFilter`, `countByType`, `countTags`, `countUntagged`, `orderTagsForRow`, `itemKeysInSpace`, `pinnedLinks`, `isDoneTask` |
| `sources.ts` | The source registry: `SOURCES`, `sourceOf`, `hostOf` |
| `url.ts`, `tlds.ts` | `normalizeUrlInput`, `isUrlLike`, `normalizeLooseUrl`, `noteAsUrl`, `ACCEPTED_TLDS` |
| `links.ts` | `getHostname`, `getUrlLabel`, `getUrlTitle`, `getLinkTitle`, `getTagsForLink`, `getTagIdsForLink` |
| `markdown.ts` | `stripMarkdown`, `markdownExcerpt`, `noteDisplayTitle` |
| `time.ts` | `relativeTime`, `timeGroupFor`, `groupByTime`, `dueDateIso`, `toDayKey` / `fromDayKey` / `shiftDay` / `dayKeyOf` |
| `errors.ts` | `getErrorMessage` |
| `tokens/` | Canvas swatches (`CANVAS_COLOR_OPTIONS`, `getCanvasColorOption`, …), OKLCH maths (`buildThemeSurfaceColors`, `buildCanvasGradient`, `parseOklch`, …), `buildSpaceColors`, and Pastel Sky constants (`PASTEL_SKY_COLORS`, `TYPE_SCALE`, `SPACE`, `RADIUS`, `FONT_WEIGHTS`, `MOTION`, `DEPTH`, `WORDMARK_INK`). `src/styles/pastelSky.test.ts` in the web app fails if these drift from `pastel-sky.css` |
| `repository.ts` | The `Repository` interface and its parts (below), plus `AuthUser` / `AuthSession` |

### `@memex/core/supabase`

The v1 adapter. It's kept out of the main entry point so pure consumers never load supabase-js (`@supabase/supabase-js` is an optional peer dependency).

- `createMemexClient({ url, anonKey, auth? })` is the one way to create memex's Supabase client. Leave out `auth` on the web to keep supabase-js's browser defaults (localStorage, OAuth callback detection). In Expo, pass `auth: { storage, detectSessionInUrl: false }` with a SecureStore-backed `AuthStorage`. Only ever pass the anon key; RLS limits every query to the signed-in user's rows.
- `createSupabaseRepository(client)` returns a `Repository`. Its queries are the ones the web app's hooks ran before 2026-11-01, moved over unchanged.

```ts
// Web (src/data/repository.ts)
export const repository = createSupabaseRepository(createMemexClient({ url, anonKey }));

// Expo (sketch)
import * as SecureStore from 'expo-secure-store';
const storage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};
export const repository = createSupabaseRepository(
  createMemexClient({ url, anonKey, auth: { storage, detectSessionInUrl: false } }),
);
```

## The Repository

```ts
interface Repository {
  auth: AuthRepository;              // getSession, onAuthStateChange, signInWithPassword, signUp, signInWithOAuth, signOut
  links: LinksRepository;            // getAll, getById, getByTag, create, update, delete, reorder, setTags (+ legacy getByProject(s))
  notes: NotesRepository;            // getAll, create, update, delete, setTags
  tasks: TasksRepository;            // getAll, create, update, delete, setTags
  tags: TagsRepository;              // getAll, getById, create, update, delete, getUsageCount
  spaces: SpacesRepository;          // getAll, getById, create, update, delete   (table: profiles)
  jots: JotsRepository;              // getAll, create, delete                    (table: self_messages)
  spaceLinks: SpaceLinksRepository;  // listMembership, getBySpace, addLinks, removeLink, setSuperFavorite
  spaceNotes: SpaceNotesRepository;  // listMembership, addNotes, removeNote
  spaceTasks: SpaceTasksRepository;  // listMembership, addTasks, removeTask
  apiTokens: ApiTokensRepository;    // getAll, create({ name, token_hash }), delete
  projects: ProjectsRepository;      // legacy pre-spaces projects, slated for retirement
}
```

Methods throw on failure, except auth calls, which return `{ error }` so forms can show the message. To add data access, add the method to the interface in `repository.ts` and implement it in `src/supabase/`. Apps never import supabase-js themselves.

## Not here (yet)

- React Query hooks and the Zustand store stay in the web app (`src/hooks/`, `src/store/`) because they depend on React. When the Expo app arrives, the hooks can move into a small `@memex/react` package over this Repository.
- Web-only pieces stay in the app: routes and URL params (`src/constants/modules.ts`), applying the canvas colour to the DOM (`src/utils/canvasColor.ts`), localStorage preferences, and sign-in redirects.
