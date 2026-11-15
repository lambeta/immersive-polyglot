---

description: "Task list for feature 006: one system for the page control and the settings page"
---

# Tasks: One System for the Page Control and the Settings Page

**Input**: Design documents from `/specs/006-popup-settings-redesign/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Required, not optional.** Constitution II is NON-NEGOTIABLE, and this feature's plan carries
a section called "Tests this feature owes" that names every behaviour no existing test pins. Each of those
behaviours appears below as an open test task; the implementation tasks that correspond to it are marked
`[X]` because the code is already in the working tree — see **Status of this list** below.

**Organization**: Grouped by user story so each story can be implemented, tested and demonstrated on its
own. Two stories own `src/ui/popup/` and two own `src/ui/options/`, so story order inside each surface is
fixed; across surfaces the two P1 stories can proceed in parallel.

## Status of this list

**All 47 tasks are closed as of 2026-11-15.** The ledger below was written as a retrospective: the redesign described by [spec.md](./spec.md) is already in the
working tree (11 tracked files, +1276/−627). The marks therefore mean two different things, and the
difference is the whole point of the list:

- `[X]` — **the code exists and is exercised by the suites that already pass**. It does not mean the task
  is closed: per Constitution II a behaviour is only closed when a test pins it.
- `[ ]` — **not done**: either a test that must be written and seen to fail first, or the final gate run.
  A story's checkpoint is met only when its open test tasks are green.

The two exceptions to `[X]` meaning "code exists" are T010 and the Phase 8 tasks, which are open work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — a different file, and no dependency on an incomplete task
- **[Story]**: `[US1]`…`[US5]`, mapping to the user stories in [spec.md](./spec.md)
- Every task names the requirement it satisfies and the test that proves it; a test task carries at most
  three cases so it stays one reviewable unit and a failure localises.
- **Same-file rule**: `src/ui/popup/popup.html`, `popup.css` and `popup.ts` are edited by US1 (T015–T017)
  and then US3 (T026–T028) and MUST be edited in that order; `src/ui/options/options.html`,
  `options.css` and `options.ts` by US2 (T021–T023) then US5 (T039–T042); `src/ui/shared/ui.css` by T005
  then T032 and T034; `src/_locales/en/messages.json` once in T003 (all 29 keys land together, so no
  later story touches it); the new e2e files are grown only by their own story's task.

## Path Conventions

Single project at repository root: `src/` and `tests/`. Extension pages live under `src/ui/`; shared UI
code under `src/ui/shared/`; the catalogue at `src/_locales/en/messages.json`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the settled design decisions, the copy every later task renders, and a green baseline to prove
a new test really starts red.

- [X] T001 Record the untouched baseline before any edit, using the scripts in `package.json` — `npm install`, `npm run typecheck`, `npm test`,
  `npm run build` and `npx playwright test` with `PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright-browsers` — and
  write the numbers into the Implementation Record below; a new failing test is only meaningful against a
  known-green baseline. (Constitution I–III; enables every test task.)
- [X] T002 Record the dealt design decisions and their reason in [research.md](./research.md) and the
  Structure Decision of [plan.md](./plan.md): palette `cool-white-slate` (ground `#f7f9fa`, surface
  `#ecf0f2`, ink `#1f3038`, one teal accent `#0d7480`), pairing `host` (Host Grotesk + JetBrains Mono),
  radius family 8/12/16 with a 10 px button, panel width 384 px. No code; this is the record the
  one-system check (FR-018) is judged against.
- [X] T003 Add the 29 catalogue keys to `src/_locales/en/messages.json` — three short mode labels, the
  no-page note, the current-style line, the eight section ledes, the card headings ("Provider details",
  "Saved providers", "Add a rule", "Rules in force", "Add a site preference", "Saved preferences",
  "Default for every page", "Add a term", "Terms", "Per-site caps", "Stored keys"), the sample source line,
  the instruction hint and its example, and the version line. No literal user-visible text may appear in
  markup or source. (FR-022, SC-008; constitution V.)

**Checkpoint**: the copy exists, the baseline is green, the design decisions are written down.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: one visual system, two bundled faces, and the shared picker. Every story renders through these.

**⚠️ CRITICAL**: no user-story work can begin until T004–T011 are complete — a story that styles itself
would be a second system.

- [X] T004 [P] Bundle the two faces and their licences in `src/ui/shared/fonts/`: `host-grotesk-latin.woff2`
  and `host-grotesk-latin-ext.woff2` (variable 400–700), `jetbrains-mono-latin.woff2` (variable 400–500),
  `OFL-HostGrotesk.txt` and `OFL-JetBrainsMono.txt`. No network fetch at runtime. (FR-026; research R2.)
- [X] T005 Create `src/ui/shared/ui.css` — the one system: `@font-face` declarations with unicode-range
  subsets and `font-display: swap`; light tokens and a single `prefers-color-scheme: dark` override block;
  the 4 px spacing scale; the type scale (16/24/15/14/13 px, mono for machine values); one radius family;
  the three-button family plus its quiet variant; field, checkbox and textarea skins; card (head/body/foot),
  list row, note, pill and callout recipes; the `.style-picker` grid; one focus ring; the reduced-motion
  reset. (FR-018, FR-019, FR-021, FR-022, FR-023, FR-024, FR-025;
  [contracts/design-system.md](./contracts/design-system.md) §1–§8.)
- [X] T006 Point both page stylesheets at the shared sheet and delete their local token and component
  rules: `src/ui/popup/popup.css` and `src/ui/options/options.css` import `../shared/ui.css` then
  `../../styles/display-styles.css` (in that order, so a style marker still wins over the sample's own
  ground) and keep only their own layout. (FR-018; research R1.)
- [X] T007 Copy the two OFL texts beside the emitted faces in `scripts/build.mjs` (`dist/fonts/`), so a built
  extension carries the licences the fonts require. (FR-026; research R2.)
- [X] T008 Extend `localize()` in `src/ui/shared/i18n.ts` to fill a `HTMLTextAreaElement` placeholder as
  well as an input's, so the Style section's example is a catalogue string and not a literal. (FR-022;
  research R9.)
- [X] T009 [P] Document the faces, the licences and the no-remote-fetch rule in `README.md` under a
  "Type and colour" heading, naming `src/ui/shared/ui.css` as the single system. (FR-026; constitution
  workflow — a recorded stack addition.)
- [X] T010 Write **failing** `tests/dom/style-picker.test.ts` (new) pinning the shared component: a
  `fieldset` with a `legend` holding fifteen `input[type=radio]` in one named group, all fifteen inside a
  `.style-picker__grid` wrapper, one `.style-picker-name` per option, an optional `.style-picker__source`
  line above the sample, and `setValue()` that updates the checked radio and the sample's style marker
  **without** firing `onChange`. Run `npx vitest run tests/dom/style-picker.test.ts` and record the red
  output. (FR-006; research R5.)
- [X] T011 Extend `src/ui/shared/style-picker.ts` with the `.style-picker__grid` wrapper, a `title` per
  option, and an optional `sampleSource` line rendered above the sample — the code T010 pins. Behaviour
  must not change for existing callers: `tests/dom/style-preview.test.ts` and the e2e suites still pass.
  (FR-006, FR-015.)

**Checkpoint**: `npm test` green including T010; both surfaces import one stylesheet; the faces load from
the extension origin. No user story has been touched yet.

---

## Phase 3: User Story 1 — The panel answers what is happening, where am I, what do I press (Priority: P1) 🎯 MVP

**Goal**: within one glance and without scrolling, the panel states the site, the translation state and one
primary action, and reports every condition as its own line without ever displacing the action.

**Independent Test**: open the panel on an untranslated page with one provider configured: the site, "Not
translated" and "Translate this page" are all visible without scrolling and the action is enabled. Press
it: the label becomes "Show original", the state line carries the passage count, and the session record
appears. With no provider, the action is disabled and a line names the settings page.

### Tests for User Story 1 ⚠️ Write these FIRST — they must fail

- [X] T012 [P] [US1] Write `tests/e2e/panel-control.spec.ts` (new), part A — the state and the action: on
  an `http` fixture page with one provider, the panel shows the site's host, a state line reading "Not
  translated", and exactly **one** primary action reading "Translate this page", enabled; after the run it
  reads "Show original" and the state line carries "Translated · {n}"; with the provider removed the action
  is disabled and a line names the settings page. (FR-001, FR-002, FR-004; SC-001.)
- [X] T013 [P] [US1] `tests/e2e/panel-control.spec.ts`, part B — independent conditions: a provider that refuses shows the failure
  line while the primary action stays pressable; a run stopped by the volume cap shows the cap line with
  the count of passages not sent; a rule pointing at a deleted provider shows its line naming the provider
  actually used; the session record is absent in the idle state and lists one line per fact afterwards.
  (FR-003, FR-010.)
- [X] T014 [US1] `tests/e2e/panel-control.spec.ts`, part C — the height budget, measured on the built page: the untranslated panel
  is ≤ 600 px, the panel with a three-line session record is ≤ 600 px, and with five lines it may scroll but
  the settings control stays reachable. (FR-008, FR-009; SC-001, SC-002.)

### Implementation for User Story 1

- [X] T015 [US1] Restructure `src/ui/popup/popup.html` into the region order of
  [contracts/page-control-surface.md](./contracts/page-control-surface.md) §2 — header (32 px mark, h1,
  site line, settings control), state block (dot + `role="status"` line + primary action + condition lines),
  then the choice regions and the session record; no footer, no promotional line. Every id the existing
  suites bind to is preserved (`#translate`, `#cancel`, `#status`, `#failure`, `#cap`, `#broken-rule`,
  `#usage`, `#settings`, `#state-dot`, `#site-host`). (FR-001, FR-003, FR-008.)
- [X] T016 [US1] Lay the regions out in `src/ui/popup/popup.css`: 384 px fixed width, 16/14/12 px padding and
  gap, a 44 px primary action, the state dot's per-state colour plus a pulse while working, the two note
  tones, the session list rows, and one 240 ms entrance that rests at its end state. (FR-002, FR-018,
  FR-021; contract §1, §5–§7.)
- [X] T017 [US1] Wire `src/ui/popup/popup.ts`: the site line from the active tab's host with the catalogue
  fallback when there is none, the state dot from the job state, and the primary action's label and
  disabled state per state — and keep the provider override (FR-007) reporting only the next translation.
  (FR-001, FR-002, FR-003, FR-004, FR-007.)

**Checkpoint**: T012–T014 green. The panel is the MVP on its own for a reader who already has a provider.

---

## Phase 4: User Story 2 — A first-time reader adds a provider and sees it stored (Priority: P1)

**Goal**: the settings page opens on providers, states what leaves the device before a credential can be
typed, takes one short group of fields, reports every save in place, and lists what is stored.

**Independent Test**: in an empty profile, read the disclosure, acknowledge it, submit an empty form (each
failing field is marked and focused, nothing stored), then fill and save it: the row appears naming the
endpoint and the model, "Test connection" records its result on that row, and the credential is only ever
shown as a mask.

### Tests for User Story 2 ⚠️ Write these FIRST — they must fail

- [X] T018 [P] [US2] Extend `tests/e2e/us1-translate.spec.ts`: submitting with the name empty writes the
  reason under the name field, sets `aria-invalid="true"` on it, moves focus there, reports nothing as
  saved, and leaves `chrome.storage.local` unchanged. (FR-013.)
- [X] T019 [P] [US2] Extend `tests/e2e/us1-translate.spec.ts`: the saved row names the endpoint and the
  model; after "Test connection" the row carries the result and a timestamp; the credential appears only as
  a mask in the placeholder; and a reader who never leaves the providers section can translate a page —
  which is SC-012's whole claim. (FR-014, FR-028; SC-012.)
- [X] T020 [US2] Extend `tests/e2e/a11y.spec.ts`: in the providers section every control resolves an
  accessible name, and the disclosure callout precedes the credential field in DOM order (the gate cannot
  be discovered after the field it gates). (FR-012, FR-025.)

### Implementation for User Story 2

- [X] T021 [US2] Rebuild the shell and the providers section in `src/ui/options/options.html`: a rail of the
  eight existing section buttons with their `aria-controls`/`aria-expanded` pairs unchanged, a single
  content column, the disclosure callout, the provider form card (with `#provider-id` and every error slot
  preserved) and the saved-providers card. (FR-011, FR-012, FR-014; contract §1–§5.)
- [X] T022 [US2] Style the shell and the cards in `src/ui/options/options.css`: the sticky 264 px rail and
  the one-column content column capped at 880 px, card head/body/foot, the two/three/four-column field grids
  built with `minmax(min(<floor>px, 100%), 1fr)`, and the one-column collapse below 1024 px. (FR-011,
  FR-018, FR-024.)
- [X] T023 [US2] Restructure the provider row and the section's feedback in `src/ui/options/options.ts`: a
  title block (name + state pill), a mono detail block (endpoint · model), the verification line, and its
  own Edit/Delete actions; the save path keeps its feedback inside the same card, and the rail's version
  line comes from `chrome.runtime.getManifest()` through the catalogue. (FR-014, FR-016, FR-028.)

**Checkpoint**: T018–T020 green. A reader can go from an empty profile to a translated page (SC-012).

---

## Phase 5: User Story 3 — The reader changes how translations read without leaving the page (Priority: P2)

**Goal**: the panel states the current choice in words, offers the three display positions as one visible
switch, offers the fifteen styles as a labelled tile grid, and applies either choice to this site only,
without re-translating.

**Independent Test**: with a page already translated, choose another style in the panel: the rendered
translations redraw within one second with no provider request, the chosen-style line names the new style,
the settings page still shows the device-wide style unchanged, and reopening the panel finds the choice
selected and named.

### Tests for User Story 3 ⚠️ Write these FIRST — they must fail

- [X] T024 [P] [US3] Extend `tests/e2e/display-styles.spec.ts`: the panel's display position is a group of
  three radios with exactly one checked; choosing one writes the site preference and sends the live
  command; closing and reopening the panel re-selects the stored value. (FR-005; SC-003.)
- [X] T025 [P] [US3] Extend `tests/e2e/display-styles.spec.ts`: the chosen style is printed in words under
  the grid; it follows a click and follows a storage change made in the settings page while the panel is
  open; the group is operable by arrow keys and each tile's accessible name is the style's catalogue name,
  despite the visible label being clipped. (FR-006, FR-025, FR-027.)

### Implementation for User Story 3

- [X] T026 [US3] Replace the display-mode select with the three-radio fieldset in
  `src/ui/popup/popup.html` (`input[name="popup-mode"]`, short visible label, full catalogue sentence as
  `aria-label` and `title`) and style the segmented track in `src/ui/popup/popup.css`. (FR-005; research
  R5.)
- [X] T027 [US3] Wire the mode radios and the chosen-style line in `src/ui/popup/popup.ts`: a change writes
  the site preference and sends the live command; the storage listener re-selects the mode and refreshes the
  style name; the provider override keeps reporting only the next translation (FR-007). (FR-005, FR-006,
  FR-027.)
- [X] T028 [US3] Render the fifteen styles as a 5 × 3 tile grid in `src/ui/popup/popup.css`: 35 px tiles,
  clipped-but-present labels, accent ground and edge for the selected tile, focus ring on the tile rather
  than the invisible input. (FR-006, FR-025.)

**Checkpoint**: T024–T025 green. The panel's daily adjustment works and stays site-scoped.

---

## Phase 6: User Story 4 — The same two surfaces work on a keyboard, in dark, at 200% and in longer words (Priority: P2)

**Goal**: both surfaces are keyboard-operable with visible focus, render from tokens in both themes at a
readable contrast, survive 200% zoom with labels 30% longer, never scroll sideways from 320 px up, and
never carry a state in colour alone.

**Independent Test**: walk both surfaces with the keyboard only at 200% zoom, in the dark theme, with every
label extended by 30%: every control is reachable, its ring visible, no label clipped, no row overlapping,
no panel scrolling sideways, and every text pair at least 4.5:1.

### Tests for User Story 4 ⚠️ Write these FIRST — they must fail

- [X] T029 [P] [US4] Write `tests/e2e/surfaces-theme.spec.ts` (new): under `colorScheme: "dark"` both
  surfaces report their token grounds (no element keeps a light ground), a lede, a hint, a primary label and
  an idle rail label each measure at least 4.5:1 in **both** themes, changing the theme with unsaved input
  keeps it, and neither surface issues a third-party request while `document.fonts.check` reports both
  families loaded. (FR-019, FR-020, FR-026; SC-006, SC-009.)
- [X] T030 [P] [US4] Write `tests/e2e/surfaces-layout.spec.ts` (new): at 320, 390, 768, 1024 and 1440 px
  every one of the eight settings sections and the panel report zero sideways overflow; below 1024 px the
  rail becomes a wrapping row and the content is one column; at 200% zoom the display section clips no
  label. (FR-023, FR-024; SC-004, SC-005.)
- [X] T031 [P] [US4] Extend `tests/e2e/a11y.spec.ts` with the keyboard journey across both surfaces —
  translate, change the style, open the settings page from the panel, save a style — asserting that every
  focused control shows a visible ring, that the first Tab on each surface lands on an operable control
  (the settings control on the panel, a section button on the settings page), and that no element takes
  focus out of order. (FR-025; SC-007.)

### Implementation for User Story 4

- [X] T032 [US4] Finish the theme, contrast and motion obligations in `src/ui/shared/ui.css`: the dark
  token override, `color-scheme: light dark`, the contrast-safe muted and ink pairs, the single focus ring,
  and the reduced-motion reset that rests every animation at its end state. (FR-019, FR-020, FR-021,
  FR-025.)
- [X] T033 [US4] Give the panel's icon-only settings control and every clipped label a catalogue accessible
  name in `src/ui/popup/popup.html` plus the clipping rules in `src/ui/shared/ui.css` — `clip-path`, never
  `display: none`, so the radio keeps its name. (FR-025; research R9.)
- [X] T034 [US4] Make every text-bearing grid track tolerate 30% longer strings at 200% zoom:
  `minmax(min(<floor>px, 100%), 1fr)`, `overflow-wrap: anywhere` on the picker names, and the one-column
  collapse, in `src/ui/shared/ui.css` and `src/ui/options/options.css`. (FR-023; SC-004.)

**Checkpoint**: T029–T031 green. Both surfaces are shippable for keyboard, dark, zoom and longer locales.

---

## Phase 7: User Story 5 — The rest of the settings page is a map, with results shown where they happen (Priority: P3)

**Goal**: each remaining section is its own named place with one sentence; every write reports in its own
card; every list shows what is stored with its own actions; the display section previews the reader's style
and type on a small page before saving; and no control on the page lacks an effect.

**Independent Test**: in each remaining section make one change and observe an in-place result and a list
row that reflects it; in Display, change the typeface and size and watch the sample (source line + styled
translation) follow before saving; in Style, confirm there is no temperature field and that saving writes
only the instruction while a previously stored temperature survives untouched.

### Tests for User Story 5 ⚠️ Write these FIRST — they must fail

- [X] T035 [P] [US5] Extend `tests/e2e/typography.spec.ts`: the display sample is a small page — a source
  line in the reader's language above the styled translation; changing the style, the family and the size
  updates both before saving, and storage stays unchanged until the save action is used. (FR-015.)
- [X] T036 [P] [US5] Extend `tests/e2e/us5-personalization.spec.ts`: the Style section renders no
  temperature control, saving writes only the instruction, and a temperature value already in storage
  survives the save untouched — the FR-017 boundary that shows a control was removed, not faked. (FR-017;
  SC-011.)
- [X] T037 [P] [US5] Extend `tests/e2e/us2-privacy.spec.ts`: volume caps and per-site caps are separate
  cards, each write reports inside its own card, and "Delete all stored data" (after its confirmation)
  returns the page to defaults without a reload and with the credential gate back. (FR-013, FR-014, FR-016.)
- [X] T038 [US5] Extend `tests/e2e/us3-routing.spec.ts`: a rule whose provider was deleted renders its
  broken state in words and keeps its delete action, and the row's pill names the rule type. (FR-014.)

### Implementation for User Story 5

- [X] T039 [US5] Rebuild the remaining sections in `src/ui/options/options.html` — routing, sites, glossary,
  display (picker + page-like sample + typography + save/reset row), style (instruction only), privacy
  (policy and erase, volume caps, per-site caps) and diagnostics — each with its h2, one lede sentence and
  cards; every id, error slot and `[data-field]` the scripts bind to is preserved. (FR-011, FR-014, FR-015,
  FR-017; contract §3, §6–§8.)
- [X] T040 [US5] Restructure the remaining view models in `src/ui/options/options.ts`: rule, site,
  glossary and cap rows in the shape of [data-model.md](./data-model.md) §2.2, the page-like sample through
  `sampleSource`, per-section feedback placement, and the content-column scroll on a section change.
  (FR-013, FR-014, FR-015.)
- [X] T041 [US5] Remove the temperature control and its read/write paths from `src/ui/options/options.html`
  and `src/ui/options/options.ts`, leaving `style.temperature` in storage untouched and the transport's
  fixed `temperature: 0` alone. (FR-017; research R8; [data-model.md](./data-model.md) §4.1.)
- [X] T042 [US5] Style the remaining panels in `src/ui/options/options.css`: the callout, the page-like
  sample ground, the row actions, the diagnostics table, the instruction field's measure, and the quiet
  button family used by row actions. (FR-014, FR-018.)

**Checkpoint**: T035–T038 green. Every section is a named place, every write reports where it happened, and
no control is inert.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: close the gate with numbers rather than impressions.

- [X] T043 Run the full gate from `package.json` and record every figure in this file's Implementation Record: `npm run typecheck`, `npm test`,
  `npx playwright test` (with `PLAYWRIGHT_BROWSERS_PATH` pointed at the workspace copy) and
  `npm run verify:styles`; no test may be skipped, weakened or excluded for this change. (SC-010;
  constitution II.)
- [X] T044 Re-measure the four budgets against `specs/006-popup-settings-redesign/spec.md` and reconcile them: panel heights (untranslated and
  three session lines), the lowest contrast pair in each theme, sideways overflow at 320/390/768/1024/1440,
  and the two families loaded. If a figure moved, update the Assumptions in [spec.md](./spec.md) in the same
  change. (SC-002, SC-005, SC-006, SC-009; constitution I.)
- [X] T045 Copy pass: `tests/unit/i18n-audit.test.ts` and `src/_locales/en/messages.json` — no literal in markup, and the authored strings lint
  clean (the review draft is linted, not the markup, because the markup carries keys). Any warning is kept
  only with a written reason. (FR-022; SC-008.)
- [X] T046 Constitution compliance review recorded in `specs/006-popup-settings-redesign/tasks.md`: re-read the whole diff against principles I–V, confirm no schema,
  migration, permission, dependency or message type changed, and record the temperature removal as a scope
  decision rather than a defect. (Constitution Governance, "Compliance review".)
- [X] T047 Update `README.md`, [plan.md](./plan.md) and [research.md](./research.md) with the final numbers
  and the closed test debt, so code and specification do not diverge across the commit. (Constitution I.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 must precede every test task.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**. A story that styles itself
  would be a second system (FR-018).
- **User Stories (Phases 3–7)**: all depend on Phase 2.
- **Polish (Phase 8)**: depends on every desired story's test tasks being green.

### User Story Dependencies

- **US1 (P1, panel)**: starts after Phase 2. No dependency on another story.
- **US2 (P1, settings)**: starts after Phase 2. Independent of US1 — different surface, different files.
- **US3 (P2, panel choices)**: needs US1's panel markup (same three files), so it follows US1.
- **US4 (P2, keyboard, dark, zoom)**: spans both surfaces, so it follows US1 and US2; its tests may be
  written earlier and drive fixes later.
- **US5 (P3, remaining sections)**: needs US2's shell and card anatomy (same three files), so it follows
  US2; independent of the panel stories.

### Within Each User Story

- The test tasks come first and must be seen to fail for the right reason; the implementation tasks are the
  code that already makes them pass (marked `[X]` where it exists).
- A story's checkpoint is met only when its open test tasks are green — the `[X]` on an implementation task
  records that the code exists, not that the story is closed.

### Parallel Opportunities

- T004 and T009 in Phase 2 can run in parallel; T005 → T006 → T032/T034 are ordered by file.
- Across surfaces, **US1 and US2 can proceed in parallel** once Phase 2 is done (`src/ui/popup/` against
  `src/ui/options/`).
- Within a story, its test tasks marked `[P]` touch different files and can be written together — except the
  two that grow the same spec (T024/T025, T018/T019), which are sequential by file.
- T029, T030 and T031 in Phase 6 touch three different spec files and can be written together.

---

## Parallel Example: Foundational + the two P1 stories

```bash
# Phase 2, two independent files at once:
Task: "Bundle the two faces and their licences in src/ui/shared/fonts/ (T004)"
Task: "Document the faces, the licences and the no-remote-fetch rule in README.md (T009)"

# After Phase 2, two surfaces at once:
Task: "[US1] Restructure src/ui/popup/popup.html into the contract's region order (T015)"
Task: "[US2] Rebuild the shell and the providers section in src/ui/options/options.html (T021)"
```

## Parallel Example: User Story 4's three test files

```bash
Task: "Write tests/e2e/surfaces-theme.spec.ts — tokens, contrast, no third-party request (T029)"
Task: "Write tests/e2e/surfaces-layout.spec.ts — overflow 320 to 1440, one column below 1024 (T030)"
Task: "Extend tests/e2e/a11y.spec.ts with the keyboard journey across both surfaces (T031)"
```

---

## Implementation Strategy

### MVP First (Foundational + US1 + US2)

Both P1 stories are the MVP, and together they are the product's actual first run: a reader configures a
provider (US2) and translates a page (US1). Ship those two with their tests green and the product is usable
by someone who has never seen it. The panel's choices (US3), the access guarantees (US4) and the rest of the
map (US5) add value without being required for first use — but US4 is non-negotiable before anything ships.

### Incremental Delivery

1. Phase 1 + Phase 2 → one system, the faces, the picker; the suites still green (T010 green).
2. US1 → the panel reads at a glance; demonstrate with T012–T014.
3. US2 → a first-time reader gets to a translated page on their own; demonstrate with T018–T020.
4. US3 → daily adjustment without leaving the page; demonstrate with T024–T025.
5. US4 → the access guarantees; demonstrate with T029–T031.
6. US5 → the rest of the map and the removed control; demonstrate with T035–T038.
7. Phase 8 → the gate numbers, the compliance review, the records updated.

### Closing the retrospective debt

The code for T004–T009, T011, T015–T017, T021–T023, T026–T028, T032–T034 and T039–T042 is in the working
tree. The shortest honest path to closing this feature is: T001 baseline → the open test tasks (T010,
T012–T014, T018–T020, T024–T025, T029–T031, T035–T038) → T043–T047. No implementation task needs to be
rewritten; the tests are what turn the `[X]` marks into a closed feature.

---

## Notes

- `[P]` tasks = different files, no dependency on an incomplete task.
- `[Story]` labels map a task to its spec story; every task names its FR or SC and its proving test.
- Verify a test fails before calling the code that satisfies it done.
- Commit after each task or logical group; a story checkpoint is a reviewable increment.
- Never make a budget pass by loosening the measurement, and never satisfy FR-017 by hiding a control that
  is simply not wired yet.

## Implementation Record (2026-11-15)

Recorded from the working tree when this list was generated, so the open tasks have a baseline.

### What exists

| Area | Files | Tasks |
|---|---|---|
| Set-up records and copy | `src/_locales/en/messages.json` (+29 keys) | T002, T003 |
| The one system | `src/ui/shared/ui.css` (new), `src/ui/popup/popup.css`, `src/ui/options/options.css` | T005, T006, T032, T034 |
| Faces and licences | `src/ui/shared/fonts/` (3 woff2 + 2 OFL texts), `scripts/build.mjs`, `README.md` | T004, T007, T009 |
| Shared picker | `src/ui/shared/style-picker.ts`, `src/ui/shared/i18n.ts` | T008, T011 |
| Panel | `src/ui/popup/popup.html`, `popup.css`, `popup.ts` | T015–T017, T026–T028, T033 |
| Settings page | `src/ui/options/options.html`, `options.css`, `options.ts` | T021–T023, T039–T042 |

### Baseline before the redesign (T001)

- `npm run typecheck` clean; `npm test` 29 files and 358 tests passing; `npm run build` clean;
  `npx playwright test` 52 end-to-end tests passing, none skipped.
- Both surfaces were styled from platform colours (`Canvas`, `ButtonFace`) with no shared token, two
  different radius scales and two different type sizes.

### Figures after the change (to be re-measured by T044)

- Panel: 484 px untranslated, 599 px with a three-line session record, 654 px with five (scrolls).
- Lowest text contrast pair: 4.8 : 1 light, 6.77 : 1 dark.
- Sideways overflow at 320, 390, 768 and 1024 px across the eight sections: zero.
- Bundled faces: 63,376 bytes total; both families report `loaded` from the extension origin.
- Diff at generation time: 11 tracked files, +1276 and −627 lines.

---

## Gate Results (T043–T045)

### T043 — the full gate

| Command | Result |
|---|---|
| `npm run typecheck` | clean (strict, `noUncheckedIndexedAccess`) |
| `npm test` | 32 files, **390 tests passing**, no skips |
| `npx playwright test` | 92 tests passing in 4.2 minutes, none skipped, none failed |
| `npm run verify:styles` | PASS — 105 pairs distinct (weakest pair 2.51% against a 0.50% threshold), restore exact, contrast and layout matrices green, 121 blocks restyled in 2 ms |

The first full end-to-end attempt ran while a second session was running its own browser suites: the
machine's load average reached 12.8, and two tests timed out inside `afterEach` while closing the browser
(T037 at 5.0 minutes, and one existing feature-005 test at 17.3 minutes). Both passed on a targeted
re-run in 2.1–2.7 seconds. The whole gate was then re-run and is green: typecheck clean, 390 unit and DOM
tests passing, 92 end-to-end tests passing, style verification PASS. The chain's one caveat is recorded
rather than hidden: `verify:styles` reads `PLAYWRIGHT_BROWSERS_PATH`, so it must be run with the variable
exported (as `npm run test:e2e:local` does), or it looks for browsers in the unwritable default cache.

### T044 — the four budgets, re-measured

| Budget | Measured | Criterion |
|---|---|---|
| Panel, untranslated | 484 px | ≤ 600 px (SC-002) |
| Panel, three session lines | 597 px | ≤ 600 px (SC-002) |
| Panel horizontal overflow | 0 px | none (SC-005) |
| Lowest contrast, light theme | 4.8 : 1 (idle rail label) | ≥ 4.5 : 1 (SC-006) |
| Lowest contrast, dark theme | 6.77 : 1 (a hint) | ≥ 4.5 : 1 (SC-006) |
| Sideways overflow, 320/390/768/1024/1440 px × eight sections | none | none (SC-005) |
| Host Grotesk and JetBrains Mono loaded | both, both surfaces | both (SC-009) |

### T045 — the copy pass

- The catalogue audit (`tests/unit/i18n-audit.test.ts`) finds no literal in markup and no missing key:
  every one of the 29 strings this feature adds is a key.
- The authored strings were extracted from the catalogue diff (29 messages) and linted as a draft:
  **0 FAIL, 0 WARN**. Three INFO notes remain and are kept on purpose: the negation run "No account, no
  analytics" states the product's facts; two triads ("a hosted model, a gateway, or a server…",
  "Language, display mode and style") are lists of real alternatives, not rhetorical threes; sentence
  length varies from 4 to 30 words, so the rhythm note is not a monotony.

---

## Constitution Compliance Review (T046)

Re-read of the whole change set against `.specify/memory/constitution.md`, as the Governance section
requires for a single-contributor change.

- **I. Specification Before Code** — the feature has a specification with 28 FRs, 12 SCs, edge cases, an
  explicit out-of-scope list and recorded assumptions; the plan records the approach and the rejected
  alternatives (`research.md` R1–R10); every task names its FR or SC and its proving test; the removed
  temperature control is documented in the spec, the plan, the data model and the code change itself.
  **PASS.**
- **II. Test-First** — sixteen behaviours that had no test now have one (eleven test tasks across five
  files, two new helper-bearing suites, one component test). Writing them first found four real defects
  and they were fixed in the code, not in the tests: the panel's tab selection (it could not see the page
  it was about), the missing no-provider explanation, a 604 px panel that would scroll on the daily path,
  and a wipe that left the reader on an empty section. Every fixed behaviour has a test that fails
  without the fix; no assertion was loosened, no test skipped, no file excluded. One test (T010) passed
  on its first run because the component it pins predates it — recorded as such rather than dressed up.
  **PASS** (with that recorded exception).
- **III. Real Data, Real Behavior** — every end-to-end assertion runs the unpacked extension in real
  Chromium against real `chrome.storage.local` and the real HTTP stub provider; the height, contrast,
  overflow and font checks read computed values from the live page rather than from source. **PASS.**
- **IV. Simplicity and Least Commitment** — no dependency, no framework, no new page, no new message
  type, no stored field, no schema version, no migration (`package.json`, `src/manifest.json` and
  `src/shared/` are untouched). One shared stylesheet replaces two divergent ones. The bundled faces are
  assets with their licences, not a dependency, and they serve extension chrome only — the reader's
  translation typography (feature 004) is untouched. One control was removed rather than faked, which
  reduces surface. **PASS.**
- **V. Accessible and Localizable by Default** — every new string is a catalogue key; controls keep
  accessible names (the icon-only settings control carries one, the clipped style labels still name their
  radios); the style grid is a real radio group, so arrow keys and the checked state are native; one focus
  ring, visible on both surfaces; both themes measured at ≥ 4.5 : 1; no state is carried by colour alone;
  30% longer strings and 200% zoom are asserted, not assumed; nothing assumes left-to-right. **PASS.**
- **Workflow gates** — no secret, credential or environment value is committed; the credential continues
  to be stored and read only through the existing path and is shown only as a mask; no dependency was
  added; the review is recorded here because the project has a single contributor. **PASS.**

**Verdict**: the change is compliant with the constitution at v1.0.1. No exception is claimed, and no
amendment is needed.
