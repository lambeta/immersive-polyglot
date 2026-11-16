# Tasks: A Loading Mark on the Passage Being Translated, and Translation Requested on Demand

**Input**: Design documents from `/specs/007-progressive-translation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **REQUIRED, not optional.** Constitution II ("Test-First") is NON-NEGOTIABLE in this
project: every behaviour task below is preceded by the test that must fail first. The plan's
[Tests this feature owes](./plan.md#tests-this-feature-owes) table is the source of the test tasks;
each test task names the T-row it discharges.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested and
demonstrated on its own. Two expectations are rewritten rather than added (plan T11, T12); both are
marked **changed** below and neither deletes an assertion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1..US4 for story phases; absent in Setup, Foundational and Polish
- Every task names the file it touches

## Path Conventions

Single project at the repository root: `src/` (extension source), `tests/` (`unit`, `dom`, `e2e`,
`support`, `fixtures`), `scripts/` (build and fixture tooling).

---

## Phase 1: Setup (Fixtures, Evidence and Test Support)

**Purpose**: the shared instruments every story's tests need. No production code changes here.

- [x] T001 Record the green baseline before any change: run `npm run typecheck` and `npm test` on `master` and write the test counts into this file's notes (no source file modified) — evidence that T30/SC-013 is judged against a known starting point
- [x] T002 [P] Add `scripts/make-long-fixture.mjs` and generate `tests/fixtures/pages/article-endless.html`: at least 200 deterministic readable passages, one screenful visible at 1280×800, and a second generated variant `tests/fixtures/pages/article-endless-noanchor.html` that sets `html { overflow-anchor: none }` (T13, T14, T19, T23)
- [x] T003 [P] Extend `tests/support/stub-provider.ts` to record, per page, the exact passage texts it was asked to translate, in arrival order, and expose them to a test (T12, T13, T16). Do not change the wire format
- [x] T004 [P] Add measurement doubles in `tests/dom/helpers.ts`: a `measureRects(map)` helper so a test can assign rectangles to elements, and a viewport double with a settable height and scroll offset — jsdom has no layout, so demand and anchor tests must inject geometry (T1, T14)

**Checkpoint**: `npm test` is still green and the fixtures exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the two shared seams every story depends on. They are placed here — not inside US1 —
because they are the only two files more than one story would otherwise edit concurrently.

**⚠️ CRITICAL**: no user-story task may start before this phase is complete.

- [x] T005 Add `PENDING_MARKER = "pending"` to `src/content/markers.ts` beside `TARGET_MARKER` and `SOURCE_MARKER`, and adjust that file's header comment: no other module may repeat the literal (contracts/pending-mark.md §1)
- [x] T006 Add the mark's box rules to `src/styles/content.css` under `[data-ipt="pending"]`: a fixed 14 px box with a 2 px stroke, `user-select: none`, `pointer-events: none`, no inherited font size or line height, no text, and a foreground colour that stays identifiable on light, dark, tinted and mid-gray pages. It MUST NOT be selected by any rule keyed on `[data-ipt-style]` (contracts/pending-mark.md §4, §5.1; FR-007)

**Checkpoint**: the marker and the mark's look exist and nothing renders them yet.

---

## Phase 3: User Story 1 — The passage being translated says so, in the place its translation will appear (Priority: P1) 🎯 MVP

**Goal**: every passage whose translation has been requested shows exactly one rotation mark in the
slot its translation will occupy, and that same node becomes the translation when it arrives.

**Independent Test**: load a fixed page with 40 passages, press the control, sample the page every
100 ms: each passage passes through mark → translation in that order, never showing both, and no
translation appears that a mark did not precede.

### Tests for User Story 1 ⚠️ Write these first and watch them fail

- [x] T007 [P] [US1] `tests/dom/renderer-pending.test.ts`: creation, one mark per passage (I1), placement after/before/in-slot for the three display modes, wordless, `aria-hidden="true"`, no `data-ipt-style`, no `lang`, not focusable, no `tabindex`, source still visible in "translation only" while pending (T5, T10)
- [x] T008 [P] [US1] `tests/dom/renderer-pending.test.ts` (same file, second describe): conversion reuses the **same node** — the element identity before and after is identical, `data-ipt` becomes `"target"`, the text is the translation, and the pending attributes are gone (T6, FR-003)
- [x] T009 [P] [US1] `tests/dom/job-mark.test.ts`: with `DeferredCaller`, the mark exists **before** the request is issued; on release the mark is replaced; a skipped unit and a repeated occurrence never get one; a rendered mark never has a sibling mark (T5, T9)
- [x] T010 [P] [US1] `tests/e2e/pending-mark.spec.ts`: in real Chromium against the unpacked extension, visible passages show a mark and then their translation, no passage ever shows both, every visible passage shows one or the other within 1 second across 20 trials, and a selection translation shows a mark that becomes its translation (T6, T20, T29)

### Implementation for User Story 1

- [x] T011 [US1] Add `#pending: Map<Element, PendingRecord>` and `showPending(source, unitId)`, `settlePending(source)`, `pendingCount`, `removePending(source)` to `src/content/renderer.ts`; place with the existing `#place` and `CONTAINER_TAGS` rules so the mark lands where the translation will; make `setDisplayMode` re-place pending marks exactly as it re-places translations (T7 expectation; FR-002)
- [x] T012 [US1] Make `renderUnit` in `src/content/renderer.ts` convert a pending container in place: keep the node, write the text, `data-ipt="target"`, `data-ipt-unit`, `lang`, `data-ipt-style`, then inherit typography and apply presentation — atomic within one render task (FR-003, contracts/pending-mark.md §6)
- [x] T013 [US1] Journal every mark before it is visible in `src/content/renderer.ts`: `recordAttribute` + `recordAttributeOnce` for `data-ipt`/`data-ipt-unit`/`data-ipt-position`, `recordStyle` before styling, `recordInsert` at insertion — exactly the discipline translations already follow (FR-009, I3)
- [x] T014 [US1] In `src/content/job.ts`, show a passage's mark when the batch carrying its units is dispatched and before the caller is invoked, keyed by `unit.domRef`, and settle it in `#renderBlock` after `renderer.renderUnit` returns (FR-001)
- [x] T015 [US1] Keep the mark out of every accounting path in `src/content/job.ts`: it is not a unit, not a rendered translation, and changes none of `countUnits`'s four figures (FR-008)

**Checkpoint**: US1 is demonstrable on its own — a page translated with today's whole-page dispatch shows
marks that become translations, and `/speckit-implement` can stop here for a reviewable increment.

---

## Phase 4: User Story 2 — Only what the reader is about to read is translated (Priority: P1)

**Goal**: a passage is requested only while it lies in the demand window (visible area plus one
viewport height below), visible passages first; scrolling is what asks for the next stretch.

**Independent Test**: on the 200-passage fixture with one screenful visible, the stub's record holds
only in-window passages; scrolling one screenful at a time adds each new passage exactly once; reading
20 of 200 sends at most 30 % of the whole-page characters.

**Depends on**: US1 (the mark is what a dispatched passage shows).

### Tests for User Story 2 ⚠️ Write these first and watch them fail

- [x] T016 [P] [US2] `tests/unit/demand.test.ts`: the predicate for visible, lookahead, exactly-at-the-boundary, entirely-above, taller-than-screen and zero-height; the lookahead is exactly one viewport height; ordering is visible-first then document order (T1, T2)
- [x] T017 [P] [US2] `tests/unit/demand-pump.test.ts`: unsent batches re-sort behind newly visible passages; started batches are never cancelled; never more than `provider.maxConcurrency` started; a retirement starts the next head (T3, T4)
- [x] T018 [P] [US2] **changed** `tests/dom/observer-demand.test.ts`: late content is collected on arrival and **not** requested while it is out of the window; it is requested when the window reaches it. The old expectation (translated on arrival) is rewritten, not deleted (T11)
- [x] T019 [P] [US2] **changed** `tests/e2e/demand-scope.spec.ts`: initial scope on the long fixture, one-screenful scroll growth with each passage requested exactly once, cost ≤ 30 % after reading 20 passages, a one-screenful page translated in full, resize/zoom/anchor-jump treated as scrolling, background tab requesting nothing (T12, T22, T23, T13, T16)

### Implementation for User Story 2

- [x] T020 [P] [US2] `src/content/demand.ts`: `DEMAND_LOOKAHEAD_RATIO = 1` (fixed constant, never read from storage), `inDemand(rect, window)` with `bottom > top AND top < bottom + lookahead`, and `orderByDemand(passages, window)` returning visible-then-lookahead in document order. Pure: no DOM access, no timers (FR-010..FR-013)
- [x] T021 [P] [US2] `src/content/viewport.ts`: one `IntersectionObserver` with a root margin of one viewport height, plus `scroll`/`resize`/`visibilitychange` listeners, coalescing every notification to at most one per animation frame; expose `pageVisible`; accept an injected observer factory through the `view`-shaped seam `PageObserver` already uses (FR-011, FR-016)
- [x] T022 [P] [US2] `src/content/passage-index.ts`: extract the job's block ↔ parts ↔ duplicate bookkeeping into a module that answers "pending passages, in document order", "the units of this passage" and "the occurrences of this passage", so both the job and the pump share one source of truth (data-model §1)
- [x] T023 [US2] `src/content/demand-pump.ts`: the ordered queue of `QueuedBatch` (group, sequence, phase), re-sorting only `queued` entries on every window change, starting at most `provider.maxConcurrency` batches, wrapping each start in `RequestLimiter.run()`, and starting the next head on each settlement (contracts/dispatch-queue.md; FR-014)
- [x] T024 [US2] `src/content/job.ts`: add `runDemand(window, options)` that plans batches from the in-window queued units only and reuses the existing apply/render path; make `run()` delegate to a document-wide window so `translateElements`, selection translation and every existing DOM test keep their meaning (R7; FR-017)
- [x] T025 [US2] `src/content/page-run.ts`: compose job + window + pump; allow at most one planning round at a time and schedule the next round when the window moved during one; stop on cancel and turn-off; never claim the page's `RunSlot` a second time (R7; FR-025)
- [x] T026 [US2] `src/content/index.ts`: start the page run with the viewport watcher on activation and keep the selection path on the whole-target window, so a selection is translated in full and still shows marks (T20); broadcast status per round so counts grow as the reader reads (R9)
- [x] T027 [US2] `src/content/observer.ts` and its caller in `src/content/index.ts`: the observer reports new content and no longer triggers translation; the page agent collects it and asks the run to re-evaluate the window (FR-018)

**Checkpoint**: US1 and US2 both hold — marks still become translations, and only in-window passages are sent.

---

## Phase 5: User Story 3 — No mark ever dangles (Priority: P1)

**Goal**: every mark ends in its translation or in its own removal — on failure, cancellation, cap
refusal and turn-off — and turning translation off still returns the page exactly.

**Independent Test**: stop a run at ten fixed moments and count the marks; compare the restored page
with the pre-translation capture. Any stray mark, or any restored page that differs, fails.

**Depends on**: US1 (the mark exists), US2 (the cap and dispatch paths it must clean up after).

### Tests for User Story 3 ⚠️ Write these first and watch them fail

- [x] T028 [P] [US3] `tests/dom/mark-endings.test.ts`: failure removes the mark and leaves nothing that reads as a translation; cancel removes every mark; a cap refusal leaves no mark; restore while a mark is on screen removes it and restores the pre-translation DOM hash; a run after restore inherits no mark; an activation while marks are on screen adds no mark and no request; a run after an explicit stop starts exactly one new run (T6, T7, T8, T17, T24)
- [x] T029 [P] [US3] `tests/e2e/mark-endings.spec.ts`: turn off with marks on screen and compare DOM hash and scroll with the pre-translation capture; cancel mid-round; cap the session at 5 passages, assert one cap notice and zero surviving marks; sample at the ten documented moments for stray marks (T7, T17, T27)

### Implementation for User Story 3

- [x] T030 [US3] `src/content/job.ts`: on a failed part, remove its passage's mark, record the failure once through `#fail`, and let the remaining batches continue — one failure must not stop the pump (FR-022, contracts/dispatch-queue.md §4)
- [x] T031 [US3] `src/content/job.ts`: on cancellation, remove every mark through the renderer while leaving rendered translations in place and restorable; discard late replies so a mark cannot reappear (FR-024)
- [x] T032 [US3] `src/content/job.ts`: when `VolumeBudget.tryReserve` refuses a part at dispatch, remove the mark that the dispatch had already shown and mark the part skipped; leave the cap notice untouched (FR-019, FR-021)
- [x] T033 [US3] `src/content/renderer.ts`: make `removeUnit` and `restorePage`'s residue audit treat `data-ipt="pending"` exactly like `"target"`, so no mark can survive a replay or a residue sweep (FR-023, I5)

**Checkpoint**: all three P1 stories hold; the page is honest about progress and exactly restorable.

---

## Phase 6: User Story 4 — Filling in above does not move what the reader is reading (Priority: P2)

**Goal**: the passage under the reader's eye keeps its place while translations land above it, and the
mark stays out of the reading flow, the focus order, the printed page and the reader's motion settings.

**Independent Test**: park the viewport on a passage, let the passages above it translate one at a
time, and measure that passage's screen position after each; run the a11y and reduced-motion checks
against a page carrying marks.

**Depends on**: US1 (the mark), US2 (rounds arriving while the reader reads).

### Tests for User Story 4 ⚠️ Write these first and watch them fail

- [x] T034 [P] [US4] `tests/unit/scroll-anchor.test.ts`: the delta arithmetic, the 2 px tolerance that makes a compensated insert a no-op, and that a correction never runs when nothing moved (T14)
- [x] T035 [P] [US4] `tests/e2e/reading-position.spec.ts`: the parked passage stays within 4 px across 19 fills, on both the normal fixture and `article-endless-noanchor.html` (T14, SC-008)
- [x] T036 [P] [US4] `tests/e2e/mark-a11y.spec.ts`: the mark is not announced, takes no focus, respects reduced motion while staying visible, does not scale at 200 % translation type, and sits on the correct side in an RTL target page (T15, T21, T28)

### Implementation for User Story 4

- [x] T037 [P] [US4] `src/content/scroll-anchor.ts`: `capture()` records the rectangle of the first passage below the viewport top; `restore()` corrects the scroll only when that rectangle moved by more than 2 px; O(1) work per call, no listener, no timer (R8; FR-027)
- [x] T038 [US4] `src/content/page-run.ts`: capture before each batch is dispatched and correct after it settles, so a correction can never fight a scroll the reader is making (FR-027)
- [x] T039 [US4] `src/styles/content.css`: `@media (prefers-reduced-motion: reduce)` makes the mark static and still visible, and `@media print` hides it — FR-029 and the print rule of contracts/pending-mark.md §5.6

**Checkpoint**: all four stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T040 [P] `tests/e2e/reporting.spec.ts` and the matching `src/content/job.ts` state handling: the panel reports `translating` only while a round is in flight and `translated` with the counts reached when the reader's screen is drained; counts keep growing on later rounds; no new status label and no new string (T25, FR-031, the 2026-11-15 clarification)
- [x] T041 [P] `tests/unit/i18n-audit.test.ts`: confirm the audit passes with an unchanged `src/_locales/en/messages.json` — the mark is wordless (T18, FR-034)
- [x] T042 [P] `tests/e2e/tabs.spec.ts`: two tabs translate independently; no mark, request or charge crosses between them (T26, FR-036)
- [x] T043 [P] `tests/e2e/scroll-budget.spec.ts`: a 30-second scripted scroll across a 300-passage page during translation stays within the 50 ms response budget and shows no dropped-frame burst (T19, SC-012)
- [x] T044 [P] `tests/e2e/display-styles.spec.ts` (extended): a mark is never blurred, underlined, highlighted, concealed or quote-styled by any of the fifteen display styles (T21, FR-005)
- [x] T045 [P] Update the existing long-fixture e2e tests to the new contract (`tests/e2e/smoke.spec.ts`, `tests/e2e/long-block.spec.ts`, `tests/e2e/long-labels.spec.ts`, `tests/e2e/a11y.spec.ts` where they assume a whole-page run): scroll into range then assert, or assert only in-window passages. No assertion is deleted or loosened (T11, T12)
- [x] T046 [P] Update `README.md`: the per-passage mark, the demand window (fixed one screenful, no setting), and the changed late-content rule; link `quickstart.md`
- [x] T047 Run the full gate and record the numbers: `npm run typecheck`, `npm test`, `npm run test:e2e:local`, `npm run verify:rendering -- --include-example`, and `npm run verify:styles` — all green, nothing skipped, compared against T001's baseline (T30, SC-013)
- [x] T048 Walk [quickstart.md](./quickstart.md) end to end against the built `dist/` with `npm run dev:provider`, including the "common ways to fool yourself" checklist (validation, SC-001..SC-012)

---

## Requirement Traceability

Every functional requirement and success criterion in [spec.md](./spec.md) is satisfied by at least one
task below. Nothing the spec asks for is left without an owner, and no task exists that no requirement
justifies (Constitution I).

| Requirement | Task(s) | Requirement | Task(s) |
|---|---|---|---|
| FR-001 | T009, T014 | FR-020 | T017, T023 |
| FR-002 | T007, T011 | FR-021 | T028, T030, T031, T032 |
| FR-003 | T008, T012, T014 | FR-022 | T028, T030 |
| FR-004 | T007, T009 | FR-023 | T029, T033 |
| FR-005 | T006, T007, T044 | FR-024 | T028, T031 |
| FR-006 | T009 | FR-025 | T025, T028 |
| FR-007 | T006, T044 | FR-026 | T028 |
| FR-008 | T015 | FR-027 | T037, T038 |
| FR-009 | T013, T033 | FR-028 | T007, T036 |
| FR-010 | T016, T020 | FR-029 | T036, T039 |
| FR-011 | T019, T021, T022 | FR-030 | T006, T036 |
| FR-012 | T016, T019 | FR-031 | T040 |
| FR-013 | T017, T020, T023 | FR-032 | T044, T045, T047 |
| FR-014 | T017, T023 | FR-033 | T009, T028, T032, T047 |
| FR-015 | T009, T024 | FR-034 | T041, T047 |
| FR-016 | T019, T021 | FR-035 | T010, T026 |
| FR-017 | T019, T024 | FR-036 | T042 |
| FR-018 | T018, T027 | FR-037 | T036, T045 |
| FR-019 | T032 | | |

| Success criterion | Task(s) | Success criterion | Task(s) |
|---|---|---|---|
| SC-001 | T010 | SC-008 | T035 |
| SC-002 | T019 | SC-009 | T036, T045 |
| SC-003 | T009 | SC-010 | T036 |
| SC-004 | T019 | SC-011 | T019, T045 |
| SC-005 | T019 | SC-012 | T043 |
| SC-006 | T029 | SC-013 | T047, T048 |
| SC-007 | T029 | | |

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T002–T004 are parallel
- **Foundational (Phase 2)**: needs Setup; **blocks every story**
- **US1 (Phase 3)**: needs Foundational; depends on nothing else
- **US2 (Phase 4)**: needs Foundational **and US1** — a dispatched passage shows a mark, so gating dispatch without the mark would leave the reader with nothing
- **US3 (Phase 5)**: needs US1 (to have marks to end) and US2 (for the cap and dispatch paths)
- **US4 (Phase 6)**: needs US1 and US2 (rounds must arrive while the reader watches a passage)
- **Polish (Phase 7)**: needs all four stories

### Within each story

Tests first and failing (Constitution II), then the implementation in the order listed: the renderer or
predicate before the job, the job before the page run, the page run before the wiring in `index.ts`.
Each implementation task names the test that proves it.

### Parallel Opportunities

- Phase 1: T002, T003, T004 — three different files
- Phase 3 tests: T007–T010 — three files, no shared state
- Phase 4: T016, T017, T018, T019 in parallel (four files); then T020, T021, T022 in parallel (three new
  modules); T023 depends on T020 and T022; T024 on T022; T025 on T023 and T024
- Phase 5 tests: T028, T029 in parallel
- Phase 6: T034, T035, T036 in parallel; T037 before T038
- Phase 7: T040–T046 in parallel; T047 and T048 last

### Parallel example — Phase 4 tests

```bash
Task: "tests/unit/demand.test.ts — predicate and ordering"
Task: "tests/unit/demand-pump.test.ts — reorder, ceiling, retire"
Task: "tests/dom/observer-demand.test.ts — late content waits for the window (changed)"
Task: "tests/e2e/demand-scope.spec.ts — scope, growth, 30 % cost, short page, tab"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1: the mark appears in the translation slot and becomes the translation
3. **Stop and validate**: sample a translated page at 100 ms — no passage without a mark before its
   translation, no passage with both
4. This is a shippable increment on its own: the reader gains per-passage progress with today's
   whole-page dispatch and no change to cost

### Incremental delivery

1. US1 → reviewable increment (mark lifecycle, whole-page dispatch)
2. US2 → the cost and latency change; the long fixture and the stub's record become the evidence
3. US3 → the honesty and restoration guarantees catch up with the new element
4. US4 → the layout and accessibility guarantees; the feature stops being able to make the page worse
5. Polish → reporting, regression sweep, documentation, full gate

### Notes

- Every task cites its FRs or its plan T-row; a task that cannot is re-derived, not implemented
  (Constitution I)
- `[P]` means a different file and no dependency on an incomplete task
- T018, T019 and T045 rewrite existing expectations because the specification changes that behaviour;
  they are the only such tasks and each says so
- Commit after each task or logical group; stop at any checkpoint to validate a story on its own

### Execution notes (2026-11-16)

- **T001 baseline**: 32 test files / 390 tests green, `tsc --noEmit` clean before any change.
- **Final gate (T047)**: 39 files / 442 unit+DOM tests green; e2e suite green in real Chromium against
  the unpacked extension and the real HTTP stub; `tsc --noEmit` clean. No test skipped or weakened.
- **Expectations rewritten for the specified change (T018, T019, T045)**, each with a comment naming
  the requirement: late content now waits for the demand window (`long-block.spec.ts`,
  `repeat-translate.spec.ts`), and a reader must scroll a long page for it to be translated
  (`us4-failures.spec.ts`). No assertion was deleted; the three rewrites scroll first and then assert
  the same property.
- **One product defect found by the existing suite and fixed**: the first cut segmented the whole
  document for every activation, which made a *selection* translation translate the entire page
  (`long-block.spec.ts`, `us5-personalization.spec.ts`). Segmentation is now page-run only.
- **One harness limitation, recorded rather than hidden**: Playwright pages in one context are all
  reported visible by Chromium, so FR-016's "a page nobody is looking at requests nothing" is proved
  in `tests/dom/observer-demand.test.ts` (where visibility can be set), and the e2e test proves the
  observable half (leaving and returning loses and duplicates nothing).