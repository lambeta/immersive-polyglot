# Implementation Plan: Translation Display Styles and Their Preview Icons

**Branch**: `002-translation-display-styles` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-translation-display-styles/spec.md`

## Summary

Add a persisted, per-site-overridable **visual style** for translated text — the fifteen presets the
reference product offers, in the order the spec fixes (None, dashed underline, solid underline,
dashed border, solid border, blur study mode, transparency, dotted underline, divider, highlight,
marker pen, marker pen 2, quote, weakened, gray) — and a **preview icon** for every preset so a reader
can choose by sight.

Three constraints shape the design:

1. **Styling must remain CSP-safe and restorable.** Feature 001 already renders translations as
   marker-attributed blocks styled by a manifest-declared stylesheet and journals every page write
   (research R2/R8 of feature 001). A style is therefore one more *product-owned attribute* on an
   already-journaled element, not a new mutation mechanism: no inline `style` attribute for
   decoration, no page-global CSS, and toggling translation off still unwinds to the original page.
2. **Changing a style must never re-translate.** Style is presentation-only: the renderer rewrites
   attributes on blocks it already owns, so SC-002 (restyle 100 blocks in under a second, zero
   provider requests) is a property of the write path, not of the job.
3. **Some presets deliberately reduce visibility.** Blur, transparency and weakened styles must be
   revealable by pointer and keyboard, must stay in the accessibility tree, and must still meet
   contrast (constitution principle V). Those are contract obligations, not polish.

Architecture in one line: a shared style catalogue (`src/shared/display-styles.ts`) is consumed by
the renderer (attribute + CSS), by the options and popup pickers (inline SVG icons), and by a
settings migration that persists the choice globally and per site.

## Technical Context

**Language/Version**: TypeScript 5.6.3, `strict` with `noUncheckedIndexedAccess` — unchanged; no new
runtime language surface. Node.js 20 LTS for tooling only.

**Primary Dependencies**: **none added**. Platform APIs only: DOM/CSSOM for decoration and computed
contrast, `chrome.storage`/`chrome.tabs`/`chrome.runtime` for persistence and live application.
Existing build and test toolchain is reused as-is (Vite 5.4.10, Vitest 2.1.4 + jsdom 25, Playwright
1.48.2). Preview icons are generated inline SVG in TypeScript, so no image assets and no image
loader are introduced.

**Storage**: `chrome.storage.local` only, schema **v1 → v2**. Adds `ui.displayStyle` (device-wide
default, default `"none"`) and optional `sites[].displayStyle`. No new storage keys, no new file
system access, nothing stored per page. The version bump is deliberate: an older build reading a v2
profile refuses to write it (feature 001's existing "newer schema" guard), so a downgrade cannot
silently drop the reader's style choice.

**Testing**: Vitest on node for the catalogue, fallback, contrast math, migration and icon
descriptors; Vitest + jsdom for renderer attribute application, concealment focusability, idempotent
switching and journaled restore; Playwright against the real unpacked extension for the pickers, live
application, persistence, site precedence, keyboard operation and computed contrast; a new
`npm run verify:styles` script that renders all fifteen styles in a real Chromium, captures them,
and asserts pairwise distinctness plus restore fidelity.

**Target Platform**: Chromium-family desktop browsers, Manifest V3, Chrome/Edge 120+ — unchanged.

**Project Type**: Single project: one browser extension with a service worker, a content script and
two extension pages.

**Performance Goals**: restyling a page holding ≥100 translated blocks completes in under 1 s with
zero provider requests (SC-002); decoration is CSS-only, so scrolling and reveal cost no JavaScript
per block; switching styles 20 times leaves no DOM or timing growth (SC-009); picker interaction
stays under one frame per change.

**Constraints**: decoration ships in manifest-declared extension CSS (survives page CSP); dynamic
values go through CSSOM property writes and are journaled; every style must restore exactly
(FR-015); concealment styles must reveal within 150 ms and keep text available to assistive
technology, selection, copy and find (FR-012); normal-text contrast ≥ 4.5:1 against the background
actually rendered behind the translation, on light and dark pages (FR-013, SC-008); forced-colors and
reduced-motion preferences respected (FR-018); RTL mirroring via logical properties (FR-014);
interface strings via the translation catalogue only (FR-022).

**Scale/Scope**: 15 styles × 3 display modes × 2 text directions = 90 rendering combinations to
verify; 22 functional requirements, 13 success criteria; 2 UI surfaces (options, popup) plus the
content script; one new settings version; ~25 new catalogue strings (15 style names plus headings,
hints, sample text).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v1.0.1.

| Principle | Gate | Status | Evidence |
|---|---|---|---|
| I. Specification Before Code | Spec exists, criteria decidable, scope bounded, requirement-to-task traceability planned | PASS | [spec.md](./spec.md): 4 stories with Given/When/Then, 22 FRs, 13 measurable SCs, explicit Out of Scope; every task will cite an FR |
| II. Test-First | Every behavior testable before implementation; no skip-based greening | PASS | Each behavior lands with a failing test first: catalogue/fallback (unit), migration (unit from the v1 fixture), renderer attributes + restore (jsdom), pickers and live apply (Playwright) |
| III. Real Data, Real Behavior | Acceptance runs against real persistence and real boundaries | PASS | E2E uses real Chromium, real `chrome.storage.local`, real fixture pages; contrast is measured from real computed styles in the browser, not from arithmetic on source tokens |
| IV. Simplicity and Least Commitment | No unrequested features, dependencies justified, complexity earned | PASS with recorded costs | Zero new dependencies; no style editor, no theme import, no animation; the four additions are listed under Complexity Tracking with their simpler-rejected alternatives |
| V. Accessible and Localizable by Default | All user-visible text in a catalog; keyboard operable; no color-only meaning; LTR/RTL safe | PASS | Style names and sample text in `_locales`; picker is a native radio group (keyboard and screen-reader correct); icons carry accessible names and a non-colour shape; concealment styles reveal on focus; forced-colors fallback uses a typographic cue; CSS uses logical properties |

Gate result: **PASS**. No unresolved clarifications: the spec carries none, and every unknown in the
Technical Context is resolved in Phase 0 ([research.md](./research.md)).

## Project Structure

### Documentation (this feature)

```text
specs/002-translation-display-styles/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1-R8
├── data-model.md        # Phase 1: catalogue, preference, application, migration
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── display-style-catalog.md     # the 15 styles, treatments, concealment, icons
│   ├── rendering-styles.md          # attribute/CSS application, reveal, contrast, restore
│   └── settings-and-messages.md     # schema v2 delta and the live style message
├── checklists/
│   └── requirements.md              # spec quality gate (complete)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── display-styles.ts      # NEW  ordered 15-style catalogue, ids, names, treatment kind, concealment
│   ├── contrast.ts            # NEW  WCAG relative luminance / ratio / safe foreground choice
│   ├── migrations.ts          # NEW  schema v1 -> v2 step (display style defaults)
│   ├── settings.ts            # EDIT bump CURRENT_SCHEMA_VERSION, register migrations, merge defaults
│   ├── types.ts               # EDIT DisplayStyleId, UiSettings.displayStyle, SitePreference.displayStyle
│   └── messages.ts            # EDIT setDisplayStyle / styleChanged command payloads
├── content/
│   ├── renderer.ts            # EDIT apply/remove style attribute, concealment attrs, live restyle
│   ├── job.ts                 # EDIT carry displayStyle, expose setDisplayStyle
│   └── index.ts               # EDIT resolve style per site, pass to job, handle live style command
├── styles/
│   ├── display-styles.css     # NEW  the 15 treatments, reveal, forced-colors, logical properties
│   └── content.css            # unchanged; display-styles.css is declared beside it in the manifest
├── ui/
│   ├── shared/style-preview.ts # NEW  inline-SVG preview icon per style (accessible, colour-independent)
│   ├── shared/style-picker.ts  # NEW  radio-group picker + live sample, shared by options and popup
│   ├── options/options.html    # EDIT new "Display" panel, site-form style field
│   ├── options/options.ts      # EDIT render picker/sample, save + broadcast, storage sync
│   ├── options/options.css     # EDIT picker/layout rules (imports display-styles.css)
│   ├── popup/popup.html        # EDIT style picker
│   ├── popup/popup.ts          # EDIT persist selection, send live style, storage sync
│   └── popup/popup.css         # EDIT picker layout (imports display-styles.css)
├── _locales/en/messages.json   # EDIT 15 names + UI strings
└── background/service-worker.ts # EDIT relay the style broadcast to every tab

package.json                   # EDIT add the verify:styles npm script

scripts/
├── verify-styles.mjs          # NEW  real-Chromium capture: pairwise distinctness, restore, contrast
└── build.mjs                  # EDIT copy display-styles.css next to content.css

tests/
├── unit/
│   ├── display-styles.test.ts # NEW  order/count/ids/fallback/i18n keys
│   ├── contrast.test.ts       # NEW  luminance, compositing, 4.5:1 guarantee, pathological backgrounds
│   └── migrations.test.ts     # EDIT v1 -> v2 fixture path
├── dom/
│   ├── renderer-style.test.ts # NEW  attribute apply/switch/remove, concealment focusability, restore hash
│   ├── style-preview.test.ts  # NEW  every style has a distinct, labelled SVG icon (needs a DOM)
│   └── restorer.test.ts       # EDIT prove tabindex/style attributes are unwound
├── e2e/
│   ├── display-styles.spec.ts  # NEW  options/popup picker, live apply, persistence, site override
│   └── a11y.spec.ts           # EDIT keyboard/announcement and contrast assertions
└── fixtures/storage/
    └── v2.json                # NEW  migrated-shape fixture for future migrations
```

**Structure Decision**: Single project at the repository root, following feature 001's layout. The
style catalogue is `shared` because three contexts read it (content script, options, popup) and a
duplicated list would drift; the contrast utility is `shared` because both the renderer and the
tests must compute the same thing. The visual rules live in a dedicated stylesheet that both the
injected stylesheet and the two UI pages include, so the preview sample and the real rendering are
literally the same rules. No package split, no new build mode.

## Phase 0: Research (complete)

Eight decisions, all resolved; full rationale in [research.md](./research.md):

- **R1**: Style is a product-owned attribute plus manifest-declared CSS; no inline decoration, no page-global CSS, no new permissions.
- **R2**: The fifteen presets are reproduced clean-room from observation, with stable ids and an explicit treatment table; nothing is copied from the reference product.
- **R3**: Persistence is schema v1 → v2 (`ui.displayStyle`, `sites[].displayStyle`) with an ordered migration and a v1-fixture test; the version bump prevents downgrade data loss.
- **R4**: Live restyle is an attribute rewrite on already-rendered blocks plus a `setDisplayStyle` command relayed to every tab; the existing unhandled `setDisplayMode` command is wired through the same path.
- **R5**: Concealment styles reveal on `:hover`/`:focus`, become focusable only while concealment is active (`tabindex` journalled), and keep full text in the accessibility tree.
- **R6**: Gray and weakened foregrounds are computed from the actual backdrop luminance, because CSS cannot guarantee 4.5:1 on an arbitrary page background; the fallback (black or white) provably reaches ≥4.58:1.
- **R7**: Preview icons are generated inline SVG from the catalogue (no binary assets), carry `role="img"` + title, use shape as well as colour, and scale to 200% zoom.
- **R8**: Distinctness and restore are verified by a real-browser capture script plus jsdom journal tests, making SC-001 and SC-004 decidable per release.

## Phase 1: Design (complete)

- [data-model.md](./data-model.md) — catalogue entry, style preference, resolved style, ephemeral application, migration rules
- [contracts/display-style-catalog.md](./contracts/display-style-catalog.md) — the fifteen styles, their treatments, concealment flags, icon and picker obligations
- [contracts/rendering-styles.md](./contracts/rendering-styles.md) — how a style attaches to a rendered translation, reveal and contrast rules, composition with display modes, restore
- [contracts/settings-and-messages.md](./contracts/settings-and-messages.md) — schema v2 delta, migration, live-style command
- [quickstart.md](./quickstart.md) — how to prove the feature end to end

### Post-Design Constitution Re-check

| Principle | Re-check | Status |
|---|---|---|
| I | Every design artifact traces to FRs/SCs; SC-001/004/008 are made decidable by `verify:styles` | PASS |
| II | Each artifact names the test that will prove it; concealment and fallback each have a refused-path test | PASS |
| III | E2E exercises real storage and real layout; contrast measured in-browser | PASS |
| IV | No dependency, no abstraction layer added beyond the four recorded costs | PASS |
| V | Catalogue strings, radio-group semantics, shape cues, RTL logical properties and forced-colors handling are in the design, not deferred | PASS |

Gate result: **PASS**. Complexity Tracking records the justified costs.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A contrast-computation utility in `shared` (luminance, alpha compositing, safe-foreground search) | FR-013/SC-008 require 4.5:1 against the background *actually* behind each translation, and pages may be dark, coloured or mid-luminance | A fixed gray token is unreadable on dark pages; relying on `opacity` cannot reach 4.5:1 on white (0.5 opacity gives ≈3.9:1) and cannot be verified |
| Inline-SVG preview icons generated in TypeScript | FR-007/FR-010 and SC-001/SC-011 need fifteen distinct, labelled, zoom-safe icons with no colour-only meaning | Binary PNG/SVG assets would need an asset pipeline, localisation of `<title>`, and would drift from the treatment table; CSS-only icons cannot show blur/transparency/divider shapes consistently |
| A shared `display-styles.css` included by the injected stylesheet and both UI pages | US2 scenario 5 requires the preview and the real rendering to agree; duplication would drift silently | Two hand-maintained copies of fifteen treatments guarantee drift; inlining rules into TS would move authoring into strings and lose cascade/media features |
| Broadcast + storage-change listeners for live style sync | FR-002 (restyle already-translated pages) and FR-005 (options and page control agree without reload) | Requiring a page reload contradicts SC-002's "applies within 1 s"; polling storage would add timers the product otherwise has none of |
