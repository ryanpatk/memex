# Library grid performance

The Library's grid view (`/library`, `StreamPage` → `components/stream/MasonryLayout.tsx`) as rebuilt on 2026-11-12 to stay smooth with thousands of cards: why it was choppy, how it works now, the numbers, and how to measure it again.

## Why it was choppy

Measured on 2,435 items (the `large` fixture Library, below) before any change:

1. **Every card was in the DOM.** 2,433 grid cards, 40.5k DOM nodes, and `StreamPage` rebuilt every card's element on any state change (a keystroke, a toast, a selection).
2. **Picture boxes had no size until the picture loaded.** Each lazy image that arrived changed its card's height. A `ResizeObserver` then re-laid out the whole masonry: 2,433 `offsetHeight` reads, ~2,300 transform writes and a React re-render of every cell. In 4.5s of scrolling that happened 41 times (≈94,000 card style writes). It also made cards jump, which the browser's CLS metric doesn't see because cards move by `transform`.
3. **`loading="lazy"` inside the scroll area** waited until a picture was inside the scroller's visible box, so pictures loaded and resized in view.
4. **Mounting cost.** A ~500ms task on first render (1.2s in dev). Filter toggles and keystrokes re-filtered and re-rendered everything synchronously.
5. **The empty state showed while the first load was pending**, and the pinned-sites row popped in after it, pushing the page down.

Not causes: scroll listeners (there were none on the grid), date or URL parsing (already cheap or memoized), and `backdrop-filter`. Idle and second-pass scrolling over already-loaded cards ran at 60fps even with 40k nodes.

## How it works now

- **Virtualized masonry** (`MasonryLayout`, geometry in `src/utils/masonry.ts`). Every card gets a position from its measured height, or an estimate until measured. Only cards within a window around the viewport are mounted: 1 screen behind and 1.5 ahead in the direction of travel, with 800/1,400px floors for short phone screens. A layout pass over 2,400 cards is plain arithmetic (well under a millisecond), so nothing off screen touches the DOM. The scroll handler is passive and re-renders at most every quarter screen.
- **Measured heights** come from one `ResizeObserver` (border-box sizes, no forced layout), applied with `flushSync` so a resized card never overlaps its neighbours for a frame. They're kept per session (`sessionStorage`), so returning from a note, Back/Forward or a reload lands on real sizes. Each height is tied to a size token (content version, picture ratio, caption mode), and a stale one falls back to the estimate.
- **Estimates** (`src/utils/cardEstimates.ts`) follow the card anatomy: title lines and excerpt lines from text length, or picture height from the aspect ratio. Text cards land within a line.
- **Pictures reserve their box before they load** (`src/utils/imageRatios.ts`, `hooks/useImageRatio.ts`, `hooks/useShownRatio.ts`):
  - the aspect ratio is remembered in `localStorage` once seen, and guessed by source before that (YouTube 16:9, Pinterest 1.4, most others the 1.91:1 og:image);
  - the real ratio is read from the image header (`naturalWidth`) rather than waiting for `load`, and pictures up to 4 screens ahead are warmed in the background (10 at a time) so they know their size before their card mounts;
  - **a card only changes size while it's below the viewport.** A picture whose size arrives while its card is on screen or above it crops to its box (`object-fit: cover`, as before) until the card is below the screen again. Masonry would otherwise carry the change into the cards on screen;
  - pictures fade in over the card's neutral fill (opacity, 160ms) and load when their card mounts (no `loading="lazy"`; the window is the lazy loading). `decoding="async"` stays.
- **The first screen settles before it shows.** On a first visit the grid waits up to 450ms for on-screen pictures to report their size, then fades in (200ms).
- **Scroll anchoring.** When heights change above the first card on screen, the scroll offset absorbs the change. The browser's own anchoring is off for the grid (`overflow-anchor: none`), since it can't see transforms. `scrollbar-gutter: stable` keeps the grid's width from flipping when results get short enough to drop the scrollbar.
- **Scroll memory** per query (filters, search and sort): a new query starts at the top, while returning to the grid (closing a note, another page, a reload) or Back/Forward lands where you were.
- **Rendering.** Cards are `memo` components with stable handlers (`hooks/useStableCallback.ts`). Search filters the grid on a 120ms-debounced, deferred value and the palette on a deferred one, so the input never waits. A new set of results fades in from 0.35 opacity (220ms, Web Animations, off under reduced motion) instead of snapping.
- **Keyboard and selection.** DOM order is item order, so Tab order is unchanged, and the focused card stays mounted while scrolled away. ⌘A and Shift-click ranges use the grid's full order, mounted or not.
- **Loading.** A card-shaped skeleton replaces the empty state while the first load is pending. The pinned-sites row keeps its height while loading if the last visit had one.

## Numbers

Production bundle, headless Chrome 2× DPR at 1280×800, fresh profile (cold caches), 2,435 items, pictures served with a 60–700ms delay. `scripts/bench-grid.mjs`, two runs each, 2026-11-12:

| | Before | After |
|---|---|---|
| Scroll down at 3,000px/s | 6fps, 163–166 dropped frames / 3s, worst frame 217–233ms | **60fps, 0 dropped**, worst 17ms |
| Scroll down at 8,400px/s | 5–7fps, 166–168 dropped, worst 233–267ms | **60fps, 0 dropped**, worst 17ms |
| Scroll back up at 6,000px/s | 6–10fps, 156–169 dropped, worst 167–283ms | **60fps, 0 dropped**, worst 17ms |
| Long tasks while scrolling | 17–31 per run, longest 164–285ms | **0** |
| Cards moving on screen while scrolling | 41 full re-layouts in 4.5s (dev count) | **0** (also cold, and after a jump back up) |
| Blank frames during scroll | 0 | 0 |
| DOM nodes | 40,503 | 815 at rest, ≤1,581 while scrolling |
| Mounted cards | 2,433 | 30 at rest, ≤78 while scrolling |
| Load: longest task / total blocking | 534–539ms / 650–659ms | 92–95ms / 42–72ms |
| Load CLS | 0.071 | 0.056 first visit (shell, see below), 0.0002 after |
| Filter toggle: worst frame / long tasks | up to 433ms / up to 244ms | 17–33ms / none |
| Search keystroke (Event Timing, worst) | 152–176ms, long tasks up to 122ms | 40–48ms, none |

The remaining first-visit CLS comes from the app shell, not the grid: the sidebar's Inbox row appears once proposals load (it only shows while something is waiting, by design) and, on a browser's very first visit, the pinned-sites row.

## Measuring again

```bash
# Dev, by eye: the whole app on 2,400 generated items (or large:5000)
VITE_MEMEX_FIXTURES=large npm run dev

# A production bundle on the same data (local only; deploys build in production mode and never use fixtures)
VITE_MEMEX_FIXTURES=large npx vite build --mode bench --outDir /tmp/memex-bench
npx vite preview --outDir /tmp/memex-bench --port 4173
node scripts/bench-grid.mjs http://localhost:4173/library
```

The fixture photos live in `scripts/fixture-images/` and are served only by the dev and preview servers (`vite.config.ts`). Never point the benchmark at a signed-in production account.

## Choices Ryan can reverse

- **Cropping instead of moving.** A picture whose real size arrives while its card is on screen keeps its reserved box and crops until the card is next below the screen. The alternative is a visible jump. Storing image dimensions at capture (below) makes this rare.
- **The first-visit wait.** Up to 450ms of blank grid on a first visit, so the first screen appears settled. Remove `isPending` in `StreamPage` to show cards at once and let them settle in view.
- **Scrollbar gutter.** `scrollbar-gutter: stable` on the grid's scroller. Invisible with macOS overlay scrollbars; with always-on scrollbars it reserves the gutter even when the results fit.

## Next

- **Store picture dimensions at capture.** Adding `preview_image_width` / `preview_image_height` to `links` (additive), written by memex-scraper, would make every picture's box exact from the first frame on every device, so nothing would ever need to crop or settle. It needs a migration, a scraper deploy and (optionally) a backfill, which needs Ryan's go-ahead.
- **Read past 1,000 rows.** Supabase's API returns at most 1,000 rows per request (`max_rows`), and `links/notes/tasks.getAll` ask once, so a Library past 1,000 links would silently show only the newest 1,000. Paging those reads with `.range()` in `@memex/core/supabase` fixes it. Not a problem at today's ~410 links.
- **The List layout isn't virtualized.** It still renders every row. Fine at hundreds of items; at thousands it wants the same treatment (rows are uniform, so it's simpler).
