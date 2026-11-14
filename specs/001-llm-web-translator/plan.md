# Implementation Plan: Immersive Web Translator with User-Supplied LLM Providers

**Branch**: `001-llm-web-translator` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-llm-web-translator/spec.md`

## Summary

Build a Manifest V3 browser extension that translates the readable content of a page with a
provider the user configures, and displays the result using Immersive Translate's bilingual
rendering behaviour reproduced inside this product's own display path.

Two facts drive the whole design:

1. **Immersive Translate is closed source.** Its GitHub repository states it contains no source
   code; the legacy open-source project was archived in January 2023 and is MPL-2.0. Rendering is
   therefore **reproduced clean-room from captured reference behaviour**, never copied. This is
   recorded as research decision R2 and is the single largest schedule risk.
2. **The user's credential is the only translation path.** There is no vendor backend, no proxy,
   no account. The provider layer is the product's whole server-side surface, and it is entirely
   user-owned configuration.

Architecture in one line: the content script owns the translation job and the page mutation, the
service worker owns credential-bearing network calls, and an options/popup UI owns configuration.

## Technical Context

**Language/Version**: TypeScript 5.6, `strict` with `noUncheckedIndexedAccess`; Node.js 20 LTS for
tooling only (no runtime Node dependency in the shipped extension)

**Primary Dependencies**: runtime — none beyond platform APIs (`chrome.*`, DOM, Web Crypto). Build
and test — Vite 5, Vitest 2 with jsdom, Playwright 1.48, `@types/chrome`. Deliberately no UI
framework: the extension surface is a popup, an options page, and injected markup (see R1)

**Storage**: `chrome.storage.local` for providers, routing rules, glossary, site preferences (10 MB
quota, ample); `chrome.storage.session` for per-tab translation job state; translation units live in
content-script memory for the lifetime of the page. No database, no file system, no remote storage

**Testing**: Vitest for segmentation, batching, prompt assembly, retry policy, credential masking and
DOM restore; jsdom for rendering/restoration logic; Playwright driving a real Chromium with the
unpacked extension against local fixture pages and a local stub provider server (R5)

**Target Platform**: Chromium-family desktop browsers, Manifest V3, Chrome/Edge 120+

**Project Type**: Single project — a browser extension with three execution contexts (service worker,
content script, extension pages)

**Performance Goals**: first translated segments visible within 5 s of trigger on a typical article
(SC-003); segmentation of a 5,000-node page under 150 ms; no main-thread task over 50 ms during
injection; 60 fps scrolling preserved while translation streams in

**Constraints**: no vendor backend; credential never leaves the device except to the configured
endpoint; service worker may be terminated after ~30 s idle, so jobs must not depend on it staying
alive; page CSP may block inline styles and scripts, so styling uses manifest-declared CSS plus CSSOM
property assignment; `chrome.storage.local` is isolated from page context but not encrypted at rest
(documented limitation, R4); memory growth per page must stay bounded across repeated
translate/restore cycles (SC-008)

**Scale/Scope**: one user, one device; up to ~5,000 translatable segments per page; typically 1-5
providers and under 50 routing rules; 3 user-facing surfaces (popup, options, injected page UI);
32 functional requirements, 11 success criteria

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v1.0.1.

| Principle | Gate | Status | Evidence |
|---|---|---|---|
| I. Specification Before Code | Spec exists, criteria decidable, scope bounded, requirement-to-task traceability planned | PASS | [spec.md](./spec.md) has 5 stories with Given/When/Then, 32 FRs, 11 measurable SCs, and an explicit Out of Scope; every task will cite an FR |
| II. Test-First | Every behavior testable before implementation; no skip-based greening | PASS | R5 defines the test stack per layer; tasks.md will order failing test before implementation per behavior |
| III. Real Data, Real Behavior | Acceptance runs against real persistence and real boundaries | PASS with noted exception | e2e runs a real Chromium, real `chrome.storage`, real HTTP against the stub provider (an external boundary, permitted by the principle); a manual checklist additionally exercises one real provider each release |
| IV. Simplicity and Least Commitment | No unrequested features, dependencies justified, complexity earned | PASS | Zero runtime dependencies; no UI framework; no state library; single package. Justified exceptions listed under Complexity Tracking |
| V. Accessible and Localizable by Default | All user-visible text in a catalog; keyboard operable; no color-only meaning; LTR/RTL safe | PASS with obligation | `_locales/` catalog from the first commit; popup/options keyboard-navigable; injected markup uses semantic elements and `lang` attributes so screen readers read translations in the right language |

Gate result: **PASS**. No unresolved clarifications: the spec carries none, and every `NEEDS
CLARIFICATION` in the Technical Context above was resolved in Phase 0 (see [research.md](./research.md)).

## Project Structure

### Documentation (this feature)

```text
specs/001-llm-web-translator/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1-R8
├── data-model.md        # Phase 1: entities, storage schema, state machines
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── provider-adapter.md    # user-configured provider contract
│   ├── rendering-dom.md       # behaviour to reproduce + reference-capture format
│   ├── extension-messaging.md # content script <-> service worker <-> UI protocol
│   └── storage-schema.md      # persisted configuration shape
├── checklists/
│   └── requirements.md        # spec quality gate (complete)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── manifest.json             # MV3 manifest (permissions, entries, _locales)
├── background/
│   ├── service-worker.ts     # message router, job/chunk relay
│   ├── provider-client.ts    # fetch, SSE streaming, retry, timeout, error taxonomy
│   └── credentials.ts        # credential read/mask/delete; never sent to content scripts
├── content/
│   ├── job.ts                # translation job orchestration (owns lifecycle)
│   ├── segmenter.ts          # readable-content extraction, dedupe, stable IDs
│   ├── batcher.ts            # grouping under provider limits, ordering, reuse
│   ├── renderer.ts           # reproduces Immersive Translate rendering behaviour (R2)
│   ├── restorer.ts           # exact page restoration on toggle-off (FR-019)
│   ├── observer.ts           # late content, mutation safety, cancellation
│   └── selection.ts          # translate-selection / single block (FR-013)
├── ui/
│   ├── popup/                # current-page control: trigger, cancel, provider, mode, usage
│   ├── options/              # providers, routing rules, glossary, style, privacy, delete-all
│   └── shared/               # i18n bindings, a11y primitives, credential field
├── shared/
│   ├── types.ts              # entities shared across contexts
│   ├── messages.ts           # typed message/port protocol (contracts/extension-messaging.md)
│   ├── settings.ts           # storage access, migration, defaults
│   └── prompt.ts             # translation instruction + glossary + JSON output contract
└── _locales/en/messages.json # source-locale catalog (principle V)

tests/
├── unit/                     # vitest: segmenter, batcher, prompt, retry, parser, masks
├── dom/                      # vitest + jsdom: renderer, restorer, observer idempotence
├── e2e/                      # playwright: real chromium, unpacked extension, fixture pages
├── fixtures/
│   ├── pages/                # 20 reference pages, frozen (SC-003, SC-004)
│   └── captures/             # reference rendering captures, frozen (SC-011)
└── support/
    ├── stub-provider.ts      # local HTTP provider: success, rate limit, malformed, slow
    └── load-extension.ts     # playwright persistent-context launcher
```

**Structure Decision**: Single project at repository root. The extension is one deployable artifact;
splitting packages would add build indirection without a consumer. The three execution contexts are
directories, not packages, because they share types and must ship in one manifest. Tests are split by
what they can actually prove: pure logic (`unit`), page-mutation logic in a DOM (`dom`), and
whole-product behaviour in a real browser (`e2e`).

## Phase 0: Research (complete)

Eight decisions, all resolved; full rationale in [research.md](./research.md):

- **R1**: TypeScript + Vite, no extension framework, no UI framework.
- **R2**: Rendering reproduced clean-room from reference captures (Immersive Translate is closed
  source; archived predecessor is MPL-2.0 and not used).
- **R3**: Job orchestration lives in the content script; network egress goes through the service
  worker via long-lived ports, keeping the worker alive by message traffic and surviving its
  termination.
- **R4**: Credentials in `chrome.storage.local`, readable only by the service worker, masked in UI,
  never sent to content scripts.
- **R5**: Vitest + jsdom + Playwright against a real browser and a real local stub provider.
- **R6**: Segmentation by block-level text nodes with hash-based dedupe and stable IDs.
- **R7**: Provider calls are OpenAI-compatible chat completions with JSON-array output, one batch per
  request, bounded concurrency, streaming optional.
- **R8**: Restore-by-inverse-mutation: every injected node and attribute is journaled at write time.

## Phase 1: Design (complete)

- [data-model.md](./data-model.md) — entities, storage schema, unit/job state machines, validation rules
- [contracts/provider-adapter.md](./contracts/provider-adapter.md) — what a provider must supply and
  how failures are classified
- [contracts/rendering-dom.md](./contracts/rendering-dom.md) — the rendering behaviour to reproduce and
  the capture format that makes SC-011 decidable
- [contracts/extension-messaging.md](./contracts/extension-messaging.md) — port/message protocol
- [contracts/storage-schema.md](./contracts/storage-schema.md) — persisted shape and migration
- [quickstart.md](./quickstart.md) — how to prove the feature works end to end

### Post-Design Constitution Re-check

| Principle | Re-check | Status |
|---|---|---|
| I | Design artifacts trace back to FR/SC; rendering contract makes SC-011 decidable | PASS |
| II | Every phase-1 artifact names the test that will prove it; no behavior is design-only | PASS |
| III | e2e asserts against real browser storage and real HTTP; stub is boundary-only | PASS |
| IV | Still zero runtime dependencies; no abstraction layer was added during design | PASS |
| V | i18n catalog + a11y obligations appear in the design, not deferred to polish | PASS |

Gate result: **PASS**. Complexity Tracking below records the three justified costs.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Three execution contexts with a message protocol (content job owner, service worker egress, UI) | MV3 requires network calls with user credentials outside page context, while page lifetime and DOM mutation live in the content script; the service worker is terminable, so it cannot own job state | Doing all networking in the content script is blocked by page CORS and would expose the credential to page-adjacent context, violating FR-021/FR-022. Single-context shortcuts fail one requirement or the other |
| Local stub provider server plus 20 frozen fixture pages in the test suite | SC-003/SC-004/SC-011 must be decidable per release, and FR-026 requires reproducing rate limits and malformed responses on demand | Testing only against a real provider makes the suite non-deterministic and costs money; testing only with mocked `fetch` would not exercise the real HTTP boundary that principle III requires |
| A reference-capture corpus pinned in the repo | FR-015/SC-011 bind us to Immersive Translate's observable rendering; without a frozen baseline the criterion is unfalsifiable | "Looks right" review cannot satisfy principle I, and eyeballing drifts silently as the product evolves |
