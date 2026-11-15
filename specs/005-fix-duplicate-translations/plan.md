# Implementation Plan: One Translation Per Passage, However Often Translate Is Pressed

**Branch**: `005-fix-duplicate-translations` | **Date**: 2026-11-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-fix-duplicate-translations/spec.md`

## Summary

Make translation activation **idempotent per page**. Today every `translatePage` command builds a
fresh `TranslationJob` after cancelling the previous one, and `cancel()` leaves whatever was already
rendered on the page. The new run then segments the page *including the product's own output*, so a
second press produces a second translation per paragraph, and the first run's rendered translations
re-enter segmentation as if they were source text (for container-tag sources such as list items and
table cells the container sits inside the source, so the next pass reads it as part of that block).
Verified in the repository's own harness: two runs over a two-paragraph page ended with **four**
`[data-ipt="target"]` blocks, and the second run's unit list contained the first run's translations.

The fix is a single-run slot owned by the page agent, decided **synchronously** before the handler's
first `await`:

- **absorb** — an activation arriving while a run is starting, running, or already finished for the
  same target starts nothing, requests nothing and renders nothing (spec FR-001..FR-006);
- **replace** — an activation for a *different* target (for example a whole-page press after a
  selection-only run: the spec settles that as a replacement, so those passages are translated again
  rather than kept), or one arriving after an explicit stop, first cancels **and replays the previous
  run's journal** so the page never holds output from two runs (FR-007, FR-008);
- **restore** gains the cancellation it was missing, so turning translation off during a run cannot
  leave a late reply rendered into a restored page (FR-010..FR-012).

The claim is taken **before** the page is judged translatable, so a refusal (restricted page,
unsupported content, no enabled provider) settles the slot as failed: the reader sees one report
however often they press, and the slot never leaks a stale "starting" phase.

A second, independent guard closes the root cause rather than only the symptom: the segmenter never
reads `[data-ipt="target"]` subtrees as source text (FR-005, FR-017). The marker strings move into
one shared module so writer, reader and restorer cannot drift.

No new storage key, no schema change, no new dependency, no new user-visible string, no control
relabelled. Every existing behaviour of a single press is preserved (FR-016, FR-019, FR-020).

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict, `noUncheckedIndexedAccess`), ES modules; Node.js 20 LTS for tooling only.

**Primary Dependencies**: none at runtime (platform APIs only). Build Vite 5.4.10; tests Vitest 2.1.4, jsdom 25.0.1, Playwright 1.48.2, @types/chrome 0.0.287 — all pinned in `package.json`.

**Storage**: none added and none changed. `chrome.storage.local` (`SettingsStore`, `schemaVersion` 2) is read as today; the run slot is per-page in-memory state inside the content script, exactly like the existing `job` variable it replaces.

**Testing**: Vitest unit tests in `tests/unit` (node) for the new activation policy and the segmenter ownership guard; jsdom DOM tests in `tests/dom` for job-level double runs, renderer placement and journal-exact restore; Playwright end-to-end in `tests/e2e` with the unpacked extension in real Chromium, real `chrome.storage.local` and the repository's HTTP stub provider, asserting both rendered output and the **request count** observed at the provider boundary.

**Target Platform**: Chromium-family desktop browsers, Manifest V3 extension (`minimum_chrome_version` 120).

**Project Type**: Single browser-extension project (content script, service worker, options page, popup) — no backend.

**Performance Goals**: An absorbed activation must cost nothing measurable: zero provider requests and no re-segmentation of the page. A 100-passage page translates after five activations within 5% of the single-activation duration (SC-007). A replacement replays one journal — no network work — before starting.

**Constraints**: No new dependency, storage key, schema bump, locale key or user-visible string; no control relabelled or disabled in a new way. At most one translation run per page, one journal per page, one rendered translation per source passage. Restore must remain byte-exact (`domHash`, zero residue, scroll position). Absorbing must not swallow a genuine new target. Absorbed activations must consume no session or site volume (FR-013). CSP untouched.

**Scale/Scope**: One user-facing decision (what a repeat press does) touching five modules: a new pure `run-slot.ts`, a new `markers.ts` constant module, the page agent `index.ts`, the `segmenter.ts` guard, and `renderer.ts` re-exports. No UI markup change. 20 functional requirements, 12 success criteria, 3 user stories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Gate | How this plan satisfies it | Verdict |
|---|---|---|
| I. Specification Before Code (NON-NEGOTIABLE) | `spec.md` fixes the intended behaviour (absorb, not restart), the replacement rule, the restore rule and the request-count rule before any code; each task in `tasks.md` will cite the FR it satisfies, and this plan records the two behavioural decisions that implementation must not improvise (R2, R6). | PASS |
| II. Test-First (NON-NEGOTIABLE) | Every behaviour starts with a failing test: the claim race and the decision table in `tests/unit/run-slot.test.ts`; the ownership guard in `tests/unit/segmenter.test.ts` (a page already holding product output yields no unit); job-level double runs and exact restore in `tests/dom`; five-activation request counts, one failure report, one cap notice and exact restore in a new `tests/e2e/repeat-translate.spec.ts`. Refused paths (press during run, press after completion, press after stop, different selection, failing provider, capped run) are tested, not only the happy path. The regression test fails before the fix — the DOM double-run test reproduces four target blocks today. | PASS |
| III. Real Data, Real Behavior (NON-NEGOTIABLE) | The e2e proof runs the real unpacked extension in real Chromium, drives the real message wire the popup uses, and reads the real `requests` array of the HTTP stub provider — the ratified external boundary this product does not own. The rendered page is inspected, not a mock of it. No in-memory stand-in is accepted as evidence. | PASS |
| IV. Simplicity and Least Commitment | No dependency, no storage key, no schema migration, no new message type, no new locale string, no options UI. The decision is one pure function plus one synchronous claim; the marker module removes three copies of a literal rather than adding an abstraction. Activating-while-running absorbs instead of the more elaborate restart-and-reconcile design (rejected in R2). | PASS |
| V. Accessible and Localizable by Default | No new string, so nothing new to translate; no control is relabelled or newly disabled. An absorbed activation moves neither focus nor scroll position and keeps every journey keyboard-operable (FR-020, SC-012). Nothing carries meaning by colour. | PASS |
| Workflow: no secrets, traceability, no unjustified dependency | No credential path touched; `parseCommand` still refuses credential fields; every FR maps to an SC and to a test in the traceability table of `data-model.md`; dependency list unchanged. | PASS |

**Gate result**: PASS. No violations, so the Complexity Tracking table stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-fix-duplicate-translations/
├── plan.md                         # This file
├── spec.md                         # Feature specification
├── research.md                     # Phase 0: R1–R9, decisions and rejected alternatives
├── data-model.md                   # Phase 1: run slot, decisions, invariants, traceability
├── quickstart.md                   # Phase 1: runnable verification guide
├── contracts/
│   ├── activation-lifecycle.md     # Phase 1: activation/decision/restore contract
│   └── page-markup-ownership.md    # Phase 1: who owns [data-ipt], and who may not read it
├── checklists/
│   └── requirements.md             # Spec quality checklist (from /speckit-specify)
└── tasks.md                        # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── content/
│   ├── run-slot.ts             # NEW: the page's single run slot — pure state machine,
│   │                           #      synchronous claim(), decision table, no DOM/chrome/timers
│   ├── markers.ts              # NEW: TARGET_MARKER / SOURCE_MARKER — one definition, three readers
│   ├── index.ts                # page agent: claim before the first await; absorb / replace / run;
│   │                           #   discard previous journal on replace; cancel before restore;
│   │                           #   settle the slot on completion, failure and cancellation
│   ├── segmenter.ts            # guard: a [data-ipt="target"] subtree is never source text
│   │                           #   (silently pruned — no skip count, no new SkipReason)
│   ├── job.ts                  # unchanged public surface (cancel()/restore() already exist);
│   │                           #   replacement is composed by the page agent, not inside the job
│   ├── renderer.ts             # imports the markers from markers.ts and re-exports them,
│   │                           #   so every existing import path keeps working
│   ├── observer.ts             # imports the markers; its "our own injection" test stops
│   │                           #   hardcoding the attribute name
│   └── restorer.ts             # unchanged: journal replay + residue audit stay the only
│                               #   restoration path (residue never becomes the safety net, R5)
├── shared/
│   └── messages.ts             # unchanged command/status types; the reply of translatePage does
│                               #   carry { absorbed: true, reason } for tests and logs (R8)
└── ui/
    └── popup/popup.ts          # not changed by this feature: no new control, label, string
                                #   or disabled state (a separate visual redesign is in flight)

tests/
├── unit/
│   ├── run-slot.test.ts        # NEW: decision table, claim race, settle/reset, same-target identity
│   └── segmenter.test.ts       # (extend) product output is never segmented or counted
├── dom/
│   ├── job-repeat.test.ts      # NEW: two jobs over one page — what a second run does to the DOM,
│   │                           #   and that a replay before the second run leaves one set
│   └── restorer.test.ts        # (extend) journal-exact restore after a replaced run
├── support/
│   └── e2e-fixtures.ts         # (extend) repeatCommand(): fire N activations over the real wire
└── e2e/
    └── repeat-translate.spec.ts # NEW: five activations, one translation per passage,
                                 #   request count unchanged, exact restore, one failure notice,
                                 #   one cap notice, popup double press
```

**Structure Decision**: Keep the single-extension layout. Exactly two new modules, both small and both
justified by a specific requirement rather than by symmetry:

- `src/content/run-slot.ts` exists because the guarantee is a **state machine with a race**, and the
  page agent that owns it (`index.ts`) is a module-level side-effect file with `chrome` globals that no
  test can load. Putting the decision in a pure, dependency-free module is what makes FR-001..FR-003
  testable in milliseconds under the node environment instead of only through Playwright. The same
  module owns the target-identity comparison (`sameTarget`), so FR-008/FR-018 are decided by the same
  fast tests instead of only by the browser suite.
- `src/content/markers.ts` exists because three modules (renderer writes, segmenter must not read,
  observer must not re-translate) now depend on the same two literal strings; one definition removes
  the drift that produced this defect. It is a constant module, not an abstraction layer.

`job.ts`, `restorer.ts`, `messages.ts`, the popup and every stylesheet are left alone unless a task
finds a requirement they cannot meet — the replacement and restoration semantics are composed by the
page agent from the primitives the job already exposes (`cancel()`, `restore()`, `journal`).

An unrelated popup/options visual redesign is in flight in the working tree at the time of planning. It
touches the same popup file but not the activation path (the `#translate` click handler, `render()` and
the `jobUpdated` listener keep their behaviour). This feature neither depends on nor reverts it, and no
task may pull that redesign into scope.

## Complexity Tracking

> No constitution violations. Nothing to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 0: Outline & Research

Unknowns extracted from Technical Context and the spec, resolved in [research.md](./research.md):

- **R1** — Which surface must own the single-run rule: the popup, the service worker, or the page agent.
- **R2** — What "a run is in progress or its result is displayed" means as state, and which repeat activations absorb versus replace.
- **R3** — How to close the race between two activations that both pass a check, given that the handler awaits settings and provider resolution before any job exists.
- **R4** — How the segmenter stops reading the product's own output as source text without changing skip counts or adding a user-visible string.
- **R5** — What happens to the previous run's journal when an activation replaces a run, and why the residue audit in `restorePage` must not be the safety net.
- **R6** — Whether turning translation off during a run is already safe, and what restore must do if it is not.
- **R7** — Test strategy and the smallest honest surface that proves each success criterion, including the request-count proof.
- **R8** — How an absorbed activation is observed and reported without adding a message type, a status field or a user-visible string.
- **R9** — Performance and scale: what an absorbed activation costs, and what a replacement costs.

All items are resolved; none is marked NEEDS CLARIFICATION.

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — the run slot (phases, outcomes, transition table), the activation
  record the page agent keeps, the marker vocabulary, invariants, validation rules and the
  FR → test traceability table. Includes the explicit statement that nothing is persisted.
- [contracts/activation-lifecycle.md](./contracts/activation-lifecycle.md) — the activation contract:
  who may activate, the decision table, ordering guarantees, the reply shape, the restore contract,
  the single-journal invariant and page independence.
- [contracts/page-markup-ownership.md](./contracts/page-markup-ownership.md) — the `[data-ipt]` ownership
  contract between renderer, segmenter, observer and restorer: what each may write, what each may read,
  what may never be treated as source text, and the residue rule.
- [quickstart.md](./quickstart.md) — runnable validation scenarios mapped to success criteria, with the
  one-command-per-package workflow the constitution requires.

**Supersession**: none. This plan adds contracts; it does not amend feature 001's messaging or rendering
contracts, and the `translatePage`/`toggleTranslation` message shapes are unchanged.

## Post-Design Constitution Check

| Principle | Re-check after Phase 1 design | Verdict |
|---|---|---|
| I | The two contracts pin the decision table, the reply shape, the single-journal invariant and the markup ownership rules; the spec's FRs map to contract sections and to tests. | PASS |
| II | Each designed artefact names its failing test first: run-slot table and race, segmenter ownership, job double-run, e2e request counts, restore hash. | PASS |
| III | The request-count criterion is verified at the real provider boundary through the stub's `requests` array; the DOM is the real rendered page in real Chromium. | PASS |
| IV | Two small modules, no dependency, no storage change, no new message type, no new string; the restart-and-reconcile alternative is documented as rejected. | PASS |
| V | Nothing new to localize; focus and scroll untouched by an absorbed activation; keyboard journeys unchanged and covered by the a11y assertions already in the suite. | PASS |

**Gate result**: PASS.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Absorbing a press that a reader expected to be a retry after a failure (FR absorbs same-target presses even when the run failed). | This changes no reachable popup flow: after a failure the control already offers restore, so the reader's retry path stays restore → translate. Documented in R2; the e2e test asserts one failure notice and the existing recovery test still turns translation off and on. |
| Cancelling before restoring changes the timing of a restore that previously raced in-flight replies. | Intended (FR-011) and covered by a new e2e case that restores mid-run and asserts `expectNoResidue` plus an unchanged `domHash`; no existing test depended on the old behaviour. |
| The segmenter guard could alter skip counts on pages that already contain `[data-ipt]` markup (a site cloning our node). | The guard prunes silently — no skip counter, no new `SkipReason`, no locale key — and `segmenter.test.ts` asserts both the absence of a unit and an unchanged skip count. |
| Selection identity by element reference could absorb a genuinely new selection that resolves to the same elements. | Those elements *are* the same passages, so the second request would be the duplicate this feature forbids; a genuinely new selection is a different element set and takes the replace path. |
| A same-target repeat press gives no new visual feedback, so the reader may think the control is broken. | The claim happens before the first await and the run broadcasts its state immediately, so the control flips to its running state on the first press — the same latency as today; no new UI is added (FR-019). |
| Five concurrent messages over the real wire make the e2e timing-sensitive. | Assertions poll (`expect.poll` on job status and on `stub.requests.length`) instead of sleeping, and the wire test is separate from the popup double-press test so one flaky surface cannot hide the other. |
| Moving the marker constants could break an import. | `renderer.ts` re-exports both constants, so every existing import path and test keeps compiling; `npm run typecheck` is a gate. |
