# Implementation Plan: Complete Translation of Long Source Blocks

**Branch**: `003-fix-long-block-translation` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-fix-long-block-translation/spec.md`

## Summary

The reported abstract is not a translation-quality problem; it is a presentation defect. Segmentation
already splits a long block into sentence-grouped units that share one source element (feature 001,
FR-010). The job renders each unit as soon as its result arrives, and the renderer keeps one
translation per source element, so every later unit removes the translation its sibling just rendered.
On the reported page the abstract is four units, of which exactly one survives.

The fix makes completeness a property of the **block**, not of the request:

1. A translation part carries its 0-based position within its source block, so source order is
   explicit rather than inferred from arrival or collection order.
2. The job groups the parts that belong to one source element and composes their translated text in
   that order; the renderer updates the existing translation block in place instead of removing and
   re-creating it. The passage grows as parts arrive and no part ever displaces another.
3. Duplicate registration is corrected from per-element to per (element, part position), because the
   current key drops every part after the first and would leave a repeated long paragraph
   half-translated even after the renderer is fixed.

Nothing changes in segmentation size, batching, prompts, provider calls, storage, settings, or the
number of requests. Restore still replays one inserted block per source block.

**Coordination with feature 002.** The working tree already carries feature 002's display-style work
(`data-ipt-style`, `setDisplayStyle`, `recordAttributeOnce`). This plan composes with it: the block
update path replaces only the container's text, so the style attribute, the style-switch command and
the one-container invariant are untouched, and feature 002's style suites stay green.

## Technical Context

**Language/Version**: TypeScript 5.6.3, `strict` with `noUncheckedIndexedAccess` — unchanged. No new
runtime language surface; Node.js 20 LTS for tooling only.

**Primary Dependencies**: **none added**. DOM and CSSOM APIs only, through the existing renderer and
restorer. No new package, permission, or build mode.

**Storage**: **none**. No schema bump, no new key, nothing per page. The block aggregate and the part
position are ephemeral job state, exactly like today's unit list; the persisted shape in
`contracts/storage-schema.md` of feature 001 is untouched.

**Testing**: Vitest 2.1.4 with jsdom for part positioning, block composition, in-place updates,
duplicates, partial failure, modes and restore; the existing Playwright 1.48.2 suite against real
Chromium, real `chrome.storage.local` and the local stub provider for the end-to-end path; a captured
fixture of the reported article's front matter makes SC-001 decidable offline. No new runner, no new
harness.

**Target Platform**: Chromium-family desktop browsers, Manifest V3, Chrome/Edge 120+ — unchanged.

**Project Type**: Single project: one browser extension with a service worker, one content script and
two extension pages.

**Performance Goals**: each part arrival re-renders its own block once, so work is linear in parts;
100 four-part blocks render in under 1 s in jsdom (absolute CI guard); the request count for every
reference page is identical to the pre-fix run (SC-006, SC-009).

**Constraints**: exactly one translation container per source block; parts composed in source order
regardless of arrival; the source block is never moved, wrapped, rewritten or truncated; a failed or
cancelled part is absent rather than replaced by placeholder text; restore replays one insert per
block and returns the baseline DOM hash; the complete passage carries the target language and stays
readable for CJK and RTL targets; no new user-visible string.

**Scale/Scope**: four source files edited (types, segmenter, renderer, job); one new DOM test suite,
additions to the segmenter, renderer, restorer and batcher suites, one new e2e spec; two fixtures plus
the fixture index; 17 functional requirements, 10 success criteria.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v1.0.1.

| Principle | Gate | Status | Evidence |
|---|---|---|---|
| I. Specification Before Code | Spec exists, criteria decidable, scope bounded, requirement-to-task traceability planned | PASS | [spec.md](./spec.md) carries 3 stories with Given/When/Then, 17 FRs, 10 measurable SCs and a bounded Out of Scope; every planned task will cite an FR |
| II. Test-First | Every behaviour begins with a failing test; no skip-based greening | PASS | The regression test for the reported abstract is written and observed failing before the fix; part ordering, in-place update, duplicates, partial failure and restore each get an intended-path and a refused-path test |
| III. Real Data, Real Behavior | Acceptance runs against the real boundaries | PASS | E2E runs real Chromium, real storage, real HTTP; the SC-001 fixture is a verbatim capture of the reported page's front matter, labelled with URL, date and reason; one manual check on the live page is recorded |
| IV. Simplicity and Least Commitment | No unrequested features, no dependency, complexity earned | PASS | Zero dependencies, no new module, no storage or settings change; one field, one map in the existing job and one update path in the existing renderer |
| V. Accessible and Localizable by Default | One accessible passage, language declared, no new strings, RTL safe | PASS | The complete block is one container carrying the target language, so screen readers read it continuously and find locates every part; no UI text is added; placement rules already cover LTR and RTL |

Gate result: **PASS**. No unresolved clarifications: the specification carries none, and every
unknown in the Technical Context is resolved in Phase 0 ([research.md](./research.md)).

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-long-block-translation/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1-R8
├── data-model.md        # Phase 1: block, part, aggregate, rendered block, duplicates
├── quickstart.md        # Phase 1: how to prove the fix end to end
├── contracts/
│   └── block-rendering.md   # one container per block, ordering, update, modes, restore
├── checklists/
│   └── requirements.md      # spec quality gate (complete)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── types.ts                 # EDIT  TranslationUnit.partIndex (ephemeral, documented)
└── content/
    ├── segmenter.ts             # EDIT  assign partIndex per source element; carry it on duplicates
    ├── renderer.ts              # EDIT  update text in place; keep data-ipt-style and one container
    └── job.ts                   # EDIT  group parts per element, compose in part order, fix duplicate key

tests/
├── unit/
│   ├── segmenter.test.ts        # EDIT  part positions 0..n-1, stable for repeats, duplicate carries part
│   └── batcher.test.ts          # EDIT  unit fixture gains partIndex (required field)
├── dom/
│   ├── renderer.test.ts         # EDIT  one container, in-place growth, same unit replace, modes
│   ├── block-rendering.test.ts  # NEW   end-to-end block composition and restore with a fake caller
│   └── restorer.test.ts         # EDIT  multi-part block restores to the baseline hash with one insert
├── e2e/
│   └── long-block.spec.ts       # NEW   reported page and authored long-block fixture through the stub
└── fixtures/
    ├── README.md                # EDIT  record the capture (URL, date, reason) and the authored fixture
    └── pages/
        ├── article-tests-as-data.html  # NEW  verbatim capture of the reported article's front matter
        └── article-abstract.html       # NEW  authored long abstract plus surrounding blocks

package.json                     # unchanged
scripts/                         # unchanged
```

**Structure Decision**: No new module or layer. The aggregate lives inside the existing job, which
already owns unit lifecycle and knows when a part is terminal; the renderer keeps its single
responsibility (present one source block) and gains update-in-place semantics. A separate
`block.ts` was rejected because it would hold two maps and be called from one place — a layer, not a
boundary. The part position belongs on the unit because both the job and the tests need to state
source order without depending on arrival order.

## Phase 0: Research (complete)

Eight decisions, all resolved; full rationale in [research.md](./research.md):

- **R1**: The defect is presentation, not segmentation: four units share one source element and the
  renderer's one-container-per-element rule lets each unit delete its predecessor.
- **R2**: One container per source block, updated in place, composing all translated parts in source
  order; no second container and no remove/reinsert cycle.
- **R3**: Source order is carried explicitly as a 0-based part position on the unit and on the
  duplicate entry, instead of being inferred from collection or arrival order.
- **R4**: Parts are joined with a single space after trimming; the source block's own text already had
  its boundaries normalized, and a space preserves word boundaries for Latin targets.
- **R5**: Duplicate entries are keyed per (element, part position); the current per-element key drops
  every part after the first, which is the same class of loss for repeated long blocks.
- **R6**: A failed, empty or cancelled part is omitted; the remaining parts still render in order and
  no placeholder is fabricated. The block may show a subset until the remaining parts arrive.
- **R7**: Journal and restore are unchanged: one insert per rendered block, attributes journalled at
  first render, in-place text growth inside our own node needs no entry.
- **R8**: Verification is test-first: a DOM regression test with reversed arrival, the captured
  front matter for SC-001, and a real-Chromium e2e run through the stub provider; request counts are
  compared against the pre-fix run.

## Phase 1: Design (complete)

- [data-model.md](./data-model.md) — source block, translation part, block aggregate, rendered block,
  duplicate block, restore record; validation rules and state transitions.
- [contracts/block-rendering.md](./contracts/block-rendering.md) — the DOM contract: one container,
  ordered composition, in-place update, display modes, duplicates, partial results, restore.
- [quickstart.md](./quickstart.md) — the runnable proof: failing-before/passing-after, automated
  suites, the captured page, and the manual live-page check.

### Post-Design Constitution Re-check

| Principle | Re-check | Status |
|---|---|---|
| I | Every artifact traces to FRs; SC-001/002/003/005/006 are made decidable by the captured fixture, the ordering tests, the hash comparison and the request count | PASS |
| II | Each behaviour names its failing test first, including the refused paths (empty part, failed part, swapped arrival) | PASS |
| III | The e2e path uses real storage, real HTTP and real Chromium; the live page is checked once by hand and recorded | PASS |
| IV | No dependency, no module, no storage key, no setting; the part field is the smallest representation that makes order explicit | PASS |
| V | One passage with the target language, no new interface string, existing RTL placement rules preserved | PASS |

Gate result: **PASS**.

## Complexity Tracking

No violations. The change adds no dependency, no module, no storage key and no setting. The one new
field exists because FR-001 and FR-003 require source order independent of arrival, and the one new
job map exists because the job is the only component that knows when a block's parts are terminal.
Both are exercised by tests named in the tasks.
