---

description: "Task list for Translation Display Styles and Their Preview Icons"
---

# Tasks: Translation Display Styles and Their Preview Icons

**Input**: Design documents from `/specs/002-translation-display-styles/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution principle II makes test-first non-negotiable, so every behavior task
below has a test task that must exist and fail first. Principle III requires the acceptance-facing
tasks to run in a real Chromium against real `chrome.storage.local`.

**Organization**: Tasks are grouped by user story so each story is independently implementable,
testable, and demonstrable. Story phases follow spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task — safe to run in parallel
- **[Story]**: US1–US4, mapping to [spec.md](./spec.md); absent for Setup, Foundational, and Polish
- Every task names the file it touches and the requirement it satisfies

## Path Conventions

Single project at repository root: `src/` (shipped), `tests/` (never shipped), `scripts/`
(verification). Paths follow the tree in [plan.md](./plan.md) "Source Code".

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the baseline and the files every later phase edits. No product behavior yet.

- [x] T001 Run `npm ci`, `npm run typecheck` and `npm test` on a clean checkout and record the green baseline in the change description; confirm the two pre-existing gaps this feature touches — `src/content/index.ts` does not handle the `setDisplayMode` command, and `src/shared/settings.ts` registers no migration — before editing either file (constitution II)
- [x] T002 [P] Add the fifteen style names and the Display-panel strings to `src/_locales/en/messages.json`: `displayStyleNone`, `displayStyleUnderlineDashed`, `displayStyleUnderlineSolid`, `displayStyleBorderDashed`, `displayStyleBorderSolid`, `displayStyleBlur`, `displayStyleTransparency`, `displayStyleUnderlineDotted`, `displayStyleDivider`, `displayStyleHighlight`, `displayStyleMarker`, `displayStyleMarker2`, `displayStyleQuote`, `displayStyleWeakened`, `displayStyleGray`, plus `tabDisplay`, `displayTitle`, `displayStyleLabel`, `displayStyleSample`, `displayStyleSave`, `displayStyleSaved` (FR-001, FR-022)
- [x] T003 [P] Create `src/styles/display-styles.css` as the shared treatment stylesheet and ship it: declare it beside `styles/content.css` in `src/manifest.json` and copy it alongside `content.css` in `scripts/build.mjs`, so `dist/styles/display-styles.css` is injected (FR-006; contracts/rendering-styles.md section 2)

**Checkpoint**: Baseline recorded; catalogue strings and the shared stylesheet file exist and ship.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The catalogue, the persisted preference, and the live-style message. All four stories read
these; none can start before they exist.

**⚠️ CRITICAL**: No user story work can begin until this phase completes.

- [x] T004 [P] Add `DisplayStyleId` (union of the fifteen ids), `UiSettings.displayStyle` and `SitePreference.displayStyle?` to `src/shared/types.ts`, quoting the data-model constraints verbatim: "Optional in storage; missing or unknown resolves to `none`" and "Optional; must be a catalogued id when present" (FR-004, FR-019)
- [x] T005 Create `src/shared/display-styles.ts` implementing contracts/display-style-catalog.md: the ordered fifteen-entry catalogue with `id`, `order` (contiguous 0–14), `nameKey`, `treatment`, `concealment`, `foregroundPolicy` and `icon`; `DEFAULT_DISPLAY_STYLE = "none"`; `isDisplayStyleId`; `resolveDisplayStyle`. Constraints verbatim: "exactly fifteen entries; ids unique and stable; every entry has a name key and an icon; `concealment: true` only for blur, transparency, weakened" (FR-001, FR-020)
- [x] T006 [P] Create `tests/unit/display-styles.test.ts`: fifteen entries, fixed order matching FR-001, stable unique ids, every `nameKey` present in the catalogue, unknown id resolves to `none` without throwing (FR-001, FR-020, FR-022)
- [x] T007 Create the v1 → v2 migration in `src/shared/migrations.ts` and register it in `src/shared/settings.ts`; bump `CURRENT_SCHEMA_VERSION` to 2 and extend `mergeDefaults` so absence means `none` and an unknown stored id is ignored rather than rewritten (data-model: "Absence means `none`"; FR-004, FR-020, FR-021)
- [x] T008 [P] Extend `tests/unit/migrations.test.ts` from `tests/fixtures/storage/v1.json` and create `tests/fixtures/storage/v2.json`: v1 loads as v2 with `ui.displayStyle = "none"`, the step is idempotent, a failed step persists nothing, and a newer-schema profile is still refused (FR-004, FR-021, SC-013)
- [x] T009 [P] Add the `setDisplayStyle` and `styleChanged` commands to `src/shared/messages.ts` and parse them: `style` must be a string; an unknown id is accepted and resolves to `none` rather than rejected (FR-002, FR-020)
- [x] T010 [P] Extend `tests/unit/messages.test.ts`: both new commands parse, an unknown style id is accepted (resolves to `none`), a non-string style is rejected, and no payload admits a credential field (FR-020, FR-021)
- [x] T011 Handle `styleChanged` in `src/background/service-worker.ts`: forward `{type:"setDisplayStyle", style}` to every tab, ignore tabs without the content script, and answer `{ok:true}` (FR-002; contracts/settings-and-messages.md section 4.2)

**Checkpoint**: Catalogue, persistence and message plumbing are in place; the four story phases can proceed.

---

## Phase 3: User Story 1 - Choose how translations look and have it stick (Priority: P1) 🎯 MVP

**Goal**: A reader picks one of the fifteen styles for the device, it applies to the page already
translated, and it survives reloads and restarts.

**Independent Test**: Translate a fixture page, choose "Highlight" in the options Display panel, and
confirm every translated block is highlighted within a second with no new provider request; reload the
page and restart the browser and confirm the highlight persists.

### Tests for User Story 1 (write first, must fail) ⚠️

- [x] T012 [P] [US1] Create `tests/dom/renderer-style.test.ts`: `data-ipt-style` is applied to every rendered block including `none`; switching rewrites it without re-inserting nodes; switching to the same style is a no-op; the DOM hash after restore equals the pre-render hash; 20 switches add no journal growth; the attribute composes with all three display modes and with selection-only rendering (FR-002, FR-003, FR-006, FR-011, FR-015, FR-016, FR-017, SC-004, SC-009)
- [x] T013 [P] [US1] Create `tests/e2e/display-styles.spec.ts` (US1 scenarios): the options Display panel lists exactly the fifteen styles in order; selecting one restyles an already-translated fixture page within 1 s with zero provider requests (assert the stub provider's request log); the choice survives reload and browser restart; the page control shows the same selection after the options change (FR-002, FR-003, FR-004, FR-005, SC-002, SC-003)

### Implementation for User Story 1

- [x] T014 [US1] Extend `src/content/renderer.ts`: accept `displayStyle` in `RenderOptions`, set `data-ipt-style` (including `none`) through the journal on every container, and add `setDisplayStyle(style)` that rewrites it on all rendered records without creating, moving or detaching nodes (FR-002, FR-003, FR-011, FR-015, FR-016)
- [x] T015 [US1] Carry `displayStyle` through `src/content/job.ts`: add it to `JobOptions`, pass it to the renderer, and expose `setDisplayStyle` that delegates without touching unit state or issuing requests (FR-002, FR-003)
- [x] T016 [US1] In `src/content/index.ts`: read the device-wide `ui.displayStyle`, pass it to the job, handle the `setDisplayStyle` command by updating cached settings and the live renderer, and route the existing `setDisplayMode` command through the same live-update path (FR-002, FR-005)
- [x] T017 [P] [US1] Fill in the twelve non-concealment treatments in `src/styles/display-styles.css`: none, dashed/solid underline, dashed/solid border, dotted underline, divider, highlight, marker, marker-2, quote, gray; selectors keyed only on `[data-ipt-style="<id>"]`, logical properties, no `!important`, no page-global rules (FR-001, FR-006, FR-011, FR-014)
- [x] T018 [P] [US1] Create `src/ui/shared/style-picker.ts`: a native radio group over the catalogue (fieldset legend, one labelled radio per style, names only at this stage), with a sample element the live value will drive (FR-005, FR-006, FR-008)
- [x] T019 [US1] Add the Display panel to `src/ui/options/options.html`, render the picker and the current selection in `src/ui/options/options.ts`, save to `ui.displayStyle`, send `styleChanged` after saving, and subscribe to `chrome.storage.onChanged` to re-render on external changes (FR-002, FR-004, FR-005)
- [x] T020 [US1] Add the style picker to `src/ui/popup/popup.html` and wire `src/ui/popup/popup.ts`: show the resolved style, persist the selection, send `setDisplayStyle` to the tab, and subscribe to `chrome.storage.onChanged` (FR-002, FR-005)

**Checkpoint**: US1 is demoable — styles can be chosen, applied live, and persisted. This is the MVP.

---

## Phase 4: User Story 2 - See what a style looks like before committing (Priority: P1)

**Goal**: Every style option carries a preview icon, and the picker shows a live sample of the selected
style before it is saved.

**Independent Test**: Open the picker by keyboard and with a screen reader; confirm fifteen distinct,
labelled icons, that the live sample updates before saving, and that labels survive 200 % zoom.

### Tests for User Story 2 (write first, must fail) ⚠️

- [x] T021 [P] [US2] Create `tests/dom/style-preview.test.ts` (SVG generation needs a DOM): every catalogued style yields exactly one icon, the fifteen descriptors are pairwise distinct in their own right, and every icon carries `role="img"` with an accessible name equal to the style name (FR-007, FR-008, FR-010, SC-001, SC-006)
- [x] T022 [P] [US2] Extend `tests/e2e/display-styles.spec.ts`: each option renders an icon next to its name; changing the selection updates the live sample before saving; the picker is fully keyboard-operable and announces names and selected state; icons and names remain legible and unclipped at 200 % zoom (FR-007, FR-008, FR-009, FR-010, SC-006, SC-011)

### Implementation for User Story 2

- [x] T023 [US2] Create `src/ui/shared/style-preview.ts`: generate one inline SVG per catalogue entry from its `icon` descriptor (text bars plus the style's mark), `role="img"`, `<title>` from the localised name, shape as well as `currentColor`, no external assets (FR-007, FR-008, FR-010)
- [x] T024 [US2] Enhance `src/ui/shared/style-picker.ts`, `src/ui/options/options.html` and `src/ui/options/options.css`: render each option's icon beside its name and a live sample that follows the selection before saving (FR-007, FR-009, FR-010)
- [x] T025 [P] [US2] Add icons to the page control: `src/ui/popup/popup.html`, `src/ui/popup/popup.ts`, `src/ui/popup/popup.css` reuse the shared picker and icon generator, keeping the compact popup layout usable at 200 % zoom (FR-005, FR-007, FR-010)

**Checkpoint**: US1 and US2 together satisfy the original request: styles plus their icons.

---

## Phase 5: User Story 3 - Study and low-emphasis styles stay readable and accessible (Priority: P2)

**Goal**: Blur, transparency and weakened reveal on hover and keyboard focus, stay available to
assistive technology, and every style meets contrast on light and dark pages.

**Independent Test**: Choose Blur, reveal each translation by pointer and by keyboard, read the page with
a screen reader, use find and copy, and measure gray/weakened contrast on light, dark and mid-gray pages.

### Tests for User Story 3 (write first, must fail) ⚠️

- [x] T026 [P] [US3] Add contrast fixtures under `tests/fixtures/pages/`: a light page, a dark page, a tinted page and a mid-luminance page with a paragraph and a heading, referenced by the contrast checks (SC-008)
- [x] T027 [P] [US3] Create `tests/unit/contrast.test.ts`: relative luminance and alpha compositing are correct; weakened/gray foregrounds reach 4.5:1 (normal) and 3:1 (large) on white, black, tinted and `#777`/ `#808080` backdrops; the black-or-white fallback always reaches at least 4.58:1; the same backdrop yields the same colour (FR-013, SC-008)
- [x] T028 [P] [US3] Extend `tests/dom/renderer-style.test.ts`: a concealment style adds `data-ipt-conceal="true"` and `tabindex="0"`; a non-concealment style removes both; switching repeatedly adds no duplicate journal entries; restore removes both and the DOM hash matches; the `lang` attribute and text node are untouched (FR-012, FR-015, FR-018, SC-007)
- [x] T029 [P] [US3] Extend `tests/e2e/a11y.spec.ts`: Tab reaches a concealed translation and reveals it, the focus outline is visible, a screen reader sees the full text, find and copy return the text, forced-colors emulation keeps text legible with a typographic cue, and reduced-motion adds no transition (FR-012, FR-013, FR-018, SC-007, SC-008)

### Implementation for User Story 3

- [x] T030 [US3] Create `src/shared/contrast.ts`: sRGB parsing, relative luminance, alpha compositing, contrast ratio, effective-backdrop walk, and `safeForeground(backdrop, policy)` implementing hue-blend (weakened) and neutral (gray) with the 4.5:1/3:1 floor and the black-or-white fallback (FR-013)
- [x] T031 [US3] Extend `src/content/renderer.ts`: for concealment styles set `data-ipt-conceal` and `tabindex="0"` (journalled) and remove them on switch; for `weakened`/`gray` compute the foreground with `src/shared/contrast.ts` and write it as `--ipt-style-fg` through CSSOM, journalled; skip detached nodes (FR-012, FR-013, FR-018)
- [x] T032 [US3] Extend `src/styles/display-styles.css`: blur, transparency and weakened initial states; `:hover` and `:focus` reveal with no transition; `:focus-visible` outline; `@media (forced-colors: active)` fallback (filters off, underline cue, system colours); `prefers-reduced-motion` guard (FR-012, FR-018)

**Checkpoint**: All three concealment styles are safe to ship; contrast is measured, not assumed.

---

## Phase 6: User Story 4 - Let each site decide how translations look (Priority: P2)

**Goal**: A site can override the device-wide style, and removing the override returns it to the global
choice without re-translating.

**Independent Test**: Set global Highlight and a site override Quote, open a page on each of two sites,
confirm each uses the expected style; remove the override and confirm the site returns to Highlight.

### Tests for User Story 4 (write first, must fail) ⚠️

- [x] T033 [P] [US4] Extend `tests/e2e/display-styles.spec.ts`: a site override wins on the matching site and not elsewhere; removing it returns the site to the global style without a provider request; changing the global style leaves the override intact; a stored override naming an unknown style renders `none` without blocking translation (FR-019, FR-020, SC-010)
- [x] T034 [P] [US4] Extend `tests/unit/display-styles.test.ts`: `resolveDisplayStyle` prefers a catalogued site override, falls back to the global default, then `none`; an unknown override is ignored rather than propagated; source is reported as `site`, `global` or `default` (FR-019, FR-020, SC-010)

### Implementation for User Story 4

- [x] T035 [US4] Extend `src/content/index.ts` with `displayStyleFor(settings)` using feature 001's site matcher: site override → global → `none`, passed to the job at start (FR-019, FR-020)
- [x] T036 [US4] Add the site style control to `src/ui/options/options.html` and `src/ui/options/options.ts`: a style select on the site form (including "inherit"), saving `sites[].displayStyle`, showing the style in the site list, confirming via `styleChanged` (FR-019)
- [x] T037 [US4] Extend `src/ui/popup/popup.ts` so a selection made on a matched site is written as that site's override (creating the site preference when absent) and sent live, leaving other sites on the global style (FR-019)

**Checkpoint**: All four stories work independently; site precedence matches language and display mode.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Make the feature decidable per release and update the documentation the project promises.

- [x] T038 [P] Create `scripts/verify-styles.mjs` and add `verify:styles` to `package.json`: render all fifteen styles in real Chromium, capture each, assert the 105-pair distinctness matrix, restore hash per style, the contrast table on light and dark pages, the three-mode × two-direction layout matrix, and the 100-block restyle time (FR-013, FR-014, FR-015, SC-001, SC-002, SC-004, SC-005, SC-008, SC-012)
- [x] T039 [P] Record the style-level re-baseline obligation: update `tests/fixtures/captures/README.md` and `scripts/verify-rendering.mjs` so a capture carries the style in effect and the comparison checks it (SC-012)
- [x] T040 [P] Add `tests/e2e/long-labels.spec.ts`: substitute labels 30 % longer than English and assert no clipping or overlap in the picker at 200 % zoom (FR-022, SC-011)
- [x] T041 [P] Update `README.md` and `specs/002-translation-display-styles/quickstart.md` to document the fifteen styles, the Display panel, the site override and the new `verify:styles` command (constitution I; SC-012)
- [x] T042 Calibrate the pairwise distinctness threshold against weakened vs gray in `scripts/verify-styles.mjs` and record the calibration in its help text, closing research R8's open item (SC-001)
- [x] T043 [P] Extend `tests/unit/settings.test.ts` and `tests/e2e/us2-privacy.spec.ts`: delete-all-local-data removes the style, the next load reports `none`, and no style key stores page content (FR-021, SC-013)
- [x] T044 Run the full validation: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e:local`, `npm run verify:styles`, then walk [quickstart.md](./quickstart.md) section 5 on a loaded `dist/` (all SCs; constitution III)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 first, then T002/T003 in parallel
- **Foundational (Phase 2)**: depends on Setup; **blocks all four stories**
  - T004 → T005 → T006; T004 → T007 → T008; T004 → T009 → T010 → T011
- **User Stories (Phases 3–6)**: depend on Foundational
  - US1 has no dependency on other stories (T014 → T015 → T016; T017/T018 in parallel after T005; T019/T020 after T018)
  - US2 extends US1's picker surface (T023 → T024, and T024 → T025); testable independently once US1's picker exists
  - US3 extends US1's renderer (T030 → T031 → T032); testable independently
  - US4 extends US1's persistence and surface (T035 → T036/T037); testable independently
- **Polish (Phase 7)**: depends on the stories it measures; T038/T042 belong together

### User Story Dependencies

- **US1 (P1)**: can start after Foundational — no story dependencies; delivers the MVP
- **US2 (P1)**: soft dependency on US1 (same picker component); adds icons and the live sample
- **US3 (P2)**: soft dependency on US1 (same renderer); adds concealment and contrast
- **US4 (P2)**: soft dependency on US1 (same persistence and picker); adds per-site precedence

### Within Each User Story

- Test tasks MUST be written and FAIL before the implementation tasks they cover
- Renderer/job/content order for US1; contrast → renderer → CSS order for US3
- Story complete and independently demonstrated before moving to the next priority

### Parallel Opportunities

- Setup: T002 and T003
- Foundational: T006, T008, T010 after their producers; T004 precedes all data-shape work
- US1: T012 and T013 (tests); T017 and T018 (different files); T019 and T020 (different surfaces) once T018 exists
- US2: T021 and T022 (tests); T024 and T025 (different surfaces) once T023 exists
- US3: T026, T027, T028 and T029 (all different files); T030 precedes T031/T032
- US4: T033 and T034 (tests); T036 and T037 (different surfaces) after T035
- Polish: T038, T039, T040, T041 and T043 in parallel; T042 depends on T038

---

## Parallel Example: User Story 1

```bash
# Tests first, in parallel (different files):
Task: "T012 renderer-style DOM tests in tests/dom/renderer-style.test.ts"
Task: "T013 picker/live-apply/persistence e2e in tests/e2e/display-styles.spec.ts"

# Then the two independent implementation slices:
Task: "T017 twelve non-concealment treatments in src/styles/display-styles.css"
Task: "T018 native radio-style picker in src/ui/shared/style-picker.ts"
```

## Parallel Example: User Story 2

```bash
# Tests in parallel, then the two surfaces:
Task: "T021 icon descriptor tests in tests/dom/style-preview.test.ts"
Task: "T022 icon/live-sample/zoom e2e in tests/e2e/display-styles.spec.ts"
Task: "T024 icons + live sample in src/ui/shared/style-picker.ts and src/ui/options/"
Task: "T025 compact popup picker in src/ui/popup/"
```

## Parallel Example: User Story 3

```bash
# Fixtures and tests in parallel:
Task: "T026 light/dark/tinted/mid-gray fixtures in tests/fixtures/pages/"
Task: "T027 contrast math tests in tests/unit/contrast.test.ts"
Task: "T028 concealment DOM tests in tests/dom/renderer-style.test.ts"
Task: "T029 a11y e2e tests in tests/e2e/a11y.spec.ts"
```

## Parallel Example: User Story 4

```bash
# Tests in parallel, then the independent surfaces:
Task: "T033 site-override e2e in tests/e2e/display-styles.spec.ts"
Task: "T034 resolution precedence tests in tests/unit/display-styles.test.ts"
Task: "T036 site style control in src/ui/options/"
Task: "T037 popup site override in src/ui/popup/popup.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational)
2. Complete Phase 3 (US1)
3. **STOP and VALIDATE**: choose a style, see an already-translated page restyle with zero requests, reload, restart
4. Demo the MVP

### Incremental Delivery

1. Setup + Foundational → catalogue, persistence and message plumbing ready
2. US1 (P1) → styles work end to end → demo (MVP)
3. US2 (P1) → icons and live sample → demo (the full request as written)
4. US3 (P2) → concealment and contrast safety → demo
5. US4 (P2) → per-site precedence → demo
6. Polish → `verify:styles`, docs, calibration, full validation

### Parallel Team Strategy

1. Team completes Setup and Foundational together
2. After Foundational:
   - Developer A: US1 (renderer, job, content, options, popup)
   - Developer B: US2 (icons and picker enhancement) once US1's picker lands
   - Developer C: US3 (contrast module, concealment CSS/attributes) once US1's renderer lands
3. US4 follows US1's persistence; Polish follows the stories it measures

---

## Notes

- [P] tasks touch different files and have no incomplete dependency
- [Story] labels map each task to its spec story for traceability
- Every task names the requirement it satisfies; a task without one must be re-derived or dropped (constitution I)
- Constitution II forbids greening a test by loosening it, skipping it, or excluding a file
- Constitution III requires the acceptance-facing tasks (e2e, `verify:styles`) to run against the real extension, real storage and real layout
- Stop at each checkpoint and validate the story independently before continuing
- The two research open items become T039 and T042; neither blocks earlier phases
