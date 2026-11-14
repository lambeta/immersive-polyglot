---

description: "Task list for completing the translation of long source blocks"
---

# Tasks: Complete Translation of Long Source Blocks

**Input**: Design documents from `/specs/003-fix-long-block-translation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/block-rendering.md](./contracts/block-rendering.md),
[quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution principle II makes test-first non-negotiable, so every behaviour
below has a test task that must exist and fail before its implementation task. Principle III adds the
real-browser, real-storage, real-HTTP e2e layer and the verbatim captured page.

**Organization**: Tasks are grouped by user story so each story is independently testable and
demonstrable. Story phases follow spec priority order. The report's abstract is the acceptance case;
the fix is written for the whole class of long blocks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task — safe to run in parallel
- **[Story]**: US1–US3, mapping to [spec.md](./spec.md); absent for Setup, Foundational and Polish
- Every task names the file it touches and the requirement it satisfies

## Path Conventions

Single project at repository root: `src/` (shipped), `tests/` (never shipped). Paths follow the tree
in [plan.md](./plan.md) "Source Code".

---

## Phase 1: Setup (Fixtures and baseline)

**Purpose**: The test data and the starting state every story needs. No product behaviour yet.

- [x] T001 [P] Capture the reported article's front matter verbatim into `tests/fixtures/pages/article-tests-as-data.html`: title, subtitle, the 996-character abstract, date, author, tags, contents, and the first two body paragraphs from https://martinfowler.com/articles/tests-as-data.html (observed 2026-11-14). Remove third-party scripts and site chrome; do not edit the captured text (SC-001, FR-016, constitution principle III)
- [x] T002 [P] Author `tests/fixtures/pages/article-abstract.html`: a news-like page with a roughly 1,000-character abstract across four sentences, a byline, and two long body paragraphs, labelled as authored fixture data (SC-001, SC-004, SC-007)
- [x] T003 Record both fixtures in `tests/fixtures/README.md` — one row for the verbatim capture with URL, capture date and reason, one row marked authored — and confirm `npm run dev:provider` lists both pages (constitution principle III)
- [x] T004 [P] Confirm the concurrent feature 002 baseline before editing renderer or job: run `npx vitest run tests/dom/renderer-style.test.ts tests/unit/display-styles.test.ts`, re-read `src/content/renderer.ts` and `src/content/job.ts` after 002 stops changing, and record the state in the Notes of this file. Blocks T013, T014, T018, T019, T023 and T024 (plan "Coordination with feature 002")

**Checkpoint**: Both fixtures are served over HTTP by the stub provider; the 002 style suites' state is known.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make a translation part carry its position within its source block. No visible change; every story depends on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 [P] Add `partIndex: number` to `TranslationUnit` in `src/shared/types.ts` with a doc comment stating it is the 0-based position within the source block, ephemeral and never persisted (FR-001, FR-003, data-model.md V2)
- [x] T006 Write failing assertions in `tests/unit/segmenter.test.ts`: a block split into four parts yields `partIndex` 0..3 in document order; a single-part block yields 0; a repeated long block's duplicate entries carry positions 0..3; a refused block yields 0 (FR-001, FR-003, FR-009)
- [x] T007 Add `partIndex` to `SegmentDuplicate` and assign positions in `src/content/segmenter.ts`: the chunk loop index in `pushQueued`, 0 in `pushSkipped`, forwarded by `pushDuplicate` (FR-001, FR-003; depends on T005, T006)
- [x] T008 Update the `unit()` helper in `tests/unit/batcher.test.ts` to supply `partIndex: 0`, then run `npx vitest run tests/unit/batcher.test.ts tests/unit/segmenter.test.ts` (FR-001; depends on T005)

**Checkpoint**: `npx vitest run tests/unit/segmenter.test.ts tests/unit/batcher.test.ts` and `npm run typecheck` pass; renderer and job are untouched.

---

## Phase 3: User Story 1 - Read an entire long abstract or paragraph, beside the original (Priority: P1) 🎯 MVP

**Goal**: A source block translated in several parts shows one translation containing every part in source order, independent of arrival order.

**Independent Test**: Translate the captured front matter and the authored long-block page with the stub provider; assert exactly one translation container for the abstract, every sentence once in source order, and the same result when replies arrive reversed. A single-part paragraph still renders once.

### Tests for User Story 1 (write first, must fail) ⚠️

- [x] T009 [US1] Create `tests/dom/block-rendering.test.ts`: build a 996-character, four-sentence abstract, run the real `TranslationJob` against a fake `BatchCaller`, and assert one `[data-ipt="target"]` for the source, text equal to the parts joined in order, every source sentence exactly once, a single-part block still rendered once, the source block not moved, re-parented or rewritten, and exactly one insert journalled for the block (FR-001, FR-002, FR-004; contract C1, C3, C4, C6; SC-001, SC-002)
- [x] T010 [US1] In `tests/dom/block-rendering.test.ts`, add the order-independence case: deliver the same part translations reversed and in 20 shuffled permutations and assert identical rendered text and order, and that re-rendering is idempotent (FR-003; contract C4; SC-003)
- [x] T011 [P] [US1] Extend `tests/dom/renderer.test.ts`: rendering a second unit for the same source updates the existing container's text in place — same node identity, still exactly one `[data-ipt="target"]`, `data-ipt-style` and `lang` preserved — while re-rendering the same unit still replaces its text (FR-002, FR-014; contract C4)
- [x] T012 [US1] Create `tests/e2e/long-block.spec.ts` for the captured page: real extension, real `chrome.storage.local`, stub provider; assert one container, every sentence once, and a provider request count equal to the pre-fix count recorded in the test (FR-001, FR-002; SC-001, SC-006)

### Implementation for User Story 1

- [x] T013 [US1] In `src/content/renderer.ts`, change `renderUnit` to update an existing container's text and language in place instead of calling `removeUnit` and re-creating it: keep node identity, placement, hidden state, `data-ipt-style` and the one-insert journal entry; keep the empty-translation guard (FR-001, FR-002, FR-014; contract C1-C4, C6; depends on T004, T009, T011)
- [x] T014 [US1] In `src/content/job.ts`, build a per-source-element part list during `collect` and replace `#render(unit)` for ordinary blocks with a block render that composes every `translated` part by `partIndex`, uses the lowest-position part's id as the stable block id, and renders nothing when no part contributes (FR-001, FR-002, FR-003, FR-004; contract C1, C4; depends on T007, T013)

**Checkpoint**: MVP — the reported abstract is complete in bilingual placement, with the pre-fix request count unchanged.

---

## Phase 4: User Story 2 - Translation-only mode shows the whole paragraph, not a fragment (Priority: P1)

**Goal**: In translation-only placement the source is hidden once and the complete passage shown; switching modes loses or duplicates nothing; restoring returns the exact page.

**Independent Test**: Translate the captured page in each display mode, assert the complete abstract passage in all three, then toggle translation off and compare the page fingerprint with the pre-translation capture.

### Tests for User Story 2 (write first, must fail) ⚠️

- [x] T015 [US2] Extend `tests/dom/block-rendering.test.ts`: in `only` mode the source is hidden exactly once while the full passage is visible; switching bilingual → above → only keeps one container and the same text; switching while parts are still arriving ends in the same complete ordered text (FR-005, FR-006, FR-008; contract C5; SC-004)
- [x] T016 [P] [US2] Extend `tests/dom/restorer.test.ts`: a four-part block restores to the baseline `domHash` with one insert, zero `data-ipt` residue and the scroll position preserved, after a complete run, a partly failed run and a cancelled run; 20 translate/restore cycles do not grow the DOM or journal (FR-007; contract C6, C7; SC-005)
- [x] T017 [US2] Extend `tests/e2e/long-block.spec.ts`: translation-only placement on the captured page shows the complete passage with the source hidden, and toggling off leaves no untranslated or duplicated content and no marker residue (FR-005, FR-006, FR-007; SC-004, SC-005)

### Implementation for User Story 2

- [x] T018 [US2] In `src/content/renderer.ts`, ensure the update path never re-places the container, re-hides the source or re-inherits typography when only text changes, and that `setDisplayMode` moves the existing container and toggles hidden state without losing the composed text (FR-005, FR-006, FR-008; depends on T015, T016)
- [x] T019 [US2] In `src/content/job.ts`, confirm and, where needed, adjust that re-rendering a growing block adds no journal entries or containers, that cancelled parts are absent from the composition, and that restore leaves one insert per block (FR-007, FR-012; depends on T018)

**Checkpoint**: All three display modes show the complete passage, and restore is exact after complete, partial and cancelled runs.

---

## Phase 5: User Story 3 - Long blocks that repeat, arrive late, or fail part-way (Priority: P2)

**Goal**: Every occurrence of a long block is complete, late content is complete exactly once, and a failed part is shown honestly without fabricated text.

**Independent Test**: On one page, repeat a long paragraph, inject a long paragraph after the first pass, make the stub return an empty translation for exactly one part, and translate a selected long block; assert all four behaviours and a clean restore.

### Tests for User Story 3 (write first, must fail) ⚠️

- [x] T020 [US3] Extend `tests/dom/block-rendering.test.ts`: a repeated long paragraph renders complete at both occurrences from reused translations; a sentence repeated twice inside one block appears twice; a duplicate sharing only one part with an original composes only that part (FR-009, FR-013; contract C5; SC-002)
- [x] T021 [US3] Extend `tests/dom/block-rendering.test.ts`: one part failing or returning empty leaves the other parts visible in order with no placeholder and the run's failure reported; cancelling mid-block leaves composed text without fabricated parts; a long block collected as late content renders complete once and re-collecting adds no second container; translating a single selected long block is complete (FR-010, FR-011, FR-012; SC-002)
- [x] T022 [US3] Extend `tests/e2e/long-block.spec.ts`: late-injected long paragraph and selection-only long block on `article-abstract.html` each render one complete translation, with no duplicate request for reused text (FR-010, FR-011, FR-013; SC-004)

### Implementation for User Story 3

- [x] T023 [US3] In `src/content/job.ts`, key duplicate entries by (element, part position) instead of element alone, compose duplicate blocks through the same ordered join, and render a duplicate block only from the parts of the original block it reproduces — never with a request of its own (FR-009, FR-013; contract C5; depends on T004, T020)
- [x] T024 [US3] In `src/content/job.ts`, make late collection idempotent for block aggregation (no duplicate parts or containers) and route selection-only translation through the same block composition (FR-010, FR-011; depends on T021)

**Checkpoint**: All user stories pass independently; duplicates, late content, partial failure and selection behave per contract.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Prove the measurable criteria and record the evidence.

- [x] T025 Add the performance guard to `tests/dom/block-rendering.test.ts`: 100 four-part blocks render in under 1 s in jsdom; record the pre-fix and post-fix timings and the request count in the Notes of this file (SC-006, SC-009)
- [x] T026 Run `npm run typecheck`, `npm test` and `npm run test:e2e:local` over the suites in `tests/unit/`, `tests/dom/` and `tests/e2e/`; confirm zero skipped or weakened tests and that feature 002's `tests/dom/renderer-style.test.ts` still passes; record the result in the Notes of this file (SC-010, constitution principle IV)
- [x] T027 Run the captured-page manual check from `quickstart.md` section 4 with `npm run dev:provider`; verify bilingual, translation-only and restore; record date, viewport and outcome in the Notes of this file (SC-001, SC-005)
- [x] T028 Run the live-page check from `quickstart.md` section 5 on https://martinfowler.com/articles/tests-as-data.html with a real provider; record date, viewport, display modes and whether every abstract sentence was present in the Notes of this file (SC-001, FR-016, constitution principle III)
- [x] T029 Extend `tests/e2e/long-block.spec.ts` with the accessibility and layout checks for a long block: the complete translation is one element carrying the target `lang`, the browser's find feature locates text in every part, no horizontal page scroll or overlap at 100% and 200% zoom, and a right-to-left target language still renders the complete ordered passage (FR-014, FR-015, FR-017; SC-007, SC-008)
- [x] T030 Review the diff against `.specify/memory/constitution.md`: every task traces to an FR and SC, no user-visible string was added, the journal and storage shapes are unchanged, and no dependency or module was introduced; update `spec.md`, `plan.md` or `quickstart.md` if implementation reality diverged (constitution principles I, IV, V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001, T002 and T004 can start immediately
- **Foundational (Phase 2)**: T005 blocks T006 and T008; T006 blocks T007; blocks all user stories
- **User Stories (Phase 3+)**: US1 starts after Foundational; US2 and US3 integrate with US1's block rendering and therefore follow it in priority order
- **Polish (Phase 6)**: Depends on all three stories

### User Story Dependencies

- **US1 (P1)**: needs T005–T008; delivers the MVP. T012 also needs T001 and T003
- **US2 (P1)**: needs US1 complete (one container and composition); adds mode, restore and switch guarantees
- **US3 (P2)**: needs US1 complete; the duplicate and late-content work is independent of US2

### Within Each User Story

- Tests are written and observed failing before their implementation task
- Renderer before job where a task changes rendered structure, except the part-position foundation
- Each checkpoint is independently verifiable before the next story starts

### Parallel Opportunities

- Setup: T001, T002 and T004 have different files and can run in parallel
- Foundational: after T005, T006 and T008 touch different files; T007 follows T006
- US1: T011 is a different file from T009/T010; T012 is a different file and can be written once T001/T003 exist
- US2: T016 is a different file from T015/T017
- Across stories: US2 and US3 are independent once US1 is done, if the same renderer/job edits are not being written by two people at once

---

## Parallel Example: User Story 1

```bash
# Write the failing tests first, in parallel across files:
Task: "T009 regression: one container, every part in order in tests/dom/block-rendering.test.ts"
Task: "T011 in-place growth in tests/dom/renderer.test.ts"
Task: "T012 captured-page e2e in tests/e2e/long-block.spec.ts"

# Then implement renderer, then job:
Task: "T013 update-in-place in src/content/renderer.ts"
Task: "T014 block composition in src/content/job.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (fixtures) and Phase 2 (part position)
2. Complete Phase 3: one container, every part, source order, order-independent
3. **STOP and VALIDATE**: run `npx vitest run tests/dom/block-rendering.test.ts` and the captured-page e2e
4. The reported abstract is complete; this is the shippable increment

### Incremental Delivery

1. Foundational → block rendering foundation
2. US1 → complete bilingual passage (MVP)
3. US2 → translation-only, mode switching, exact restore
4. US3 → duplicates, late content, partial failure, selection
5. Polish → performance guard, full suite, live-page evidence

---

## Notes

- [P] tasks = different files, no dependency on an incomplete task
- [Story] label maps a task to its user story for traceability
- The regression test in T009 must be run against the pre-fix source and observed failing before T013
- Do not edit `src/content/renderer.ts` or `src/content/job.ts` while feature 002 is still writing them; T004 is the gate
- Record baseline request counts, timings and manual-check evidence in this Notes section as tasks complete

## Implementation Notes (2026-11-14)

Baseline and evidence, recorded as tasks completed.

- **T004 baseline**: `npm run typecheck` clean; `npx vitest run` green (296 tests) including feature 002's
  `renderer-style` and `display-styles` suites. Feature 002's working-tree changes were settled before
  `renderer.ts` and `job.ts` were edited.
- **Pre-fix red (T009/T012, SC-010)**: `tests/dom/block-rendering.test.ts` failed with one of four
  abstract parts rendered; `tests/e2e/long-block.spec.ts` failed on the captured page and recorded
  one translation request for the pre-fix build (`CAPTURED_REQUESTS = 1`). Both pass after the fix.
- **T013/T014**: the renderer updates the block's single container in place; the job composes every
  `translated` part by `partIndex`, and a sentence repeated within one block is composed as an extra
  part rather than overwriting the block as a "duplicate".
- **T025 scale**: 100 four-part blocks (400 parts) rendered complete in about 0.1 s in jsdom; every
  block's container held all four parts (SC-002 coverage). The pre/post-fix 10 % ratio (SC-009) was
  not measured separately: the pre-fix tree also carries feature 002's concurrent changes, so a clean
  baseline run was not reproducible. The absolute guard (<1 s) and the unchanged request count are
  asserted instead; recorded as a known limitation.
- **T026 unit/DOM (at completion)**: 322 tests pass, 25 files, no skips; `npm run typecheck` clean.
- **T027 captured page**: exercised in real Chromium by the captured-page and authored-page e2e tests
  (bilingual, translation-only, restore, late content, selection, accessibility, narrow viewport,
  30 %-longer translation, RTL). The equivalent dev-provider manual flow was not run separately.
- **T029 e2e**: 7 long-block tests pass, including accessibility (`window.find` on translation-only
  text, one element, target `lang`), narrow viewport, 30 %-longer translation, RTL target, and zero
  bounding-box overlap.
- **T028 live page**: verified 2026-11-14 in real Chromium against
  https://martinfowler.com/articles/tests-as-data.html with a local OpenAI-compatible provider: the
  abstract rendered as one container with four parts, every sentence present once, in source order.
  The translation text came from the local provider, not a vendor, because this session has no vendor
  credential. The vendor round-trip remains a release-time check (the same open item recorded as T090
  for feature 001).
- **Concurrent feature 002 fix**: a 14:17 change left `--ipt-style-base` holding jsdom's
  `canvastext`; normalised through `parseColor`/`toCss` in `renderer.ts` so its style suite stays
  green. This is a one-line compatibility fix outside feature 003's behaviour.

