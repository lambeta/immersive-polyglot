# Phase 0 Research: Translating a Drawing's Own Words Without Moving the Drawing

**Feature**: `010-preserve-rendered-diagrams` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

This feature exists because one drawing's style sheet was read as prose. The decisions below are the
ones that had to be settled before a task could be written. Every measurement was taken on
2026-11-18 against the reported page in a real Chromium (Playwright 1.48, viewport 1280 × 900), and
against jsdom 25 for the DOM-test boundary. No decision depends on a site name.

The single most important fact: the page gives us the **rendered drawing**, not the diagram's source.
The captured SVG is `#mermaid-_R_8t9bsnt9fktb_-light`, a sequence diagram with 20 `<text>` runs,
one embedded `<style>` (5,208 characters of text content), and 42 drawn shapes. The drawing's whole
`textContent` is the failing line: the labels, then the style sheet. There is no diagram source in
the DOM to re-render from.

---

## R1 — Replace the label in place; never re-render the drawing

**Decision**: A translated label replaces the text of the label's own runs. The drawing's shapes,
lines, frames, sizes and positions are not touched. No second drawing and no sibling translation
block is created.

**Why**: The page exposes a finished drawing. Re-rendering it would require the diagram source (not in
the DOM), a rendering engine (a new runtime dependency the constitution does not permit without
amendment), and a layout that could move every shape — the opposite of what the owner asked for. The
probe confirms in-place writes are safe: after replacing one message label and one participant label,
all 42 drawn shapes kept their exact viewport boxes (0 moved).

**Alternatives considered**:

- **Re-render from the diagram source** — the source is a component prop in the page's JavaScript,
  not in the DOM; the product has no access to it, and adopting a Mermaid-class engine is a new
  runtime dependency.
- **A translated legend beside the drawing** — leaves every label unreadable in the target language,
  which is not what "translate the drawing's words" means.
- **An overlay of translated text above the drawing** — duplicates the drawing, covers it, and breaks
  selection and accessibility.

**Evidence** (real Chromium, live page):

```text
svg                          #mermaid-_R_8t9bsnt9fktb_-light
<text> elements              20
<text> runs with text        20 (labels + five sequence numbers)
style elements inside svg    1 (5,208 characters of stylesheet text)
shapes (rect/line/path)      42
shapes moved after writing   0
getBBox()                    supported (152.1 × 21.7 for "Return metric scores")
getBoundingClientRect().width 84 (the SVG is scaled; bbox is in user units)
```

The width difference is why the fit measurement uses `getBBox()` for SVG text and a rectangle for
HTML labels: mixing the two units would compare a scaled width with an unscaled one.

---

## R2 — What counts as a label: rendered text elements, not the drawing's metadata

**Decision**: For an SVG drawing, a label is one rendered `<text>` element and the text runs inside
it (its direct text nodes and its `<tspan>`s). Text inside `<style>`, `<script>`, `<title>`,
`<desc>`, `<defs>`, `<metadata>`, `<symbol>`, and the paint-server containers (`<clipPath>`,
`<mask>`, `<pattern>`, `<marker>`, gradients, filters) is never a label. For HTML labels inside a
`<foreignObject>`, the label root is the object's element child and its runs are its text nodes.

**Why**: `<text>` is the only SVG content that renders as words. The other elements either never
render, render only through a reference, or describe the drawing rather than appear in it. The
reported diagram's labels are exactly these `<text>` elements: four participant names, the "loop"
keyword, the loop's description, five message texts, and five sequence numbers. The style sheet is
not among them, which is why it must never be read as text.

**Alternatives considered**:

- **`textContent` of the SVG** — the defect itself; includes the style sheet.
- **Every text node not in `<style>`/`<script>`** — would read `<title>`/`<desc>` accessibility
  metadata and `<defs>` definitions that never render.
- **`innerText`** — not available for SVG and includes CSS-generated content in HTML; the rendered
  text elements are the honest unit.

**Evidence**: the live label inventory (20 text elements) is in the plan's [Summary](./plan.md) and
was captured in the regression fixture. The SVG's `textContent` begins
`AgentEvaluatorDatasetAgentEvaluatorDataset#mermaid-…{font-family…}`; `querySelectorAll("text")`
returns the 20 real labels and no stylesheet.

---

## R3 — Only a phrase is a label; a lone token is an identifier

**Decision**: A label's text is gathered from its runs, whitespace-normalised, and then tested: it is
eligible only when it contains at least two words separated by spaces, or a run containing clause
punctuation (comma, semicolon, colon, parentheses, brackets, question mark, exclamation mark). A
single token — a participant name, a diagram keyword, an identifier, a number, a symbol, a one-letter
variable — is not sent and stays exactly as drawn. A label written by a language that does not put
spaces between words is one token and also stays as drawn.

**Why**: This is the owner's clarification of 2026-11-18 (option C in the clarify session). On the
reported diagram it means the five message labels and the loop's description are translated, while
"Agent", "Evaluator", "Dataset", "Developer", "loop", and the sequence numbers stay as drawn. The
rule is mechanical, has no keyword list and no site knowledge, and is exactly what the specification
records in FR-003 and Assumptions.

**Alternatives considered**:

- **Translate every word with letters** (clarify option A) — would translate "loop" and every
  identifier; the owner chose not to.
- **A diagram-keyword list** (`loop`, `alt`, `else`, `opt`, `end`) — knows one library's grammar,
  not a page's drawing; a real label named "End" would be mistaken for a keyword.
- **A character-count threshold** — translates "API" or leaves a long proper name; the phrase rule has
  a meaning the owner can predict.

**Consequence recorded in the specification**: a space-less source makes short labels ineligible. The
plan keeps that behaviour rather than inventing a language-specific heuristic; the owner can amend
the rule if a Chinese-source diagram is wanted later.

---

## R4 — Fit: shrink only the label, to a floor, then keep the source text

**Decision**: Measure the label's own rendered bounds before writing (SVG `getBBox()`, HTML
rectangle). Write the translation. If it is wider, reduce **only that label's** font size in 1 px
steps down to a floor of `max(75% of the drawn size, 10 px at 100% zoom)`, re-measuring after each
step. If it still does not fit at the floor, restore the original runs and the original inline
style, and leave the label as drawn. Never clip, never overlap a neighbour, never enlarge the
drawing. Use an injected measurer under jsdom, which has no `getBBox()`.

**Why**: The owner chose shrink-to-fit over overflow and clipping. The probe shows the reported
diagram's realistic Chinese labels are **narrower** than their sources (ratios 0.62–0.84), so the
reported case fits without shrinking; a synthetic 2.1× label is wider than the floor at every size
and would keep its source text — the honest fallback the owner asked for. HTML labels also check the
height, because a translation can wrap to more lines inside a fixed width; the fit shrinks or falls
back rather than growing into a neighbour.

**Measured** (real Chromium, live page, user units):

| Source | Chinese | Original width | Translated width | Ratio |
|---|---|---|---|---|
| Curate ~100 goldens (inputs & expected outputs) | 整理约100个黄金样本（输入和预期输出） | 354.8 | 299.2 | 0.84 |
| Define 3-5 key metrics | 定义3-5个关键指标 | 166.7 | 138.4 | 0.83 |
| Update prompt, model, or logic | 更新提示词、模型或逻辑 | 224.0 | 175.9 | 0.79 |
| Generate outputs for test cases | 为测试用例生成输出 | 231.4 | 143.9 | 0.62 |
| Return metric scores | 返回指标分数 | 152.1 | 95.9 | 0.63 |
| [Iterate until pass] | [迭代直到通过] | 132.6 | 107.0 | 0.81 |
| loop | 循环 | 31.7 | 32.0 | 1.01 (not a label) |
| Agent | 智能体 | 43.5 | 48.0 | 1.10 (not a label) |

**Alternatives considered**:

- **Keep the original type size and allow overflow** (clarify option B) — the owner rejected it;
  labels could cover arrows and neighbouring text.
- **Clip to the original box** (clarify option C) — hides words; rejected.
- **Enlarge the drawing or re-layout it** — violates the in-place decision (R1).
- **Use the enclosing box/lane width when one is detected** — a useful widening, but it needs a
  reliable "which shape frames this label" rule across libraries. The product chooses the label's own
  bounds, the conservative guarantee in FR-010; a translation that fits its own footprint cannot
  overlap a neighbour. The reported case does not need the wider bound.

**DOM-test boundary** (jsdom 25.0.1, probe):

```text
text.getBBox              undefined
text.getComputedTextLength undefined
getBoundingClientRect().width 0
getComputedStyle().fontSize   16px
```

so `Renderer` takes a `measureLabel` injection exactly as it already takes `view`. The real
measurement is proven in Playwright.

---

## R5 — Journal text runs and styles; write no marker inside the drawing

**Decision**: Extend the existing write journal with a `text` entry (the node and its previous
value) and generalise `style` entries from `HTMLElement` to `Element`. Every label run written,
cleared, or shrunk is journalled at the moment of the write; replay restores it in reverse. No
`data-ipt` marker is written inside a drawing.

**Why**: Label writes change page-owned text and an inline style attribute. The residue audit only
finds `[data-ipt]`, so a label cannot rely on it; the journal is the only mechanism that can restore
the runs exactly (constitution III, FR-013, SC-004). A marker on a label root would also violate
FR-014 ("nothing may be written into the drawing beyond the phrase text") and would be visible to the
page.

**Evidence**: `Journal` already stores insert/attribute/style entries and replays in reverse;
`restorePage` verifies zero `[data-ipt]` residue and the DOM hash; `domHash` includes text and
attributes, so a missed text restore is a failing test. The new entry is a fourth kind, not a second
restore mechanism.

**Alternatives considered**:

- **Snapshot `innerHTML` of the drawing** and restore it — clobbers page changes made during the run,
  can be rejected by strict CSP, and breaks the single-journal invariant.
- **A `data-ipt` marker on each label root** — forbidden inside a drawing, and the page could clone
  it.
- **Re-derive the original from the drawing's source** — the source is not in the DOM (R1).

---

## R6 — Labels are units in the existing job; the renderer branches on the label root

**Decision**: The segmenter emits one `TranslationUnit` per eligible phrase, with `domRef` set to the
label root. The job treats it like any other passage for batching, budget, retries, counts and
usage, but:

- it never calls `showPending` for a label (no spinner inside a drawing);
- it calls `Renderer.renderLabel` instead of the block renderer;
- duplicates reuse the one translation and are written at each occurrence;
- the progressive demand window already measures `unit.domRef`, so a label in view is requested like
  a paragraph in view.

**Why**: The job owns the only budget, concurrency ceiling, retry policy, progress broadcast and
restore journal. A second job for labels would duplicate all of them and would create a second run
state to reconcile. The renderer is the only place that needs to know a passage is a label, and
`element.closest("svg")` answers that without a new persisted field.

**Evidence**: `TranslationJob.#renderBlock` already composes parts and duplicates per source element;
`PageRun.#measurePending` measures every passage's `domRef`, not a fixed selector list, so label
roots are measured without adding them to `PASSAGE_SELECTOR`. `Renderer.showPending` inserts a
`<div>`; that is why the job must skip labels, and why a test asserts no `[data-ipt]` appears inside
an `<svg>`.

**Alternatives considered**:

- **A separate `LabelJob`** — duplicates budget/limiter/progress/counts and breaks the one-run rule.
- **A new `placement` field on the shared `TranslationUnit`** — it would have to travel through
  messages and tests for a fact the DOM already answers; `closest("svg")` is local and cannot go
  stale. The plan keeps the shared type unchanged.
- **Render labels as sibling blocks** — violates the in-place decision and creates the very duplicate
  the reader complained about.

---

## R7 — Remember seen label roots; never re-read a translated label

**Decision**: The job owns a `WeakSet<Element>` of label roots and passes it to `segmentPage`. The
segmenter adds a root before deciding eligibility, so a later `collect()` on a late subtree skips
it. `TranslationJob.collect` also climbs from a root inside a graphic to that graphic's root before
segmenting. The page observer ignores attribute and child additions that happen **inside** a
graphic; a newly added or replaced graphic **root** is still reported.

**Why**: Labels have no marker, so once a label is translated, its text is the target language. A
later segmentation of the same drawing would read the translation as source and translate it again
(or, worse, send it back). The observer also sees the fit's inline style mutation on the label root;
without the climb-and-ignore rule that would trigger a collect loop on every rendered label.

**Evidence**: `PageObserver` observes `attributes` with `style`/`class` and queues the target;
`#isOurs` only recognises `[data-ipt]`, which labels cannot carry. `TranslationJob.collect` dedupes
by id and source text; a translated label's text no longer matches the old id, so id dedupe alone is
not enough. A `WeakSet` survives no longer than the run and needs no storage.

**Alternatives considered**:

- **A marker attribute** — forbidden inside the drawing (FR-014), and it would be page-visible.
- **Language detection** — would treat a translation into the page's own language as source, and a
  one-word translation as unknown; not decidable enough.
- **Refuse all late collections inside a drawing** — misses genuinely new drawings and labels after a
  page re-render; the WeakSet keeps new roots eligible.

---

## R8 — A drawing is silent to prose extraction; its phrases are not

**Decision**: In the segmenter, a graphic root is not a prose candidate and its subtree is never read
as prose. A block that contains only a drawing produces no unit and no skipped-passage count. A block
that contains prose and a drawing is translated from the prose outside the drawing, and the drawing's
labels are harvested separately. `subtreeText` and `hasBlockDescendant` stop at graphic and silent
subtrees.

**Why**: The reported failure is exactly a wrapper `<div>` whose only child is the `<svg>`; the
wrapper was a leaf candidate, its `subtreeText` walked into the SVG, and the style sheet became the
passage. The same walk would leak `<script>` or `<style>` text from any non-prose child. The drawing
must be a silent boundary, and a drawing-only wrapper must not inflate the "N passages skipped" line.

**Evidence**: the live wrapper is `<div style="width:100%;max-height:60vh;overflow:auto"><svg>…`;
`subtreeText` currently prunes only `[data-ipt]` and joins child text. The live SVG's textContent is
the reported failing string. The existing `empty-body.html` fixture (an SVG with no text) is the
boundary case: the product must produce zero units and zero skipped passages there.

**Alternatives considered**:

- **Pre-remove the SVG before segmenting** — mutates the page, breaks the observer, and loses the
  labels.
- **Regex the style text out of the passage** — fragile, still sends markup names and titles, and
  cannot tell a label from a stylesheet.
- **Treat the wrapper as a skipped passage** — tells the reader a passage was skipped when nothing
  readable was there, and still misses the labels.

---

## R9 — Selection and single-block targeting go to the drawing root

**Decision**: `selectedBlocks` and `blockFromPoint` first resolve a node inside a graphic to the
graphic's root. A selection inside a drawing therefore collects that drawing's eligible labels and
nothing from its internals; a selection in prose behaves exactly as today.

**Why**: `closestBlock` matches `div`/`span`/`p`, not SVG elements; a selection inside the live
diagram would otherwise resolve to the drawing's wrapper (or an ancestor article div) and translate
the wrapper's prose and/or the wrapper's `textContent` — the same defect through a second door.

**Evidence**: `selection.ts` walks to the nearest selector match and stops at the first non-empty
`div`; the diagram's wrapper is a plain `div`. The reported page's diagram has no block-level prose
inside it, but a wrapper can contain prose around the drawing.

**Alternatives considered**:

- **Leave selection unchanged** — would send the drawing's style sheet through the selection path
  (the defect persists for selections).
- **Refuse selection inside drawings** — loses a legitimate "translate this diagram's words" request
  and contradicts FR-019.

---

## R10 — Opaque graphics and typeset mathematics are preserved, never sent

**Decision**: Canvas, image, iframe, object/embed, video, audio and MathML roots are graphic roots
with no labels. They are skipped entirely, contribute no unit and no skipped count, and are not sent.
Typeset mathematics is one graphic; its glyphs and any embedded source form are not sent.

**Why**: There is no editable text to replace. Trying would require optical recognition or redrawing,
both out of scope and both dishonest about what the product saw. The specification's FR-007 and
Out of Scope record this boundary.

**Alternatives considered**: OCR (out of scope, new dependency, privacy), redrawing (R1), treating
canvas fallback text as prose (not what the reader sees).

---

## R11 — Prove the in-place path in a real browser; inject measurement under jsdom

**Decision**: Unit tests cover the phrase rule, label-text joining, graphic-root classification,
extraction exclusions and the seen-label set in jsdom/node. DOM tests cover run writing, journal
restore, shrink loop, floor fallback, RTL and duplicates with an injected measurer. Playwright proves
`getBBox`-based fitting, shape stability, request privacy, counts, modes, restore and accessibility
against a real Chromium and the exact captured diagram fixture. The stub provider supplies a
deterministic translation set for SC-001, because its default `【译】` prefix would make every label
longer and exercise fallback rather than the reported case.

**Why**: jsdom has no `getBBox` (probe above), so a jsdom-only fit test would assert a fake. A
Playwright-only test cannot cheaply drive every grouping and exclusion branch. Splitting at the
boundary follows feature 001's test strategy.

**Alternatives considered**: polyfilling `getBBox` in jsdom (measures nothing real), image diffing
the drawing (brittle, no text semantics), testing only against the live site (not deterministic).

---

## R12 — One translation per phrase, one write per occurrence

**Decision**: A repeated phrase is one unit and one request; each label root that shows it is a
separate occurrence, written by the same translation. Fit is decided at each occurrence, because each
label has its own width; the unit's state remains `translated` if a translation exists. No
per-occurrence state is added to the shared model.

**Why**: The job's existing duplicate machinery already maps many elements to one translation, and
SC-008 requires one request per distinct phrase. A per-occurrence "not applied" state would touch
the shared unit model, the panel's counts and every message shape for an edge that the spec treats as
"the original label stays" (SC-016), not as a failure or a skip.

**Alternatives considered**: one unit per element (repeated requests, violates SC-008); a new
`noFit` skip reason (new model/UI state, and the phrase was translated and paid for); hiding the
label (rejected by the owner's fit choice).

---

## R13 — No dependency, permission, storage key or new user-visible string

**Decision**: The feature adds no runtime dependency, no manifest permission, no storage key and no
catalogue string. It uses the existing provider, budget, limiter, display modes, skipped/usage
surfaces and error taxonomy. The only new code is in the content script and its tests.

**Why**: The work is a DOM extraction/rendering change inside the existing pipeline; a Mermaid
dependency would be a constitution amendment for a capability the page does not expose (R1). There
is no new reader-facing sentence: a phrase that cannot fit keeps its source text, and a same-language
phrase uses the existing skipped surface.

**Alternatives considered**: bundling a renderer (R1), a new "no fit" message (unnecessary state),
a new permission (not needed).

---

## R14 — Risks this plan accepts, and the test that catches each

| Risk | Why it is real | Treatment |
|---|---|---|
| **Multi-line labels collapse to one line** | A `<text>` with several `<tspan>` lines receives the whole translation in its first run; later runs are cleared, leaving empty lines. | The reported diagram's labels are single-line. A DOM test covers the write/restore; the contract records the boundary. If a later feature needs line-balanced wrapping, it is a new decision. |
| **A phrase split across sibling `<text>` elements is two labels** | The grouping unit is one text-bearing element; sibling elements are separate labels by DOM structure. | The contract states the boundary; the captured fixture and authored diagram use one element per label. A test proves tspan grouping. |
| **The page re-renders text in place** | The observer does not watch `characterData`; a React update that mutates an existing label's text node is not a new element. | The WeakSet prevents re-translation of the old root; a replaced drawing root is new and is translated. Recorded as a limitation in the contract; the reported page's diagram is static after hydration. |
| **`textLength` / `lengthAdjust` fixes the rendered width** | A drawing can constrain text width, so font shrinking may not change the rendered width. | Fit measures the rendered box and falls back to the source text; the case is noted in the rendering contract. No page in the reference set uses it. |
| **CJK is wider than the source** | A Chinese glyph is roughly square; some translations grow. | The probe measured 0.62–0.84 for the reported labels; a 2.1× synthetic case is the fallback test. The floor is 75%/10 px. |
| **The page animates attributes inside the drawing** | The observer watches `style`/`class`; animated SVG classes could trigger collects. | Internal attribute changes are ignored by the observer; only a new/replaced graphic root is reported. |
| **The fit loop causes layout thrash** | Each measurement forces layout. | Measure only when a translation arrives, not during segmentation; 1 px steps are bounded by the floor (≤ 20 reads for a 30 px label); a 200-label/5,000-element test bounds the time. |
| **A provider returns an empty or broken translation** | Renderer refuses empty text elsewhere. | `renderLabel` rejects empty text the same way; the unit keeps its original label; the existing failure path reports it. |

---

## R15 — Performance budget

**Decision**: Segmentation does no layout reads. Label text is read from the DOM only. `getBBox` is
called only when a translated label is about to be written, and the shrink loop is bounded by the
75%/10 px floor. The observer never re-collects inside a drawing. A 5,000-element drawing with 200
labels is the size test; its labels are translated as they enter the demand window.

**Why**: The product's existing performance promise is a 5 s first translation and no main-thread
task over 50 ms (feature 001); the new path must not turn segmentation into a layout pass over every
SVG. The Progressive engine already measures only pending passages.

**Evidence**: `PageRun.#measurePending` reads one rectangle per pending passage; labels join that
set only when their phrase is pending. The reported diagram has 20 text runs and one style sheet; the
fixture is small; the size test is authored.
