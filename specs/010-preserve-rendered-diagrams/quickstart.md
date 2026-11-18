# Quickstart: Seeing a Diagram's Words Translated Without Moving the Diagram

**Feature**: `010-preserve-rendered-diagrams` | **Date**: 2026-11-18

The automated suites prove the extraction, the in-place write, the fit and the restore. Three things
need a real browser and a human eye: that the drawing's shapes really do not move, that a long
translation degrades the way the owner chose, and that the translated words are what a screen reader
announces. Each scenario names the criterion it settles.

Design detail lives in [contracts/label-extraction.md](./contracts/label-extraction.md) and
[contracts/label-rendering.md](./contracts/label-rendering.md); this file is how to see the result.

---

## Prerequisites

```bash
npm install
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium   # once
npm run build        # dist/, the unpacked extension
```

For the local scenario, start the stub provider and load `dist/` through `chrome://extensions` →
Developer mode → Load unpacked. Then configure a provider pointing at
`http://127.0.0.1:8787/v1/chat/completions`, model `dev-model`, any credential:

```bash
npm run dev:provider   # http://127.0.0.1:8787 — translations are prefixed 【本地测试】
```

The captured reference fixture is served by the **test** stub, not the dev provider, under
`/pages/article-eval-driven-development.html`; the e2e suites use it.

---

## 1. The automated gates (SC-002, SC-003, SC-004, SC-005, SC-006, SC-008, SC-010, SC-011, SC-013, SC-015)

```bash
npm run typecheck
npm test                       # unit + DOM
npm run test:e2e:local         # builds, then real Chromium against the stub + captured fixture
```

| Suite | What it pins |
|---|---|
| `tests/unit/graphics.test.ts` | the phrase table, label-text joining, graphic-root classification |
| `tests/unit/segmenter-labels.test.ts` | 6 phrases queued, 4 names + loop + numbers not; styles/titles/defs excluded; prose around a drawing; a drawing-only wrapper has 0 skipped; duplicates; seen set |
| `tests/dom/label-renderer.test.ts` | run write/clear, journal text entries, shrink loop, floor fallback, RTL style, exact restore |
| `tests/dom/job-labels.test.ts` | label units requested/counted; no pending mark inside SVG; no sibling block; duplicates; fit fallback keeps source; no re-collect after style write |
| `tests/dom/selection-graphic.test.ts` | a selection inside a drawing resolves to the graphic root; prose selection unchanged |
| `tests/dom/observer-labels.test.ts` | internal mutations ignored; a new graphic root reported; replaced root eligible |
| `tests/e2e/diagram-labels.spec.ts` | the captured article in 3 modes: 6 phrases translated, 4 names + "loop" unchanged, shapes at 0 px, no stylesheet text, restore hash, 20 cycles |
| `tests/e2e/diagram-privacy.spec.ts` | request bodies contain the 6 phrases and none of `@keyframes`, `#mermaid-`, `{font-family`; counts/characters exclude styles |
| `tests/e2e/diagram-guards.spec.ts` | opaque chart/photo/frame/media/math preserved, 0 requests; a drawing-only page; a late drawing root |
| `tests/e2e/diagram-long-labels.spec.ts` | a long translation shrinks to the floor or keeps the source text; 0 overlap/clipping; no sibling |
| `tests/e2e/diagram-a11y.spec.ts` | AT reads the translated labels; role/name preserved; no duplicate announcement |
| `tests/e2e/diagram-target-change.spec.ts` | a new run after a target-language change shows every eligible label in the new language |
| `tests/e2e/diagram-large.spec.ts` | 5,000 elements / 200 labels: first visible translation within 2 s; no style sheet in requests, reports or logs |
| Re-run | `status-badge.spec.ts` zero-passage page still has 0 translated and no skipped drawing; existing segmenter/renderer/restore suites stay green |

---

## 2. The reported article, by eye (SC-001, SC-005, SC-009, SC-012, SC-016)

Use a real provider (or the dev provider with a small local model) and open
`https://deepeval.com/blog/eval-driven-development`.

1. Turn translation on. Under "What is eval driven development?" the sequence diagram must still be
   a sequence diagram: four participant boxes, their lifelines, the loop frame and the arrows in the
   same places.
2. Read the five message texts and the loop's description. They are in the target language. The four
   participant names and "loop" are still English — the owner's phrase-only choice.
3. Search the page for `@keyframes`, `#mermaid-`, or `font-family`. None appears.
4. Switch to translation-above, then translation-only. The diagram and its translated labels stay
   visible; only prose blocks change.
5. Turn translation off. The diagram and every label are back to the original; the page does not
   scroll-jump.
6. Reload and repeat. No second diagram, no duplicate label, no repeated request for a label already
   on screen.

**Pass**: the drawing is unchanged, the phrases are translated, the single tokens are not, and the
style sheet never appears. **Fail**: any of those is false.

## 3. The captured fixture, deterministically (SC-001, SC-002, SC-003)

The e2e suite serves `tests/fixtures/pages/article-eval-driven-development.html` — the captured SVG
subtree with its style element and 20 text elements, plus the introducing and following paragraphs —
and configures the stub to return the measured Chinese translations from R4. This is the regression
case for the reported defect:

- the 6 eligible phrases are translated;
- the 4 participant names, "loop" and the five numbers stay as drawn;
- 42 shapes keep their exact boxes (0 px movement);
- no request contains the style sheet;
- the usage totals equal prose + the 6 phrases.

The fixture is a capture, not an authored page: its URL, capture date and scope are recorded in
`tests/fixtures/README.md`. It is not evidence that every live site works; the live scenario above is
that check.

## 4. A translation that does not fit (SC-016)

Point the fixture at a target whose words run longer than the source (for example German, or the
stub's `long` translation function) and translate.

- A label that fits at its drawn size is unchanged in type size.
- A label that does not fit shrinks only itself, down to no less than 75 % of its drawn size and
  10 px, and renders completely inside its original footprint.
- A label that cannot fit at the floor keeps its source text; it is not clipped, not overlapped, and
  no sibling block appears.
- In every case the drawing's shapes are where they were.

**Pass**: the reader sees either a complete translation or the original words, never both overlapping.
**Fail**: clipped text, text over a neighbouring label or arrow, or a moved shape.

## 5. Opaque graphics, math and the drawing-only page (SC-006, SC-015)

Open the authored fixtures:

| Fixture | Expected |
|---|---|
| `diagram-opaque.html` | a chart on a drawing surface, a photo, a plugin object, an embedded frame, a media player and a typeset equation are byte-identical to before; 0 requests for them; an inline icon inside a translated sentence stays an icon; surrounding prose translates |
| `diagram-only.html` | the drawing's phrases translate with no error; no prose unit |
| `empty-body.html` (existing) | an SVG with no text: 0 units, 0 requests, 0 skipped passages |
| `diagram-late.html` | an SVG injected 700 ms after translation starts: its phrases translate; no stylesheet request; no duplicate |

Two boundary runs on the captured fixture:

- **Same language (SC-009)**: set the target language to the fixture's own language (English) and
  translate. No request is made for the diagram's phrases, and every label is byte-identical to the
  drawn text.
- **A failed label (SC-013)**: point the stub at a failing mode for the label batch. The label keeps
  its source text; the page reports the failure through the existing channel; 0 labels are blank or
  partial.

## 6. Selection and a single block (SC-011)

1. Select one word inside the diagram. The selection target is the drawing root, not the wrapper
   article; only the drawing's eligible phrases are translated, and no stylesheet text is sent.
2. Hover a message label and use the single-block action. The same holds.
3. Select a paragraph beside the drawing. It translates exactly as before; the drawing is untouched.

## 7. Screen reader and keyboard (SC-012)

1. With VoiceOver on the translated drawing, move through the SVG. The translated phrases are read;
   the drawing still announces its role; no label is announced twice.
2. The drawing's own links and keyboard behaviour are unchanged.
3. At 200 % zoom, the translated labels remain legible and inside the drawing; the page has no
   horizontal scroll it did not have before.

## 8. Restore and repeat (SC-004, SC-010)

Translate and restore 20 times on the captured fixture. Each restore must return the drawing's exact
markup, every label's original text and the page's scroll position. Change display mode, display
style and typography while translated: 0 shapes move, 0 labels duplicate, 0 labels revert to source.
Then change the target language, translate the page again (a new run after the settings change), and
confirm every eligible label is shown in the new language with 0 duplicates (SC-010).

## 9. Size and time (SC-014)

Open an authored page whose SVG has at least 5,000 elements and 200 labels. Turn translation on: the
first visible translation appears within 2 seconds. Its style sheet must never appear in a request,
a usage report or a log; the page remains scrollable while labels stream in.

---

## Requirement coverage

| Requirement group | Scenario |
|---|---|
| FR-001 – FR-006 (extraction and eligibility) | §1 unit/segmenter suites, §2, §3 |
| FR-007 – FR-008 (opaque, late/replaced) | §1 guards suite, §5 |
| FR-009 – FR-016 (in-place, fit, modes, restore, usage) | §1 renderer/job/e2e suites, §2, §4, §8 |
| FR-017 – FR-018 (counting, failure) | §1 privacy/job suites, §3, §5 |
| FR-019 – FR-020 (selection, page shapes) | §1 selection suite, §5, §6 |
| FR-021 – FR-023 (accessibility, run, performance) | §1 a11y suite, §7, §9 |
| SC-009, SC-013 | §5 |
| SC-010 | §8 |
| SC-001, SC-005, SC-009, SC-012, SC-016 | §2, §3, §4, §7 |
| SC-002, SC-003, SC-004, SC-006, SC-007, SC-008, SC-010, SC-011, SC-013, SC-014, SC-015 | §1, §5, §6, §8, §9 |
