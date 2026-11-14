# Tasks: Divider Style Fix and Custom Translation Typography

**Input**: Design documents from `specs/004-translation-divider-font/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. The project constitution (Principle II) makes test-first non-negotiable, so every
behaviour below starts with a failing test, including the refused paths. The task template's
"tests are optional" note does not override the constitution.

**Organization**: Tasks are grouped by user story. The Divider story (US1) touches no file the
Foundational phase touches, so it can start immediately after Setup and forms the MVP on its own.
US2 and US3 need the Foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = Divider fix, US2 = typography preference, US3 = preview before saving
- Every task names the requirement it satisfies and the file it changes

## Path Conventions

Single project at the repository root: source in `src/`, tests in `tests/`, verification scripts in
`scripts/`, this feature's documents in `specs/004-translation-divider-font/`.

---

## Phase 1: Setup

**Purpose**: establish the pre-change baseline the constitution's test-first rule depends on.

- [X] T001 Run the untouched baseline gates — `npm install`, `npm run build`, `npm run typecheck`, `npm test` and, when a Chromium build is available, `npm run test:e2e:local` — and record the results in the task notes; any pre-existing failure must be known before a new test can be judged (Constitution Principles II and III)

---

## Phase 2: Foundational (blocks US2 and US3; US1 does not need it)

**Purpose**: the shared typography value, its persistence defaults and its validation, plus the
catalogue strings every later UI task uses.

**⚠️ CRITICAL**: US2 and US3 must not start until T002–T007 are complete.

- [X] T002 [P] Add the new Display strings to `src/_locales/en/messages.json`: `displayFontFamily`, `displayFontFamilyHint`, `displayFontSize`, `displayFontSizeHint`, `displayTypographyReset`, `displayTypographySaved`, `displayFontInvalid` and `displayFontSizeInvalid`; no literal user-visible text may appear in markup or source (FR-023, Constitution Principle V)
- [X] T003 [P] Add `TranslationTypography { fontFamily: string; fontScale: number }` and the optional `UiSettings` fields `translationFontFamily?: string` (absent/empty = inherit the page's font) and `translationFontScale?: number` (absent = 100; integer 50–200, multiple of 5) to `src/shared/types.ts` (FR-009, FR-010; data-model `1–`2)
- [X] T004 [P] Write failing unit tests in `tests/unit/settings.test.ts` for resolution and tolerance: defaults are `""`/`100`; a stored `""` is inherit; a stored `"Georgia, serif"` resolves unchanged; a stored scale of `101` resolves to `100`, `240` to `200`, `49` to `50`, `"big"` to `100`; saved values survive a reload with `schemaVersion` still 2 (FR-009, FR-012, FR-020)
- [X] T005 Implement the defaults in `defaultSettings()`, the tolerant normalisation in `mergeDefaults()` and `resolveTypography(settings)` in `src/shared/settings.ts` so T004 passes; invalid stored values fall back to `""`/`100` (FR-009, FR-012, FR-020; data-model `2`)
- [X] T006 [P] Write failing unit tests in `tests/unit/validation.test.ts` for `validateFontFamily` and `validateFontScale` using the accepted examples (`Georgia, serif`, `"Source Han Serif SC", "Noto Serif SC", serif`, `system-ui`, `思源宋体`) and refused examples (`Arial; color:red`, `url(https://x/y.woff2)`, `Arial }`, an unterminated quote, a 201-character value, `49`, `201`, `101`, `NaN`) from contract `3` (FR-017, FR-018)
- [X] T007 Implement `validateFontFamily`, `validateFontScale` and `validateTypography` in `src/shared/validation.ts` returning `ValidationIssue` values with the catalog keys from T002, so T006 passes and the UI never invents wording (FR-017, FR-018)

**Checkpoint**: the typography value, defaults and validation exist and are tested; US2/US3 can build on them. US1 can start in parallel with this phase.

---

## Phase 3: User Story 1 - Divider introduces the translation with a short dashed line (Priority: P1) 🎯 MVP

**Goal**: every Divider-styled translation is introduced by a short hairline dashed line of about
fifteen segments — never a full-width rule and never a line down an edge — with the preview icon and
live sample saying the same thing.

**Independent Test**: translate a fixture article, select Divider, and inspect each block: one short
dashed horizontal line (60–90 px) just above the translation, no full-width or edge decoration,
unchanged text styling; repeat in "above"/"only" modes and on an RTL page; switch style and confirm
no new provider request.

### Tests for User Story 1 (write first, confirm they fail) ⚠️

- [X] T008 [P] [US1] Extend `tests/e2e/display-styles.spec.ts` with a failing Divider geometry test: the computed `::before` box is 60–90 px wide (about fifteen dashes), 1 px dashed in the text colour, sits above the text, while the block itself has no block-start, inline-start or block-end border; switching into/out of Divider issues zero provider requests; run it for the below/above/only modes (FR-001, FR-002, FR-003, FR-005, FR-008; SC-001, SC-003)
- [X] T009 [P] [US1] Extend `tests/dom/renderer-style.test.ts` with a failing test that a Divider-styled block leaves the translation's text content, language, family, style, weight, alignment and colour declarations untouched, and marks only the container (FR-004, FR-006)
- [X] T010 [US1] Draw the Divider line in `src/styles/display-styles.css` with a `::before` box: `content: ""`, `display: block`, `width: 88px`, `max-width: 50%`, `border-block-start: 1px dashed currentColor`, `margin-block-end: 0.4em`; the block itself keeps no border. Leave every other style untouched, keep the existing forced-colors mapping and introduce no transition (FR-001, FR-002, FR-003, FR-004, FR-006; contract divider-presentation `1`–`2`, `5`)
- [X] T011 [P] [US1] Write a failing unit test in `tests/unit/display-styles.test.ts` asserting the Divider descriptor is `{ mark: "rule", pattern: "dashed" }` and that Quote keeps the solid `bar` mark, so the two icons cannot converge (FR-007; data-model `5`)
- [X] T012 [P] [US1] Write a failing DOM test in `tests/dom/style-preview.test.ts` asserting the Divider icon draws a short dashed horizontal line above the text bars (a `stroke-dasharray` line wider than it is tall and shorter than the bars), draws no vertical stroke, and that Quote keeps no dashed line (FR-007)
- [X] T013 [US1] Restore the `"rule"` mark in the union, set the Divider entry in `src/shared/display-styles.ts` to the descriptor from T011, and make the `rule` mark honour `pattern` in `src/ui/shared/style-preview.ts` so T011 and T012 pass (FR-007; research R7)
- [X] T014 [P] [US1] Write a failing DOM test in `tests/dom/renderer.test.ts`: a translated block whose target language is Arabic/Hebrew carries `dir="rtl"`; an English or Chinese target carries no `dir`; `setTargetLang` updates it; `removeUnit` / restore removes it and leaves the page hash unchanged (FR-001, FR-005; SC-002)
- [X] T015 [P] [US1] Write a failing unit test in `tests/unit/direction.test.ts` for `isRtlLanguage`: `ar`, `he`, `fa`, `ur`, `ps`, `ckb` true; `en`, `zh`, `ja`, `auto` false; region subtags (`ar-EG`, `he-IL`) and upper-case input classified correctly (FR-001)
- [X] T016 [US1] Add `src/shared/direction.ts` with `isRtlLanguage(lang)` and wire `#applyDirection` into `src/content/renderer.ts` — write `dir="rtl"` through `recordAttributeOnce` for RTL targets, remove it otherwise, and update it in `setTargetLang` — so T014 and T015 pass (FR-001, FR-005; research R2; contract divider-presentation `3`)
- [X] T017 [US1] Run `npm run verify:styles` and confirm the 105-pair distinctness matrix, restore hash, contrast table, mode × direction layout and restyle time all pass with the short dashed Divider; if Divider drifts below the 0.5 % threshold against another dashed style, widen the designed difference (line position above the block, short length, dash rhythm, hairline weight) — never lower the threshold or exclude the pair (FR-001, FR-003, FR-006; SC-001, SC-003; research R9)

**Checkpoint**: US1 is complete and independently demonstrable; Divider no longer renders a horizontal line or a stub, and RTL targets mirror it.

---

## Phase 4: User Story 2 - Reader chooses the typeface and size of translations (Priority: P1)

**Goal**: a device-wide font-family stack and a 50–200 % size scale, applied to translated blocks
relative to each source block, updating open pages live with no provider request and persisting
across reloads.

**Independent Test**: save a family and 125 % in Display settings; every translated block — heading,
paragraph, list item, table cell — switches family and grows by 25 % relative to its own source,
page-authored text is untouched, no request is issued; reload, restart and a new tab keep it; Reset
returns to the page's font at 100 %.

### Tests for User Story 2 (write first, confirm they fail) ⚠️

- [X] T018 [P] [US2] Write failing DOM tests in `tests/dom/renderer-typography.test.ts`: a custom family is applied with the source's computed family appended as the final fallback; scale 125 on an `h2` and a `p` produces different absolute sizes both 25 % above their own source; line-height scales with a px value and stays `normal` otherwise; scale 100 with no family writes no `font-size`/`line-height`/`font-family` override; switching back to defaults removes the overrides; restore leaves the page hash unchanged (FR-009–FR-015, FR-024; SC-005, SC-006, SC-011)
- [X] T019 [US2] Implement typography in `src/content/renderer.ts`: capture `baseFontFamily`/`baseFontSizePx`/`baseLineHeight` once per record, add `#applyTypography(record)` after `#inheritTypography` and before the foreground decision, add `setTypography(typography)` re-applying typography and foreground to every record, and journal the style attribute once per container so T018 passes (FR-009–FR-015, FR-019; data-model `4`)
- [X] T020 [P] [US2] Write failing unit tests in `tests/unit/messages.test.ts` for the new commands: valid `typographyChanged` and `setTypography` payloads parse; missing `typography`, a non-object, a numeric `fontFamily`, a non-finite `fontScale` and a credential-like field are refused with `MessageError` (FR-019; contract typography-settings `5`)
- [X] T021 [US2] Add `typographyChanged` and `setTypography` to `src/shared/messages.ts` (command union, type list, strict parser returning a fresh `{ fontFamily, fontScale }` object) so T020 passes (FR-019)
- [X] T022 [US2] Add `typography?: TranslationTypography` to `JobOptions` and a `setTypography` passthrough on `TranslationJob` in `src/content/job.ts`, passing the value into the `Renderer` constructor (FR-019)
- [X] T023 [US2] In `src/content/index.ts`, resolve typography from settings when a job starts, pass it through `JobOptions`, and handle the `setTypography` command by clearing the cached settings and calling `job?.setTypography(...)` without touching unit state (FR-019; contract typography-settings `5`)
- [X] T024 [US2] Relay `typographyChanged` in `src/background/service-worker.ts` to every tab as `setTypography`, matching the existing `styleChanged` pattern and ignoring tabs without a content script (FR-019)
- [X] T025 [US2] Add the Display-panel controls to `src/ui/options/options.html`: a labelled font-family text input with a hint that empty keeps the page's font, a labelled `type="number" min="50" max="200" step="5"` size input, a labelled Reset button, and error slots associated with each input (FR-022, FR-023; contract typography-settings `6`)
- [X] T026 [US2] Implement the Display-panel behaviour in `src/ui/options/options.ts`: prefill both fields from settings, validate with `validateTypography` on save, refuse the whole save (style included) on any issue with the specific catalog message and no storage write, save family + size + selected style together, notify every tab with `typographyChanged`, show the saved feedback, and implement Reset writing `""`/`100` and notifying (FR-017, FR-018, FR-019, FR-021)
- [X] T027 [P] [US2] Style the new Display rows, hints and error text in `src/ui/options/options.css` so the panel wraps at 200 % zoom and the sample keeps its existing frame (FR-023; SC-010)
- [X] T028 [P] [US2] Write end-to-end tests in `tests/e2e/typography.spec.ts`: saving a family and 125 % restyles every rendered block within 1 second with zero provider requests; values persist across reload, browser restart and a new tab; each invalid font and size input shows a message, keeps the previous values and leaves open pages unchanged; Reset restores the page's font at 100 % immediately; at 200 % scale no block overflows its container or forces horizontal scrolling at 1280 px and 400 px viewport widths (FR-016, FR-017–FR-021; SC-004, SC-006, SC-007, SC-008)

**Checkpoint**: US2 works on its own — typography can be set, applied, persisted and reset — regardless of US1.

---

## Phase 5: User Story 3 - Preview the result before committing (Priority: P2)

**Goal**: the Display panel's live sample shows the selected style together with the entered family
and size before saving, is fully keyboard/screen-reader operable, and survives 200 % zoom.

**Independent Test**: on the Display panel, select Divider, type a family and change the size; the
sample updates immediately without saving; navigate away and back and the sample and stored settings
show the last saved values; keyboard-only and 200 % zoom remain usable.

### Tests for User Story 3 (write first, confirm they fail) ⚠️

- [X] T029 [P] [US3] Write a failing e2e test (extend `tests/e2e/typography.spec.ts`) asserting the sample's computed family and size track the entered values on every input event while the saved settings and open pages stay unchanged until Save; after Save the sample keeps the saved values (FR-022; SC-010)
- [X] T030 [US3] Implement the live sample update in `src/ui/options/options.ts`: on `input` of either field, apply the entering family (with a fallback) and `<scale>%` size to the sample element only, using the same resolved form as the renderer, and never write settings; keep the sample's `data-ipt-style` in sync with the selected style (FR-022)
- [X] T031 [US3] Complete the accessibility wiring in `src/ui/options/options.html` and `src/ui/options/options.ts`: `aria-describedby` hints, error text in a polite live region with the input referenced, keyboard reachability in source order, and the size input exposing its current value, minimum and maximum (FR-023; SC-010)
- [X] T032 [P] [US3] Extend `tests/e2e/a11y.spec.ts` with a failing test: the Display panel is operable by keyboard alone, every control has an accessible name, a refused value is announced, and at 200 % zoom nothing is clipped (FR-023; SC-010)

**Checkpoint**: all three stories function independently, and the sample proves the result before saving.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T033 [P] Update `README.md` to describe Divider as a short dashed line above the translation and to list the custom translation font as a product capability (FR-001, FR-009)
- [X] T034 Run every quality gate from `quickstart.md` — `npm run build`, `npm run typecheck`, `npm test`, `npm run test:e2e:local`, `npm run verify:styles` — and record the outcome; no test may be skipped or loosened to pass (Constitution quality gates; SC-001–SC-011)
- [X] T035 Review the full diff against `.specify/memory/constitution.md` and `spec.md`, confirm every FR maps to at least one passing test and every task cites its FR; if implementation reality diverged, update `specs/004-translation-divider-font/spec.md` in the same change set (Constitution Principles I, II, IV)
- [X] T036 Audit the change against `package.json`, `src/shared/settings.ts`, `src/manifest.json` and `src/styles/display-styles.css`: no runtime dependency added, no new storage key, `schemaVersion` still 2 with no migration, no font fetched or bundled, no page-authored node restyled, no credential path touched (FR-025, Constitution Principle IV)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: first; everything else is judged against its recorded baseline.
- **Foundational (T002–T007)**: blocks US2 and US3. US1 does **not** depend on it because US1 touches
  only `display-styles.css`, `display-styles.ts`, `style-preview.ts`, `direction.ts`, `renderer.ts`
  (direction only) and their tests — files the Foundational phase never edits.
- **US1 (T008–T017)**: after T001; no dependency on US2/US3.
- **US2 (T018–T028)**: after T002–T007. Its renderer task T019 edits `renderer.ts`, which US1's T016
  also edits, so run T016 before T019 (or coordinate a single edit); every other US2 task is
  independent of US1.
- **US3 (T029–T032)**: after US2's T026 (the fields and save path) and after US1's T013 (the icon the
  sample pairs with). T029/T030 also follow T026.
- **Polish (T033–T036)**: after all three stories.

### Within each story

Tests first and failing (T008/T009/T011/T012/T014/T015 before T010/T013/T016; T018 before T019;
T020 before T021; T028 after T021–T027; T029/T032 before T030/T031), then implementation, then the
story's verification task.

### Task-level dependency summary

```text
T001
 ├─ US1: T008 T009 → T010 ; T011 T012 → T013 ; T014 T015 → T016 ; then T017
 └─ T002..T007 (Foundational)
      └─ US2: T018 → T019 ; T020 → T021 → T022 T023 T024 ; T025 → T026 ; T027 ; T028
           └─ US3: T029 → T030 ; T031 ; T032
                └─ T033..T036
```

---

## Parallel Opportunities

- **US1 tests**: T008, T009, T011, T012, T014 and T015 are six different test files — launch them
  together after T001.
- **US1 internals**: T010 (stylesheet), T013 (catalogue + icon generator) and T016 (direction +
  renderer) touch disjoint files and can follow their tests in parallel.
- **Foundational**: T002, T003, T004 and T006 are four independent files; T005 waits on T003/T004 and
  T007 on T002/T006.
- **US2 plumbing**: T021 (messages) then T022 (job), T023 (content), T024 (worker relay) and T025
  (options markup) are independent of each other; T027 (options CSS) runs alongside T026.
- **US3**: T029 and T032 are independent test files; T031 follows T026.

---

## Parallel Example: User Story 1

```bash
# Fail first, in parallel (six files, no dependencies):
Task: "e2e divider geometry in tests/e2e/display-styles.spec.ts"
Task: "DOM divider text untouched in tests/dom/renderer-style.test.ts"
Task: "unit divider descriptor in tests/unit/display-styles.test.ts"
Task: "DOM divider icon in tests/dom/style-preview.test.ts"
Task: "DOM RTL dir in tests/dom/renderer.test.ts"
Task: "unit isRtlLanguage in tests/unit/direction.test.ts"

# Then implement, in parallel where files differ:
Task: "divider rule in src/styles/display-styles.css"
Task: "descriptor + bar pattern in src/shared/display-styles.ts / src/ui/shared/style-preview.ts"
Task: "direction helper + renderer attribute in src/shared/direction.ts / src/content/renderer.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Complete T001.
2. Complete US1: T008–T017 (Foundational can run in parallel if a second contributor is available).
3. **STOP and VALIDATE**: run the US1 e2e tests and `npm run verify:styles`; demonstrate the
   short dashed line in the three modes and on an RTL page.
4. Demo the fixed Divider; typography is not required for this increment.

### Incremental delivery

1. T001 → US1 → validate → demo (MVP: the reported Divider defect is gone).
2. Foundational T002–T007 → US2 T018–T028 → validate → demo (custom family and size, persisted and
   live).
3. US3 T029–T032 → validate → demo (preview and accessibility).
4. Polish T033–T036 → full gates → review.

### Parallel team strategy

- Contributor A: US1 after T001 (independent of everything else).
- Contributor B: Foundational, then US2.
- Contributor C (after B's T026): US3.
- Coordinate only on `src/content/renderer.ts` (US1 direction vs US2 typography) and
  `src/ui/options/options.ts` (US2 save vs US3 sample).

---

## Notes

- [P] means different files and no dependency on an incomplete task.
- Every story is independently completable and testable; US1 is deliberately dependency-free.
- Verify each test fails for the right reason before implementing.
- Commit after each logical group; do not mark a task complete with a failing or skipped test.
- Avoid changing `specs/002-translation-display-styles/contracts/display-style-catalog.md` beyond the
  supersession note already recorded in the plan phase.

---

## Completion Notes

- **Completed**: 2026-11-14, all T001–T036.
- **Final treatment (per the requester's clarifications)**: Divider is one **short** hairline dashed
  horizontal line of about fifteen segments (88 px, capped at half the block's width) just above the
  translation, never a full-width rule, never a short stub of one or two dashes, and never a line down
  an edge. The requester corrected the design twice — first from a leading-edge vertical rule to
  "是横向的分割线", then to "横向的虚线，但是只有15个左右段" — and the spec, plan, research, data
  model, contract, quickstart, task descriptions, tests and icon were updated in the same change set
  each time (Constitution I).
- **Typography**: device-wide font-family stack plus a per-block 50–200 % size scale (5 % steps),
  applied after inheritance, relayed live with `typographyChanged` → `setTypography`, previewed in the
  Display panel, refusable with the previous value kept, persistable without a schema bump.
- **Gates (recorded)**: `npm run build` PASS; `npm run typecheck` PASS; `npm test` 358/358 PASS;
  `npm run test:e2e:local` 51/51 PASS; `npm run verify:styles` PASS (105 pairs, weakest
  underline-dashed vs underline-dotted at 2.51 %, restore 2205 == 2205, modes × direction, restyle
  121 blocks in 6 ms).
- **Requirement trace**: every FR-001…FR-025 is cited by at least one task above and covered by a
  unit, DOM or e2e test; docs and code were updated together.
