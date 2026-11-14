# Implementation Plan: Divider Style Fix and Custom Translation Typography

**Branch**: `004-translation-divider-font` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-translation-divider-font/spec.md`

## Summary

Replace the Divider display style's full-width top border with a hairline dashed rule on the
translation's **logical inline-start edge** (left in LTR, right in RTL), spanning the block's full
height, with the translation's own text styling untouched. The same change lands in the shared
stylesheet, the live sample, and the generated preview icon, so the picker and the page cannot
disagree. To make the rule mirror for RTL targets deterministically, translated blocks gain a
`dir` value derived from the target language (a behaviour correction that also fixes the Quote bar
for RTL content).

Add a device-wide typography preference: an optional custom font-family stack and a font-size scale
(50–200%, default 100%, 5% steps) applied to translated blocks **relative to each source block's own
size**. The renderer already inherits typography from the source; the new step overrides family and
scales size and line-height after inheritance, and a new `typographyChanged` command relays changes
to every open tab so already-rendered translations restyle within one second without any provider
request. The options Display panel gains the two inputs, inline validation, a Reset action, and a
live sample that combines style + family + size. No new runtime dependency, no new storage key, no
schema bump: the fields are optional and default-tolerant.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict, `noUncheckedIndexedAccess`), ES modules; Node.js 20 LTS for tooling only.

**Primary Dependencies**: none at runtime (platform APIs only). Build: Vite 5.4.10. Tests: Vitest 2.1.4, jsdom 25.0.1, Playwright 1.48.2, @types/chrome 0.0.287 — all pinned in `package.json`.

**Storage**: `chrome.storage.local` through `SettingsStore` (`src/shared/settings.ts`), `schemaVersion` 2. Two optional fields are added under the existing `ui` key (`translationFontFamily`, `translationFontScale`); `STORAGE_KEYS` is unchanged, so no migration and no new key.

**Testing**: Vitest unit tests (`tests/unit`) and jsdom DOM tests (`tests/dom`) for renderer, settings, validation and icons; Playwright end-to-end in real Chromium with the unpacked extension and the repository's HTTP stub provider (`tests/e2e`); `scripts/verify-styles.mjs` for the 105-pair distinctness matrix, restore, contrast and the mode × direction layout matrix.

**Target Platform**: Chromium-family desktop browsers, Manifest V3 extension.

**Project Type**: Single browser-extension project (content script, service worker, options page, popup) — no backend.

**Performance Goals**: Typography restyle of an already-translated page with ≥120 blocks within 1000 ms (existing restyle budget, SC-004); no extra provider request; translation throughput unchanged.

**Constraints**: No network fonts, no bundled font assets, zero runtime dependencies; extension-owned elements only (never restyle page-authored nodes); no `!important`; CSP must not be weakened; logical CSS properties so RTL mirrors; every user-visible string in `src/_locales/en/messages.json`; exact DOM restore on toggle-off including the new `dir` attribute and typography declarations; 200% zoom and 200% text scale must not clip or overlap.

**Scale/Scope**: Two user-facing areas (one display-style treatment, one typography preference). Touch points: 2 stylesheets, renderer/job/content agent, shared settings/types/validation/messages/display catalogue, service worker relay, options page markup/script/styles, locale catalogue, preview icon generator. 25 functional requirements, 11 success criteria.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Gate | How this plan satisfies it | Verdict |
|---|---|---|
| I. Specification Before Code (NON-NEGOTIABLE) | `specs/004-translation-divider-font/spec.md` states every FR, SC, edge case, assumption and explicit out-of-scope item before any code; `tasks.md` will cite the FR each task satisfies. | PASS |
| II. Test-First (NON-NEGOTIABLE) | Each behaviour starts with a failing test: unit tests for `validateTypography`/`resolveTypography` and the icon; DOM tests for the renderer's family/scale/line-height/`dir` and restore; e2e for save → live apply → persistence → invalid input → reset; `verify:styles` re-run for distinctness. Refused paths (invalid font, out-of-range size, unknown stored values) are tested, not just happy paths. | PASS |
| III. Real Data, Real Behavior (NON-NEGOTIABLE) | E2E runs the real unpacked extension in real Chromium against real `chrome.storage.local` and the real HTTP stub provider; `verify:styles` renders the real stylesheet. The stub is the already-ratified external-provider boundary. | PASS |
| IV. Simplicity and Least Commitment | No new dependency, no new storage key, no schema migration (optional, default-tolerant fields), no new abstraction beyond `TranslationTypography` + one validator + one small RTL-language helper; the existing restyle channel is extended rather than replaced; one CSS rule replaces one CSS rule. | PASS |
| V. Accessible and Localizable by Default | New strings go through the catalog; inputs have labels and exposed values; validation errors are announced through a live region; keyboard-only operation; CSS uses logical properties; forced-colors and 200% zoom handled; no meaning carried by colour alone. | PASS |
| Workflow: no secrets, traceability, no unjustified dependency | No credential path touched; each task will name its FR and test; dependency list unchanged. | PASS |

**Gate result**: PASS. No violations, so the Complexity Tracking table stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-translation-divider-font/
├── plan.md                     # This file
├── spec.md                     # Feature specification
├── research.md                 # Phase 0: decisions, rationale, rejected alternatives
├── data-model.md               # Phase 1: settings shape, renderer state, validation, messages
├── quickstart.md               # Phase 1: runnable verification guide
├── contracts/
│   ├── divider-presentation.md # Phase 1: rendered divider + preview-icon contract
│   └── typography-settings.md  # Phase 1: stored shape, validation, application, UI contract
├── checklists/
│   └── requirements.md         # Spec quality checklist (from /speckit-specify)
└── tasks.md                    # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── types.ts                # UiSettings: optional translationFontFamily / translationFontScale
│   ├── settings.ts             # defaultSettings + tolerant mergeDefaults for the two fields
│   ├── validation.ts           # validateTypography(): font-family grammar + size range
│   ├── display-styles.ts       # divider icon descriptor (vertical dashed edge mark)
│   ├── direction.ts            # NEW: isRtlLanguage(), the only place that decides text direction
│   └── messages.ts             # typographyChanged (UI→worker) and setTypography (worker→content)
├── content/
│   ├── renderer.ts             # leading-edge divider state, typography override after inheritance,
│   │                           #   dir attribute, setTypography(), record base typography
│   ├── job.ts                  # JobOptions.typography, setTypography() passthrough
│   └── index.ts                # resolve typography from settings, handle setTypography, fresh jobs
├── background/
│   └── service-worker.ts       # relay typographyChanged to every tab as setTypography
├── styles/
│   └── display-styles.css      # divider: inline-start dashed border + inline-start padding
├── ui/
│   ├── shared/style-preview.ts # bar mark honours a dash pattern → divider icon
│   └── options/
│       ├── options.html        # Display panel: font family input, size input, reset, error slot
│       ├── options.ts          # load/save/validate, live sample typography, notify tabs
│       └── options.css         # field row and sample styling for the new controls
└── _locales/en/messages.json   # new Display strings and validation messages

tests/
├── unit/
│   ├── validation.test.ts      # (extend) font/size accepted and refused paths
│   ├── settings.test.ts        # (extend) defaults, tolerance, persistence without schema bump
│   ├── display-styles.test.ts  # (extend) divider icon descriptor
│   └── direction.test.ts       # NEW: RTL language classification
├── dom/
│   ├── renderer.test.ts              # (extend) RTL dir attribute present, updated, restored
│   ├── renderer-typography.test.ts  # NEW: family override, scale, line-height, fallback, 100% no-op
│   ├── renderer-style.test.ts        # (extend) divider leaves text untouched; only the container is marked
│   └── style-preview.test.ts         # (extend) divider icon is a dashed vertical mark
└── e2e/
    ├── display-styles.spec.ts        # (extend) divider renders vertical, no horizontal decoration
    └── typography.spec.ts            # NEW: save, live restyle, persistence, invalid input, reset, sample
```

`scripts/verify-styles.mjs` is re-run (not restructured) to confirm the fifteen styles remain
pairwise distinct after Divider becomes vertical; the script prints its weakest pair every run.

**Structure Decision**: Keep the existing single-extension layout. The only new module is
`src/shared/direction.ts` (one pure predicate, shared by the renderer and its tests), because
target-language direction is domain data, not a renderer detail. Everything else extends the
modules feature 002/001 already established (`display-styles.ts`, `renderer.ts`, `settings.ts`,
`messages.ts`, the shared preview generator, the options Display panel).

## Complexity Tracking

> No constitution violations. Nothing to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 0: Outline & Research

Unknowns extracted from Technical Context and the spec, resolved in [research.md](./research.md):

- **R1** — How to draw a full-height, hairline, dashed leading rule that survives lists/table cells and mirrors in RTL (logical inline border vs. pseudo-element vs. background gradient).
- **R2** — How the translation's direction is established so the rule mirrors for an RTL *target* on an LTR page.
- **R3** — How to scale translation size per source block without flattening the heading/body hierarchy and without line overlap.
- **R4** — Which font-family values are accepted, and how fallback keeps missing glyphs readable.
- **R5** — Persistence shape and migration policy for two optional settings.
- **R6** — How a typography change reaches already-rendered blocks in every tab without a provider request.
- **R7** — How the Divider preview icon changes without losing pairwise distinctness at 16 px.
- **R8** — Contrast, forced-colors, reduced-motion and accessibility obligations for the new rule and controls.
- **R9** — Verification strategy and the `verify:styles` calibration risk.

All items are resolved; none is marked NEEDS CLARIFICATION.

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — persisted shape, resolved typography value, renderer record
  fields, validation grammar, message payloads, invariants and traceability.
- [contracts/typography-settings.md](./contracts/typography-settings.md) — storage/resolution/
  validation/application/UI/restore contract for the new preference.
- [contracts/divider-presentation.md](./contracts/divider-presentation.md) — rendered geometry,
  direction, mode/container behaviour, color and forced-colors behaviour, preview-icon contract,
  and the supersession note for feature 002's catalogue rows.
- [quickstart.md](./quickstart.md) — runnable validation scenarios mapped to success criteria.

**Supersession**: Feature 002's `contracts/display-style-catalog.md` still describes Divider as a
horizontal rule above the translation. This plan amends that contract in place with a
"superseded by 004" pointer on the Divider row and the Divider icon row, so the recorded contract
and the shipped rendering cannot diverge (Constitution I).

## Post-Design Constitution Check

| Principle | Re-check after Phase 1 design | Verdict |
|---|---|---|
| I | The contract files pin the exact rendered outcome and the exact accepted input grammar; the spec's FRs map to design sections. | PASS |
| II | Every design decision names its observable test (DOM geometry, computed typography, e2e persistence, restore hash). | PASS |
| III | E2E uses the real extension, real storage and real HTTP; `verify:styles` renders the real CSS. | PASS |
| IV | Design adds one predicate module and one setting object; no framework, dependency, storage key or migration. | PASS |
| V | Catalog keys, labelled controls, live-region errors, logical properties, forced-colors and RTL are part of the contract, not follow-ups. | PASS |

**Gate result**: PASS.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| After Divider becomes vertical, its pixel signature could drift toward Quote's in the 105-pair distinctness check (threshold 0.5%). | Run `npm run verify:styles`; it prints the weakest pair. If divider/quote falls below threshold, widen the difference in the treatment itself (dash rhythm, thickness, gap) — never lower the threshold. |
| Explicit `dir` on translations changes existing RTL rendering. | Covered by the mode × direction layout matrix plus a new DOM test; `dir` is journalled and restored. |
| Scaling `line-height` from a computed pixel value behaves differently in jsdom (which may report `normal`). | The renderer scales only concrete pixel values and leaves `normal` alone; the DOM test covers both branches. |
| A custom font stack that omits the page font could hide glyphs. | The renderer appends the source's computed family as the final fallback; e2e covers a Latin-only face with Chinese text. |
| Live sample and real rendering drift (sample shows 100% scale while translations use 125%). | One shared resolver formats the family/scale; the sample and the page both consume it; e2e asserts the sample text matches the saved values. |
| A font value could smuggle CSS out of the setting. | Strict allow-list grammar in `validateTypography`, applied before save and again on read; only extension-owned nodes receive the value. |
