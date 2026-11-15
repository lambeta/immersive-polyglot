# Contract: Page Control Surface

**Status**: Phase 1 design contract for `src/ui/popup/popup.html`, `popup.css` and `popup.ts`.
**Depends on**: `design-system.md` (tokens, controls, motion, catalogue rule).
**Supersedes**: nothing. Every id listed here already existed and keeps its behaviour; the contract
records what the panel now looks like and what each control must do.

---

## 1. Geometry

| Property | Value |
|---|---|
| Panel width | 384 px, fixed (one column) |
| Padding | 16 px sides, 16 px top, 12 px bottom |
| Region gap | 14 px |
| Height, untranslated | 484 px measured — must stay ≤ 600 px (FR-009) |
| Height, translated with three session lines | 599 px measured — must stay ≤ 600 px |
| Height, five session lines | 654 px measured — scrolls; allowed by the spec |
| Minimum control height | 40 px (44 px for the primary action) |

The panel has no horizontal scroll at any state, and no region may be clipped by the browser's 600 px
limit while the primary action or the settings control is unreachable.

## 2. Region order

1. **Header** — product mark (32 px, the shipped icon), title (h1), the current site (mono, muted), and
   the settings control, right-aligned. The header is not a bar: no ground of its own, no hairline, no
   sticky behaviour.
2. **State** — a status dot plus the state line (`role="status"`, `aria-live="polite"`), then the
   primary action, then the condition lines (failure, cap, broken rule) in that order.
3. **Display position** — a `fieldset` with a `legend` ("Display") and a three-cell track of radios.
4. **Provider** — a labelled `<select>`.
5. **Style** — the fifteen-tile grid, then the chosen-style line.
6. **Session record** — `section` with an h2 ("This session") and a list; omitted entirely when empty.
7. Nothing else. No footer, no promotional line, no version, no link row.

## 3. Controls

| Control | Id | Accessible name | Behaviour | Keyboard |
|---|---|---|---|---|
| Settings | `#settings` | `popupOpenSettings` via `aria-label` + `title` | opens the settings page | Enter/Space; first-class button |
| Primary action | `#translate` | its visible label | translates the page, or restores it when a run exists; disabled with no enabled provider | Enter/Space |
| Cancel | `#cancel` | its visible label | cancels the run; rendered only while collecting or translating | Enter/Space |
| Display position | `input[name="popup-mode"]` ×3 | the full catalog sentence (short word visible) | writes the site preference, sends the live command | arrows move, as a native radio group |
| Provider | `#provider` | `popupProvider` | selects this page's provider override for the next translation; no stored rule changes | native select |
| Style | `input[name="popup-display-style"]` ×15 | the style's catalogue name | writes the site style, sends the live command | arrows move the selection; the page follows |
| Page reset | `#translate` (same control) | — | returns the page to its original state | Enter/Space |

The state dot is **decorative** (`aria-hidden`): the state is carried by the words beside it. Its colour
is an aid, never the message.

## 4. Style tiles

- Grid: 5 columns × 3 rows, 6 px gap, each tile 35 px tall, `--r-sm`.
- A tile shows only the style's preview mark; the name is clipped (`clip-path: inset(50%)`) so it stays
  the radio's accessible name, and the tile carries the name as `title`.
- Selected: `--p-accent-tint` ground, accent edge, accent glyph. Focused: the shared focus ring on the
  tile, not on the invisible input.
- The chosen-style line under the grid reads "Current style: {name}" and updates on selection and on a
  storage change from the settings page.
- The grid is a `fieldset` with a `legend` ("Translation display style"); the legend is a 13 px muted
  label, not a heading.

## 5. Condition lines

Each condition is independent, sits under the primary action, and never replaces it. They use
`.note--error` / `.note--warn` and carry `role="alert"` (failure) or `role="status"` (cap, broken rule):

| Id | Content source | Tone |
|---|---|---|
| `#failure` | the failure class's catalogue message, or the no-provider message | danger |
| `#cap` | `popupCapReached` with the count | warn |
| `#broken-rule` | `popupBrokenRule` with the rule and the provider used | warn |

## 6. Session record

One row per fact, hairline-separated, 13 px muted: passages translated, characters sent, passages
reused, passages skipped, passages failed. The whole section, heading included, is absent when the list
would be empty (`:has(#usage:empty)`). It is a record, not a chart: no bars, no money, no estimates.

## 7. Motion

One entrance on load (240 ms fade + 5 px rise) and the working-state pulse on the dot. Hover and press
feedback on the primary action, the settings control, the segmented options and the tiles. Nothing else
moves. Under reduced motion everything rests and no region is left invisible.

## 8. Invariants a reviewer checks on screen

1. Exactly one primary action; the settings control is visible without scrolling in every state.
2. The panel is 384 px wide and does not scroll sideways at 200% zoom.
3. The chosen style is stated in words, not only as a highlighted tile.
4. No provider ⇒ the action is disabled and the reason names the settings page.
5. The session record disappears when there is nothing to report.
6. Every tile is reachable by Tab once (as a radio group) and by arrow keys within the group.
