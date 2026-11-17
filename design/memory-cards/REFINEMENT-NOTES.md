# Memory Cards: refinement pass 2 (notes)

_Draft in progress. The critique below was written before any render changed; `png-before/` holds those renders._

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
