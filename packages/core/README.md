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
| `tasks/tasks.ts` | The Tasks view (`docs/tasks-view.md`): `taskSpaceMap`, `filterTasksBySpace` (incl. `UNFILED_TASKS`), `countOpenTasksBySpace`, `splitTasks`, `compareOpenTasks` / `compareDoneTasks`, `groupTasks` (by space or due date), `dueBucket`, `dueDayKey`, `daysUntilDue`, `isOverdue`, `dueLabel`, `dueShortcuts`, `parseTaskGrouping`, `parseTaskInput` (the add field, on the composer's `@Space` syntax); types `TaskGroup`, `TaskGrouping`, `DueBucket` |
| `stream/items.ts` | `StreamItem`, `buildStreamItems`, `linkToItem` / `noteToItem` / `taskToItem`, `mergeTags`, `itemKey` / `parseItemKey`, `itemMatchesSearch`, `byUpdatedDesc`, `isPendingItem` |
| `stream/filters.ts` | The Library's filters: `parseList`, `parseTypeFilter`, `matchesTypeFilter`, `matchesTagFilter`, `countByType`, `countTags`, `countUntagged`, `orderTagsForRow`, `itemKeysInSpace`, `pinnedLinks`, `isDoneTask` |
| `stream/views.ts` | Saved Library views (decision 15A, `docs/library-views.md`): `LibraryFilters`, `EMPTY_FILTERS`, `BUILT_IN_VIEWS`, `parseLibraryFilters` / `formatLibraryFilters`, `matchesLibraryFilters` (type, source, space incl. `UNFILED`, tags), `spaceIdsByItem`, `countMatching`, `sanitizeFilters`, `sameFilters`, `findActiveView`, `viewDiffers`, `parseViewDefinition` (forgiving) / `serializeViewDefinition`, `savedViewsToTabs`, `nextViewPosition`, `normalizeViewName`, `suggestViewName`, `uniqueViewName`; types `LibraryView`, `ViewDefinition`, `LibraryLayout` |
| `stream/sort.ts` | One sort for every Library layout: `LibrarySort`, `DEFAULT_SORT` (recently updated), `SORT_FIELDS`, `SORT_OPTIONS`, `parseSort` / `formatSort` (`?sort=field:dir`), `nextSort` (header clicks), `sortLabel`, `sortItems`, `groupDateFor`, item accessors `itemTitle` / `itemSavedAt` / `itemSourceLabel` / `itemTypeLabel` |
| `stream/table.ts` | The Library Table's columns: `TABLE_COLUMNS` (with hide-first `priority`), `tableColumns`, `ariaSortFor`, `nextRowIndex` (row keyboard moves) |
| `sources.ts` | The source registry: `SOURCES`, `sourceOf`, `hostOf` |
| `url.ts`, `tlds.ts` | `normalizeUrlInput`, `isUrlLike`, `normalizeLooseUrl`, `noteAsUrl`, `ACCEPTED_TLDS` |
| `links.ts` | `getHostname`, `getUrlLabel`, `getUrlTitle`, `getLinkTitle`, `getTagsForLink`, `getTagIdsForLink` |
| `markdown.ts` | `stripMarkdown`, `markdownExcerpt`, `noteDisplayTitle` |
| `time.ts` | `relativeTime`, `timeGroupFor`, `groupByTime`, `dueDateIso`, `toDayKey` / `fromDayKey` / `shiftDay` / `dayKeyOf` |
| `errors.ts` | `getErrorMessage` |
| `tokens/` | Canvas swatches (`CANVAS_COLOR_OPTIONS`, `getCanvasColorOption`, …), OKLCH maths (`buildThemeSurfaceColors`, `buildCanvasGradient`, `parseOklch`, `oklchToHex` for renderers without OKLCH, …), `buildSpaceColors`, and Pastel Sky constants (`PASTEL_SKY_COLORS`, `TYPE_SCALE`, `SPACE`, `RADIUS`, `FONT_WEIGHTS`, `MOTION`, `DEPTH`, `WORDMARK_INK`). `src/styles/pastelSky.test.ts` in the web app fails if these drift from `pastel-sky.css` |
| `repository.ts` | The `Repository` interface and its parts (below), plus `AuthUser` / `AuthSession` |
| `capture/` | Capture rules shared by memex-api and the MCP write tools (below; also at `@memex/core/capture`) |
| `agent/` | The MCP read model, at `@memex/core/agent` only (below) |

### `@memex/core/agent`

What memex's MCP server reads and how it pages, independent of the Worker (ROADMAP §3.6; memex-api's `/mcp` is the first consumer, `docs/mcp.md`). Subpath only, so its helper names stay out of the main entry point.

- `createAgentReadService(store, { now? })`: `search`, `getItem`, `getJournal`, `listSpaces`, `spaceOverview`, `timelineStats`, `getImages` (picture URLs for an item or a space; `markdownImages`, `IMAGE_LIMITS`). Each validates its own arguments (throws `AgentInputError` / `AgentNotFoundError` with messages fit for an agent), caps sizes (`AGENT_LIMITS`: page sizes, 280-character excerpts, 20,000-character full text, date ranges) and pages with keyset cursors across all four types.
- `AgentReadStore`, the storage port for one user: `listItems` (terms, space, `[from, to)` range, keyset, order; `source` is only a hint the service re-checks with `sourceOf`), `getItem`, `listSpaces` (with counts), `activity`. memex-api's PostgREST version is `api/src/mcp/store.ts`; `createMemoryAgentStore` is the in-memory one for tests. The v2 vault index can implement the same port (decision 19).
- `createAgentWriteService(store, { writer: { clientName, tokenId }, capture, now? })`: `addJot`, `saveLink` (through `createCaptureService`), `createNote`, `createTask`, `appendToNote`, `proposeChange`. The write rules live here: agents only add (stamped `captured_by: 'agent'` + client name); changes to existing items the client didn't create become Inbox proposals; `proposeChange` never edits; no deletes, one item per call. Also validation and caps (`AGENT_WRITE_LIMITS`), ownership checks before any write, a pending-proposal cap per client, and idempotency keys (`fingerprint`, replayed results). `AgentWriteStore` is the port (`api/src/mcp/writeStore.ts` over PostgREST; `createMemoryAgentWriteStore` for tests); `writeRef` names a result for the audit log.
- Proposals for clients: `proposalFields` (what a proposal changes, against the item as it is now), `lineDiff` / `compactDiff`, `changedSinceProposed`, `applyProposal(repo, proposal, target)` (writes through the Repository, then marks it applied), `rejectProposal`. The web Inbox uses them; Repository areas `proposals` and `agentTokens` back them.
- Cursors: `canonicalTimestamp` (microsecond UTC, sortable as strings), `PageKey`, `compareKeys`, `keysetBound` (the per-table condition that continues a merged scan), `encodeCursor` / `decodeCursor`.
- Days in a zone, Intl only: `isDay`, `isTimeZone`, `dayOf`, `dayStartMs`, `addDays`, `daySpan`, `bucketStart`.
- Agent tokens: `AGENT_TOKEN_RE` (`mxa_` + 43), `agentBearerToken`, `checkAgentToken` (revoked / expired / invalid), `AgentScope` (`read` · `read_write`), `scopeAllows`, `scopeList`, `normalizeClientName`.
- Audit: `summarizeArgs` (keeps ids, enums, dates, numbers; free text becomes `{ chars }`), `AUDIT_STATUSES`.
- Text: `searchTerms` (≤ 6 lowercased words, wildcards stripped), `matchesTerms`, `clip`.

### `@memex/core/memory`

`createMemoryRepository(data, { signedOut? })`: the whole `Repository` over plain arrays (nothing persists; new links keep their capture provenance: `source`, `source_id`, `lists`, `captured_by`, `captured_client`, `url_key`), and `createDemoData(now?)`: an invented, screenshot-safe Library (kitchen reno, Kyoto trip, job search; saves from X, Pinterest and YouTube; generated SVG pictures; two saved views). The web app runs on it with `VITE_MEMEX_FIXTURES=1 npm run dev` (`=signed-out` to start signed out); production builds never include it.

### `@memex/core/supabase`

The v1 adapter. It's kept out of the main entry point so pure consumers never load supabase-js (`@supabase/supabase-js` is an optional peer dependency).

- `createMemexClient({ url, anonKey, auth? })` is the one way to create memex's Supabase client. Leave out `auth` on the web to keep supabase-js's browser defaults (localStorage, OAuth callback detection). In Expo, pass `auth: { storage, detectSessionInUrl: false, flowType: 'pkce' }` with an encrypted `AuthStorage` (see `apps/mobile`). Only ever pass the anon key; RLS limits every query to the signed-in user's rows.
- Native OAuth (Expo): create the client with `flowType: 'pkce'`, call `auth.signInWithOAuth(provider, { redirectTo, skipBrowserRedirect: true })`, open the returned `url` in an auth browser session, then pass the redirect's `code` to `auth.exchangeCodeForSession`. `auth.setAutoRefresh(active)` pauses token refresh while the app is backgrounded.
- `createSupabaseRepository(client)` returns a `Repository`. Its queries are the ones the web app's hooks ran before 2026-11-01, moved over unchanged.

```ts
// Web (src/data/repository.ts)
export const repository = createSupabaseRepository(createMemexClient({ url, anonKey }));

// Expo (apps/mobile/src/data/repository.ts): SecureStore holds a key per
// value, AsyncStorage the encrypted session (SecureStore caps values at 2 KB).
export const repository = createSupabaseRepository(
  createMemexClient({
    url,
    anonKey,
    auth: { storage: encryptedStorage, detectSessionInUrl: false, flowType: 'pkce' },
  }),
);
```

## The Repository

```ts
interface Repository {
  auth: AuthRepository;              // getSession, onAuthStateChange, signInWithPassword, signUp, signInWithOAuth, exchangeCodeForSession, setAutoRefresh, signOut
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
  views: SavedViewsRepository;       // getAll, create, update, delete         (table: saved_views)
  projects: ProjectsRepository;      // legacy pre-spaces projects, slated for retirement
}
```

Methods throw on failure, except auth calls, which return `{ error }` so forms can show the message. To add data access, add the method to the interface in `repository.ts` and implement it in `src/supabase/`. Apps never import supabase-js themselves.

## Capture (`@memex/core/capture`)

The rules for saving a link once (ROADMAP Phase 3; vocabulary in `CONTEXT.md` → Sources). memex-api's routes use it today; the hosted MCP server's write tools should call the same service so agents dedupe exactly like the extension.

```ts
import { createCaptureService, parseCaptureInput, CaptureError } from '@memex/core/capture';

// 1. Validate what the caller sent. The URL decides source + sourceId; ids must be UUIDs.
const parsed = parseCaptureInput(args, {
  defaultCapturedBy: 'agent',          // servers pin this; clients can't claim it
  allowedCapturedBy: [],               // memex-api allows ['extension', 'resync', 'share', 'api']
  defaultClient: 'claude-code',        // e.g. the MCP client's name
});
if (!parsed.ok) throw new Error(parsed.error);

// 2. One service per request, over a store already scoped to the token's user.
const capture = createCaptureService(store, { enrich: (url) => scrape(url) });
const { link, duplicate, listsAdded, attached } = await capture.capture(parsed.value);
await capture.lookup(url);              // { found: false } | { found: true, link }, read-only
await capture.addToSpace(linkId, spaceId);
await capture.remove(linkId);           // undo; false if not the user's
// Bad input / unowned ids throw CaptureError with .status 400 | 404.
```

- **`CaptureStore`** is the storage port, for one user: `findCandidates`, `insertLink` (throws `CaptureConflictError` on the unique `(user, source, source_id)` index; the service then returns the winner), `setLists`, `ownedLinkIds` / `ownedSpaceIds` / `ownedTagIds`, `addToSpace`, `addTags`, `deleteLink`. memex-api's PostgREST version is `api/src/store.ts` (every query through `userScope`, `api/src/db.ts`); `createMemoryCaptureStore` is an in-memory one for tests.
- **`createRepositoryCaptureStore(repository, { links? })`** runs the same service over the `Repository`, for clients that use it directly (the Expo app's composer: `captured_by: 'app'`, `captured_client: 'memex-ios/<version>'`). Pass `links` to read candidates from a cache you already hold instead of `links.getAll()`. A Postgres unique violation (`23505`) becomes `CaptureConflictError`. `mightMatch` and `toCapturedLink` are its helpers.
- **Dedupe order**: same `(source, source_id)` → the same item under another URL (`identifySource`: X status, Pinterest pin, YouTube watch / youtu.be / shorts / embed / live) → the same `normalizeUrlKey` (no scheme, `www.`, trailing slash, fragment or tracking parameters). Stores may over-fetch; `pickMatch` re-checks every candidate. Older rows without `source_id` / `url_key` still match through `urlVariants` and `legacyIdFragments`.
- **Duplicates** merge new `lists` (e.g. saved from the toolbar, later bookmarked) and still apply the requested space and tags.
- **Helpers**: `identifySource`, `canonicalUrl`, `isValidSourceId`, `normalizeUrlKey`, `urlVariants`, `isUuid`, `httpUrl`, `parseSourceTag` (reads the pre-2026-11-01 `links.source` tags), `linkMatchFor`, `matchStrength`, `pickMatch`, `LIMITS`.

## Not here (yet)

- React Query hooks and the Zustand store stay in the web app (`src/hooks/`, `src/store/`) because they depend on React. When the Expo app arrives, the hooks can move into a small `@memex/react` package over this Repository.
- Web-only pieces stay in the app: routes and URL params (`src/constants/modules.ts`), applying the canvas colour to the DOM (`src/utils/canvasColor.ts`), localStorage preferences, and sign-in redirects.
