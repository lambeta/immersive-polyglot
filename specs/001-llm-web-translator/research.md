# Phase 0 Research: Immersive Web Translator

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-13

All unknowns raised by the Technical Context are resolved below. Each decision records what was
chosen, why, and what was rejected.

---

## R1. Extension toolchain: TypeScript + Vite, no extension framework, no UI framework

**Decision**: Ship hand-written MV3 entries (`manifest.json`, service worker, content script, popup,
options) compiled by Vite, typed with `@types/chrome`. TypeScript 5.6 in `strict` mode. No UI
framework, no state library, no router.

**Rationale**: The product's entire interaction surface is one popup, one options page, and injected
markup. A UI framework would be adopted to render three forms and a list. Constitution principle IV
requires complexity to be earned, and neither the DOM work (which is imperative and page-owned) nor
the configuration UI (three screens) earns a framework. Vite covers the actual need: TypeScript
compilation, multiple entry points, and asset copying for a `chrome://extensions`-loadable bundle.

**Alternatives considered**: WXT / Plasmo (extension frameworks) — genuinely convenient, but they
abstract the manifest, which is the artifact we most need to read and defend at review time, and they
add a build-time dependency plus a release cadence we do not control. React — rejected: no component
reuse beyond a handful of form controls, and its reconciliation model fights direct page mutation.
Rollup by hand — rejected: Vite is the same engine with the dev loop already solved.

---

## R2. Rendering: reproduce Immersive Translate's behaviour clean-room from frozen captures

**Decision**: Do not reuse any Immersive Translate code. Reproduce its observable rendering behaviour
— translation placement relative to the source segment, the display-mode set, and the
mutation/restoration semantics — implementing it from scratch against a frozen corpus of reference
captures (see [contracts/rendering-dom.md](./contracts/rendering-dom.md)).

**Rationale**: Immersive Translate is not open source. Its repository states plainly that it does not
contain the source code, and notes that the legacy open-source project was archived on 2023-01-17
([repository notice](https://github.com/immersive-translate/immersive-translate)). The archived
predecessor (`old-immersive-translate`) is available under **MPL-2.0**
([LICENSE](https://raw.githubusercontent.com/immersive-translate/old-immersive-translate/main/LICENSE)).
Using it would mean either vendoring MPL-2.0 files (file-level copyleft, disclosure obligations, and a
codebase frozen three years ago that does not match today's behaviour) or reconstructing from outdated
code, which is worse than observing current behaviour directly. Clean-room reproduction also satisfies
FR-015 in the only way it is verifiable: by matching captured behaviour rather than by claiming
lineage.

**Alternatives considered**: (a) Copy current source — impossible, not published. (b) Vendor the
MPL-2.0 archived project — licensing is tractable but the code is stale and would create a maintenance
surface we do not own, plus a disclosure obligation on every modified file. (c) Depend on Immersive
Translate being installed and drive it — rejected by the user's clarification and by FR-016. (d) Invent
our own rendering — violates FR-015 and the user's explicit constraint.

**Risk and mitigation**: This is the plan's largest risk: behaviour reproduced from observation can
diverge silently. Mitigation is the frozen capture corpus plus SC-011's structural comparison, run per
release. Where a behaviour cannot be reproduced faithfully, it is escalated as a spec change, not
approximated (recorded in the spec's rendering assumption).

---

## R3. Execution model: content script owns the job, service worker owns the wire

**Decision**: The content script owns translation job state and all page mutation. It talks to the
service worker over a long-lived `chrome.runtime.Port` for every network call. The service worker
holds no job state and is treated as terminable at any moment: if it dies, the content script
reconnects and re-issues the outstanding request.

**Rationale**: Manifest V3 service workers are terminated after roughly 30 seconds of inactivity, and
a translation job on a long article can run for minutes. Anything stateful in the worker would be lost
mid-flight. Meanwhile the credential and cross-origin `fetch` cannot live in the content script: page
CORS applies to page-context requests, and FR-021/FR-022 forbid exposing the credential to anything
adjacent to page context. Splitting responsibilities this way puts durability where lifetime exists
(content script lives as long as the page) and keeps secrets where isolation exists (extension origin).
Port message traffic resets the worker's idle timer, so an active job keeps it alive without the
"keep-alive hack" of a self-pinging worker; and because the worker is stateless, its death is a
non-event.

**Alternatives considered**: `chrome.offscreen` document holding the whole pipeline — justified for
DOM-dependent APIs only; we need none, and it adds a second lifetime model. All-in-worker fetching with
job state in `chrome.storage.session` — writes per batch, and still loses in-flight streams on
termination. All-in-content-script fetch — blocked by page CORS and leaks the credential.

---

## R4. Credential storage: `chrome.storage.local`, service-worker-only reads

**Decision**: Providers and credentials persist in `chrome.storage.local`. The credential value is
read only inside the service worker, is never included in messages to content scripts, never rendered
unmasked after entry, and is deleted by FR-024's one-action wipe.

**Rationale**: `chrome.storage.local` is isolated from page context, so page scripts cannot read it
(FR-021). It is **not encrypted at rest** — an attacker with local filesystem access to the profile can
read it. That limitation is documented in the privacy disclosure (FR-023) rather than papered over with
a key we would have to store beside the ciphertext, which would be security theatre. Credentials are
held in `chrome.storage.local` rather than `session` so they survive restarts per the spec's
assumptions.

**Alternatives considered**: Passphrase-derived encryption (Web Crypto + PBKDF2) — real security for the
at-rest threat, but it forces a passphrase unlock on every browser start, which is a product-level UX
decision the spec does not authorize; recorded as a future option, not implemented now. `storage.session`
only — loses credentials on restart, contradicting the assumption that settings survive restarts.
Storing nothing and prompting per session — defeats the daily-reader use case.

---

## R5. Testing: Vitest + jsdom + Playwright against a real browser and a real stub provider

**Decision**: Three layers. (1) Vitest over pure logic — segmentation, batching, prompt assembly,
response parsing, retry/backoff, redaction. (2) Vitest + jsdom over DOM behaviour — renderer,
restorer journal, observer idempotence. (3) Playwright launching a real Chromium with the unpacked
extension via persistent context, loading local fixture pages and calling a **local stub provider
server** over real HTTP.

**Rationale**: Constitution principle III forbids declaring a feature done on the strength of a
stand-in that bypasses the real boundary, and allows doubles only at external, unowned boundaries.
The stub provider is exactly that boundary: the user's provider is not ours to run. Everything else is
real — real Chromium, real `chrome.storage`, real HTTP, real DOM. jsdom is used only where the logic
is genuinely DOM-shaped but does not need layout; anything requiring real layout, CSP behaviour, or
extension APIs goes to Playwright.

**Alternatives considered**: Mocking `fetch` in unit tests only — fast but proves nothing about the
wire, and would let a broken request shape ship. Puppeteer — Playwright's persistent-context extension
loading and fixture server story is more direct. Manual QA — cannot run per release, so SC-003/004/011
would be unverifiable.

**Scope of the stub**: success, credential rejection (401), rate limit (429 + Retry-After), malformed
body, oversized response, slow/streaming response, and connection reset. Each maps to an error class in
[contracts/provider-adapter.md](./contracts/provider-adapter.md).

---

## R6. Segmentation: block-level text extraction with hash dedupe and stable IDs

**Decision**: Walk the DOM, collect text from block-level elements, split over-long blocks at sentence
boundaries, skip non-content by declaration (navigation, forms, editable, `pre`/`code`, hidden,
already-target-language), assign each segment a stable ID derived from its document position plus a
content hash, and dedupe identical source text within the page.

**Rationale**: FR-007 through FR-011 and FR-014 all hinge on segment identity. Stable IDs are what let a
streamed response land on the right node after the page mutates (edge case: changing pages) and what
makes dedupe (FR-011) and cancellation (FR-012) tractable. Sentence-level splitting keeps each unit
inside a provider's reliable output length and improves translation quality on long paragraphs.

**Alternatives considered**: Whole-element translation (one request per block, no splitting) — simpler
but degrades on long blocks and multiplies request count. Text-node walk without block awareness —
produces fragments that translate badly and cannot be placed. Hash-only IDs — collide on repeated
identical text and break alignment when content shifts.

---

## R7. Provider contract: OpenAI-compatible chat completions, batched, JSON-array output

**Decision**: A provider is defined by endpoint, credential, model identifier, extra headers, and a
request template. Requests are chat-completion shaped with a system instruction that mandates a JSON
array of translated strings in input order, plus glossary and style rules. Batches are sized by an
estimated token budget, sent with a bounded concurrency ceiling, optional streaming, explicit timeouts,
and bounded retries with jitter.

**Rationale**: The user's requirement is "user-defined LLM provider", and the de-facto common shape is
the OpenAI-compatible chat completion — which is also what Immersive Translate's own custom-AI flow
speaks, so users arrive with a configuration they already understand. JSON-array output is what makes
FR-008 (segment correspondence) mechanically verifiable instead of heuristic. Exposing header and
template overrides covers providers that differ without shipping a release (FR-004).

**Alternatives considered**: One request per segment — simplest alignment, but 10-100x the request count
and cost, and unacceptably slow on large pages. Free-form text with delimiter parsing — brittle, and the
failure mode silently misaligns translations. A plugin API per provider — explicitly out of scope.

**Parsing and failure taxonomy**: missing/short/long array, invalid JSON, embedded markdown fences,
preamble text, partial stream, and per-index errors each map to a defined outcome (retry the batch,
retry the subset, or mark specific units failed) — never to a silently wrong rendering (FR-020).

---

## R8. Restoration: journaled inverse mutation

**Decision**: Every write to the page is recorded at the moment of write — inserted nodes, added
attributes, and class/style changes — in a per-page journal. Toggling translation off replays the
journal in reverse. Re-running translation is a restore followed by a fresh journal.

**Rationale**: FR-019 requires the original page back, exactly, with scroll position intact, and
SC-008 requires 20 cycles without DOM growth. Reconstructing "the original" by querying for our own
markers fails when the page or a framework rewrote the surrounding DOM; replaying a journal of what we
did is O(changes) and cannot leave residue. It also makes the toggle idempotent, which the observer
needs in order to avoid loops (edge case: mutating page).

**Alternatives considered**: Remove-by-selector on toggle — leaks nodes when the site clones or moves
our markup, and cannot restore attribute changes. Snapshot the whole `body` and restore it — destroys
page state, breaks React/hydration, and is enormous on real pages.

---

## Open items carried into `/speckit-tasks`

None blocking. Two execution-time obligations, both recorded as tasks rather than decisions:

1. Capture the reference rendering corpus from Immersive Translate once, by hand, and freeze it under
   `tests/fixtures/captures/`. Manual because store installation is interactive.
2. Verify one real provider end to end each release, in addition to the stub (principle III).
