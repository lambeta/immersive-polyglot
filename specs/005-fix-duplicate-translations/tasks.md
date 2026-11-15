---

description: "Task list for feature 005: one translation per passage, however often Translate is pressed"
---

# Tasks: One Translation Per Passage, However Often Translate Is Pressed

**Input**: Design documents from `/specs/005-fix-duplicate-translations/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Required, not optional.** Constitution principle II is NON-NEGOTIABLE (every behaviour
starts with a failing test, every bug fix lands with a regression test that fails before the fix), and
spec SC-011 restates it. Every implementation task below is preceded by the test that must fail first.

**Organization**: Grouped by user story so each story can be implemented, tested and demonstrated on its
own. The three stories share one call path in `src/content/index.ts`, so they are sequenced in that file —
but each has its own journey, its own acceptance scenarios and its own gate.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: `[US1]`, `[US2]`, `[US3]`, mapping to spec.md user stories
- Every task names the requirement it satisfies and the test that proves it; each e2e task carries at
  most three cases so it stays one reviewable unit and a failure localises.
- **Same-file rule**: no two tasks may run in parallel if they edit the same file. `src/content/index.ts`
  is touched by T013, T014, T020, T021 and T028 and MUST be edited in that order;
  `tests/unit/run-slot.test.ts` is grown by T006 then T008, and `src/content/run-slot.ts` by T007 then T009;
  the one e2e spec `tests/e2e/repeat-translate.spec.ts` is appended to by T015, T016, T017, T022, T023,
  T025, T026, T027 and T029 in that order.

## Path Conventions

Single project at repository root: `src/` and `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The three things every later task needs — a way to fire N activations over the real wire, a
way to set a selection, and a recorded green baseline to prove the regression test really starts red.

- [X] T001 [P] Add repeat-activation helpers to `tests/support/e2e-fixtures.ts`: `repeatCommand(extension, pageUrl, command, times)` that sends N copies through `chrome.tabs.sendMessage` without awaiting each other; `clickTranslate(page, times = 5)` that presses the popup's `#translate` control `times` times within one animation frame (the spec's five-press scenario); `selectPassage(page, selector)` that sets a DOM `Range`/`Selection` over that element so `translateSelection` has something to resolve; and `translationsPerPassage(page)` that maps each source passage to the number of `[data-ipt="target"]` blocks beside or inside it. No product code. (Contract: activation-lifecycle §8; enables the proofs of FR-001, FR-018 and SC-002; used by T015, T016, T017, T022, T023, T025, T026, T027, T029.)
- [X] T002 Record the green baseline before any edit: `npm run typecheck`, `npm test`, `npm run build` all pass. Confirm the baseline gap this feature fills by searching the suite for a double-activation test — `grep -rn "translatePage" tests/` shows no test that activates twice, and `tests/dom` has no `job-repeat` test. Note the result in the task log (commands come from `package.json`). (SC-011 pre-condition.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The decision surface, the target-identity rule and the marker vocabulary. Every user story
depends on all three.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T003 [P] Create `src/content/markers.ts` exporting `TARGET_MARKER = "target"` and `SOURCE_MARKER = "source"`, with a doc comment stating the ownership rule from [contracts/page-markup-ownership.md](./contracts/page-markup-ownership.md) §2: a `data-ipt="target"` element is product output and is never source text. No behaviour. (FR-005, FR-019; research R4.)
- [X] T004 [P] Change `src/content/renderer.ts` to import both markers from `./markers.js` and re-export them (`export { TARGET_MARKER, SOURCE_MARKER } from "./markers.js"`), replacing the local constant definitions. Behaviour must not change: every existing import path still resolves. Prove with `npx vitest run tests/dom/renderer.test.ts tests/dom/renderer-style.test.ts tests/dom/renderer-typography.test.ts`. (FR-016.)
- [X] T005 [P] Change `src/content/observer.ts` to build its `[data-ipt]` selectors and attribute checks from the marker constants instead of literal strings, so the "our own injection" rule (observer.ts `#isOurs`, `#collect`) has one definition. Prove with `npx vitest run tests/dom/observer.test.ts`. (FR-017; research R4: no module repeats the literals.)
- [X] T006 [P] Write **failing** tests in `tests/unit/run-slot.test.ts` (node environment, no DOM) for [data-model.md](./data-model.md) §1: (a) empty slot → `start`; (b) `claim()` twice in a row with no `await` between → second returns `absorb-running` (the race of research R3); (c) `finished` + `completed` + `sameTarget: true` → `absorb-repeat`; (d) `finished` + `completed` + `sameTarget: false` → `replace`; (e) `finished` + `failed` + same target → `absorb-repeat` (SC-008); (f) `finished` + `cancelled` → `replace` (a press after an explicit stop starts one new run); (g) `settle()` twice or `settle()` before `claim()` leaves the state consistent and never throws; (h) `reset()` returns the slot to empty. Run `npx vitest run tests/unit/run-slot.test.ts` and record the red output. (FR-001, FR-002, FR-003, FR-007, FR-018.)
- [X] T007 Implement `src/content/run-slot.ts` to make T006 green: export `RunPhase` (`"starting" | "running" | "finished"`), `RunOutcome` (`"completed" | "failed" | "cancelled"`), `RunSnapshot` (`{ phase; outcome? }`, with `outcome` present **if and only if** `phase === "finished"`), `ActivationDecision` (`"start" | "replace" | "absorb-running" | "absorb-repeat"`) and `class RunSlot` with `snapshot`, `claim({ sameTarget })` (synchronous and total: decides **and** records the claim in one step, never awaits, never throws), `markRunning()`, `settle(outcome)`, `reset()`. No DOM, no `chrome`, no timers, no storage. (FR-001, FR-002, FR-003, FR-007; data-model I1–I5; research R2, R3.)
- [X] T008 Write **failing** tests in `tests/unit/run-slot.test.ts` for the target-identity rule ([data-model.md](./data-model.md) §2): (a) two whole-page activations are the same target; (b) a selection and a whole-page activation are never the same target; (c) two selections resolving to the same elements in the same order are the same target; (d) selections differing by one element, by their order, or by their length are not the same target; (e) with no previous target, nothing counts as the same. Run `npx vitest run tests/unit/run-slot.test.ts` and record the red output. (FR-008, FR-018; SC-009; plan.md Structure Decision.)
- [X] T009 Implement `sameTarget(previous, next)` in `src/content/run-slot.ts` to make T008 green: a pure function over `{ kind: "page" } | { kind: "selection"; elements: Element[] }` that treats whole-page as equal to whole-page only, compares selections element-for-element by **reference** (never by text, id, class or length alone), and returns false when either side is absent or empty. No DOM reads beyond object identity, no `chrome`, no timers. (FR-008, FR-018; data-model §2; research R2.)

**Checkpoint**: `npm test` green with the slot and identity tests; markers centralised; no product behaviour changed yet.

---

## Phase 3: User Story 1 — Pressing Translate several times translates the page once (Priority: P1) 🎯 MVP

**Goal**: However often the reader presses the translate control, the page is translated once: one
translation per readable passage, no translation of a translation, no transient duplication.

**Independent Test**: Press the popup's translate control five times in one animation frame, and separately
fire five `translatePage` messages at a fixture page within one second, 20 times over; every paragraph ends
with exactly one `[data-ipt="target"]` block whose text equals the single-activation result, and no unit's
source text is a rendered translation. Delivers a usable fix on its own: the reported symptom is gone even
before restore hardening (US2) and cost accounting (US3) land.

### Tests for User Story 1 ⚠️ Write these FIRST — they must fail

- [X] T010 [P] [US1] Extend `tests/unit/segmenter.test.ts` with the ownership cases (build the JSDOM documents the file already uses): (a) a page holding a `<div data-ipt="target" lang="zh">译文</div>` inside a paragraph yields **no** queued unit for it and leaves `result.skipped` unchanged versus the same page without the div — the prune is silent, not a new `SkipReason`; (b) a `<li>` containing its own translation container yields **no** unit whose `sourceText` includes the rendered text, and the list item's own text is not silently lost from the same pass; (c) a page with no markers segments byte-identically to today (same unit count, ids and order). Run and record the red output. (FR-004, FR-005, FR-017; contract §3 of page-markup-ownership.)
- [X] T011 [P] [US1] Create `tests/dom/job-repeat.test.ts` using `tests/dom/job-harness.ts` (`startJob`, `FakeCaller`, `DeferredCaller`). **(a) RED today**: run one job over a two-paragraph page, then construct a second job over the same document and run it — assert that the second job's `units` contain **no** entry whose `sourceText` includes a rendered translation (today it contains both, so this fails until T012). **(b) The composition the page agent relies on**: replay the first job's journal, then run the second job — exactly **two** `[data-ipt="target"]` blocks, one per paragraph, no unit whose `sourceText` is or contains a translation, and the two source paragraphs still present. **(c) No transient duplicate**: with `DeferredCaller`, release a batch and assert no paragraph ever shows two translations at the moment a result lands. (FR-004, FR-005, FR-006.)

### Implementation for User Story 1

- [X] T012 [US1] Add the ownership guard to `src/content/segmenter.ts`: at the **top** of the walk loop in `segmentPage` (before `skipReasonFor`), `if (element.getAttribute("data-ipt") === TARGET_MARKER) continue;` — pruning the subtree before any text is read (`textContent`, `subtreeText`), with no `skipped += 1`, no unit, no duplicate. Import `TARGET_MARKER` from `./markers.js`. Makes T010 green. (FR-005, FR-017; research R4.)
- [X] T013 [US1] Wire the slot into the page agent in `src/content/index.ts`: keep `job`, `observer`, `lastStatus`; add `const slot = new RunSlot()`. In `startTranslation`, call `slot.claim({ sameTarget })` **before** the first `await` (`await settings(true)`), and on `absorb-running`/`absorb-repeat` return immediately with `{ ok: true, absorbed: true, reason }`, touching no settings, no provider, no DOM and no budget. Call `slot.markRunning()` when the job is created, and `slot.settle(...)` on **every** exit path: `completed`, `failed` (including the unsupported-page and no-provider refusals, which settle `failed` before a job exists — the claim always precedes the refusal, so repeat presses on such a page report once, per data-model §4) and `cancelled`. Change the `translatePage`/`translateSelection` replies in `handleCommand` to include `absorbed` and `reason` (`"running" | "repeat"`); leave `toggleTranslation`, `cancelJob`, `getJobStatus` and `JobStatusPayload` untouched. (FR-001, FR-002, FR-003, FR-007, FR-014, FR-015; contract §3–§5; data-model I1–I4 and §4.)
- [X] T014 [US1] Add target identity to `src/content/index.ts`: store the claimed target beside the slot (`{ kind: "page" } | { kind: "selection"; elements: Element[] }`) and compute `sameTarget` **only** through the `sameTarget()` helper proven in T008/T009 — never inline, never by text comparison. A second `translateSelection` over the same blocks must absorb; a different selection must not. (FR-008, FR-018; data-model §2; research R2.)
- [X] T015 [US1] Append the US1 core cases to `tests/e2e/repeat-translate.spec.ts`: (a) **20 trials**, each a fresh load of `tests/fixtures/pages/news-article-a.html` followed by five `repeatCommand` activations within one second, and in every trial exactly one target block per paragraph with the text equal to that fixture's single-activation result, while polling every 100 ms for the whole non-idle duration that no passage ever holds two translations (`expect.poll` with `intervals: [100]` on `translationsPerPassage`); (b) five activations, wait for completion, five more → still one per passage (the stale-control window of FR-002); (c) the same five-activation run on `tests/fixtures/pages/forum-thread.html` and `tests/fixtures/pages/docs-table.html` (container-tag placement) → no passage duplicated, no translation text that contains a translation. Record the trial count in the spec's comment header. (SC-001, SC-003, SC-004; FR-001, FR-004.)
- [X] T016 [US1] Append the reader-action and late-content cases to `tests/e2e/repeat-translate.spec.ts`: (a) **the reader's own action** — open `extension.popupUrl`, press `#translate` **five** times within one animation frame via `clickTranslate(page, 5)`, then assert one translation per passage and a single run's request count (spec US1 scenario 1; constitution III); (b) **late content between presses** — on `tests/fixtures/pages/news-article-a.html`, inject a new paragraph between two activations, then assert the injected paragraph is translated exactly once and nothing on the page is a translation of a translation. (FR-002, FR-004, FR-017; SC-001, SC-004.)
- [X] T017 [US1] Append the boundary cases to `tests/e2e/repeat-translate.spec.ts`: (a) **presentation changes between presses** — switch display mode and display style between two activations, assert one translation per passage and that the last chosen presentation is the one shown, with no request made on account of the press; (b) **all-skipped page** — `tests/fixtures/pages/news-zh.html` with target language `zh`, five activations → zero provider requests and one status; (c) **selection requested during a whole-page run** — `selectPassage` then `translateSelection` while the page run is in flight is absorbed: no output from two runs ever coexists, no extra request is issued, and the page stays restorable (contract §3 absorb rule; see the Notes entry on this case). (FR-001, FR-006, FR-007; SC-002; edge cases of spec.md §Edge Cases.)
- [X] T018 [US1] **US1 gate**: `npx vitest run tests/unit/run-slot.test.ts tests/unit/segmenter.test.ts tests/dom/job-repeat.test.ts` green, `npx playwright test tests/e2e/repeat-translate.spec.ts` green for the US1 cases, with the red state of T006/T008 (modules absent), T010 and T011(a) recorded before T012/T013, and the US1 e2e cases recorded red before T013. Record T015's trial count and the observed target counts. Stop and demonstrate the MVP here: five presses, one translation per passage. (SC-001, SC-011.)

**Checkpoint**: The reported defect is fixed. The page can no longer hold two translations for one passage, and product output is never segmented.

---

## Phase 4: User Story 2 — One turn-off still returns the page exactly as it was (Priority: P1)

**Goal**: After any number of activations, turning translation off restores the page exactly, including
when translation is turned off while the run is still going, and a replacement never leaves output from
an earlier run.

**Independent Test**: Five activations, wait, turn translation off — zero `[data-ipt]` nodes, structural
`domHash` equal to the pre-translation capture, scroll position unchanged. Then turn off mid-run and
confirm nothing appears afterwards.

### Tests for User Story 2 ⚠️ Write these FIRST — they must fail

- [X] T019 [P] [US2] Extend `tests/dom/restorer.test.ts`: **(a) RED today** — a job restored while a batch is in flight must render nothing afterwards: drive it with `AbortableCaller`/`DeferredCaller`, restore, release the batch, assert 0 `[data-ipt="target"]` blocks (today a late reply still renders, which is the defect research R6 found). **(b)** A restore after a replaced run leaves an exact `domHash`, 0 residue, and no `data-ipt` on the page's own blocks. **(c)** The page's own paragraphs still exist after restore — the guard against research R5's failure mode, where the residue audit removed `data-ipt="source"` blocks and emptied the article. Run and record the red output for (a). (FR-010, FR-011, FR-012.)
- [X] T020 [US2] Add the **replace** path to `src/content/index.ts`: when `slot.claim` returns `replace`, call `previous.cancel()` then `previous.restore()` **before** resolving settings, building the job or writing any DOM, so at most one journal has ever written to the page (data-model I6, research R5). Then proceed as `start`. (FR-007, FR-008, FR-012.)
- [X] T021 [US2] Fix restore in `src/content/index.ts`: `restore()` must (1) `job.cancel()`, (2) `portClient.cancelPending()`, (3) stop the observer, (4) `job.restore()` (journal replay), (5) `slot.reset()`, clear the stored target, set `job = null` and broadcast `idle` — in that order. It must remain idempotent on an untranslated page. (FR-010, FR-011, FR-012; data-model I4, I7; research R6.)
- [X] T022 [US2] Append the restore cases to `tests/e2e/repeat-translate.spec.ts`: (a) five activations on `tests/fixtures/pages/news-article-a.html` → turn translation off → zero `[data-ipt]`, `domHash` equal to the capture taken before translating, scroll position unchanged; (b) slow provider (`latencyMs`), activate, turn off while in flight → nothing appears afterwards and residue stays zero. (SC-005; FR-010, FR-011.)
- [X] T023 [US2] Append the replacement cases to `tests/e2e/repeat-translate.spec.ts`: (a) whole-page translation, then `selectPassage` + `translateSelection` for one paragraph → the page never holds two sets, one translation per passage, and turn-off restores exactly; (b) turn off, then activate once → the same single-activation result, with nothing from the earlier run reappearing; (c) selection-only run first, then a page-wide activation → the selection's output is removed first, the page ends with exactly one translation per passage and no passage left untranslated, and turn-off restores exactly (spec edge case; FR-008, FR-012). (SC-005, SC-009.)
- [X] T024 [US2] **US2 gate**: `npx vitest run tests/dom/restorer.test.ts` green, US2 e2e cases green, with T019(a) recorded red before T021 and the mid-run turn-off e2e case recorded red before T021. (SC-005, SC-011.)

**Checkpoint**: The reader can always get their page back, no matter how often they pressed.

---

## Phase 5: User Story 3 — A repeat press costs the reader nothing extra (Priority: P2)

**Goal**: An absorbed press issues no request, consumes no session or site allowance, changes no reported
count, and duplicates no failure, cap or provider notice; pages in different tabs stay independent, the
translation still lays out correctly in every direction and zoom, and the run's state is announced once.

**Independent Test**: Compare the stub provider's `requests.length`, the reported counts and the usage
record after one activation and after five, measuring each run from a freshly reset session so the
baseline spends nothing: identical. With a failing provider, with no provider and with a capped run, ten
activations produce exactly one notice each.

- [X] T025 [US3] Append the cost cases to `tests/e2e/repeat-translate.spec.ts`: (a) five activations → `stub.requests.length` equals the single-activation count, and every request body is the single-run segmentation — **measure the baseline from a clean session**: reset the stored `limits` (and any allowance-affecting `chrome.storage.local` keys) between the two measurements, or run each measurement in its own extension context, so the available allowance is identical; (b) five activations → `jobStatus` `counts` and `usage` equal the single-activation figures measured the same way. (SC-002, SC-006; FR-013.)
- [X] T026 [US3] Append the failure, cap and provider cases to `tests/e2e/repeat-translate.spec.ts`: (a) stub mode `serverError`, ten activations → exactly one failure reported and the request count is the single-run count; (b) a capped run (`limits.sessionCapSegments` below the page's passage count), ten activations → exactly one cap notice, no passage over the cap translated, no second run; (c) provider disabled or routing resolving to none, ten activations → exactly one provider report and zero requests (spec edge case). (SC-008; FR-014; SC-002 via the request count.)
- [X] T027 [US3] Append the timing case to `tests/e2e/repeat-translate.spec.ts`: on `tests/fixtures/pages/article-long.html` (123 paragraphs), one activation and five activations both complete, the five-activation duration is within 5% of the single-activation duration, and the request counts are identical. (SC-007; FR-006; research R9.)
- [X] T028 [US3] Make the no-work guarantee explicit in `src/content/index.ts`: the absorb branch must return before `settings(true)`, before `resolveProvider`, before `new VolumeBudget(...)` and before `new TranslationJob(...)` — add a comment citing FR-013 so the ordering cannot drift, and confirm `emit`/broadcast is not called on the absorb path. Verify that `src/content/limiter.ts` and `src/content/job.ts` are **not** modified by this feature (absorb must not touch the budget). (FR-006, FR-013; data-model I5; research R9.)
- [X] T029 [US3] Append the independence, direction and announcement cases to `tests/e2e/repeat-translate.spec.ts`: (a) two tabs, both activated repeatedly at the same time → each page holds exactly one translation per passage, neither is absorbed or delayed by the other, and each tab is charged only for its own passages — an absorbed press adds no charge and no passage is charged twice within one tab; (b) a right-to-left target (`ar`) on `tests/fixtures/pages/docs-rtl.html` after five activations, and the same page at 200% zoom → one translation per passage, no horizontal page scroll, no overlap; (c) keyboard operation (`Alt+T`, and `Tab`+`Enter` on the popup control) leaves focus and scroll position unchanged when an activation is absorbed, and the run's state is asserted through the accessibility tree — the status element is a live region (`role="status"` or `aria-live="polite"`) whose text changes once per run, not once per press. (FR-009, FR-020; SC-010, SC-012.)
- [X] T030 [US3] **US3 gate**: run `npx playwright test tests/e2e/repeat-translate.spec.ts` with the US3 cases present and confirm T025's request-count assertion equals the single-activation baseline recorded in that spec; write the observed counts into the spec's comment header. (SC-002, SC-006, SC-008.)

**Checkpoint**: All three stories work, independently verifiable, with cost accounting intact.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, scope discipline and the full gate.

- [X] T031 [P] Document the reader-visible rule in `README.md`: pressing the translate control again while a page is being translated or already translated does nothing new; to translate again, turn translation off first. One short paragraph next to the existing behaviour bullets — no new feature list entry. (FR-002, FR-015.)
- [X] T032 [P] Prove nothing else changed: `npx vitest run tests/unit/i18n-audit.test.ts tests/unit/settings.test.ts tests/unit/messages.test.ts` green, `git diff --stat` shows **no** change to `src/_locales/en/messages.json`, no new `STORAGE_KEYS` entry in `src/shared/settings.ts`, no `schemaVersion` bump, and `package.json`/`package-lock.json` untouched. (FR-019; constitution IV; quickstart §1.)
- [X] T033 [P] Confirm scope discipline on the working tree: the feature's diff touches only `src/content/{index,segmenter,markers,renderer,observer,run-slot}.ts`, `tests/{unit,dom,e2e,support}` and `README.md`. The in-flight popup/options visual redesign (`src/ui/**`, `src/_locales/**`, `scripts/build.mjs`, `.taste-skill/`, `specs/006-popup-settings-redesign/`) must be neither reverted nor extended by this feature (FR-019; constitution IV; plan.md, Structure Decision).
- [X] T034 Run the full gate from `package.json`: `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`. All green, nothing skipped, no test loosened, `tests/unit/run-slot.test.ts` and `tests/dom/job-repeat.test.ts` included in the run. (FR-016, SC-011.)
- [X] T035 (automated equivalent passed; dev-provider hand walk blocked by a occupied port 8787; the live-region assertion in T029(c) stands in for the AT check, a human screen-reader spot-check is still recommended) Walk [quickstart.md](./quickstart.md) §3 by hand against `npm run dev:provider` and `dist/`: steps 1–6 pass, and the dev provider's console shows one round of requests for five presses and none for the repeats. Record the observed request count next to SC-002. Then do the one check the browser suite cannot make: with a screen reader (or the browser's accessibility inspector), confirm a run announces its status **once**, not once per press, and that the translated passage is read as a single target-language passage. (SC-002, SC-012.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: needs Setup. **Blocks every user story.**
- **US1 (Phase 3)**: needs Foundational. Delivers the MVP.
- **US2 (Phase 4)**: needs Foundational and **T013/T014** (it extends the same claim/absorb path in
  `index.ts`; the journey and its tests are independent, the file is not).
- **US3 (Phase 5)**: needs Foundational and T013 (absorption is what it measures). Its assertions also
  cover the US2 replace path once T020/T021 land, so it is sequenced last in practice.
- **Polish (Phase 6)**: needs all three stories.

### User Story Dependencies

- **US1 (P1)**: independent — the reported defect alone.
- **US2 (P1)**: independently testable as a journey (restore), shares `index.ts` with US1.
- **US3 (P2)**: independently testable as a journey (cost, reporting, direction, announcement), depends on
  US1's absorb branch.

### Within Each User Story

Tests first and red → guard/module → page-agent wiring → e2e → gate. `src/content/index.ts` is a single
file: T013 → T014 → T020 → T021 → T028 strictly in order, never in parallel.

### Parallel Opportunities

- Phase 1: T001 and T002 (`tests/support/e2e-fixtures.ts` vs. no file change).
- Phase 2: T003, T004, T005 and T006 all touch different files and can run at once; then T007 → T008 → T009
  strictly in order (one module and its one test file).
- Phase 3: T010 (`tests/unit/segmenter.test.ts`) and T011 (`tests/dom/job-repeat.test.ts`) in parallel;
  T012 and T013 touch different files and can run once their tests are red (`segmenter.ts` vs `index.ts`);
  T014 follows T013; the e2e tasks T015/T016/T017 are sequential (same file).
- Phase 4: T019 is parallel with Phase 3 work; T020 → T021 sequential (same file).
- Phase 5: T025/T026/T027/T029 all append to the same spec file — sequential; T028 touches `index.ts` and
  may run alongside them once T021 has landed.
- Phase 6: T031, T032 and T033 in parallel; T034 and T035 last.

---

## Parallel Example: User Story 1

```bash
# Both failing tests are independent files and land together:
npx vitest run tests/unit/segmenter.test.ts        # T010: product output is never segmented or counted
npx vitest run tests/dom/job-repeat.test.ts        # T011: the regression — four target blocks today

# Then the two implementation sides of the same story, in different files:
#   T012  src/content/segmenter.ts   → the ownership prune
#   T013  src/content/index.ts       → claim / absorb / settle
```

## Parallel Example: Phase 2

```bash
# Four independent files, one checkpoint:
#   T003  src/content/markers.ts        (new constants)
#   T004  src/content/renderer.ts       (import + re-export)
#   T005  src/content/observer.ts       (use the constants)
#   T006  tests/unit/run-slot.test.ts   (red decision table)
npx vitest run tests/dom/renderer.test.ts tests/dom/observer.test.ts   # T004/T005 keep behaviour

# Then, in order, because they share one module and one test file:
#   T007 → src/content/run-slot.ts      (the slot, green)
#   T008 → tests/unit/run-slot.test.ts  (same-target rule, red)
#   T009 → src/content/run-slot.ts      (sameTarget(), green)
```

---

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Phase 1 (T001–T002), Phase 2 (T003–T009).
2. Phase 3 (T010–T018): tests red, ownership guard, slot wiring, target identity, e2e core (20 trials),
   reader action, boundary cases, gate.
3. **STOP and VALIDATE (T018)**: five presses — by wire and by clicking the popup control — produce one
   translation per passage on paragraphs, list items and table cells, over 20 trials. The reported defect
   is gone; ship or demo from here if pressure demands it.

### Incremental Delivery

1. Foundation + US1 → the defect is fixed and the page can no longer be duplicated (MVP).
2. US2 → "turn translation off" is trustworthy again after any number of presses, including mid-run, and
   a selection-then-page transition never leaves two sets behind.
3. US3 → the cost story survives: one run's requests, one failure notice, one cap notice, one provider
   report, tabs independent, RTL and zoom unaffected, status announced once.
4. Polish → documentation, scope audit, full gate, hand verification against the dev provider.

### Parallel Team Strategy

1. One developer completes Phase 1 and Phase 2 (they are small and everything depends on them).
2. Then: developer A takes US1 (ownership guard + slot wiring + identity + e2e), developer B starts T019
   (restorer tests) in parallel. When T013 lands, B continues with T020/T021 and A closes out the US1 e2e
   cases (T015/T016/T017).
3. US3 is one developer appending e2e cases after US1, plus the ordering check in `index.ts` (T028).
4. Polish is a single reviewer pass: it is where the constitution's quality gates are confirmed.

---

## Notes

- [P] = different files, no incomplete dependency. Never parallelise two tasks on `src/content/index.ts`,
  `src/content/run-slot.ts`, `tests/unit/run-slot.test.ts` or `tests/e2e/repeat-translate.spec.ts`.
- Every implementation task names its FR and the test that proves it (constitution I: traceability).
- A red test is a deliverable: record T006, T008, T010, T011(a) and T019(a) failing before their fixes,
  because SC-011 requires the regression to fail before and pass after.
- **The selection-during-run question is settled, not open**: `spec.md` §Edge Cases now states that
  every activation during a run is absorbed, including one that asks for a selection; a replacement
  happens only once the previous run has ended. That matches this task list (T017(c)),
  `contracts/activation-lifecycle.md` §3 and `data-model.md` §1.2. Changing it again is a specification
  change that MUST move all four together.
- SC-001/SC-003 are verified at their stated scale: T015 runs **20 trials** with 100 ms sampling, so the
  criterion is decidable rather than approximately asserted.
- Do not weaken, skip or delete an existing assertion to get green (constitution II).
- No new dependency, storage key, locale string or control label anywhere in this task list (FR-019).
- Commit after each task or logical group; stop at each checkpoint to validate the story on its own.