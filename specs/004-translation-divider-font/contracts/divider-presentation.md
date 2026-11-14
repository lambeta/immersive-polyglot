# Contract: Divider Presentation and Preview Icon

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md) | **Date**: 2026-11-14

This contract is normative for FR-001 through FR-008. It supersedes feature 002's catalogue entry for
Divider in `specs/002-translation-display-styles/contracts/display-style-catalog.md` (the description
row and the icon-shape row), because that entry describes a full-width rule where this feature ships a
short dashed line.

---

## 1. Treatment (normative)

The Divider style introduces the translated block with exactly one short dashed horizontal line above
it — never a full-width rule and never a line down an edge:

```css
[data-ipt-style="divider"]::before {
  content: "";
  display: block;
  width: 88px;
  max-width: 50%;
  border-block-start: 1px dashed currentColor;
  margin-block-end: 0.4em;
}
```

- The line is short: about fifteen dash segments at the platform's 1 px dash pattern (88 px), and at
  most half the block's width on very narrow blocks.
- No other property may draw the line: no background image, no extra node, no page-authored element.
- The translation's own text styling is untouched: no italic, no inline indent, no
  family/size/weight/alignment change (FR-004, FR-006).

---

## 2. Geometry (the observable outcome)

| Property | Required outcome |
|---|---|
| Orientation | Horizontal: the line's width is far greater than its thickness. |
| Length | Short and fixed: measured width between 60 px and 90 px at default zoom (about fifteen dashes), never more than half the block's width, and never a stub of one or two dashes. |
| Thickness | A hairline: 1 CSS px at 100 % zoom, and never more than 2 CSS px. |
| Position | Immediately above the translated text, at the block's inline-start (left in LTR, right in RTL), with one small gap below it. |
| Block decoration | Zero: no border on the block itself, no full-width rule, no rule along an edge, no rule below the text. |
| Placement | Does not change the block's display type, position, float, writing mode or width; no horizontal scrollbar. |

---

## 3. Direction and language

- The line is block-level decoration: it starts at the translation's inline-start and therefore sits on
  the left in LTR and on the right in RTL, keeping its short length either way.
- Independently, the renderer writes `dir="rtl"` on a translation whose target language is RTL
  (see [typography-settings.md](./typography-settings.md) section 4.4 and the shared
  `isRtlLanguage` helper), so the translated text reads in the correct direction.

---

## 4. Modes and containers

| Situation | Required behaviour |
|---|---|
| Translation below the source (default) | The line sits between the source block and the translation. |
| Translation above the source | The line travels with the translation and stays directly above it. |
| Translation only (source hidden) | The line remains, introducing the translation from the surrounding page content. |
| Source is a list item, table cell, caption, definition-list term/description | The line sits above the translation block inside that container without breaking the marker, cell borders or list geometry. |
| Translation longer than the source | The line keeps its short length and position while the text wraps normally. |
| Single short word | The line keeps its short length; it does not collapse to a dot or a stub. |

---

## 5. Colour, forced colours, motion and zoom

- `currentColor` ties the line to the translation's text colour, so it inherits every contrast
  correction the existing foreground policy makes. Non-text contrast against the immediate backdrop
  must be ≥ 3:1 (FR-003).
- Under `@media (forced-colors: active)` the line uses the forced text colour and keeps its dashed
  pattern; it must remain visible and the style must not be carried by colour alone.
- No transition or animation is introduced; reduced motion needs no change.
- At 200 % zoom the line keeps its 88 px short length, the block does not clip, and the layout matrix
  still reports no overlap and no horizontal scroll.

---

## 6. Preview icon

| Aspect | Contract |
|---|---|
| Descriptor | `{ mark: "rule", pattern: "dashed" }` in `src/shared/display-styles.ts`. |
| Mark | A short dashed horizontal line above the icon's text bars, in `currentColor`, roughly nine of the viewBox's twenty-four units wide (not the full width). |
| Bars | The same abstract text bars as every other non-bar icon. |
| Weight | A hairline: at most 1.6 px stroke in the 24×16 viewBox. |
| Size | Legible and unclipped at 16 px and at 200 % UI zoom; vector, no raster, no external request. |
| Semantics | `role="img"` with an accessible name equal to the localised style name; the decorative layer is hidden from assistive technology. |
| Distinction | Quote keeps its solid vertical bar mark; no other style draws a dashed line above the bars. |

---

## 7. Live sample

The options page's sample element carries the same `data-ipt-style` value and the same stylesheet as
the injected rendering (the build copies `display-styles.css` into both UI bundles). Selecting Divider
must therefore show the short dashed line in the sample, with no separate sample-only rule to drift.

---

## 8. Restoration

The treatment is pure CSS (one generated box) on a container the product owns, plus the journaled
`dir` attribute. It adds no nodes and no attributes of its own. Removing the translation removes the
line completely: the restored DOM hash must equal the pre-translation hash, and no `data-ipt-style`,
`border` or `dir` residue may remain on page-authored elements (FR-024, SC-009).

---

## 9. Required tests

| Obligation | Test |
|---|---|
| Short dashed line above the translation (60–90 px, about fifteen dashes); no full-width rule; no edge rule; no bottom rule; single-line and wrapped blocks | `tests/e2e/display-styles.spec.ts` (computed pseudo-element geometry) |
| Text styling untouched; only the container is marked | `tests/dom/renderer-style.test.ts` |
| RTL target renders right-to-left with the line at the inline-start | `tests/dom/renderer.test.ts` (dir) and the e2e mode × direction layout matrix |
| Icon is a short dashed horizontal mark and differs from Quote | `tests/unit/display-styles.test.ts`, `tests/dom/style-preview.test.ts` |
| Pairwise distinctness of all fifteen styles after the change | `npm run verify:styles` (105 pairs) |
| Exact restore with Divider active | `tests/dom/restorer.test.ts` and `verify:styles` restore pass |
