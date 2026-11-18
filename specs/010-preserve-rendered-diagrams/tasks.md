---
description: "Task list for feature 010 — translate a drawing's phrases in place without moving the drawing"
---

# Tasks: Drawing Labels Translate In Place Without Breaking the Drawing

**Input**: Design documents from `/specs/010-preserve-rendered-diagrams/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. The project constitution makes test-first non-negotiable (Principle II), and the
plan names the 23 behaviours this feature owes (plan's T1–T23). The tests for new behaviour are written
and watched failing before their implementation (T007/T008, T014–T016, T021–T023, T026–T028); the
Polish suites (T033–T036) are end-to-end confirmations of behaviour first proven at the unit/DOM level,
or of the existing re-run path. Two tasks are **MANUAL** (T041–T042): the boundary is the live site with
a real provider and a screen reader / 200 % zoom, neither of which the harness owns; each names the
measurement that makes it decidable.

**Organization**: Tasks are grouped by user story so each story is independently implementable and
testable. `Proves` cites [plan.md's test table](./plan.md#tests-this-feature-owes) (T1–T23); `FR-` and
`SC-` cite [spec.md](./spec.md). Every requirement is cited by at least one task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different file, no dependency on an incomplete task)
- **[Story]**: which user story the task belongs to (US1, US2, US3)
- Every task names its exact file path

## Path Conventions

Single project: `src/` and `tests/` at the repository root; specs under
`specs/010-preserve-rendered-diagrams/`. The feature touches the content script only; no manifest,
storage, message or UI change.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a green baseline, the captured regression fixture, the authored boundary fixtures, and the
fixture provenance that keeps a capture distinct from authored data (Constitution III).

- [X] T001 Record the green baseline at the repository root (`package.json`, `vitest.config.ts` read,
  not edited) — `npm run typecheck` and `npm test` on the untouched tree, no file changes — so the
  first red any later task sees is its own (Constitution II)
- [X] T002 [P] Capture the reported diagram into `tests/fixtures/pages/article-eval-driven-development.html`:
  load `https://deepeval.com/blog/eval-driven-development` with Playwright, wait for
  `svg[id^="mermaid"]`, and save the SVG's outer HTML — including its `<style>` element, its
  `#mermaid-…-light` id and all 20 `<text>` runs — plus the introducing and following paragraphs, with
  an HTML comment naming the URL, the capture date (2026-11-18) and the capture scope; strip scripts and
  site chrome only (FR-001, SC-001; [fixtures README](../../tests/fixtures/README.md))
- [X] T003 [P] Create `tests/fixtures/pages/diagram-opaque.html`: prose plus one case each for a chart
  painted on a `<canvas>`, a photograph (a data-URI image), a plugin object, an embedded frame
  (`srcdoc`), a media player, a typeset equation (MathML) and an inline icon with a phrase `<title>`
  inside a translated sentence; every case must be preserved and unsent (FR-007, SC-006)
- [X] T004 [P] Create `tests/fixtures/pages/diagram-only.html` — a page whose only content is an SVG
  label-bearing drawing — and `tests/fixtures/pages/diagram-late.html` — prose plus a script that
  injects an SVG drawing after 700 ms (FR-007, FR-008, FR-020; SC-007, SC-015)
- [X] T005 [P] Create `tests/fixtures/pages/diagram-long-labels.html` — short two-word phrases in narrow
  positions, so a long target translation cannot fit — and `tests/fixtures/pages/diagram-large.html` —
  a script that builds an SVG with at least 5,000 elements and 200 phrase labels (FR-010, FR-023;
  SC-014, SC-016)
- [X] T006 Update `tests/fixtures/README.md`: add the captured article's URL, capture date and scope, and
  the five authored fixtures (opaque, only, late, long-labels, large) with the condition each exercises;
  keep the existing capture-vs-authored distinction explicit (Constitution III)

**Checkpoint**: the regression capture and the boundary fixtures exist, and the baseline is green.

---

## Phase 2: Foundational (Blocking Prerequisites for Every Story)

**Purpose**: the two domain modules and the journal entry every story relies on — graphic roots, label
roots/runs, the phrase rule, the in-place write and the fit.

**⚠️ CRITICAL**: no user story can begin until this phase is green.

- [X] T007 [P] Write the failing `tests/unit/graphics.test.ts`: the phrase rule over the reported
  labels — accepted: the 5 message phrases and `[Iterate until pass]`; refused: `Agent`,
  `Evaluator`, `Dataset`, `Developer`, `loop`, the five numbers, a style rule, a one-letter
  variable and a space-less label — using exactly
  `has letters AND (two or more whitespace-separated words OR one of , ; : ( ) [ ] ? !)`;
  `labelText` joins `<tspan>` lines with a space at a line boundary but keeps an inline styled word
  intact; `graphicRootOf`/`isGraphicLabel` classify `<svg>`, `<math>`, `<canvas>`,
  `<iframe>`, `<object>`, `<embed>`, `<video>` and `<audio>`; `<text>` inside SVG is a label,
  the SVG root is not; sibling `<text>` elements are separate labels (Proves T1, T2; FR-002, FR-003,
  FR-004; [extraction contract §1–§3](./contracts/label-extraction.md))
- [X] T008 [P] Write the failing `tests/dom/label-renderer.test.ts` against jsdom with an injected
  `measureLabel` (jsdom has no `getBBox`): a translation is written into the first non-empty run and
  every other run is cleared; each write journals a `text` entry; `restorePage` restores the exact run
  values and the `domHash` equals the baseline; a wider translation shrinks in 1 px steps to
  `max(75% of the drawn size, 10 px)`; below that floor the original text and original inline style
  return with no residual `font-size`; an HTML label also fails the fit when its wrapped height grows;
  an RTL target sets `direction` and restores it; no sibling block is created (Proves T7, T8, T9;
  FR-009, FR-010, FR-013, FR-014; [rendering contract §1–§3](./contracts/label-rendering.md))
- [X] T009 Implement `src/content/graphics.ts`: the graphic/opaque root sets, `graphicRootOf`,
  `isGraphicRoot`, `isOpaqueGraphic`, `isGraphicLabel`, `labelRootsInGraphic` (SVG `<text>`;
  the element child of a `<foreignObject>`; exclude `style`, `script`, `title`, `desc`, `defs`,
  `metadata`, `symbol`, `clipPath`, `mask`, `pattern`, `marker`, gradients and filters),
  `labelRuns`, `labelText` and `isLabelPhrase` (FR-002, FR-003, FR-004; R2, R3)
- [X] T010 Implement the journal extension in `src/content/restorer.ts`: add
  `{ kind: "text"; node: CharacterData; previous: string }` with a once-per-node `WeakSet`,
  `recordText`, replay in reverse, and clearing; generalise `recordStyle` from `HTMLElement` to
  `Element`; leave insert/attribute/style semantics unchanged (FR-013; [data-model §10](./data-model.md))
- [X] T011 Implement `src/content/label-renderer.ts`: `renderLabel(journal, root, text, { measure,
  view, targetLang })` with the run write/clear, the own-bounds measurement (SVG `getBBox()`; HTML
  rectangle/scroll box; injected measure fallback), the `max(75%, 10 px)` floor, 1 px shrink steps,
  exact revert on no-fit, RTL `direction`, and `applied: boolean`; no other style write (FR-009,
  FR-010, FR-014; R4, R5)
- [X] T012 Implement `src/content/renderer.ts`: add the `measureLabel` render option, store it, and
  expose `renderLabel(unit, text, root)` delegating to `label-renderer.ts`; the block
  `renderUnit`/`#place`/`#hideSource` path is unchanged (FR-009, FR-010)
- [X] T013 Run T007 and T008 green in `tests/unit/graphics.test.ts` and
  `tests/dom/label-renderer.test.ts`; confirm the jsdom injection is the only reason a measurement
  exists and that no shape moves in the DOM test (Proves T1, T2, T7, T8; SC-004, SC-016)

**Checkpoint**: graphic roots, phrase eligibility, the in-place write, the fit and the text journal are
proven; nothing is wired into the page run yet.

---

## Phase 3: User Story 1 - The drawing keeps its shape, and its phrases become the reader's language (Priority: P1) 🎯 MVP

**Goal**: a page's drawing is no longer read as prose; its eligible phrases are translated in place, its
shapes stay where they were, and every display mode keeps the drawing visible.

**Independent Test**: translate the captured article fixture in all three display modes; the 6 eligible
phrases are translated, the 4 participant names / `loop` / the numbers are unchanged, all 42 shapes keep
their exact boxes, no stylesheet string is visible, and 20 translate/restore cycles return the captured
hash.

### Tests for User Story 1 ⚠️ Write these FIRST and watch them fail

- [X] T014 [P] [US1] Write the failing `tests/unit/segmenter-labels.test.ts`: a phrase in
  `<svg><text>` is one queued unit; the 4 names, `loop`, the numbers and a style rule produce nothing;
  a wrapper whose only child is a drawing produces 0 units and 0 skipped passages; a block mixing prose
  and an SVG keeps the prose passage and harvests the labels separately; a repeated phrase is one unit
  plus occurrences; a second collect with the seen-set adds nothing; a replaced root is eligible; hidden,
  `translate="no"` and opaque roots produce no unit (Proves T3, T4, T5, T6; FR-001–FR-008)
- [X] T015 [P] [US1] Write the failing `tests/dom/job-labels.test.ts`: a label unit is dispatched and
  written in place; no `[data-ipt]` appears inside the SVG; no sibling block is created; a repeated
  occurrence is written from the same translation; `collect` climbs from a label root or an embedded
  node to the graphic root; display mode, display style and typography leave the label alone; the job
  counts the label (Proves T9; FR-009, FR-011, FR-012, FR-015)
- [X] T016 [P] [US1] Write the failing `tests/e2e/diagram-labels.spec.ts`: the captured fixture, with
  `startStubProvider({ translate })` returning the six measured Chinese translations, in bilingual,
  above and only modes — 6 phrases translated, 4 names + `loop` unchanged, 42 shape boxes at 0 px, no
  `@keyframes`/`#mermaid-`/`font-family` visible, 20 translate/restore cycles with the captured hash
  (Proves T13, T17; SC-001, SC-004, SC-005, SC-011)

### Implementation for User Story 1

- [X] T017 [US1] Implement the graphic branches in `src/content/segmenter.ts`: a graphic root is
  never a prose candidate; `subtreeText` and `hasBlockDescendant` stop at graphic and silent
  subtrees; a drawing-only wrapper is silent (no unit, no skip); a mixed leaf queues its prose and then
  pushes children to harvest the drawing; `seenLabels` is accepted and a root is added before
  eligibility; SVG labels are harvested with the phrase rule; a graphic inside a refused region is left
  untouched (FR-001–FR-008; R7, R8)
- [X] T018 [US1] Implement the label path in `src/content/job.ts`: a run-scoped
  `WeakSet<Element>` passed to `segmentPage`; `collect` climbs from a root inside a graphic to the
  graphic root; `#render` and `#renderDuplicates` call `renderer.renderLabel` for a label root;
  `#showPending` and `markPassages` skip labels; counts include the label units; the block path is
  untouched (FR-009, FR-011, FR-012, FR-015; R6, R7)
- [X] T019 [US1] Run T014–T016 green in `tests/unit/segmenter-labels.test.ts`,
  `tests/dom/job-labels.test.ts` and `tests/e2e/diagram-labels.spec.ts`; record the measured
  6/4/numbers outcome, the 42-shape 0 px result and the 20-cycle hash in a comment beside the e2e
  assertions; confirm the drawing is visible in all three modes and no style-sheet text is present
  (SC-001, SC-004, SC-005, SC-011)
- [X] T020 [US1] Re-run the existing boundary suites — `tests/e2e/status-badge.spec.ts` zero-passage
  case, `tests/unit/segmenter.test.ts`, `tests/dom/renderer.test.ts` and
  `tests/dom/restorer.test.ts` — with no assertion deleted or weakened; the empty SVG page still
  produces 0 translated and 0 skipped (Proves T20; FR-001, FR-012, FR-022)

**Checkpoint**: US1 is the MVP — the reported drawing translates its phrases and keeps every shape.

---

## Phase 4: User Story 2 - Only the phrases leave the device, and cost stays honest (Priority: P1)

**Goal**: the drawing's style sheet, identifiers and metadata never reach the provider; the six phrases
do; the usage and skip counts are exact; a failed label keeps its source words.

**Independent Test**: translate the captured fixture with a recording provider; the request bodies
contain the six phrases and none of `@keyframes`, `#mermaid-` or `{font-family`; the character and
segment totals equal prose + phrases; a tenfold larger style sheet changes neither; a same-language
phrase sends nothing; a failed label keeps its source and is reported.

### Tests for User Story 2 ⚠️ Write these FIRST and watch them fail

- [X] T021 [P] [US2] Write the failing `tests/e2e/diagram-privacy.spec.ts`: every recorded request
  contains the six eligible phrases as their own passages and no style/keyframe/generated-id/markup
  token; the recorded segment and character totals equal prose + phrases; growing the captured style
  sheet tenfold does not change those totals; an echoing provider never shows the style sheet; a late
  drawing's phrases are requested without its internals (Proves T10, T14; FR-016, FR-017; SC-002,
  SC-003, SC-008)
- [X] T022 [P] [US2] Add the same-language case to `tests/unit/segmenter-labels.test.ts`: with the
  target set to the fixture's own language, an eligible phrase is a `sameLanguage` skip with 0 queued
  units and 0 requests, and its drawn text stays byte-identical (Proves T21; FR-005, SC-009)
- [X] T023 [P] [US2] Add the failure case to `tests/dom/job-labels.test.ts`: when the provider fails
  the label batch, every label keeps its source text, no label is blank or partial, the failure is
  reported through the existing channel, and no `[data-ipt]` appears inside the SVG (Proves T22;
  FR-018, SC-013)

### Implementation for User Story 2

- [X] T024 [US2] Make T021–T023 green in `src/content/job.ts`: count a label's characters and
  passage exactly once, never count style/title/markup, keep a failed label's source text out of the
  translation path, and add no new state, skip reason, message field or reader-facing string; touch
  `src/content/segmenter.ts` only if the same-language path needs the label root (FR-016, FR-017,
  FR-018; [data-model §7–§8](./data-model.md))
- [X] T025 [US2] Run T021–T023 green in `tests/e2e/diagram-privacy.spec.ts`,
  `tests/unit/segmenter-labels.test.ts` and `tests/dom/job-labels.test.ts`; inspect the recorded
  request bodies and the session usage record; record the exact segment/character arithmetic and the
  0 style-token result beside the assertions (SC-002, SC-003, SC-009, SC-013)

**Checkpoint**: US1 and US2 both hold; privacy and accounting are decidable from the request record.

---

## Phase 5: User Story 3 - Prose and captions still translate, and opaque graphics are preserved (Priority: P2)

**Goal**: the sentence before the drawing, the paragraph after it and a figure caption still translate;
opaque graphics and typeset mathematics stay untouched and unsent; a late drawing is handled; a
selection inside a drawing targets the drawing, not the wrapper's prose.

**Independent Test**: translate the opaque, drawing-only and late fixtures; the seven non-prose cases
are byte-identical and unsent, the drawing-only page translates its phrases, the late SVG translates on
arrival, prose and captions translate normally, and a selection inside the drawing resolves to the
drawing root.

### Tests for User Story 3 ⚠️ Write these FIRST and watch them fail

- [X] T026 [P] [US3] Write the failing `tests/e2e/diagram-guards.spec.ts`: the seven opaque/non-prose
  cases (chart, photo, plugin, frame, media, equation, inline icon) are byte-identical and produce 0
  requests; the drawing-only page translates its eligible phrases with 0 errors; the late SVG's phrases
  translate within 5 s with 0 style characters and 0 duplicate blocks; surrounding prose and a figure
  caption translate normally (Proves T15; FR-006, FR-007, FR-008, FR-020; SC-006, SC-007, SC-015)
- [X] T027 [P] [US3] Write the failing `tests/dom/observer-labels.test.ts`: an attribute or child
  change inside a graphic is ignored; a fit style write causes no new collect; a new SVG root is
  reported; a replaced root is eligible again while the old detached units are not rendered (Proves T11;
  FR-008, FR-012; [extraction contract §5](./contracts/label-extraction.md))
- [X] T028 [P] [US3] Write the failing `tests/dom/selection-graphic.test.ts`: a selection whose start
  and end are inside the same SVG returns the SVG root; `blockFromPoint` inside the SVG returns the
  SVG root (stub `document.elementFromPoint` where jsdom lacks it); a prose selection is unchanged;
  only the drawing's eligible phrases are collected (Proves T12; FR-019, SC-011)

### Implementation for User Story 3

- [X] T029 [P] [US3] Make `src/content/observer.ts` graphic-aware: import `graphicRootOf`; ignore
  attribute and child mutations inside a graphic (the fit's own style write included); report only a
  newly added or replaced graphic root; keep the existing debounce, seen-set and product-output guards
  (FR-008, FR-012; R7)
- [X] T030 [P] [US3] Make `src/content/selection.ts` graphic-aware: if the selection start/end or the
  point target is inside a graphic, return that graphic root; otherwise keep the existing
  `closestBlock` logic exactly (FR-019; R9)
- [X] T031 [P] [US3] Fix the prose/opaque boundaries in `src/content/segmenter.ts` revealed by T026:
  prose around a drawing, a figure caption and an inline icon still queue; a mixed block does not absorb
  drawing text; opaque/math roots produce no unit and no skipped count; no page text is lost to
  over-blocking (FR-006, FR-007; R8)
- [X] T032 [US3] Run T026–T028 green in `tests/e2e/diagram-guards.spec.ts`,
  `tests/dom/observer-labels.test.ts` and `tests/dom/selection-graphic.test.ts`; confirm 0 requests
  for the opaque cases, 0 skipped for a drawing-only wrapper, the late root's phrases translated, and
  the selection's 0 internals (SC-006, SC-007, SC-011, SC-015)

**Checkpoint**: all three stories hold independently; the drawing boundary is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T033 [P] Add `tests/e2e/diagram-long-labels.spec.ts`: a long target translation shrinks only the
  affected label to the 75 %/10 px floor or keeps its source; 0 clipped/overlapping labels; 0 moved
  shapes; an HTML label that wraps taller also falls back rather than growing (Proves T16; FR-010,
  SC-016)
- [X] T034 [P] Add `tests/e2e/diagram-a11y.spec.ts`: assistive technology reads 100 % of the translated
  phrases, the drawing's role/name and reading order survive, and no phrase is announced twice (Proves
  T18; FR-021, SC-012)
- [X] T035 [P] Add `tests/e2e/diagram-large.spec.ts`: the 5,000-element / 200-label fixture reaches its
  first visible translation within 2 s; the style sheet appears in no request, report or log (Proves
  T19; FR-023, SC-014)
- [X] T036 [P] Add the target-language scenario to `tests/e2e/diagram-target-change.spec.ts`: translate
  in zh, restore, change the target to de, translate again; every eligible label is shown in the new
  language, 0 duplicates and 0 stale strings remain (Proves T23; FR-015, SC-010)
- [X] T037 [P] Update `README.md`'s "What it is": a drawing's phrases are translated in place while its
  shapes stay put; single-token labels, opaque graphics and typeset mathematics stay as drawn
  (Constitution I; FR-001, FR-007)
- [X] T038 [P] Amend `specs/005-fix-duplicate-translations/contracts/page-markup-ownership.md` §2 and
  §5: label text/style writes are journaled, no `data-ipt` marker is written inside a drawing, and the
  new [label-rendering contract](./contracts/label-rendering.md) is the owner of those writes
  (Constitution I; FR-014)
- [X] T039 Run the full gate from the repository root (`package.json` scripts) — `npm run typecheck`,
  `npm test`, `npm run test:e2e:local`, `npm run verify:styles` — with nothing skipped, weakened or
  excluded; record any discrepancy between the rendered result and the plan (Proves T20;
  Constitution II)
- [X] T040 Run [`specs/010-preserve-rendered-diagrams/quickstart.md`](./quickstart.md) §1–§9 end to end;
  record the captured fixture's 6/4/numbers,
  the 42-shape 0 px result, the request/count arithmetic, the fit fallback, the opaque cases, the late
  drawing, selection, accessibility, the 5,000-element time and the 20-cycle restore (SC-001–SC-016)
- [ ] T041 **MANUAL** Perform [`specs/010-preserve-rendered-diagrams/quickstart.md`](./quickstart.md) §2
  against the live article with a real provider: the drawing keeps its shapes, the five message phrases
  and `loop`'s description translate, the four names / `loop` stay English, no style-sheet text is
  visible, all three modes keep the drawing visible, and restore returns the original (SC-001, SC-005,
  SC-012)
- [ ] T042 **MANUAL** Perform [`specs/010-preserve-rendered-diagrams/quickstart.md`](./quickstart.md) §7:
  VoiceOver reads the translated phrases and the drawing's role, the drawing's links/keyboard behaviour
  survive, and at 200 % zoom no translated label is clipped and the page gains no horizontal scroll
  (SC-012)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first (baseline); T002–T005 can run in parallel; T006 follows T002–T005.
- **Foundational (Phase 2)**: depends on Setup; blocks all stories. T007/T008 are the failing tests;
  T009/T010 can run in parallel; T011 follows T009/T010; T012 follows T011; T013 is the green gate.
- **US1 (Phase 3)**: depends on Foundational. It is the enabling slice and the MVP.
- **US2 (Phase 4)**: depends on US1 — privacy and accounting cannot be measured before labels are
  extracted and written. Its three test tasks can run in parallel; T024 follows them.
- **US3 (Phase 5)**: depends on US1 — the prose/opaque/late boundary and selection need the label path.
  US2 and US3 may run in parallel with each other after US1.
- **Polish (Phase 6)**: depends on US1–US3. T033–T038 are independent files; T039 follows them; T040
  follows the full gate; T041–T042 follow the validated build.

### User Story Dependencies

- **US1**: no dependency on US2/US3. Independently testable on the captured fixture.
- **US2**: depends on US1's extraction and job path; independently testable once US1 is green.
- **US3**: depends on US1's extraction and job path; independently testable with its own fixtures and
  selection/observer suites.

### Within Each Story

- Tests first (T014–T016, T021–T023, T026–T028), each watched failing for the right reason.
- US1: then the segmenter (T017), the job (T018), green (T019), the boundary re-run (T020).
- US2: then the job accounting/failure fixes (T024), green (T025).
- US3: then observer (T029), selection (T030), segmenter boundary fixes (T031), green (T032).
- Polish: then the long/fit, a11y, large, target-language suites (T033–T036), the docs/contract
  (T037–T038), the full gate (T039), the quickstart (T040), and the two manual proofs (T041–T042).

### Parallel Opportunities

- T002, T003, T004, T005 — four independent fixture files.
- T007, T008 — two independent test files.
- T009, T010 — `graphics.ts` and `restorer.ts` are independent; T011 follows them.
- T014, T015, T016 — unit, DOM and e2e files, all failing first.
- T021, T022, T023 — three different files.
- T026, T027, T028 — three different files.
- T029, T030, T031 — three different source files once their tests exist.
- T033, T034, T035, T036, T037, T038 — six different files.

---

## Parallel Example: User Story 1

```bash
# Tests first — three files, all expected to fail:
Task: "T014 failing extraction tests in tests/unit/segmenter-labels.test.ts"
Task: "T015 failing job/placement tests in tests/dom/job-labels.test.ts"
Task: "T016 failing captured-fixture e2e in tests/e2e/diagram-labels.spec.ts"

# Then the two implementation files, in this order (T017 before T018):
Task: "T017 graphic branches in src/content/segmenter.ts"
Task: "T018 label render path in src/content/job.ts"
```

---

## Parallel Example: User Story 2

```bash
# After US1 is green — three test files, then the one accounting task:
Task: "T021 privacy/accounting e2e in tests/e2e/diagram-privacy.spec.ts"
Task: "T022 same-language unit case in tests/unit/segmenter-labels.test.ts"
Task: "T023 failed-label DOM case in tests/dom/job-labels.test.ts"
Task: "T024 accounting/failure fixes in src/content/job.ts (after T021–T023)"
```

## Parallel Example: User Story 3

```bash
# After US1 is green — three test files, then three source files:
Task: "T026 opaque/only/late e2e in tests/e2e/diagram-guards.spec.ts"
Task: "T027 observer tests in tests/dom/observer-labels.test.ts"
Task: "T028 selection tests in tests/dom/selection-graphic.test.ts"
Task: "T029 observer handling in src/content/observer.ts"
Task: "T030 selection targeting in src/content/selection.ts"
Task: "T031 prose/opaque boundaries in src/content/segmenter.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: baseline and the captured fixture.
2. Phase 2: `graphics.ts`, the text journal, `label-renderer.ts`, the renderer delegation —
   proven by jsdom with an injected measurer.
3. Phase 3: the segmenter and job wiring; the captured fixture in all three modes.
4. **STOP and VALIDATE**: the reported defect is fixed — 6 phrases translated, 4 names/loop unchanged,
   42 shapes at 0 px, no style sheet, restore exact.
5. That is the owner's request; US2 and US3 harden it.

### Incremental Delivery

1. Foundation ready (graphic roots, phrase rule, in-place write, text journal).
2. US1 → the drawing translates; ship the reported fix.
3. US2 → prove the style sheet never leaves the device and the counts are exact.
4. US3 → prove prose/captions, opaque graphics, late drawings and selection.
5. Polish → fit edge, a11y, size, target-language change, docs, contract, full gate, manual proofs.

### Reviewer's short path

T001 → T002 → T007 → T008 → T009 → T010 → T011 → T012 → T014 → T015 → T016 → T017 → T018 → T019 is the
reported fix end to end. T021–T025 prove privacy; T026–T032 prove the boundaries; T033–T042 complete the
evidence.

---

## Notes

- [P] tasks are different files with no unfinished dependency.
- Tests must fail before their implementation; a green test that never failed is not evidence.
- No existing assertion is expected to change: the empty SVG page and the block renderer keep their
  outcomes. T020 re-runs the boundary suites and refuses any deleted or weakened assertion.
- The captured fixture is a **capture** (URL, date, scope in the fixture README); the five other
  fixtures are **authored** and labelled as such. Neither is presented as evidence for the other
  (Constitution III).
- The specification's plan-time amendments A1–A3 are already in [spec.md](./spec.md): the label grouping
  unit, the own-bounds/fit-fallback reading, and the two permitted style writes (`font-size` and RTL
  `direction`). No task may write any other style into a drawing.
- No new dependency, permission, storage key, message field or user-visible string. A same-language
  phrase uses the existing skipped surface; a fit fallback is not a failure and has no message.
- T041 and T042 are manual because the boundary is a live site with a real provider and a screen
  reader / 200 % zoom; each names its measurement and neither may be reported as a passing automated
  test.
- Commit after each task or logical group; stop at each checkpoint to validate the story independently.
