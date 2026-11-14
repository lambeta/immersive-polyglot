# Contract: Divider Presentation and Preview Icon

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md) | **Date**: 2026-11-14

This contract is normative for FR-001 through FR-008. It supersedes feature 002's catalogue entry
for Divider in `specs/002-translation-display-styles/contracts/display-style-catalog.md` (the
description row and the icon-shape row), because that entry describes a horizontal rule above the
translation, which this feature removes.

---

## 1. Treatment (normative)

The Divider style decorates the translated block with exactly one rule, on the block's **logical
inline-start edge**, and nothing else:

```css
[data-ipt-style="divider"] {
  border-inline-start: 1px dashed currentColor;
  padding-inline-start: 0.55em;
}
```

- The previous declarations (`border-block-start: 1px solid currentColor` and
  `padding-block-start: 0.4em`) are removed.
- No other property may be used to draw the rule: no pseudo-element, no background image, no extra
  node.
- The translation's own text styling is untouched: no italic, no indent beyond the inline padding,
  no family/size/weight/alignment change (FR-004, FR-006).

---

## 2. Geometry (the observable outcome)

| Property | Required outcome |
|---|---|
| Orientation | Vertical: the rule's rendered height is far greater than its width. |
| Width | A hairline: 1 CSS px at 100 % zoom, and never more than 2 CSS px. |
| Height | Spans the translated block's rendered height: `height(rule) ≥ 0.9 × height(block)`, for a one-line heading as well as a multi-line paragraph. |
| Position | At the block's inline-start edge; the text begins one small gap after it (0.55em). |
| Block decoration | Zero: `border-block-start-width`, `border-block-end-width` and any pseudo-element decoration are 0/none. A rule above, below or between lines is a defect. |
| Stub | None: no fixed-width segment of roughly 10 % of the column. |

The rule must not change the block's display type, position, float, writing mode or width beyond the
inline padding; the page must not gain a horizontal scrollbar.

---

## 3. Direction and language

- The rule's side is decided by CSS logical properties against the translation block's computed
  direction: left for LTR, right for RTL.
- The renderer writes `dir="rtl"` on the translation when the block's target language is RTL
  (see [typography-settings.md](./typography-settings.md) section 4.4 and the shared
  `isRtlLanguage` helper). For non-RTL targets it removes the attribute and the block inherits the
  page's direction.
- This makes the rule mirror for an RTL target on an LTR page, not only on an RTL page.

---

## 4. Modes and containers

| Situation | Required behaviour |
|---|---|
| Translation below the source (default) | Rule on the translation's leading edge, between source and translation. |
| Translation above the source | Rule travels with the translation; still on its leading edge. |
| Translation only (source hidden) | Rule remains, identifying the translation block. |
| Source is a list item, table cell, caption, definition list term/description | The translation block sits inside that container; the rule draws on the block's leading edge without breaking the marker, cell borders or list geometry. |
| Translation longer than the source | The rule covers the whole rendered block; no clipping, no overflow, no shortening. |
| Single short word | The rule still spans the one line's height; it does not collapse to a dot. |

---

## 5. Colour, forced colours, motion and zoom

- `currentColor` ties the rule to the translation's text colour, so it inherits every contrast
  correction the existing foreground policy makes. Non-text contrast against the immediate backdrop
  must be ≥ 3:1 (FR-003).
- Under `@media (forced-colors: active)` the existing rule maps the divider's border colour to
  `CanvasText` and keeps the dashed pattern; the rule must remain visible and the style must not be
  carried by colour alone.
- No transition or animation is introduced; reduced motion needs no change.
- At 200 % zoom the rule stays a hairline, the block does not clip, and the layout matrix still
  reports no overlap and no horizontal scroll.

---

## 6. Preview icon

| Aspect | Contract |
|---|---|
| Descriptor | `{ mark: "bar", pattern: "dashed" }` in `src/shared/display-styles.ts`. |
| Mark | A thin dashed vertical stroke on the icon's leading edge (leading edge = left in the LTR-rendered picker), in `currentColor`. |
| Bars | The same abstract text bars and leading offset as Quote, so the pair differs by stroke weight and dash pattern, not by position. |
| Weight | The stroke is at most half the thickness of Quote's solid bar. |
| Size | Legible and unclipped at 16 px and at 200 % UI zoom; vector, no raster, no external request. |
| Semantics | `role="img"` with an accessible name equal to the localised style name; the decorative layer is hidden from assistive technology. |
| Drift guard | The `"rule"` mark is removed from the type union together with its draw branch, and the icon test asserts that no catalogue entry references it. |

---

## 7. Live sample

The options page's sample element carries the same `data-ipt-style` value and the same stylesheet as
the injected rendering (the build copies `display-styles.css` into both UI bundles). Selecting
Divider must therefore show the vertical dashed rule in the sample, with no separate sample-only
rule to drift.

---

## 8. Restoration

The treatment is pure CSS on a container the product owns, plus the journaled `dir` attribute. It
adds no nodes and no attributes of its own. Removing the translation removes the rule completely:
the restored DOM hash must equal the pre-translation hash, and no `data-ipt-style`, `border` or `dir`
residue may remain on page-authored elements (FR-024, SC-009).

---

## 9. Required tests

| Obligation | Test |
|---|---|
| No block rule; inline-start dashed rule; hairline width; full-height coverage; single-line and multi-line | `tests/e2e/display-styles.spec.ts` (computed styles and geometry) |
| Text styling untouched; only the container is marked | `tests/dom/renderer-style.test.ts` |
| RTL target puts the rule on the right | `tests/dom/renderer-typography.test.ts` (dir) and the e2e mode × direction layout matrix |
| Icon is a dashed vertical mark and differs from Quote | `tests/unit/display-styles.test.ts`, `tests/dom/style-preview.test.ts` |
| Pairwise distinctness of all fifteen styles after the change | `npm run verify:styles` (105 pairs) |
| Exact restore with Divider active | `tests/dom/restorer.test.ts` and `verify:styles` restore pass |
