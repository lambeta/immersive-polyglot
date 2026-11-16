# Implementation Plan: A Loading Mark on the Passage Being Translated, and Translation Requested on Demand

**Branch**: `007-progressive-translation` (the working tree stays on `master`; this project
registers no `before_plan` hook) | **Date**: 2026-11-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-progressive-translation/spec.md`

## Summary

Stamp a per-passage progress mark into the slot a translation will occupy, and stop sending the whole
page to the provider at once. Work is gated at **dispatch**, not at segmentation: the page is still
segmented locally and once (it costs nothing and keeps passage ids stable), but a passage is only
*requested* and only *marked* when it lies in the reader's demand window — the visible area plus a
fixed one-screenful lookahead.

Six small modules make that possible, and each one replaces something that exists today rather than
duplicating it:

1. **The mark is a renderer-owned container in the translation slot**, carrying
   `data-ipt="pending"` instead of `data-ipt="target"`, journalled like any other page write. When
   the translation arrives the *same node* becomes the translation: text in, `data-ipt` rewritten,
   style and typography applied. That is what makes "replaced in the same position" true by
   construction instead of by hoping two separate nodes line up, and it is why turning translation off
   removes marks without a second restoration mechanism.
2. **A demand predicate over measured geometry** (`demand.ts`) decides which passages are in range.
   It is a pure function of rectangles, so the boundary cases — a passage taller than the screen, one
   entirely above the viewport, one zero-height because it is collapsed — are unit-testable in jsdom,
   where no layout exists.
3. **A viewport watcher** (`viewport.ts`) turns scrolling, resizing, zooming, tab visibility and
   newly arriving content into "the demand window may have changed" notifications, coalesced to one
   per frame. `IntersectionObserver` does the per-element bookkeeping Chromium is built for; the seam
   is injectable because jsdom has no observer.
4. **A dispatch pump** (`demand-pump.ts`) owns the order and the concurrency of outbound batches:
   visible passages first, lookahead behind them, re-sorted whenever the window moves, never cancelling
   a request that was already sent. The existing concurrency ceiling still applies; the pump simply
   never hands the limiter more work than it can start.
5. **An open page run** (`page-run.ts`) composes those four with the job. A run no longer resolves
   when "the page" is translated; it resolves when the *demand* the reader has reached is translated,
   and it keeps accepting demand afterwards — so scrolling is not a second run and 005's
   one-run rule is untouched.
6. **A reading-position guard** (`scroll-anchor.ts`) records the rectangle of the first passage below
   the reader's viewport top before a batch renders and corrects the scroll only if the browser did not
   compensate. Inserting text above a reader who is reading is the one layout effect this feature would
   otherwise cause, and SC-008 makes it a hard 4 px budget.

Preserved deliberately: the provider wire format, the message protocol, the storage schema, the
fifteen display styles, display modes, typography, the failure taxonomy, the volume caps, selection
translation, and `TranslationJob.run()` as the "translate this whole target" entry point — which is
exactly what a demand window covering the document still means, and what keeps the existing DOM tests
meaningful.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict, `noUncheckedIndexedAccess`), classic IIFE bundle for
the content script, ES modules for the service worker and the two extension pages; Node.js 20 LTS for
tooling only.

**Primary Dependencies**: none at runtime (platform APIs only). Build Vite 5.4.10; tests Vitest 2.1.4,
jsdom 25.0.1, Playwright 1.48.2, @types/chrome 0.0.287 — all already pinned. This feature adds no
package.

**Storage**: unchanged. No new key, no schema version bump, no migration (FR-034). Demand, marks and
queue order are ephemeral page state, held in memory exactly as unit state is today.

**Testing**: Vitest unit tests for the pure demand predicate, the pump's ordering and cancellation,
the scroll-anchor arithmetic and the mark's state rules (`tests/unit`); jsdom DOM tests for the mark
lifecycle against the renderer/journal and for the observer's changed duty (`tests/dom`); Playwright
end-to-end in real Chromium against the unpacked extension and the repository's HTTP stub provider
(`tests/e2e`), where the stub records which passages were actually requested — that record is the
evidence for SC-002, SC-004 and SC-005.

**Target Platform**: Chromium-family desktop browsers, Manifest V3. `IntersectionObserver`,
`prefers-reduced-motion`, the Page Visibility API and `requestAnimationFrame` are all available in
the supported range; no polyfill is added.

**Project Type**: Single browser-extension project (service worker, content script, panel, settings
page) — no backend.

**Performance Goals**: the mark for a passage on screen appears before that passage's request is
issued and, at the product level, within the first frame after the demand window is published; the
work performed per scroll frame is bounded by the elements whose intersection state changed, not by
the number of passages on the page (SC-012: no scroll response delayed by more than 50 ms); a
200-passage page costs at most 30 % of today's characters when only the first 20 passages are read
(SC-004).

**Constraints**: no new runtime dependency; no new message type or provider field; every new
user-visible string is forbidden (the mark is wordless — FR-034, and the i18n audit test enforces it);
the content script must stay a classic IIFE bundle; all page writes go through `Journal` so
restoration stays exact (FR-023); the mark must not be selectable, focusable, announced, printed, or
styled by any of the fifteen display styles; the lookahead is a fixed product constant, not a setting.

**Scale/Scope**: 4 user stories, 37 functional requirements, 13 success criteria. Touch points: 6 new
content modules, 1 new fixture page plus its generator, and modifications to `markers.ts`,
`renderer.ts`, `job.ts`, `index.ts`, `observer.ts` (duty change only) and `styles/content.css`.
No change to `src/background/**`, `src/ui/**`, `src/shared/**` or the manifest.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Gate | How this plan satisfies it | Verdict |
|---|---|---|
| I. Specification Before Code (NON-NEGOTIABLE) | `spec.md` carries 4 prioritised stories, 37 FRs, 13 SCs, edge cases, recorded assumptions, explicit out-of-scope items and one clarification (2026-11-15) on what the panel reports at rest. This plan records the approach; `research.md` records every decision with the rejected alternative; `contracts/` pin the mark, the window and the queue; each task in `tasks.md` will cite its FR and its proving test. The one behaviour the spec changes rather than adds — late content being requested on arrival — is called out in the spec (FR-018), here, and in the tests it obliges. | PASS |
| II. Test-First (NON-NEGOTIABLE) | Every behaviour is mapped to a test in [Tests this feature owes](#tests-this-feature-owes), including refused and boundary paths (cap refusal, failed passage, mark at restore time, passage above the window, lookahead boundary at exactly one screenful, background tab). The change to existing expectations is enumerated and justified there rather than absorbed silently; no assertion is deleted or loosened. | PASS |
| III. Real Data, Real Behavior (NON-NEGOTIABLE) | Demand is proven in real Chromium, where rectangles exist, against the real unpacked extension and real `chrome.storage.local`; the stub provider is the one permitted double and it records the passages actually requested, so the cost claims are measured at the real boundary. jsdom is used only for the pure predicate and for DOM lifecycle, never to claim layout. | PASS |
| IV. Simplicity and Least Commitment | Six small modules, each replacing an existing responsibility rather than adding a parallel path: the mark reuses the renderer, the container and the journal; the pump reuses the limiter as the hard ceiling and adds only ordering; the open run reuses `RunSlot`; `run()` keeps its meaning. No setting, dependency, message, storage key or provider field is added. The lookahead is a constant, not a preference — a knob nobody asked for is complexity with a UI. | PASS |
| V. Accessible and Localizable by Default | The mark is `aria-hidden`, wordless, non-focusable and non-selectable, so the catalog gains no key and the reading order is unchanged; it honours `prefers-reduced-motion` and is suppressed in print; layout tolerance is preserved because the mark occupies the slot the translation would have taken. Keyboard, screen-reader and RTL/zoom checks are acceptance criteria (FR-028..FR-030, SC-009, SC-010). | PASS |
| Workflow: no secrets; traceability; no unjustified dependency | No credential path is touched; the content script still holds no secret. No dependency is added. Each task will name its FR and its test. | PASS |

**Gate result**: PASS. No principle is violated, so the Complexity Tracking table stays empty.

### Post-design re-check (after Phase 1)

Re-read against [data-model.md](./data-model.md), the three [contracts](./contracts/) and
[quickstart.md](./quickstart.md). Four things the design could have slipped in, and did not:

1. **A new stored or transmitted value.** The data model adds `data-ipt="pending"` to the page's own
   markup and nothing else: no storage key, no schema version, no message field, no provider field
   (FR-034). Verified by reading §6 of the data model, which lists what is deliberately absent.
2. **A second rendering or restoration path.** The mark is the translation container before it holds
   text, journalled once (R3). `Renderer`, `Journal` and `restorePage` stay the only mechanisms.
3. **A new user-visible string or an a11y regression.** The mark is wordless and `aria-hidden`; the
   panel's vocabulary is unchanged (R9); keyboard order, reading order and the target-language marking
   of translations are untouched ([pending-mark contract §5](./contracts/pending-mark.md)).
4. **A widened blast radius.** `src/background/**`, `src/ui/**`, `src/shared/**` and the manifest are
   unmodified, so the credential path, the routing and the settings surface cannot regress.

No new violation was found; the gate result stands.

## Risks and decisions the reviewer should see

| Risk | Treatment |
|---|---|
| **Changing late-content behaviour** (FR-018) contradicts how the observer works today: content that arrives is translated on arrival. Off-screen late content will now wait for the reader. | This is a specified change, not a defect. T11 rewrites that expectation and asserts the new rule; the spec states it, so code and specification do not diverge (Constitution I). |
| **Existing e2e tests on long fixture pages** assume the whole page translates before they assert. | Enumerated as T12. The tests scroll and then assert, or assert only in-window passages. No assertion is removed (Constitution II). |
| **The clarify session ended before the out-of-window queue question was answered.** | Settled at the recommended option in [research R5](./research.md) with the rejected alternatives and the exact requirements that would change if the reviewer chooses C (FR-020, FR-024). |
| **Scroll anchoring is page-dependent.** | R8 keeps the browser mechanism and adds a measured guard, proven on a page that disables anchoring (T14). |
| **A very long page could hold many marks in memory.** | Bounded by the window: marks exist only for passages inside one-and-a-bit screens, so the count is bounded by what fits on a screen plus the lookahead (dispatch-queue §5.3). |

## Project Structure

### Documentation (this feature)

```text
specs/007-progressive-translation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output: decisions and rejected alternatives
├── data-model.md        # Phase 1 output: passages, marks, windows, queue entries
├── quickstart.md        # Phase 1 output: how to see and prove the behaviour
├── contracts/
│   ├── pending-mark.md      # What the mark may be, do and never do
│   ├── demand-window.md     # When a passage may be requested or marked
│   └── dispatch-queue.md    # Order, concurrency, reordering and cancellation
└── checklists/
    └── requirements.md  # Spec quality checklist (already passing)
```

### Source Code (repository root)

```text
src/
├── content/
│   ├── index.ts             # MODIFIED: activation wiring, open run, observer duty
│   ├── job.ts               # MODIFIED: demand-scoped dispatch, mark lifecycle, run() kept
│   ├── renderer.ts          # MODIFIED: showPending / settlePending / pending re-place
│   ├── markers.ts           # MODIFIED: PENDING_MARKER
│   ├── observer.ts          # MODIFIED: reports new content, no longer requests it
│   ├── demand.ts            # NEW: pure demand predicate and demand ordering
│   ├── viewport.ts          # NEW: coalesced viewport/visibility notifications
│   ├── passage-index.ts     # NEW: block ↔ parts ↔ duplicates bookkeeping
│   ├── demand-pump.ts       # NEW: ordered, ceiling-bounded batch dispatch
│   ├── scroll-anchor.ts     # NEW: keep the passage under the reader's eye in place
│   └── page-run.ts          # NEW: composes job + window + pump + anchor for one open run
├── styles/
│   └── content.css          # MODIFIED: the mark's own rules, reduced motion, print
└── background/**, ui/**, shared/**   # UNCHANGED by design (FR-034)

tests/
├── unit/     # demand, pump, anchor, mark rules, i18n audit (existing suite extended)
├── dom/      # mark lifecycle, journal restore with a mark on screen, observer duty
├── e2e/      # demand scope, scroll growth, restore, caps, a11y, reduced motion, anchor
├── fixtures/pages/article-endless.html   # NEW: 200+ deterministic passages
└── support/stub-provider.ts             # EXTENDED: record requested passages per page
scripts/
└── make-long-fixture.mjs    # NEW: regenerates the fixture deterministically
```

**Structure Decision**: The existing single-project layout is kept — `src/content` for the page agent
and `tests/{unit,dom,e2e}` for the three layers it already uses. The new modules live beside the
modules they compose rather than in a new directory, because they are content-script concerns with the
same lifetime as the job and no other consumer. No framework-style boundary is introduced
(Constitution IV).

## Complexity Tracking

No principle is violated; this table is intentionally empty. Two places where a more elaborate design
was available and rejected are recorded for the reviewer:

| Considered | Why rejected | Where recorded |
|---|---|---|
| A separate "progressive renderer" beside the existing one | Two renderers means two journals, and restoration would have to know which one owns a node — the exact class of defect 005 fixed | [research R3](./research.md) |
| Priority support inside `RequestLimiter` | The limiter's FIFO order is unit-tested behaviour and a published contract of feature 001; ordering is a demand concern, so it lives in the pump while the limiter stays the hard ceiling | [research R6](./research.md) |

## Phases

- **Phase 0**: `research.md` — nine decisions (R1..R9), each with rationale and the rejected
  alternatives. No item is left as NEEDS CLARIFICATION; the one question the clarify session left
  unanswered is settled here and flagged.
- **Phase 1**: `data-model.md`, three contracts, `quickstart.md` — the shapes, the invariants and the
  runnable way to see each success criterion.
- **Phase 2** (`/speckit-tasks`): dependency-ordered tasks, each citing its FR and its test.

## Tests this feature owes

Every row names a behaviour the spec requires that no test pins today. Rows marked **changed** rewrite
an existing expectation because the specification changes that behaviour; none deletes an assertion.

| # | Behaviour | Level | Proves |
|---|---|---|---|
| T1 | Demand predicate: visible, below-lookahead, above-viewport, taller-than-screen, zero-height, exact one-screenful boundary | unit | FR-010, FR-012 |
| T2 | Demand ordering: visible passages before lookahead, document order within each group | unit | FR-013 |
| T3 | Pump: unsent batches re-sort behind newly visible passages; sent batches are never cancelled | unit | FR-020, R5 |
| T4 | Pump: never exceeds the provider ceiling; starts the next batch as one retires | unit | FR-014 |
| T5 | Mark: one per passage, wordless, `aria-hidden`, not focusable, no display-style attribute, never a second one for a translated passage | unit + dom | FR-001, FR-004, FR-005, FR-028 |
| T6 | Mark lifecycle: mark → translation in place (same node), on success, failure, cancel, cap refusal, restore; sampled at 100 ms it never shows both and never shows a translation that no mark preceded | dom | FR-003, FR-008, FR-021, FR-022, SC-003 |
| T7 | Restore while marks are on screen returns the pre-translation DOM hash and scroll position; a run after the restore inherits no mark | dom + e2e | FR-009, FR-023, FR-026, SC-007 |
| T8 | A skipped passage and a passage outside the window never receive a mark | dom | FR-006, FR-012 |
| T9 | Repeated passage inside the window is filled without a request (no mark, or a mark that settles at once) | dom | FR-015 |
| T10 | "Translation only" keeps the source visible while its mark shows, hides it when the translation arrives | dom | FR-002 |
| T11 | **changed**: late content is collected on arrival and requested only when it enters the window | dom + e2e | FR-018 |
| T12 | **changed**: a long fixture page reports only in-window passages requested; the test scrolls and then asserts the rest | e2e | FR-010..FR-013, FR-020, SC-002 |
| T13 | The recorded characters sent drops to at most 30 % when reading 20 of 200 passages | e2e | SC-004 |
| T14 | Scroll position of the passage under the reader is preserved across fills, including on a page that sets `overflow-anchor: none` | e2e | FR-027, SC-008 |
| T15 | Reduced motion: the mark is static but visible | e2e | FR-029, SC-010 |
| T16 | Background tab requests nothing until it is visible again | e2e | FR-016 |
| T17 | Cap reached mid-page: no mark survives, one cap notice | e2e | FR-019, FR-021 |
| T18 | No new locale key: the i18n audit stays green with an unchanged catalog | unit | FR-034 |
| T19 | Scroll work stays bounded on a 300-passage page | e2e | SC-012 |
| T20 | Selection translation still works and now shows marks for the passages it targets | dom + e2e | FR-035 |
| T21 | Mark stays identifiable on light, dark, tinted and mid-gray pages and at 100 %, 150 % and 200 % zoom; it does not scale with translation typography | e2e + measurement | FR-007, FR-030 |
| T22 | Resize, zoom change and an anchor jump are treated exactly like scrolling: the new range is requested once, nothing already translated is touched | e2e | FR-011 |
| T23 | A page whose passages all fit on one screen translates in full with the same request count and the same result as today | e2e | FR-017, SC-011 |
| T24 | Pressing translate while marks are on screen adds no mark and no request; a run after an explicit stop starts exactly one new run | unit + e2e | FR-025, FR-024 |
| T25 | The panel reports `translating` only while a round is in flight and `translated` with the counts reached when the reader's screen is drained; counts grow on later rounds; the turn-off action stays available | e2e | FR-031 |
| T26 | Two tabs translate independently: no marks, requests or charges cross between them | e2e | FR-036 |
| T27 | Sampling the page at the ten documented moments yields zero stray marks | e2e | SC-006 |
| T28 | Keyboard-only journey from turning translation on to turning it off is unchanged; the mark never takes focus and is never announced | e2e (existing a11y suite extended) | FR-037, SC-009 |
| T29 | Every fixed passage on screen shows a mark or a translation within 1 second of the press, across 20 trials | e2e | SC-001 |
| T30 | The full existing suite (unit, DOM, e2e, style verification) passes with nothing skipped, weakened or excluded | all | FR-032, FR-033, SC-013 |

**Preserved behaviour** (FR-032, FR-033, SC-013) is proved by keeping the existing suites unmodified
and green: placement, the three display modes, the fifteen display styles, typography, the failure
taxonomy, one translation per passage, duplicate reuse and the volume caps already have tests, and T30
is the requirement that they still pass. The only rows that change existing expectations are T11 and
T12, both called out in [Risks](#risks-and-decisions-the-reviewer-should-see).
