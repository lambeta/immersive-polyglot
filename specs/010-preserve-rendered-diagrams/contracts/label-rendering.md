# Contract: In-Place Label Rendering

**Feature**: `010-preserve-rendered-diagrams` | **Status**: ratified by this plan | **Version**: 1

This is the write half of the feature: what the product may change inside a drawing, how the fit is
measured, and how the change is undone. It extends
[feature 001's rendering contract](../../001-llm-web-translator/contracts/rendering-dom.md) (prose
placement) and [feature 005's ownership contract](../../005-fix-duplicate-translations/contracts/page-markup-ownership.md)
(markers and restore). Labels are a second rendering path; prose is unchanged.

---

## 1. What is written

| Aspect | Obligation |
|---|---|
| Unit | One eligible phrase, at one label root |
| Text | The provider's non-empty, trimmed translation is written into the label's first non-empty run; the label's other runs are cleared |
| Nodes | No node is created, moved, removed, wrapped, or given a `data-ipt` marker inside the drawing |
| Geometry | The drawing's shapes, connectors, frames, sizes and positions are not changed |
| Sibling output | No translation block is inserted before, after or inside the drawing |
| Empty result | An empty or whitespace-only translation is refused, as for prose (FR-020 of feature 001) |

A label root is one `<text>` element (or one HTML label root inside `<foreignObject>`). Its runs are
its text nodes; writing keeps the run nodes so the journal can restore each value.

## 2. Measurement and fit

**Measurement**:

- SVG text: `getBBox()` in user units. The probe shows `getBoundingClientRect()` is scaled by the
  SVG's display size (152.1 user units vs 84 CSS px for the same label), so mixing them would compare
  incomparable widths.
- HTML labels: the element's own rectangle and scroll box, width and height. A translation that
  wraps to more lines must fit both the original width and the original height; the fit shrinks the
  type and falls back to the source text if it cannot, so a wrapped label cannot grow into a
  neighbour.
- jsdom: no `getBBox()` and a zero rectangle; the renderer takes a `measureLabel(root)` injection
  exactly as it takes `view`. The real measurement is proven in Chromium.

**Fit**:

```text
originalBox = measure(root) before any write
write translation
fits(box) = box.width <= originalBox.width + 0.5
            AND (SVG text: true; HTML label: box.height <= originalBox.height + 0.5)
if fits(measure(root)): applied at the drawn size
else:
  originalSize = computed font-size (px)
  floor = max(originalSize * 0.75, 10)
  for size = originalSize - 1 down to floor:
    root.style.setProperty("font-size", size + "px")
    if fits(measure(root)): applied at size
  if no size fits:
    restore every run and the original inline style; applied = false
```

- The bound is the label's own rendered bounds. The product does not try to discover an enclosing
  box or lane: a drawing has no reliable "which shape frames this label" signal, and the label's own
  footprint is the conservative guarantee that a fit cannot overlap a neighbour.
- Only the label's own type size may shrink. The drawing's geometry never changes.
- A translation is never clipped, never allowed to overlap a neighbour, and never allowed to enlarge
  the drawing.
- A label whose translation cannot fit at the floor keeps its source text exactly as drawn; this is a
  render outcome, not a unit state (see [data-model §7](../data-model.md)).
- The floor is 75 % of the drawn size **and** 10 px at 100 % zoom, whichever is larger.

**Direction**: for an RTL target language, the label root receives `direction: rtl` (a CSS property,
journalled with the style attribute); alignment and position are unchanged. No `lang`/`dir`
attribute is written inside the drawing.

## 3. Journal and restore

Every write goes through the run's journal at the moment it is made.

| Write | Journal entry | Restore |
|---|---|---|
| run text changed or cleared | `text` with the node and its previous value | set the node's value back |
| `font-size` / `direction` / any inline style | `style` with the element and its previous style attribute (once per element) | restore the whole style attribute |

Rules:

1. A text node is journalled once per run; a re-render of the same label does not grow the journal.
2. The style attribute is journalled once per element (the existing rule); the fit's writes share it.
3. Replay is in reverse, so clear-then-write and write-then-shrink unwind exactly.
4. After restore, no `data-ipt`, `style`, `font-size`, `direction` or text residue remains; the
   structural hash equals the pre-translation capture.
5. The `[data-ipt]` residue audit is unchanged and is not a substitute for the text journal: labels
   carry no marker by design.

## 4. Display modes, style and typography

| Setting | Effect on a drawing's labels |
|---|---|
| bilingual (below), above, only | the drawing and its translated labels stay visible in all three; translation-only hides prose sources only |
| display style (highlight, blur, etc.) | not applied to labels; labels are not product containers |
| translation typography (family/scale) | not applied to labels; the drawing's own type is preserved except for the fit shrink |
| target language | labels follow the run's target; a new run re-collects them after restore |
| reader changes a setting mid-run | no label is duplicated, hidden, or moved |

## 5. Repeated phrases

- One unit per distinct phrase, one request per distinct phrase (SC-008).
- Every occurrence is written at its own label root from the same `translatedText`.
- Fit is decided per occurrence; one occurrence may fit at the drawn size while another needs a
  shrink or keeps its source text.
- A repeated phrase's count is one translated passage, as the existing duplicate model already does.

## 6. Pending state

- No progress mark, spinner or placeholder is ever placed inside a drawing.
- A label keeps its source text until its translation arrives, then changes in one step.
- A failed label keeps its source text; it is never blank, partial or a placeholder.
- The job's `showPending` path is skipped for a label root; a test asserts no `[data-ipt]` appears
  inside an `<svg>`.

## 7. Ownership matrix (extends feature 005 §2)

| Module | Label text nodes | Label style attribute | `data-ipt` inside drawing |
|---|---|---|---|
| renderer / label renderer | writes, journalled | writes, journalled | never |
| restorer | restores via `text` entry | restores via `style` entry | never |
| segmenter | reads only runs of an unseen label root | ignores | prunes product output as before |
| observer | never treats a text mutation as content | ignores mutations inside a graphic | ignores |
| stylesheets | no global rule targets a label | — | — |

## 8. Accessibility

- Replacing the label's text is what assistive technology reads; the drawing's role, name,
  description and reading order are otherwise untouched.
- No second accessible copy of the label is introduced.
- A translated label is not hidden from selection, copying or the browser's find feature.
- The drawing remains operable (links, tooltips, keyboard behaviour) because it is not replaced.

## 9. Conformance

| Check | Where |
|---|---|
| A label write changes runs, not shapes; 0 shape boxes move | `tests/e2e/diagram-labels.spec.ts` |
| Restore returns the exact run text, style attribute and DOM hash over 20 cycles | `tests/dom/label-renderer.test.ts`, `tests/dom/restorer.test.ts`, `tests/e2e/diagram-labels.spec.ts` |
| The shrink loop stops at the floor and falls back to source text | `tests/dom/label-renderer.test.ts` (injected measure), `tests/e2e/diagram-long-labels.spec.ts` |
| No sibling block, no pending mark, no display style inside a drawing | `tests/dom/job-labels.test.ts` |
| All three modes leave the drawing and its translated labels visible | `tests/e2e/diagram-labels.spec.ts` |
| A repeated phrase is one request and every occurrence is written | `tests/dom/job-labels.test.ts`, `tests/e2e/diagram-labels.spec.ts` |
| AT reads the translated text and the drawing's role/name survive | `tests/e2e/diagram-a11y.spec.ts` |
