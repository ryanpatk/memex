---
name: memex
description: Personal working-memory system — canonical design is the Links dashboard (`/`), the template for all memex modules
colors:
  canvas: 'user-selected OKLCH swatch gradient (default soft grey oklch(0.94 0.009 264)); swatch hues from the JOYFUL_SYSTEMS palette (see JOYFUL_SYSTEMS.md)'
  surface: 'var(--bookmark-surface) / frosted white bubble'
  surface-muted: 'var(--bookmark-surface-muted)'
  border: 'var(--bookmark-border) — OKLCH neutral @ ~16% alpha'
  border-ink: 'var(--bookmark-border-ink) — full-strength neutral ink'
  text: 'var(--bookmark-text)'
  text-muted: 'var(--bookmark-muted)'
  secondary-text: 'var(--bookmark-secondary-text) — matches border ink grey'
  accent: 'var(--bookmark-accent) — focus & selection rings only'
  active-bg: 'var(--bookmark-active-bg) — canvas-derived theme chip fill'
  active-fg: 'var(--bookmark-active-fg)'
  prominent-bg: 'var(--bookmark-prominent-bg) — primary CTAs'
  prominent-fg: 'var(--bookmark-prominent-fg)'
typography:
  family: 'Two Weekend Go (+ system-ui stack)'
  brand:
    component: 'src/components/ui/Wordmark.tsx (styles: components.css → Wordmark)'
    fontFamily: 'Nunito, Varela Round, system-ui (--font-wordmark; @fontsource/nunito 900)'
    fontSize: '30px (--wordmark-size), set by the placing class'
    fontWeight: 900
    letterSpacing: '-0.05em'
    lineHeight: 0.95
    color: '#2f55d6 — Joyful Systems Blue, darkened for text; fixed, not the swatch ink'
    treatment: 'white 1px keyline + 0 10px 24px blue drop; duplicate layer with a white→clear gradient clipped to the glyphs (split gloss on the upper half); gloss kept subtle: 0.35/0.25 on the light canvas, 0.5/0.35 in dark mode'
  ui:
    fontSize: '13px (var(--bookmark-fs-ui))'
    fontWeight: '500 default chips/rows; 600 labels'
    lineHeight: 1.45
  caption:
    fontSize: '12px (var(--bookmark-fs-small))'
rounded:
  pill: '999px'
  card: '14px'
  input: '12px'
  brand-bubble: '10px'
  stack-outer: '10px'
spacing:
  toolbar-height: '52px'
  chip-height: '40px'
  action-chip-width: '6.75rem'
  feed-stack-inset: '12px'
  footer-offset-desktop: '28px'
components:
  button-prominent:
    backgroundColor: '{colors.prominent-bg}'
    textColor: '{colors.prominent-fg}'
    rounded: '{rounded.pill}'
    width: '6.75rem fixed (shared action chips)'
    minHeight: '40px'
  button-secondary-chip:
    backgroundColor: '{colors.control-bg}'
    textColor: '{colors.text}'
    border: '{colors.control-border}'
    rounded: '{rounded.pill}'
    width: '6.75rem fixed'
    minHeight: '40px'
  chip-secondary:
    default: 'transparent bg, grey text (--bookmark-secondary-text)'
    hover: 'soft bubble tint (--bookmark-chip-secondary-bg-soft)'
    selected: 'n/a for tags — see chip-primary'
  chip-primary:
    backgroundColor: '{colors.active-bg}'
    textColor: '{colors.active-fg}'
    border: 'brand bubble border'
    use: 'selected space/tag filters, active filter state'
---

> **2026-10-15 — Pastel Sky theme adopted.** Token values, typography, spacing, radii, edges, elevation, motion, and component treatments now come from the Graphical **Pastel Sky** theme: `GUI.md`, `gui/themes/pastel-sky.md`, `gui/themes/pastel-sky-components.md`, implemented in `src/styles/pastel-sky.css` (tokens) and `src/styles/components.css` (shared components). Where this document's values (Two Weekend Go, 13px UI, pill chips, frosted stacks, filled-icon set) disagree, the theme and those files win. Kept from memex: the canvas swatch, which now drives Pastel Sky's `--color-1` accent and the page canvas.

# Design System: memex

**Status:** Current design truth for the project. The live bookmark dashboard (the **Links module**) is the canonical surface; auth pages, modals, and legacy project views should inherit its `--bookmark-*` tokens from `:root`. Per `VISION.md`, every future memex module (Notes, Tasks, Spaces) inherits this dashboard's anatomy, tokens, and interaction rules — this document is the template they build from.

## Creative North Star

**"The Operator's Desk"**

A personal working-memory workbench: a user-tinted canvas gradient behind frosted-glass omnilists, with lightweight side rails for spaces and tags. Color comes from the selected canvas theme—not ambient blue chrome. Typography is confident but compact (`Two Weekend Go`, italic brand). Depth is frosted translucency and hairline dividers, not stacked card shadows. Whether the rows hold links, markdown notes, or tasks, the desk is the same.

## Module Anatomy (canonical layout)

Every primitive module shares the dashboard's grid. Desktop: **spaces rail | omnilist | tags rail**

> Naming note: spaces are today's **profiles** — the code and some UI copy still say "profile" until the rename ships. Read "profiles rail" and "spaces rail" as the same element.

| Zone                              | Role                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------- |
| **Header** (`bookmark-toolbar`)   | Brand bubble (static), super-favorite shortcuts (center), Settings chip (right) |
| **Spaces rail** (left)            | Space filter chips, left-aligned toward feed                                    |
| **Omnilist** (center, max ~640px) | Frosted stack: omnibar + virtualized item list                                  |
| **Tags rail** (right)             | Tag filter chips, right-aligned toward feed                                     |

Mobile (<900px): rails become slide-over sheets with scrim; space/tag tabs above feed.

**Empty filter = show all.** No permanent "All" chips on space or tag rails.

When a space is selected, the tag rail scopes counts and chip list to items in that space.

### App shell (planned)

The memex shell adds a persistent **left sidebar** on desktop — module navigation only (Notes, Links, Tasks, Spaces), built from the existing chip vocabulary: transparent idle chips, `--bookmark-active-*` for the active module, brand bubble at top. The sidebar never carries filters; space and tag filtering stay inside each module's rails. Mobile collapses it to the existing drawer pattern or a bottom tab bar. See `VISION.md` §5.

## Canvas & Theme Color

User picks a canvas swatch in **Settings** (grey, blue, cyan, green, gold, orange, coral, violet, pink — hues anchored to the JOYFUL_SYSTEMS palette, see `JOYFUL_SYSTEMS.md`). Selection drives:

- `--bookmark-experiment-bg` — vertical gradient page background (swatch-tinted, light and dark)
- `--bookmark-canvas-base` — swatch base
- `--bookmark-active-bg` / `--bookmark-active-fg` — selected chip surfaces
- `--bookmark-prominent-bg` / `--bookmark-prominent-fg` / `--bookmark-prominent-text` — primary CTAs and "new tag/profile" links
- `--bookmark-row-hover-bg` — list row hover tint (`color-mix` from active bg)

Implementation: `src/utils/canvasColor.ts` (applies it), with the swatches and OKLCH maths in `@memex/core` (`packages/core/src/tokens/`).

Dark mode: `[data-theme='dark']` token swap + dark swatch variants.

## Color Roles

### Canvas & surfaces

- **Canvas gradient** (`--bookmark-experiment-bg`): Full-viewport background; header and desktop rails are transparent so canvas shows through.
- **Frosted stack** (`--bookmark-stack-frosted-*`): Omnibar + list container—translucent bubble fill, blur, soft shadow, 10px radius.
- **Brand bubble** (`--bookmark-brand-bubble-*`): Header wordmark shell, secondary chip fills, stack glass base.

### Text

- **Primary** (`--bookmark-text`): Titles, body.
- **Muted** (`--bookmark-muted`): Metadata, captions.
- **Secondary** (`--bookmark-secondary-text`): Unselected tag/profile labels, placeholder-adjacent greys—tied to `--bookmark-border-ink`.

### Accent vs prominent

- **Accent blue** (`--bookmark-accent`): Focus rings, selection outlines, keyboard focus—not primary button fills.
- **Prominent** (`--bookmark-prominent-*`): Select, Done, Add bookmark, New tag, New profile—mid-tone swatch-derived fills.
- **Active** (`--bookmark-active-*`): Selected filter chips (profiles/tags).

### Named rules

**Theme-first color.** Interactive emphasis follows the user's canvas pick, not a fixed product blue.

**Grey ink for idle filters.** Unselected chips are text-only or transparent with grey ink; color arrives on selection or soft hover.

**No hover border darkening on list rows.** Row dividers stay constant; hover uses `--bookmark-row-hover-bg` only.

## Iconography

Chrome icons live in `src/components/icons.tsx` as **filled, rounded silhouettes** in `currentColor` on a 16px grid ("Filled Friendly", per the 2026-09-08 icon direction). Cutouts are real evenodd holes so a glyph reads on canvas, primary fill, or frosted glass alike. Metaphors are chosen for meaning: Home is a rounded house with a round-topped door; Notes to Self is a simple chat bubble with two text lines. Content surfaces — the note and link glyphs inside cards — stay as quiet 1.5px outlines so chrome reads louder than content. Don't mix in stroked icons for new chrome; add to `icons.tsx`.

## Mobile & installed app

memex is used as an installed home-screen app on iPhone. Rules that keep that working:

- **The sidebar becomes a fixed bottom bar under 900px** (`.memex-sidebar` is `position: fixed`). Never set `position` on `.memex-shell > *` generically — the grain-layer stacking rule is scoped to `.memex-shell-main` (and to the sidebar only on desktop) for exactly this reason.
- **Full-height shells use `100dvh`** (with a `100vh` fallback) so the iOS toolbar collapse doesn't leave a gap or clip the bottom bar.
- **Safe areas:** the header pads `env(safe-area-inset-top)` (status bar is `black-translucent`, so the canvas runs under it); the bottom bar and the Notes to Self sheet pad the bottom/side insets; `--bookmark-footer-offset` includes the home-indicator inset.
- **Inputs are ≥ 16px on phones** or iOS zooms the page on focus. Every text field is covered by a `max(16px, 1em)` floor.
- **Touch:** `touch-action: manipulation` and no tap highlight on all controls and cards; the document never rubber-bands in standalone (`overscroll-behavior: none`) — the stacks scroll inside.
- **Phone layout (2026-09-20):** the stack reorders for the thumb — filter chips on top, grid in the middle, **omnibar at the bottom** (border-top, capture button radius follows the bottom corner); the "← Back" row of link details stays at the top. The bottom bar snaps (`scroll-snap-type: x proximity`), fades at both edges, uses 44px targets, and scrolls the active space into view on route change. Notes to Self opens as a **full-screen sheet above the bar** (z 250). Header favorites scroll horizontally instead of wrapping. Grid is two equal columns at 204px with 8px gutters; card hover lift is disabled (press feedback stays). Under 380px chip counts hide and the brand shrinks.
- **Settings on phones (2026-09-27):** the header wordmark is a button that opens a left **settings drawer** (portaled to `<body>`, z 410, above the bottom bar) holding the same sections as the desktop menu: signed-in, canvas color, dark mode, sound, access tokens, log out. The old header "Settings" chip is gone; desktop keeps settings in the footer.
- **Manifest** (`public/site.webmanifest`): standalone, `start_url: /home`, theme/background keyed to the canvas grey; `theme-color` is updated at runtime to the live canvas swatch.

## Sound

Interaction sounds come from `cuelume`, routed through `src/utils/sound.ts` so components name a **mechanic**, never a sound. Per JOYFUL_SYSTEMS: short, quiet, tactile; sound accompanies feedback the UI already shows; never on passive events.

| Mechanic | Sound | Fires on |
| --- | --- | --- |
| `confirm` | sparkle | Capturing a link, note, or task; sending a note to self |
| `dismiss` | droplet | Deleting a link, note, task, or note to self; closing Notes to Self |
| `error` | error | A capture, send, or delete that fails (the UI also restores the input) |
| `move` | page | Adding a selection to a space; applying a tag to a selection |
| `toggle` | toggle | Checking a task done or undone; turning sound back on |
| hover `tick` | tick | Filter chips only (`data-cuelume-hover="tick"`) |

**User control:** Settings → Sound On / Sound Off (`SoundToggle`, persisted as `memex.sound`). Muting silences both `cue()` calls and hover attributes. Browsers keep audio suspended until the first click, so the first hover tick after load can be silent by design.

**Don't:** put hover sounds on content (cards, rows, previews), play on load or on data arriving, or call `play()` from `cuelume` directly.

## Color model (revised 2026-09-08)

Three rules, all derived at runtime from the chosen canvas swatch in `src/utils/canvasColor.ts`:

1. **Paper-first canvas.** Swatches are a whisper of hue (chroma ≈ 0.02 light / 0.018 dark; grey ≈ 0.006). Bold color lives in the interactive layer, never the ground.
2. **Hue-keyed neutrals.** Ink, muted text, borders, and control fills carry a little of the swatch hue (`--bookmark-text`, `--bookmark-muted`, `--bookmark-border*`, `--bookmark-control-*` are set on `:root` at runtime). A grey swatch keys neutrals to warm paper (hue 70), never the old cool blue-grey. Lightness and alpha are unchanged, so contrast is unchanged.
3. **Tint pairs.** `--bookmark-tint-bg` (pastel fill, L≈0.93) + `--bookmark-tint-ink` (deep ink, L≈0.44) + `--bookmark-tint-border`, one hue. Use them for secondary emphasis: active type chips, chip and bulk-target hovers, Notes to Self bubbles, the Notes to Self toggle. Never alpha-mix the primary over the canvas for a hover — it goes muddy. The **primary fill** (`--bookmark-active-bg` / `-fg`) stays reserved for navigation state (active sidebar item), the selected card, and primary buttons.

## Typography

**Families:** `Two Weekend Go` for app chrome — brand, sidebar, filter chips, buttons, headers (see `src/fonts/two-weekend-go.css`). `Inter` (variable, self-hosted via `@fontsource-variable/inter`, token `--bookmark-font-content`) for content — stream cards, the link details panel, and the note editor. `Geist Mono` (variable, self-hosted, token `--bookmark-font-mono`) for **data**: card host lines, chip and sidebar counts, timestamps, due dates, day dividers, the Spaces caption, initials fallbacks. Small sizes (10–11px), tabular numerals, a touch of tracking. Rule of thumb: if the user wrote or saved it, it's Inter; if the app is speaking, it's Two Weekend Go; if it's a number, a host, or a time, it's Geist Mono. Code inside notes uses the system monospace stack (`--font-code`).

| Level      | Size          | Weight     | Use                       |
| ---------- | ------------- | ---------- | ------------------------- |
| Brand      | 30px | Nunito 900, −0.05em, #2f55d6 + keyline, drop, split gloss | `memex` wordmark via `Wordmark` (sidebar, phone header, auth, styleguide, mocks) |
| UI         | 13px          | 500        | Chips, list rows, omnibar |
| Caption    | 12px          | 600        | Counts, footer, kickers   |
| Heading sm | 14px          | 600–700    | Modal titles, row titles  |

**Fixed UI scale** on dashboard—no fluid heading clamps in rails or list.

## Elevation & Material

> **2026-10-24 — Joyful Utility depth** (current; wins over older bullets below). The reference is GameCube/Wii/DS-era system software, kept in proportion for a working tool. One rule: **things you press are objects; things you read are paper.**
> - **Paper** (cards, the stack, task band, list rows, panels, popovers) gets soft depth only: a lit top edge (`--surface-lit`) and layered ambient + direct shadows tinted toward the canvas hue (`--shadow-s/m/l`, retuned in `pastel-sky.css`). Cards lift 2px on hover (`--hover-lift`). They never scale and never get gloss, so text and images stay crisp.
> - **Objects** (buttons, filter chips, pinned-site chips, icon buttons, task checks) use the raised control material: gradient plus bevel. Under the pointer they swell a little (`--hover-swell` 1.03; `--hover-swell-icon` 1.08 for small square controls) on the theme spring (`--transition-swell`, 220ms). On press they settle (`--press-settle` 0.97, 80ms). Ghost icon buttons are flat at rest and become a small raised button on hover. "Open" states and toggle tracks are pressed in (recessed); the chosen segment and active filter chips stand up out of them.
> - **Gloss** (the Wii-era split highlight, `--control-gloss-image`) marks what is **primary or on**: the primary button (which also gets `--control-glow`, a drop in its own colour), a checked task, and a selected item's check. Nothing else is glossy.
> - **Still** (no swell, no lift): sidebar rows, list rows and menu items. Rows you read down don't move; they tint, and only nudge 1px on press.
> - Swell and lift are mouse-only (`hover: hover`). Reduced motion zeroes all four motion tokens; the depth and gloss changes still answer the pointer.

- **Frosted omnilist:** `backdrop-filter: blur(20px) saturate(180%)` with bubble background; falls back to opaque glass when `prefers-reduced-transparency`.
- **List inside stack:** Transparent rows, 1px bottom dividers (`--bookmark-list-row-divider`), no per-row card boxes.
- **Shadows:** Tight `--bookmark-shadow-border` on frosted stack and toasts—not wide floating card shadows.
- **Press travel:** everything pressable scales to `--press-scale` (0.97) on `:active` over `--press-duration` (100ms) — the mechanical-button feel. Cards lift 1px on hover with a slightly deeper edge shadow and settle to 0.985 on press. Disabled under reduced motion.
- **Canvas grain:** a static single-tile SVG noise sits under the shell (`.memex-shell::before`, 4.5% multiply in light, 7% screen in dark). It never animates and hides under reduced transparency.
- **Capture pop-in:** the optimistic row for a just-captured item (and a just-sent note to self) settles in from 0.96 with a soft overshoot over 200ms (`memex-pop-in`). Input-driven only; nothing pops on load or on data arriving.
- **Dialogs (`.app-modal`, 2026-09-27):** the canvas surface with the edge shadow + a deep drop; backdrop is the primary hue mixed into a dark veil with a 6px blur; transparent header/footer with frosted hairlines; footer actions are the pill buttons, primary on the right. On phones a dialog becomes a **bottom sheet**: full width, 24px top corners, grab handle, slide-up entry, stacked full-width actions (primary on top, 48px), safe-area bottom padding, inputs ≥ 16px. Creating a space always goes through `NewSpaceModal` — no inline forms.
- **Edges on translucent surfaces:** cards, Notes to Self bubbles, and the composer use `--bookmark-edge-shadow` (1px inset light catch + 1px 4% outer ring + 1px soft drop) instead of a grey hairline; the border stays 1px transparent so stateful borders (selected, details-active) still take over. Dark mode swaps to an 8% inner light and a 35% ring. Chips, sidebar items, and list dividers keep their existing treatment.
- **Footer:** Fixed 28px bar on desktop (`desktop-footer`); dashboard uses `--bookmark-footer-offset: 28px` for bottom spacing.

## Components

### Header

- **Brand:** Non-interactive frosted bubble with italic `memex`.
- **Super favorites:** Favicon buttons in toolbar center.
- **Settings:** Secondary chip (6.75rem), opens account menu—canvas picker, dark mode, logout.

### Omnibar

- Tall single-row search inside frosted stack.
- **Add bookmark** appears when query is URL-like and no filter matches; uses prominent CTA styling.
- No blue focus ring on omnibar input—border-led focus.

### Filter chips (spaces & tags)

- **Unselected:** Transparent, `--bookmark-secondary-text`, soft hover bubble.
- **Selected:** Primary chip—theme `--bookmark-active-bg` / `--bookmark-active-fg`, brand bubble border.
- **Bulk assign mode:** Dashed accent border on chips (`is-bulk-target`); toast confirms apply.
- **New tag / New space:** Text buttons using `--bookmark-prominent-text`, underline on hover; same vertical metrics as chips (40px min-height). (Current UI copy says "New profile" until the spaces rename ships.)

### Link list

- Virtualized rows (~92px), favicon + title + URL + tag pills.
- Hover: theme tint background, unchanged divider.
- Selection mode: theme-tinted row fill (`--bookmark-row-selected-bg`); no outline or side accent.
- **Select/Done** + **Clear** float bottom-center of stack (prominent + secondary chips, 6.75rem width).
- New bookmarks prepend to top of list.

### Library views (15A, 2026-11-02)

- **Tabs** sit inside the stack between the search and the filter row: underline tabs on one hairline, label + count (data face, tabular). They're navigation, so they stay still and tint on hover; the lit tab's 3px bar is “on”, so it carries the gloss and grows in from the centre. The count of the lit tab takes the option-badge tint. Overflow scrolls sideways with faded edges. **Save view** is a dashed slot where the next tab will go (an object: it swells); it turns into a text field + primary button. The open saved view has a ghost ··· menu (Rename…, Save layout and sort, Delete with Undo).
- **Filter menus** (Source, Space, Sort) are filter chips with a caret; a chip with a value is “on” (raised tile) and names it (“From X”, “Kyoto trip” with its dot). Menus use the shared `.memex-menu` with check (square) and radio (round) marks; checked = color-1 + gloss.
- **Table** is paper: neutral-1 surface, hairline ring, `--shadow-s`, sticky header. Rows tint, never lift; selected rows take `--navigation-active-background`. Titles use the reading face; dates, hosts and counts the data face. Spaces are pills in their own hue (13% mix) with the dot. Selection checks and row actions appear on hover/focus (always on touch). Narrow tables shed columns by priority (Type, then Updated/Tags, then Source; spaces become dots).

### Tasks and drag to a space (2026-11-01)

- **Tasks** (`/tasks`, `styles/tasks.css`): the column sits on the same paper stack as the Journal; each group is a paper card (neutral-1, lit edge, hairline ring, `--shadow-s`) with a sticky header (space dot or a date icon; Overdue in `--error` with an icon). Rows are list rows: 44px, tint on hover, never lift; hairlines are drawn, not borders. The check is the shared task check (gloss when ticked) inside a 40px hit area. Due dates are data-face chips: Today takes the option-badge tint, Overdue the error tint plus an icon. The add field is the Journal composer's recessed field. Empty states use one raised disc; “All clear” makes it glossy because it's an “on” state.
- **Drag to a space:** while dragging, sidebar spaces become dashed slots in their own hue (`--space-hue`); the one under the pointer takes the add tint and the “+” disc, as when selecting. Dragged items fade to 50%. The ghost is a small paper pill (title), or a stacked pill with a glossy count for several items.

### Feedback toast

- **Position:** Absolute bottom-right of dashboard, above footer (`calc(var(--bookmark-footer-offset) + 12–24px)`).
- **Motion:** Slide/fade in (~280ms), out (~220ms); instant swap when `prefers-reduced-motion`.
- **Content:** OK mark + message; non-interactive (`pointer-events: none`).

### Modals & auth

- Native `<dialog class="app-modal">` pattern with muted header/footer.
- All new surfaces use `--bookmark-*` tokens—no legacy brutalist orange/blue campaign styling.

## Motion

- Fast transitions: 150ms; medium: 180ms (`cubic-bezier(0.2, 0.8, 0.2, 1)`).
- List stagger on filter change (respects reduced motion).
- Toast enter/exit animations.

## Do's and Don'ts

### Do

- Use `--bookmark-*` tokens for every new UI surface.
- Derive interactive color from canvas theme via `canvasColor.ts` surfaces.
- Keep action chips at **6.75rem** fixed width (Settings, Select, Done, Clear).
- Scope tag rail to the selected space when a space filter is active.
- Auto-apply active space/tag filters when capturing a new item from the omnibar.
- Reuse this dashboard anatomy (rails | frosted stack | omnibar capture) for every new memex module.
- Show bulk-action toasts immediately (optimistic), then persist in background.

### Don't

- Don't use fixed blue or ink-black as primary CTA fills—use `--bookmark-prominent-*`.
- Don't add "All" filter chips; empty selection means all.
- Don't darken list row borders on hover.
- Don't place inline feedback above the omnilist—use the bottom-right toast.
- Don't reintroduce decorative watermarks or heavy offset brutalist shadows on dashboard surfaces.
- Don't add a third face or move chrome to Inter—**Two Weekend Go** is the product voice, **Inter** is reserved for content surfaces (cards, details, editor).

## Component Library

Shared UI primitives live in `src/components/ui/` and render the existing token classes — new module surfaces compose these instead of re-writing markup:

| Primitive          | Renders                                             | Used by                            |
| ------------------ | --------------------------------------------------- | ---------------------------------- |
| `FilterChip`       | space/tag rail chips (idle, active, bulk-target)    | `ProfileFilterBar`, `TagFilterBar` |
| `InlineCreateForm` | rail-footer create input + Add/Cancel               | both rails                         |
| `ActionChip`       | `bookmark-toolbar-cta` variants (6.75rem chips)     | styleguide, future modules         |
| `FrostedStack`     | frosted-glass list container                        | module placeholders, styleguide    |
| `EmptyState`       | list empty title/subtitle                           | module placeholders                |
| `FeedbackToast`    | bottom-right status toast (presentational)          | `DashboardPage`                    |
| `MarkdownText`     | rendered markdown reading view (GFM)                | `NoteEditor`, future Spaces module |
| `MarkdownTextarea` | markdown-aware textarea (lists, Tab, ⌘B/I/K)        | `NoteEditor`                       |

**Stream cards:** every grid item shares one surface (components.css → “Stream cards”): neutral-1 fill, lit top edge (`--surface-lit`), hairline `--edge` ring, `--shadow-s`; hover deepens the edge, lifts 2px and deepens to `--shadow-m`; selection is a `--border-l` color-1 ring plus the shared `.memex-select-check` (text cards also take the selection tint). `StreamCard` is the text anatomy — header (leading slot + meta) / title / excerpt / tag footer, hover actions top-right — filled by `NoteGridCard` and `LinkGridCard` (links without an image). `LinkPreviewCard` is the image-first link anatomy on the same surface. The task band and list rows (`StreamRow`) use the same selection check.

**Reference page:** `/styleguide` (auth-protected, intentionally unlinked from app navigation) renders the full catalog — tokens, type, chips, stream cards, task band, list rows, empty state, toast, modal — under live canvas theming and dark mode. When adding or changing a primitive, update the styleguide page in the same change.

## Source of Truth in Code

| Concern          | Location                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| Design tokens    | `src/index.css` (`:root`, `[data-theme='dark']`, `.bookmark-dashboard`)  |
| Canvas theming   | `src/utils/canvasColor.ts`, `src/components/CanvasColorPicker.tsx`       |
| Dashboard layout | `src/pages/DashboardPage.tsx`                                            |
| Header           | `src/components/AppHeader.tsx`                                           |
| Command palette  | `src/components/stream/CommandBar.tsx`                                   |
| Rails            | `src/components/ProfileFilterBar.tsx`, `src/components/TagFilterBar.tsx` |
| Stream cards     | `src/components/StreamCard.tsx`, `src/components/stream/LinkPreviewCard.tsx`, `src/styles/components.css` |

When in doubt, match the dashboard implementation—not this document if they diverge; then update this document.
