# Implementation Plan: One System for the Page Control and the Settings Page

**Branch**: `006-popup-settings-redesign` (the working tree stays on `master`; this project registers
no `before_plan` hook) | **Date**: 2026-11-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-popup-settings-redesign/spec.md`

## Summary

Rebuild the extension's two surfaces — the page control (the extension panel) and the settings page —
as one designed system instead of two browser-default forms, without touching the translation
pipeline, the storage schema, or the definition of the fifteen display styles.

The approach is a **single extension-owned design system** (`src/ui/shared/ui.css`: tokens, type
scale, spacing scale, one radius family, one button family, one card, one focus ring, light and dark
themes, one motion layer) that both surfaces import, plus **two faces bundled with the extension**
(Host Grotesk for words, JetBrains Mono for machine-written values) so the panel and the settings page
never ask a font host for anything. The panel becomes a one-column 384 px surface with one primary
action, a three-way display switch built from a real radio group, and the fifteen styles as an
icon-tile grid whose chosen name is also printed in words. The settings page becomes a sticky rail of
eight named sections over a single content column of cards, where every write reports its result next
to the control that caused it and the Display section previews the reader's style and type on a real
page sample before saving.

Two boundaries are held deliberately. First, **no stored shape changes**: the feature reads and writes
the existing settings profile through the existing store, so there is no schema version bump and no
migration. Second, **one control is removed rather than faked**: the translation temperature field had
no effect on any request (the request body is fixed by the published provider-adapter contract), so
FR-017 requires its absence. Wiring it would change that contract, which is out of scope here.

The change described by this plan is already in the working tree. Per Constitution I it is recorded
here as a plan, and the behaviours it introduces that no test pins yet are enumerated in
[Tests this feature owes](#tests-this-feature-owes) so they cannot be declared done by omission.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict, `noUncheckedIndexedAccess`), ES modules for extension
pages; Node.js 20 LTS for tooling only.

**Primary Dependencies**: none at runtime (platform APIs only, including the bundled `@font-face`
files). Build: Vite 5.4.10. Tests: Vitest 2.1.4, jsdom 25.0.1, Playwright 1.48.2, @types/chrome
0.0.287 — all pinned; no package added by this feature.

**Storage**: unchanged. `chrome.storage.local` through `SettingsStore` (`src/shared/settings.ts`),
`schemaVersion` 2, same keys. New UI strings are not persisted; newly referenced settings (display
style, typography, provider flags) already exist.

**Testing**: Vitest unit tests (`tests/unit`) and jsdom DOM tests (`tests/dom`) for shared logic and
the style-picker preview marks; Playwright end-to-end in real Chromium against the unpacked extension,
real `chrome.storage.local` and the repository's HTTP stub provider (`tests/e2e`); a measurement pass
over the built `dist/` for the layout, contrast and height budgets that no existing suite asserts.

**Target Platform**: Chromium-family desktop browsers, Manifest V3. The panel's height limit is 600 px
and the settings page opens in a tab.

**Project Type**: Single browser-extension project (service worker, content script, panel, settings
page) — no backend, no marketing site.

**Performance Goals**: Opening either surface issues zero third-party requests and renders from local
assets; a style or position change redraws already-translated blocks within 1000 ms with no provider
request (existing restyle budget); the panel reaches a stable layout in one pass, with no reflow after
the locale catalog is applied.

**Constraints**: No UI framework (constitution). No remote fonts or styles: MV3 page CSP plus the
product's no-third-party promise. Every user-visible string from `src/_locales/en/messages.json`.
Every element a test already binds to keeps its id and its `hidden`/`aria-expanded` contract.
Layout must tolerate 30% longer strings and 200% zoom, and must not scroll sideways from 320 px up.
No secret or credential may be printed into markup or logs. No second visual system per page.

**Scale/Scope**: Two surfaces, 28 functional requirements, 12 success criteria, eight settings
sections. Touch points: 1 new shared stylesheet, 2 new font families (3 woff2 files + 2 licence
texts), 2 page HTML files, 2 page stylesheets, 2 page scripts, 1 shared component, 1 shared helper, 1
locale catalog, 1 build script, 1 README section. Lines changed in the tree: 1,276 added and 627
removed across 11 tracked files; no test file was changed by the change itself.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Gate | How this plan satisfies it | Verdict |
|---|---|---|
| I. Specification Before Code (NON-NEGOTIABLE) | `spec.md` states all 28 FRs, 12 SCs, edge cases, assumptions and explicit out-of-scope items; this plan records the approach and the rejected alternatives in `research.md`; the design contracts pin the exact surfaces; `tasks.md` will cite the FR and the proving test for each task. The spec names the removed temperature control and why, so code and specification do not diverge. | PASS |
| II. Test-First (NON-NEGOTIABLE) | Every behaviour this feature introduces is mapped to a test in [Tests this feature owes](#tests-this-feature-owes): mode radio group, chosen-style text, icon settings control, dark theme tokens, contrast pairs, panel height budget, absent temperature field, picker grid wrapper. Refused paths are covered too (no provider → disabled action; invalid provider fields; 30%-longer labels clipping). The existing 358 unit/DOM and 52 e2e tests stay green and unmodified. | PASS (with a listed debt) |
| III. Real Data, Real Behavior (NON-NEGOTIABLE) | End-to-end runs the real unpacked extension in real Chromium, real `chrome.storage.local` and a real HTTP provider boundary (the ratified stub). The height, contrast and overflow budgets are measured on the built `dist/` in a real browser, not asserted on source. | PASS |
| IV. Simplicity and Least Commitment | No dependency, no framework, no schema change, no migration, no new page, no new message type. One shared stylesheet replaces two divergent page stylesheets. Bundled faces are assets, not dependencies, and their licences ship with them. The removed control reduces surface instead of adding an inert one. | PASS |
| V. Accessible and Localizable by Default | Every string enters the catalog (29 keys added); controls keep accessible names through wrapping labels and catalog-driven `aria-label`s; the native radio group stays in the DOM so arrow-key behaviour and the checked state are real, not simulated; focus ring defined once; both themes carry ≥4.5:1; no state is carried by colour alone (each state also has words); 30% expansion and 200% zoom are part of the acceptance criteria. | PASS |
| Workflow: no secrets; traceability; no unjustified dependency | No credential path is touched; the settings page keeps masking the stored secret; each task will name its FR and test; dependency list unchanged. | PASS |

**Gate result**: PASS. No principle is violated, so the Complexity Tracking table stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-popup-settings-redesign/
├── plan.md                       # This file
├── spec.md                       # Feature specification
├── research.md                   # Phase 0: decisions, rationale, rejected alternatives
├── data-model.md                 # Phase 1: surface states, choices, invariants, validation
├── quickstart.md                 # Phase 1: runnable validation mapped to success criteria
├── contracts/
│   ├── design-system.md          # Phase 1: tokens, type, controls, motion, the one-system rule
│   ├── page-control-surface.md   # Phase 1: panel regions, states, controls, ids, height budget
│   └── settings-page-surface.md  # Phase 1: shell, sections, feedback, lists, preview, ids
├── checklists/
│   └── requirements.md           # Spec quality checklist (from /speckit-specify)
└── tasks.md                      # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── ui/
│   ├── shared/
│   │   ├── ui.css                # NEW: the one system (tokens, type, controls, cards, picker, motion)
│   │   ├── fonts/                # NEW: Host Grotesk (2 subsets) + JetBrains Mono (1) + OFL texts
│   │   ├── style-picker.ts       # grid wrapper, per-option title, optional page-like sample source
│   │   └── i18n.ts               # localize() also fills a textarea placeholder
│   ├── popup/
│   │   ├── popup.html            # one header (mark, title, site, settings control), one action,
│   │   │                          #   display switch (3 radios), provider select, style tiles, usage
│   │   ├── popup.css             # 384 px column, segmented switch, 5×3 tile grid, state dot, entrance
│   │   └── popup.ts              # mode radios, site label, state dot, chosen-style text
│   └── options/
│       ├── options.html          # rail of 8 sections + content column of cards
│       ├── options.css           # shell, rail, panels, cards, lists, preview, one-column collapse
│       └── options.ts            # section ledes, structured list rows, live sample source,
│                                  #   version line, section scroll, temperature field removed
├── _locales/en/messages.json     # +29 keys: panel labels, section ledes, headings, sample, hint
└── styles/
    └── display-styles.css        # unchanged; still shared by both surfaces for the sample + previews

scripts/
└── build.mjs                     # copies the OFL licence texts beside the emitted faces

README.md                         # "Type and colour" section: faces, licences, no remote fetch

tests/                            # no file changed yet — see "Tests this feature owes"
```

**Structure Decision**: Keep the single-extension layout. The one new module is the shared stylesheet
`src/ui/shared/ui.css`, because a design system that lives in two page stylesheets is two systems by
definition. The bundled faces live beside the shared UI code (`src/ui/shared/fonts/`) rather than in a
top-level `assets/` folder, so that "these are extension-page assets, never content-script assets" is
readable from the path; Vite emits the `woff2` files it is asked for and `scripts/build.mjs` copies the
licence texts next to them. No module boundary is introduced that the domain does not already have.

## Tests this feature owes

Constitution II is non-negotiable, so the change must not be called complete while these behaviours
have no test. Each line names the behaviour, the FR it satisfies, and the file the task will extend.
All of them are intended-path *and* refused/edge-path where the behaviour has a refusal.

| Behaviour to pin | FR / SC | Test file | Kind |
|---|---|---|---|
| The panel's display position is one radio group of three; choosing one writes the site preference and sends the live command; the stored site value re-selects it on open | FR-005, SC-003 | `tests/e2e/display-styles.spec.ts` (extend) | e2e |
| The chosen style's name is printed in words and follows the selection, including after a storage change from another surface | FR-006, FR-027 | `tests/e2e/display-styles.spec.ts` (extend) | e2e |
| The panel's settings control is an icon-only control with a catalog accessible name, reachable by Tab, and it opens the settings page | FR-008, FR-025 | `tests/e2e/a11y.spec.ts` (extend) | e2e |
| The panel measures under 600 px untranslated, and under 600 px with a three-line session record | FR-009, SC-001, SC-002 | `tests/e2e/panel-budget.spec.ts` (new) | e2e |
| Dark theme renders from tokens on both surfaces, keeps ≥4.5:1 on every text pair, and loses no unsaved input when the theme changes | FR-019, FR-020, SC-006 | `tests/e2e/panel-budget.spec.ts` (new) + measurement script | e2e |
| Zero sideways overflow from 320 px to 1920 px across all eight settings sections and the panel | FR-024, SC-005 | `tests/e2e/panel-budget.spec.ts` (new) | e2e |
| The settings page has no control without an observable effect: the temperature field is absent, and its stored value is untouched | FR-017, SC-011 | `tests/e2e/us5-personalization.spec.ts` (extend) | e2e |
| The style picker's options live in a grid that survives 30%-longer labels at 200% zoom (the wrapper must not change the measured rows) | FR-023, SC-004 | `tests/e2e/long-labels.spec.ts` (already covers; re-run) | e2e |
| Both surfaces still issue zero third-party requests while a face is in use | FR-026, SC-009 | `tests/e2e/panel-budget.spec.ts` (new) | e2e |
| The picker's sample source line and grid wrapper are built with the picker, and `setValue` still updates the sample's style | (component contract) | `tests/dom/style-picker.test.ts` (new) | DOM |

The rest of this feature's behaviour is already pinned by existing tests and must keep passing
unchanged: `a11y.spec.ts` (labels, tab walk, 200% zoom), `display-styles.spec.ts` (15 styles, icon
titles, sample follows the selection, page control agrees with settings), `typography.spec.ts`
(sample before save, reset), `long-labels.spec.ts` (30% growth), `us1-disclosure.spec.ts` (gate),
`us2-privacy.spec.ts` (masking, delete-all), `us3-routing.spec.ts`, `us4-failures.spec.ts`,
`us5-personalization.spec.ts`, `smoke.spec.ts` (panel h1 and primary action text), `preset.spec.ts`.

## Complexity Tracking

> No constitution violations. Nothing to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 0: Outline & Research

Unknowns extracted from the Technical Context and the spec, resolved in [research.md](./research.md):

- **R1** — Where the visual system lives so the two surfaces cannot drift, given no framework.
- **R2** — Which faces carry the product's own chrome, and how they are served without a network
  request or a licence violation.
- **R3** — How light and dark are produced without a manual switch and without a second stylesheet.
- **R4** — How the panel fits a 600 px limit while carrying an action, three choices and fifteen
  styles.
- **R5** — How a grid of icon tiles stays a real, keyboard-operable radio group with accessible names.
- **R6** — How the settings page gains a rail of sections without inventing new navigation state or
  breaking the existing wiring and tests.
- **R7** — How motion stays limited to hover, press, selection and load, and rests under reduced
  motion.
- **R8** — What to do with a displayed control that has no effect.
- **R9** — How an icon-only control and clipped labels keep their accessible names.
- **R10** — How each success criterion is measured, including the ones no existing suite asserts.

All items are resolved; none is marked NEEDS CLARIFICATION.

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — surface state machines, the choice objects the surfaces render,
  invariants, validation rules the surfaces surface, and traceability to the persisted profile
  (which is unchanged).
- [contracts/design-system.md](./contracts/design-system.md) — tokens, type and spacing scale, radius
  and button families, card, focus ring, theme contract, motion budget, the one-system rule, and the
  catalog rule for copy.
- [contracts/page-control-surface.md](./contracts/page-control-surface.md) — the panel's width, region
  order, per-state content, every control with its observable effect and accessible name, the ids the
  tests bind to, and the height budget.
- [contracts/settings-page-surface.md](./contracts/settings-page-surface.md) — the shell, the eight
  sections with their headings and actions, the feedback and list-row contracts, the preview contract,
  the empty states, and the ids the tests bind to.
- [quickstart.md](./quickstart.md) — runnable validation scenarios mapped to the success criteria,
  including the measurement pass that no suite covers.

**Supersession**: feature 004's `contracts/typography-settings.md` fixes the reader's translation
typography and forbids fetching or bundling webfonts *for translated page text*. This feature bundles
two faces for **extension-owned chrome only** and does not touch `translationFontFamily`,
`translationFontScale`, or the page's text. The distinction is recorded in section 6 of
[contracts/design-system.md](./contracts/design-system.md) ("Scope of the faces") so the two contracts
cannot be read as contradictory.

## Post-Design Constitution Check

| Principle | Re-check after Phase 1 design | Verdict |
|---|---|---|
| I | The three contracts pin the observable outcome of every FR (region order, states, ids, budgets); the spec's out-of-scope list is unchanged and the removed control is documented in both. | PASS |
| II | "Tests this feature owes" is a table of behaviours, FRs and test files; no behaviour is left to "verified by eye" except the visual reading, which the plan states as reviewed (not asserted). | PASS |
| III | E2E and the measurement pass run the built extension in real Chromium with real storage; the budgets are measured, not assumed. | PASS |
| IV | Design adds one stylesheet and two asset families; no dependency, key, message type, schema or page. | PASS |
| V | Catalog keys for all new copy; accessible names for every control including the icon-only one; radio group preserved; both themes ≥4.5:1; meaning never carried by colour alone; 30% / 200% in the acceptance criteria. | PASS |

**Gate result**: PASS.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The 384 px panel grows past 600 px once more than three session lines exist, hiding the settings control. | The settings control lives in the panel header, not at the foot, so it is never scrolled away (FR-008); the height budget is asserted for the idle and three-line cases (SC-002). |
| A bundled face fails to load in some environment, and the panel falls back to a system look. | `@font-face` uses `display: swap` with a system fallback stack; the measurement pass asserts both families report `loaded`; the licence texts ship beside the files. |
| Vite rewrites font URLs relative to the emitted stylesheet, breaking them under the extension origin. | The build emits `/assets/*.woff2` absolute paths, which resolve to the extension root; the measurement pass loads the page over the extension origin and asserts `document.fonts.check` for both families. |
| Promoting the radio list to an icon grid could break the existing Playwright interactions (`check()`) or the arrow-key walk. | The native `input[type=radio]` stays in the DOM, absolutely positioned over its tile with `opacity: 0`; it remains hit-testable and focusable, so `check()`, arrow keys and screen readers keep working. Covered by the extended `display-styles` and `long-labels` tests. |
| Clipping the style labels in the panel (icons only) could destroy their accessible names. | The label text is clipped with `clip-path`, never `display: none`, so it still names the radio; the tile also carries the name as its `title`. |
| Removing the temperature field could look like data loss to a reader who had set it. | The stored value is left untouched and the schema is unchanged; the field simply stops being shown. Recorded in the spec's assumptions and in `data-model.md`. |
| Two themes double the surface that can regress. | Tokens are defined once and overridden once; the measurement pass checks every text pair in both themes and fails on any pair under 4.5:1. |
| The measurement pass (height, contrast, overflow) is a script rather than a test file, so it could rot. | It lands as `tests/e2e/panel-budget.spec.ts` inside the existing Playwright run (not a side script), so `npm run test:e2e` fails when a budget regresses. |

## Implementation Record (2026-11-15)

The task list is closed: all 47 tasks in [tasks.md](./tasks.md) are marked done, and the test debt that
this plan called out is discharged by eleven test tasks that now run in the suite.

### What the tests changed

Writing the tests first was not a formality: four behaviours were wrong or missing, and each was fixed
in the code rather than in the test.

| Found by | Behaviour | Fix |
|---|---|---|
| T012 (panel-control) | The panel could not find the page it was about. `tab.url` is absent for pages the extension has no host permission for, so "not an extension page" matched every tab that hides its URL — including the panel's own tab under test. The panel showed "No web page in this tab" while a page was open. | The tab choice now requires a real `http(s)` URL (`src/ui/popup/popup.ts`). |
| T012 (refused path) | FR-004 was half-implemented: the primary action was disabled with no provider, and nothing said why. | A `#no-provider` status line appears whenever the action is disabled, naming the settings page. |
| T014 (height budget) | The panel measured 604 px in the translated state — 4 px past the browser's limit, so the panel would scroll on the daily path. | The session record's spacing was tightened (597 px with three lines). |
| T037 (privacy) | After a successful wipe the reader stayed on the section that no longer had anything in it. | `deleteAllData` lands on Providers after a verified wipe, where the disclosure gate is. |

### Measurements (T044)

| Quantity | Value |
|---|---|
| Panel height, untranslated | 484 px |
| Panel height, three session lines | 597 px |
| Panel horizontal overflow | 0 px |
| Lowest text contrast, light theme | 4.8 : 1 (an idle rail label) |
| Lowest text contrast, dark theme | 6.77 : 1 (a hint) |
| Sideways overflow, 320–1440 px × eight sections | none |
| Bundled families loaded, both surfaces | yes (Host Grotesk, JetBrains Mono) |

### Tests added or extended

| File | Kind | Tasks |
|---|---|---|
| `tests/dom/style-picker.test.ts` | new | T010 |
| `tests/e2e/panel-control.spec.ts` | new (7 tests) | T012–T014 |
| `tests/e2e/surfaces-theme.spec.ts` | new (2 tests) | T029 |
| `tests/e2e/surfaces-layout.spec.ts` | new (3 tests) | T030 |
| `tests/support/surface-metrics.ts` | new helper (height, overflow, contrast, external requests, fonts) | T014, T029, T030 |
| `tests/e2e/us1-translate.spec.ts` | extended (2) | T018, T019 |
| `tests/e2e/a11y.spec.ts` | extended (2) | T020, T031 |
| `tests/e2e/display-styles.spec.ts` | extended (2) | T024, T025 |
| `tests/e2e/typography.spec.ts` | extended (1) | T035 |
| `tests/e2e/us5-personalization.spec.ts` | extended (1) | T036 |
| `tests/e2e/us2-privacy.spec.ts` | extended (1) | T037 |
| `tests/e2e/us3-routing.spec.ts` | extended (1) | T038 |

### Note on the suite's size

The repository's suite grew while this feature was being implemented: feature 005's end-to-end spec
(`tests/e2e/repeat-translate.spec.ts`) and its unit/dom tests landed in the same working tree from a
separate session. The gate therefore runs 32 test files and 390 unit/DOM tests plus 92 end-to-end tests,
and every one of them passes.
