# Memory Cards: refinement pass 2

Design only. Nothing outside `design/memory-cards/` changed. First-pass renders are in `png-before/`, new ones in `png/`, side-by-sides in `compare/`, and `overview.png` shows 12 key screens.

**Look at these first:** `overview.png` · `png/s05.png` (the new card) · `png/d01.png` · `png/x01.png`–`x03.png` (navigation) · `png/x04.png`–`x06.png` (Journal panel) · `png/d06.png` (View panel) · `png/d18.png` (capture with live card) · `png/s12.png`–`s14.png` (states, themes, card write) · `compare/d01.png`, `compare/d31.png`, `compare/d34.png`, `compare/m01.png`.

## Summary: the moves and why

1. **The label strip is the label.** Pass 1 had a 10 px coloured stripe *and* a grey meta row saying the same thing. Now each card ends in a 44 px strip in its space's colour with the space's name on it (source, kind or time on the right). That's how a memory card or cartridge works: the label tells you what's inside. Colour now fills a surface on every card, the meta row is gone, and an unfiled card shows a grey “Unfiled” label that asks to be filed.
2. **Text-only cards wear their colour.** Jots fill with their space colour (pin 1's full-colour tiles); notes tint from it, so a Kitchen note reads as Kitchen at a glance, and dark mode never turns muddy. Picture cards stay white so the picture leads. The grid now has a rhythm of photo, white and colour, like pin 1.
3. **Heroes carry data.** The count moves into a superscript on the hero (Everything²⁴⁸, Tasks⁶, Today¹¹, like pin 3's Lessons³¹⁸), which saves a line on every page and makes the hero mean something. Hero goes to 80 px (4.4× body); phone hero to 52 px (3.1×).
4. **Bigger and fewer.** Card titles are 26 px on every card, nothing is under 16 px, the space pills lose their counts, the chosen pill fills with its colour, and New space becomes an empty cartridge slot (“+”). The busy sheets (View, Settings, Agent tokens, Keys) became tiles, chips and key caps, each with one primary action.
5. **Molded, not flat.** Primary buttons, pills, jots, tiles and key caps get a lit top edge and a darker lip at the bottom that flattens when pressed (GameCube-era plastic, not skeuomorphic). Focus is now a solid ring.
6. **Writing a card.** Capture sheets show the card you're about to write, and its label changes colour as you pick a space. s14 draws the save frame by frame: a blank card drops in, the label stamps in, “✓ Saved” lands on the label.
7. **Every state, every theme.** s12 shows every small control in eight states, s13 shows the kit in light, dark and real Plex (now vendored in `fonts/`), and s02/s03/s04 gained Disabled.

The Library still has 14 controls before the first card (nav 3, Inbox, account, field, +, •••, All, 4 spaces, new-space slot). Pass 2 made them quieter, not fewer. x02 (rail) and x03 (bento) are the options that actually change the count.

## 1. Critique of pass 1 (against the five pins)

**Proportions**
- The hero (72 px) is about 4× body, inside the 3.5–7× band, but it only names the page ("Everything", "Inbox"). In the pins the hero carries data (43 Gwei, 85%, Lessons ³¹⁸). The count sits in a separate grey sub-line, so every page header spends two lines on one idea.
- Phone heroes are 44 px over 17 px body (2.6×), below the band.
- Card titles are 24 px, but picture cards drop to 20 px. Titles should be the second-biggest thing on screen and the same on every card.

**Colour is still trim**
- The label strip is a 10 px stripe. It reads as a coloured underline, which is exactly the "colour as trim" the pins avoid. It also duplicates the meta row above it (dot + space name + source), so every card says its space twice.
- Only the space header band (d03) and phone space tiles (m02) fill a surface with colour. Notes use one pale yellow for every space, which says nothing.

**Too many small things**
- Text under 16 px in many places: key caps (15), due chips (15), the agent badge (13), menu shortcuts (15), menu headers (14), Journal timestamps (14), strips (15), the picture source badge (15), tile captions (14), tab-bar badges (13), sheet captions (14), share-sheet sources (14).
- Library: 14 controls before the first card (3 nav, Inbox, avatar, field, +, •••, All, 4 space pills, New space). Pill counts (38, 24…) repeat what the hero already says.
- The ••• view menu (d06) is two menus, 21 rows, mostly check marks. It is the only place List, Table, filters, sort and saved views live, and it reads like a settings dump.
- Settings (d31): nine 30 px colour dots (below the 44 px target), two toggle groups, two switches, two link rows and an account row in one column. Agent tokens (d32) puts a name field, a two-way toggle and a Create button on one line under the list. Shortcuts (d34) is 14 rows of tiny key caps.
- Card open (d11) shows the space pills with "+ Add" and also a "Move to…" button: two controls for one job.
- Inbox proposals stack badge, "wants to edit a note · 10 min ago", title, diff, reason and two buttons. Filing suggestions use a 44 px pill next to a quiet text button.
- Journal (d23) suggestions are a 32 px dashed strip, the smallest thing on the page and the only action there.

**Phone frames**
- m01: the Cards header carries hero + Tasks pill + avatar, then a search field, then a pill row cut off mid-word, then cards. The Journal shows a composer field and the centre + one above the other.
- m03: the proposal card wraps the diff into four lines; the Tasks frame hides everything behind a sheet.
- m05/m06: primary buttons are left-aligned and small; the offline card uses 14 px text.
- m09: the "Save as a jot" button is cut off by the tab bar.

**States and themes**
- Round icon buttons show the same picture for Loading and Error as Default.
- No disabled state on buttons, pills, fields or inputs. Switch, toggle group, checkbox, swatch, task row and menu item states are not shown together anywhere.
- Dark mode: the note colour turns muddy brown; toasts are near-black on a near-black page; the focus ring is a 45%-alpha blue that disappears on dark paper.
- The Plex switch falls back to a system font when IBM Plex is not installed, so d43 is not a real Plex render.
- Focus ring is translucent everywhere; it should be a solid, high-contrast ring.

**Consistency**
- Spacing uses 10, 12, 14, 18, 22, 26 px values outside the 4–64 scale.
- The picture radius (20) inside the card radius (28) with a 12 px inset is not concentric (28 − 12 = 16).
- Empty states use a tiny 150 px card glyph; a full-size empty card slot would say "your first card goes here" by itself.

## 2. What changed, screen by screen

Before is `png-before/<id>.png`, after is `png/<id>.png`; side-by-sides exist in `compare/` for the ids marked ◆.

**Components**
- s01 Tokens — new scale, label strip in all 8 space colours, targets, real Plex sample.
- s02 Buttons ◆ — seven states (Disabled added); molded lip; error carries a “!” badge, not only red; round buttons now differ in Loading (spinner) and Error (red ring).
- s03 Space pills — selected fills with the space colour; New space is an empty slot; Disabled added.
- s04 Field — Disabled (signed out) replaces the duplicate task example.
- s05 Cards ◆ — new anatomy: label strip, 26 px titles, tinted notes, full-colour jots, unfiled and two-space variants.
- s06 Card states — on the new anatomy; “✓ Saved” stamps on the label.
- s07 Menus ◆ — pressed and loading menu items; the ••• menu is now short (layout + “View options…”).
- s08 Toasts and states — empty states use a full-size empty card slot; offline toast uses orange, not brown.
- s09 Rows — selected task row; list rows carry the label as a strip; table chips are real strips.
- s10 Inbox cards — both cards end in a label (target space, or “Unfiled”); Reject and Not now are quiet.
- s11 Mobile nav — active tab fills its icon; header shows search + account; focus uses the tab icon ring.
- **s12 Controls: states (new)** — switch, checkbox, swatch, toggle group, input, menu item, phone tab × Default/Hover/Pressed/Focus/Loading/Error/Disabled/On, with n/a marked.
- **s13 Themes (new)** — the same kit in light, dark and Plex.
- **s14 Card write (new)** — the save moment in five frames, with timings and reduced motion.

**Desktop**
- d01 ◆, d02 — hero with count, filled space pill, label-strip cards, a jot in colour.
- d03 ◆ — the band becomes molded; the count sits on the hero; pinned sites are 64 px buttons.
- d04, d05 — d05 uses the empty slot with the search glyph; Clear is quiet.
- d06 ◆ — two 21-row menus become one View panel: three big layout tiles, then chips for Show, From, Sort and Saved views.
- d07, d08 — list rows lose the meta line and gain the label strip; table rows 76 px, chips 16 px.
- d09 — selection bar: count, Move to… (primary), Delete, ✕.
- d10 — the drop target pill is ringed and swells 10%.
- d11 ◆, d12 — Move to… removed (pills + “+ Space” do it); one primary action; a gold label edge along the sheet bottom.
- d13, d15 — d15's note document starts with its label strip (space, Saved, •••, ✕).
- d14 ◆ — Move sheet uses full-colour space tiles instead of pills.
- d16 — the space pill is filled and the source joins the meta line. d17 — the Undo toast over the new grid.
- d18 ◆, d19, d20 — capture sheets show “Your card”, a live preview with the chosen space's label; space choices in a 2×2 grid.
- d21 — one error line with a “!” badge; Retry primary.
- d22 — card-write: “✓ Saved” sits on the label.
- d23 ◆, d24 — hero “Today¹¹”, bigger bubbles, filled space strips, a 44 px dashed “File in Kyoto trip?” suggestion.
- d25 ◆, d26 — Inbox hero with count; proposal and suggestion cards on the new anatomy; d26 uses the green empty slot.
- d27 ◆, d28 — each space group gets a coloured band header; Done (4) is a quiet button.
- d29, d30 — swatches with a proper selected ring.
- d31 ◆ — Dark mode, Sounds, Font and Card captions become four tiles; canvas swatches 44 px; Connections and account rows below.
- d32 ◆ — URL row with Copy; token rows with •••; one full-width “New agent token”.
- **d45 (new)** — New agent token: name, two choice tiles (Read / Read and write), Create token.
- d33 — space dots in their colour; 16 px floor.
- d34 ◆ — “Keys”: three groups (Go, Make, Pick) of 64 px key caps.
- d35–d37 — 64 px wordmark, full-width buttons, error with “!” badge.
- d38 ◆, d40, d41 — empty card slots in blue, red and grey.
- d39 — loading cards end in a grey label.
- d42, d43 — dark and real Plex on the new Library.
- d44 — extension popup shows the card it will write, full-width Save.

**Phone**
- m01 ◆ — Cards header is hero + ⌕ + account (the search field and Tasks pill go); pills fade at the edge; Journal hero “Today¹¹”.
- m02 — a Tasks tile tops the Spaces grid; the space board's band runs under the status bar.
- m03 ◆ — compact proposal fits without wrapping; Tasks shows its band header with the Due sheet.
- m04 — Open is full width beside share and •••; the note opens on its label strip.
- m05, m06 — full-width Save; share sheet shows the card; offline outbox is an orange-labelled card “Not sent yet”.
- m07 ◆ — Account sheet as four tiles (Dark, Sounds, Haptics, Font).
- m08, m09 — filed card's label turns cyan; m09 no longer cuts off its button or its error text.

## 3. Token changes (old → new)

| Token | Pass 1 | Pass 2 |
|---|---|---|
| `--t-hero` | 72px | 80px |
| `--t-hero-m` (new) | 44px (inline) | 52px |
| `--t-h2` | 28px | 32px |
| `--t-h3` (card title) | 24px (20 on picture cards) | 26px on every card (24 on phone) |
| `--s1`…`--s9` | 4, 8, 16, 24, 32, 40, 64 (`--s1`–`--s7`) | 4, 8, 12, 16, 24, 32, 40, 48, 64 (`--s1`–`--s9`; renumbered) |
| `--r-pic` | 20px | 16px (concentric in a 28 card at a 12 inset) |
| `--label-h` (new) | 10px stripe | 44px label strip |
| `--hit`, `--ctl` (new) | — | 44px, 60px |
| `--tint` (new) | — | 22% light, 30% dark (note tint) |
| `--on-c` (new) | white on fills | #1d2127 ink on every colour fill, both themes |
| `--ring` (new) | rgba(80,119,255,.45) | #3d63f0 solid; dark #9db2ff |
| `--toast` (new) | #1d2127 in both themes | #1d2127; dark #3a414d |
| `--agent`, `--agent-bg` (new) | inline #6a43d8 / #ece5ff | tokens, with dark #c9b8ff / #352c5c |
| `--bevel`, `--shade` (new) | inline | inset 0 2px 0 rgba(255,255,255,.8) · inset 0 -5px 0 rgba(0,0,0,.16) |
| `--mut` | #6a6f75 | #62676e (contrast) |
| `--faint` | #9aa0a7 | #8d939b (contrast) |
| `--notep` | #fff8d6 | #fff6cc (only unfiled notes use it now) |
| dark `--mut`, `--faint`, `--line`, `--well`, `--pri-ink` | #a4abb5, #7c838d, #343a44, #272d36, — | #a9b0ba, #838a94, #363c46, #2a3039, #9db2ff |

`tokens.css` and `tokens.json` are generated from `mc_css.ts` by `node tokens.mjs` (also run by `make.sh`).

## 4. Alternatives explored for the open decisions

| Decision | Options (PNG) | Recommendation |
|---|---|---|
| 3 · Desktop navigation | A top bar + pills `x01` (= d01) · B slim rail with cartridges `x02` · C bento of space tiles `x03` | **A** for now. It keeps words on the nav and cards highest. **C** is the most pin-1 and worth stealing for the phone Spaces tab (m02 already does) or a future Home. **B** wins if spaces pass ~8, since the rail scrolls and the pill row can't. |
| 6 · Docked Journal panel | A cut, J opens the tab `x04` (= d23) · B week strip + folded day rows in the Journal header `x05` · C slide-over drawer on Cards `x06` | **B.** It brings back the calendar jump and day summaries without a second Journal surface. C is handy but makes two Journals to maintain. |
| 2 · Font | Nunito + Inter (d11, d27, d23) vs IBM Plex Sans `x07`, `x08`, `x09`, `d43`, `s13` | **Nunito** for memex: the rounded black weight carries the toy feel; Plex reads more like a tool. Keep the one-token switch so Joyful Systems brand surfaces can use Plex. |
| 4 · Card open | Centred card `d11` vs bigger in-place expand `x10` | **Centred card.** The in-place expand squeezes two columns and moves neighbours, which is the motion pass 1 wanted to lose. |
| 10 · Space colour | Automatic `x11` A vs chosen `x11` B / `d29` | **Chosen**, now that the label strip makes colour carry a space's name on every card. It needs the `profiles.color` migration, so it's Ryan's call. Automatic works meanwhile. |
| 9 · Phone tabs | 5 tabs, centre + `x12` left (= m01) vs 3 tabs, Inbox in the header, floating + `x12` right | **Centre +.** Capture is the primary action and deserves the thumb spot; three tabs would hide Inbox behind a header icon. |

## 5. The 13 open decisions, after pass 2

1. **Nov 4 hold / implementation** — still open; not a design question.
2. **Font** — *reframed*: real Plex renders now (`x07`–`x09`, `s13`, `d43`). Recommendation: Nunito.
3. **Drop the sidebar** — *explored* in `x01`–`x03`. Recommendation: A.
4. **Centred card vs in-place expand** — *explored* in `x10`. Recommendation: centred.
5. **List, Table, views, filters, sort behind •••** — *reframed*: they now live in one View panel (`d06`) instead of two long menus, which makes “keep them all” cheap. Still open whether to cut any.
6. **Cut the docked Journal panel** — *explored* in `x04`–`x06`. Recommendation: x05.
7. **Pinned sites off Everything** — unchanged, open.
8. **Library → Cards** — unchanged, open; the label-strip cards make “Cards” fit better.
9. **Phone tabs** — *reframed*: the Tasks header pill now lives as a tile at the top of Spaces (m02); `x12` shows three tabs. Recommendation: keep the centre +.
10. **Space colour choice** — *reframed*: colour now names the space on every card. Recommendation: chosen (needs the migration).
11. **Sound default** — mockups show Sounds **off** (Joyful Systems rule) and phone Haptics on; still Ryan's call.
12. **Card captions setting** — *reframed*: with the meta in the label strip, captions only affect picture cards. Recommendation: pick Below and drop the setting.
13. **Image upload** — unchanged, open.

## 6. Coverage changes

Every row of the README coverage table still maps to screens; the table, the moved list and the new list in `README.md` are updated, each pass-2 item marked “(pass 2)”. In short: the card meta row moved into the label strip; pill counts moved to the hero superscript and tiles; New space became a slot; Move to… on an open card is replaced by its pills; the agent-token form moved to d45 and Revoke into •••; the phone Tasks pill moved to the Spaces tab and phone search became a button; the selection bar's Done became ✕. Nothing was cut. New ids: d45, s12–s14, x01–x12.

## 7. Figma

Not made in this pass; the HTML sheets (s01–s14) and `tokens.json` are the source. A Figma file with these tokens as variables is a good next step once the label strip and font are settled.

## 8. Things I'm unsure about

- **`color-mix()`** tints the notes and empty slots. If the design Page's renderer doesn't support it, those fall back to the browser default; worth checking there.
- **Dark ink on every colour fill.** It meets contrast on all eight colours (blue is the weakest, about 4.6:1), and it reads like a printed sticker, but white on coral and blue looked livelier in pass 1.
- **“Today” as the Journal hero** while the tab says Journal. It tells you what you're looking at; it might also read as a second name.
- **Control count**: unchanged at 14 on the Library (see the summary). Fewer would mean folding Inbox into the account button or taking B/C navigation.
- **Plex weights**: only 400–700 are vendored, so 800/900 Nunito roles render at Plex 700 (intended; Plex has no black).
- **d23** fits the suggestion just above the composer; with real content the feed scrolls, so it is fine, but the mock is tight.
- The **spacing scale was renumbered** (`--s3` is now 12, not 16). Nothing in the app uses these names yet.
