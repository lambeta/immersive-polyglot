# Implementation Plan: Drawing Labels Translate In Place Without Breaking the Drawing

**Branch**: `010-preserve-rendered-diagrams` (the working tree stays on `master`; this project
registers no `before_plan` hook) | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-preserve-rendered-diagrams/spec.md`

## Summary

The reported page draws a sequence diagram as an inline vector drawing that carries its own style
sheet. Today the product reads that drawing as one prose passage: the wrapper `<div>` is a leaf
candidate, its subtree text walks into the `<svg>`, and the reader gets a line that begins
`AgentEvaluatorDataset…#mermaid-…{font-family…}`. The owner has since decided the drawing's **visible
phrases** should be translated, in place, while its shapes stay exactly where they are.

This plan delivers that as one path:

1. **Extraction stops at the drawing and starts again at its labels.** A graphic root (SVG, canvas,
   iframe, object/embed, media, MathML) is never a prose passage. Its rendered `<text>` elements are
   harvested as labels; its style sheet, scripts, titles, descriptions, definitions and geometry are
   never read. A lone token stays as drawn; a phrase (two or more words, or clause punctuation)
   becomes a unit. A block that only wraps a drawing produces no unit and no skipped-passage count.
2. **Labels are written in place.** The translation replaces the label's own text runs; the shapes,
   frames, arrows, sizes and positions are untouched. If the translation is wider than the label's
   own footprint, only that label's type shrinks — bounded by 75 % of the drawn size or 10 px — and
   below that floor the original words stay. No sibling block, no pending spinner and no marker is
   ever put inside the drawing.
3. **The existing job owns labels.** They ride the same batching, budget, limiter, retry, progress,
   duplicate and restore machinery; the renderer branches to the in-place path. A run-scoped seen-set
   prevents a translated label from being read back as source, and the observer ignores mutations
   inside a drawing so the fit's own style write cannot cause a collect loop.
4. **Selection follows the same boundary.** A selection or single-block target inside a drawing
   resolves to the drawing's root, so only its eligible phrases are collected — never the style sheet
   and never the wrapper's prose.

No runtime dependency, permission, storage key, message shape or user-visible string is added. The
shapes are the page's; only the words change.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (`strict`, `noUncheckedIndexedAccess`); Node.js 20 LTS for
tooling only. The shipped extension keeps its zero-runtime-dependency rule.

**Primary Dependencies**: none at runtime beyond platform APIs (`chrome.*`, DOM, `getBBox`, CSSOM).
The feature uses the existing Vite 5.4.10, Vitest 2.1.4, jsdom 25.0.1, Playwright 1.48.2 and
`@types/chrome` 0.0.287, all already pinned. The only new code is content-script code and tests.

**Storage**: none. Labels, their translations, the seen-set and the fit state live in content-script
memory for the lifetime of one run; restore is the existing journal. No `chrome.storage` key, area,
schema version or migration.

**Testing**: Vitest unit tests for the phrase table, label-text joining, graphic-root classification
and extraction exclusions; jsdom DOM tests for run writes, the journal text entry, the shrink loop and
the floor fallback with an injected measurer; Playwright in real Chromium for `getBBox`-based fitting,
shape stability, request privacy, counts, three display modes, restore and accessibility, against a
captured fixture of the reported diagram and authored graphic fixtures. The stub provider supplies a
deterministic translation set for SC-001; its default `【译】` prefix would exercise the fallback
instead of the reported case. The live page is checked manually with a real provider.

**Target Platform**: Chromium-family desktop browsers, Manifest V3, the existing `minimum_chrome_version`
120 floor. Nothing this feature uses is newer.

**Project Type**: Single browser-extension project — service worker, content script, panel, settings
page — no backend.

**Performance Goals**: a 5,000-element drawing with 200 labels reaches its first visible translation
within 2 s of trigger (SC-014); segmentation performs no layout reads and stays within the existing
`5,000-node / 150 ms` budget (feature 001); no main-thread task over 50 ms from the new path; 60 fps
scrolling while labels stream in; label measurement happens only when a translation is applied, not
for every label on the page.

**Constraints**: no new dependency, permission, storage key, locale string or message field; no
`data-ipt` marker inside a drawing; the fit's `font-size`/`direction` writes go through CSSOM (strict
CSP) and the journal; the drawing's geometry is immutable; a phrase that cannot fit at the floor keeps
its source text; an opaque graphic is never sent; a space-less source label is one token by the
spec's recorded assumption.

**Scale/Scope**: one user, one device; up to roughly 5,000 passages per page, of which a large drawing
can contribute 200 labels; 23 functional requirements and 16 success criteria; touch points: two new
content modules, six modified content modules, thirteen new test files, six new fixtures, two contracts,
the fixture README and the project README. No existing assertion needs to change; the boundary suites
are re-run.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.1.

| Principle | Gate | Status | Evidence |
|---|---|---|---|
| I. Specification Before Code | Spec has prioritised stories, decidable FR/SC, explicit out-of-scope, recorded clarifications; implementation reality is reconciled in this plan | PASS | [spec.md](./spec.md) carries 4 clarifications, 3 stories, 23 FRs, 16 SCs and Out of Scope. The plan's "Interpretations recorded" section makes the four implementation choices visible; no requirement is contradicted without an amendment. |
| II. Test-First | Every behaviour has a failing test named before code; no skip-based greening; no existing assertion is deleted or weakened | PASS | "Tests this feature owes" names 23 behaviours and their level. The existing zero-passage badge test, segmenter suite and restore suites stay green; the fit fallback and the phrase exclusions have refused-path tests. |
| III. Real Data, Real Behavior | Acceptance exercises real Chromium, real DOM measurement and the exact captured drawing; the stub is only the provider boundary | PASS | R1/R4 measured the live page in Chromium (42 shapes, 0 moved; `getBBox`; realistic Chinese width ratios). The accepted fixture is a capture with URL, date and scope recorded; the live page is a manual check; the stub is used only where a provider is legitimately external. |
| IV. Simplicity and Least Commitment | No new runtime dependency, permission, storage or message shape; complexity is two small modules with four real consumers; alternatives rejected in writing | PASS | R1 rejects a rendering engine and re-render; R6 rejects a second job; R13 rejects a Mermaid dependency, a new skip state and a new string. The two new modules are `graphics.ts` (one concept, four consumers) and `label-renderer.ts` (the fit path, one consumer + tests). |
| V. Accessible and Localizable by Default | Replacing the label's text is what AT reads; role/name/reading order survive; RTL direction is applied; no new string; no colour-only meaning; 200 % zoom remains legible | PASS | FR-021 and contract §8; `direction: rtl` is a CSS property on the label; the drawing is never hidden or duplicated; no catalog entry is added because no new sentence exists. |
| Workflow: no secrets; traceability; no unjustified dependency | Credential path untouched; every task will cite an FR and a test; no package added | PASS | The feature lives entirely in the content script; no request path, storage key or UI surface changes. |

**Gate result**: PASS. No principle is violated. Complexity Tracking records the costs that are
accepted, not exceptions.

### Post-design re-check (after Phase 1)

Re-read against [data-model.md](./data-model.md), the two [contracts](./contracts/) and
[quickstart.md](./quickstart.md):

1. **A new stored value?** None. The seen-set and label state are run-scoped; the journal is memory
   (data-model §10–§11).
2. **A second source of state?** The page is still the source of truth for text; the run's unit list
   and seen-set are derived from it. No second translation path is created: labels use the same job.
3. **A new user-visible string?** None. A same-language phrase uses the existing skipped surface; a
   fit fallback is not a failure state and adds no sentence.
4. **A widened blast radius?** `segmenter.ts`, `renderer.ts`, `restorer.ts`, `job.ts`,
   `observer.ts` and `selection.ts` change, plus two new modules. The prose path is preserved: the
   block rendering contract is untouched; the segmenter's new branches run only when a graphic root is
   present; restore adds a journal kind, not a second mechanism.
5. **A requirement the mechanism cannot meet?** The fit floor uses the label's own bounds, not an
   enclosing box; that is the conservative reading of FR-010 and the reported case's widths fit
   (0.62–0.84). A multi-line label collapses to one line; a phrase split across sibling `<text>`
   elements is treated as separate labels; an in-place text mutation by the page is not observed. All
   three are recorded in R14 and the contracts, not hidden.
6. **A state that could contradict the story?** A fit fallback leaves the unit `translated` while the
   occurrence shows source text. The data-model records it as a render outcome; the count is per
   distinct phrase, and the spec's SC-016 asks for the source text, not a skip. No contradiction with
   FR-018 (failure) or FR-012 (pending).
7. **A hint that could lie?** The label request is asserted to contain the 6 phrases and none of the
   style-sheet tokens; the seen-set test asserts no second unit after a re-collect. A label cannot be
   reported translated without a non-empty provider result.

No new violation was found; the gate result stands.

## Project Structure

### Documentation (this feature)

```text
specs/010-preserve-rendered-diagrams/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: R1–R15, measured decisions
├── data-model.md        # Phase 1: graphic, label, translation, journal, states
├── quickstart.md        # Phase 1: automated and manual scenarios
├── contracts/
│   ├── label-extraction.md   # what is read from a drawing, and what is never read
│   └── label-rendering.md    # in-place writes, fit, journal, modes, accessibility
└── checklists/
    └── requirements.md  # Spec quality gate (16/16)
```

### Source Code (repository root)

```text
src/content/
├── graphics.ts          # NEW: graphic roots, label roots/runs, label text joining, phrase rule,
│                        #      graphicRootOf(), isGraphicLabel()
├── label-renderer.ts    # NEW: write runs, measure, shrink-to-floor, fallback, direction
├── segmenter.ts         # MODIFIED: graphic branches, label harvest, seen-set, subtree/hasBlock guards
├── renderer.ts          # MODIFIED: renderLabel(), measureLabel injection, delegate to label-renderer
├── restorer.ts          # MODIFIED: text journal entry; style entry accepts Element
├── job.ts               # MODIFIED: label render branch, no pending marks, seen-set, collect climb
├── observer.ts          # MODIFIED: ignore mutations inside a graphic; report a new graphic root
└── selection.ts         # MODIFIED: resolve a selection/point inside a graphic to the graphic root

tests/
├── unit/
│   ├── graphics.test.ts             # NEW: phrase table, joining, root classification
│   └── segmenter-labels.test.ts     # NEW: 6 phrases, exclusions, boundaries, duplicates, seen set
├── dom/
│   ├── label-renderer.test.ts       # NEW: write/clear, journal, shrink, floor, RTL
│   ├── job-labels.test.ts           # NEW: request/counts, no pending, duplicates, fit fallback
│   ├── observer-labels.test.ts      # NEW: internal mutations ignored, new root reported
│   └── selection-graphic.test.ts    # NEW: graphic root targeting
├── e2e/
│   ├── diagram-labels.spec.ts       # NEW: captured article, 3 modes, shapes, restore
│   ├── diagram-privacy.spec.ts      # NEW: requests/counts exclude styles
│   ├── diagram-guards.spec.ts       # NEW: opaque, drawing-only, late
│   ├── diagram-long-labels.spec.ts  # NEW: shrink/fallback, no overlap
│   ├── diagram-a11y.spec.ts         # NEW: translated labels, role/name
│   ├── diagram-target-change.spec.ts # NEW: a new run after a target-language change
│   └── diagram-large.spec.ts        # NEW: 5,000 elements / 200 labels, 2 s
├── fixtures/
│   ├── pages/article-eval-driven-development.html  # NEW: captured diagram + adjacent prose
│   ├── pages/diagram-opaque.html                   # NEW: canvas, photo, plugin, frame, media, math, icon
│   ├── pages/diagram-only.html                     # NEW: only a label-bearing drawing
│   ├── pages/diagram-late.html                     # NEW: SVG injected after 700 ms
│   ├── pages/diagram-long-labels.html              # NEW: long target translations
│   ├── pages/diagram-large.html                    # NEW: 5,000 elements / 200 labels
│   └── README.md                                   # MODIFIED: capture provenance and new fixtures
└── support/                                        # existing stub/fixtures reused; a per-test
                                                    # translate function supplies the measured set

specs/005-fix-duplicate-translations/contracts/page-markup-ownership.md  # MODIFIED: label text/style
                                                    # entries and the no-marker rule
README.md                                             # MODIFIED: the diagram behaviour in "What it is"
```

**Structure Decision**: The existing single-project layout is kept. `graphics.ts` is the domain
vocabulary four modules need — the segmenter, the renderer, the job and selection — and putting it in
the segmenter would make the renderer import an extraction module or duplicate the phrase rule.
`label-renderer.ts` keeps the measurement/shrink path out of the already-large renderer and makes the
jsdom test possible with an injected measurer. No package boundary is added.

## Complexity Tracking

No principle is violated. Three costs are accepted with their reasons:

| Considered | Why it was chosen or rejected | Where recorded |
|---|---|---|
| **Two new modules** (`graphics.ts`, `label-renderer.ts`) | One concept with four consumers, and a measurement path that jsdom cannot execute without an injection; inlining would duplicate the phrase rule and make the renderer untestable | R2, R4, R11 |
| **Run-scoped `WeakSet` of label roots** | Labels cannot carry a marker (FR-014) and a translated label's text no longer matches its old id; without it a re-collect reads the translation as source | R7 |
| **Fit decided per occurrence, no new unit state** | A translation exists and is paid for; the phrase unit stays `translated`, an occurrence that cannot fit keeps its source. A per-occurrence state would touch the shared model, counts and messages for an edge the spec treats as "the original stays" | R12, data-model §7 |
| **Own-bounds width, not an enclosing box** | The product cannot reliably tell which shape frames a label across drawing libraries; the label's own footprint is the conservative bound and the reported CJK widths fit (0.62–0.84) | R4 |
| **No Mermaid/rendering dependency** | The diagram source is not in the DOM; a renderer would be a new runtime dependency and would move shapes | R1, R13 |
| **No new skip state or message** | A fit fallback is an outcome, not a failure; a new state would touch the model, UI and tests for no reader-facing gain | R12 |

## Risks and decisions the reviewer should see

| Risk | Treatment |
|---|---|
| **A multi-line label collapses to its first line** (a `<text>` with several `<tspan>` lines receives the translation in its first run, the other lines are cleared). | The reported diagram's labels are single-line. The contract records the boundary; a DOM test covers the write/restore. Line-balanced re-wrapping is a separate feature if it is ever wanted. |
| **A phrase split across sibling `<text>` elements is two labels.** | The grouping unit is one text-bearing element; sibling elements are separate by DOM structure. The contract states the boundary; the captured and authored fixtures use one element per label. |
| **The page mutates a translated label's text in place.** | The observer does not watch `characterData`; a replaced drawing root is new and is translated. A text-only re-render of the same root is a recorded limitation; the reported diagram is static after hydration. |
| **`textLength`/`lengthAdjust` fixes rendered width.** | The fit measures the rendered box and falls back to source text; no reference fixture uses it. |
| **CJK labels may be wider than the source.** | The live probe measured 0.62–0.84 for the reported phrases; a 2.1× synthetic case is the fallback test. The 75 %/10 px floor is the bound. |
| **The fit loop forces layout.** | It runs only when a translation arrives; 1 px steps are bounded by the floor; the 200-label size test bounds it. |
| **The observer could loop on the fit's style write.** | Mutations inside a graphic are ignored; `collect` climbs to the graphic root; the seen-set makes a climb harmless. The observer test asserts no collect loop. |
| **The page replaces the whole SVG after translation.** | The new root is not in the seen-set and is harvested again; the old, detached units are not rendered. The late/replaced fixture asserts this. |
| **A provider returns a translation that does not fit.** | The label keeps its source text; the unit is still `translated` and is counted once. No blank or clipped text is ever shown. |

## Specification amendments

Three plan-time findings were written back into [spec.md](./spec.md) in this change set, as principle
I requires. They narrow a definition, record two readings, and resolve a direct contradiction between
the fit/RTL writes and the old blanket "no typography" rule; no success criterion changes.

| # | Where | Before | After | Why |
|---|---|---|---|---|
| A1 | FR-004 | "the text runs a drawing lays out as one label MUST be grouped" — no grouping unit | adds: a label root is one text-bearing element (one `<text>`, or one HTML label root in a `foreignObject`); its runs are the text nodes inside it; sibling text elements are separate labels | The segmenter needs a decidable unit. A sibling `<text>` element is structurally a separate label in every drawing in the reference set; merging by class or position would guess. |
| A2 | FR-010, Assumptions | FR-010 offered "its own bounds, or the bounds of a box or lane drawn around it"; Assumptions said only that the fit rule was fixed | FR-010 uses the label's own rendered bounds only; Assumptions record that no enclosing box is detected, and that a phrase which cannot fit keeps its source text without becoming a failure, skip or new state | The conservative bound is what the product can guarantee across drawing libraries; the reported widths fit it (R4). The fallback is a render outcome, not a unit state (data-model §7). |
| A3 | FR-009, FR-010, FR-014 | FR-009 forbade any size change; FR-010 listed direction as kept; FR-014 banned any typography or direction write inside a drawing | FR-009 distinguishes shape sizes from label type size; FR-010 allows an RTL target to set the label root's direction; FR-014 permits exactly the fit's `font-size` and the RTL `direction` style writes, both journalled | The fit (FR-010) and the RTL rendering rule (FR-021) otherwise contradict FR-014's blanket ban; the amendment names the two writes the product actually makes and nothing more. |

## Interpretations recorded in this plan

These are the remaining choices inside the specification's wording:

1. **Grouping** is now defined by A1: the text nodes inside one label root, including its `<tspan>`
   lines. A phrase split across sibling `<text>` elements is treated as separate labels (Risk table).
2. **"The space the label occupied"** is now defined by A2: the label's own rendered bounds, not an
   enclosing box. The reported Chinese widths fit within their sources.
3. **A fit fallback is a render outcome**, not a new unit state, skip reason or message (data-model
   §7). The phrase was translated, so the unit remains `translated`; the occurrence keeps its source.
4. **SC-001's deterministic translation set** is the measured Chinese set from R4, supplied through
   the stub's existing per-test `translate` function. The default `【译】` prefix would make every
   label longer and test fallback, not the reported case.
5. **The space-less-source consequence** is already recorded in the spec's Assumptions; this plan
   implements it rather than adding a language-specific character heuristic.

## Tests this feature owes

Every row names a behaviour the spec requires and the test that will prove it. No existing assertion
asserts the old drawing-only-wrapper behaviour, so none needs to change; the empty SVG page's
zero-passage expectation is unchanged and the boundary suites are re-run (T20).

| # | Behaviour | Level | Proves |
|---|---|---|---|
| T1 | The phrase table accepts the 6 reported phrases and refuses the 4 names, "loop", the numbers, a style rule and a one-letter variable | unit | FR-003, SC-001 |
| T2 | `labelText` joins `<tspan>` lines with spaces and keeps an inline styled word intact; a wrapped phrase is one label | unit | FR-004 |
| T3 | A wrapper `<div>` whose only child is an SVG produces zero units and zero skipped passages; the style sheet never appears in a unit | unit | FR-002, FR-008, SC-001 |
| T4 | A block mixing prose and an SVG keeps the prose passage and harvests the drawing's labels separately; prose text never absorbs SVG text | unit | FR-006 |
| T5 | A phrase repeated in two labels is one queued unit and one occurrence; a late collect with the seen-set adds nothing; a replaced root is eligible again | unit | FR-004, FR-008, SC-008 |
| T6 | Labels inside nav, `translate="no"`, hidden or editable regions are left untouched; opaque roots produce no unit | unit | FR-007, FR-008 |
| T7 | A label write changes the run text, clears the other runs, journals a `text` entry, and restores the exact DOM hash | dom | FR-009, FR-013 |
| T8 | With an injected measurer, a wider translation (and, for an HTML label, a taller wrapped one) shrinks to the floor; below the floor the original text and inline style are restored, with no residual `font-size` | dom | FR-010, SC-016 |
| T9 | A translated label receives no sibling block, no `data-ipt`, no pending mark; display mode/style/typography changes do not touch it; RTL sets `direction` and restores it | dom | FR-011, FR-012, FR-014, FR-015 |
| T10 | A label unit is requested, counted and charged once; its style sheet is never in a request; a duplicate occurrence is written from the same translation | dom | FR-016, FR-017, SC-002, SC-003, SC-008 |
| T11 | The observer ignores attribute/child mutations inside a graphic and reports a new graphic root; a fit style write causes no new collect | dom | FR-008, FR-012 |
| T12 | A selection inside a drawing resolves to the graphic root; a prose selection is unchanged | dom | FR-019, SC-011 |
| T13 | The captured article in 3 modes: 6 phrases translated, 4 names + loop unchanged, 42 shapes at 0 px, no style-sheet text | e2e | SC-001, SC-005, SC-011 |
| T14 | Request bodies contain the 6 phrases and no `@keyframes`, `#mermaid-`, `{font-family`; counts equal prose + phrases | e2e | SC-002, SC-003 |
| T15 | Opaque chart/photo/plugin/frame/media/math and an inline icon are preserved and unsent; a drawing-only page translates its phrases; a late SVG root translates | e2e | FR-007, FR-008, FR-020, SC-006, SC-007, SC-015 |
| T16 | A long target makes a label shrink to the floor or keep its source; 0 clipped/overlapping labels; 0 moved shapes | e2e | FR-010, SC-016 |
| T17 | Restore after 20 translate/restore cycles returns the captured hash and every label's original text | e2e | FR-013, SC-004 |
| T18 | AT reads the translated phrase; role/name preserved; no duplicate announcement | e2e | FR-021, SC-012 |
| T19 | A 5,000-element/200-label drawing reaches its first visible translation within 2 s; no stylesheet in any request/report/log | e2e | FR-023, SC-014 |
| T20 | **Re-run**: the zero-passage `empty-body.html` page still has 0 translated and 0 skipped; existing segmenter/renderer/restore suites stay green | e2e / unit | FR-001, FR-012, FR-022 |
| T21 | A phrase already in the target language is refused with no request and stays byte-identical to its drawn text | unit / e2e | FR-005, SC-009 |
| T22 | A label whose request fails keeps its original text, is reported through the existing failure channel, and is never blank or partial | dom / e2e | FR-018, SC-013 |
| T23 | After a target-language change and the next run, every eligible label is re-collected and shown in the new language; 0 duplicates or stale strings | e2e | FR-015, SC-010 |

## Phases

- **Phase 0**: [research.md](./research.md) — R1–R15, each with the measurement or code fact that
  settled it, the alternatives refused and the requirement served. No `NEEDS CLARIFICATION` remains.
  R1/R4 carry the live Chromium measurements; R7 carries the no-marker constraint; R14 carries the
  accepted risks.
- **Phase 1**: [data-model.md](./data-model.md), [contracts/label-extraction.md](./contracts/label-extraction.md),
  [contracts/label-rendering.md](./contracts/label-rendering.md), [quickstart.md](./quickstart.md) —
  the entities, the journal's new text entry, the fit rule, the extraction boundary, and the runnable
  way to see each criterion.
- **Phase 2** (`/speckit-tasks`): dependency-ordered tasks, each citing its FR and its test. The fit
  and the captured fixture come first; the size test and the live manual check come last.
