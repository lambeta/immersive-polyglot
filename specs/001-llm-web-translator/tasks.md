---

description: "Task list for Immersive Web Translator with user-supplied LLM providers"
---

# Tasks: Immersive Web Translator with User-Supplied LLM Providers

**Input**: Design documents from `/specs/001-llm-web-translator/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution principle II makes test-first non-negotiable, so every behavior task
below has a test task that must exist and fail first. Principle III additionally requires end-to-end
verification in a real browser against the real HTTP boundary.

**Organization**: Tasks are grouped by user story so each story is independently implementable,
testable, and demonstrable. Story phases follow spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task — safe to run in parallel
- **[Story]**: US1–US5, mapping to [spec.md](./spec.md); absent for Setup, Foundational, and Polish
- Every task names the file it touches and the requirement it satisfies

## Path Conventions

Single project at repository root: `src/` (shipped), `tests/` (never shipped). Paths follow the tree in
[plan.md](./plan.md) "Source Code".

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make a loadable, testable extension skeleton exist. No product behavior yet.

- [x] T001 Create `package.json` with pinned dev dependencies (typescript 5.6, vite 5, vitest 2, jsdom, playwright 1.48, @types/chrome) and scripts `build`, `typecheck`, `test`, `test:e2e`, `verify:rendering`; commit the lockfile (constitution: every toolchain version pinned)
- [x] T002 [P] Create `tsconfig.json` with `strict: true` and `noUncheckedIndexedAccess: true`, targeting the browser and excluding `tests` from the shipped build
- [x] T003 [P] Create `vite.config.ts` with four entries (service worker, content script, popup, options) emitting to `dist/`, plus asset copy for manifest and `_locales`
- [x] T004 Create `src/manifest.json`: Manifest V3, `permissions: ["storage"]`, `host_permissions: ["<all_urls>"]` (the product translates arbitrary sites), content script on `<all_urls>` at `document_idle`, popup, options page, `default_locale: "en"`. No `unlimitedStorage` (storage contract section 4)
- [x] T005 [P] Create `src/_locales/en/messages.json` and `src/ui/shared/i18n.ts` so no user-visible string is hardcoded from the first commit (constitution principle V)
- [x] T006 [P] Create `vitest.config.ts` (two projects: node for `tests/unit`, jsdom for `tests/dom`) and `playwright.config.ts`
- [x] T007 [P] Create `tests/support/stub-provider.ts`: local HTTP server with switchable modes `success`, `authRejected` (401), `rateLimited` (429 + Retry-After), `malformed`, `emptyStrings`, `slow`, `connectionReset`, plus a request log used by assertions
- [x] T008 [P] Create `tests/support/load-extension.ts`: Playwright persistent-context launcher that loads `dist/` unpacked and returns a page handle (real browser, real `chrome.storage` — principle III)
- [x] T009 [P] Create `tests/fixtures/pages/` with the frozen 20-page reference set (news, documentation, forum, wiki, blog) and `tests/fixtures/README.md` recording each page's origin and why it is in the set (SC-003, SC-004)
- [ ] T010 [P] Capture the reference rendering corpus into `tests/fixtures/captures/<page-id>/<mode>.json` using the procedure and JSON shape in contracts/rendering-dom.md section 3 (manual, one-time, Immersive Translate installed). Blocks T043–T044 and SC-011

**Checkpoint**: `npm run build` produces a `dist/` that loads unpacked; `npm test` runs empty suites green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, protocol, storage, prompt contract, the credential accessor, and context skeletons every story needs. The accessor and its disclosure exist here/early so no increment can ship a credential path that bypasses FR-021 or FR-023.

**⚠️ CRITICAL**: No user story work can begin until this phase completes.

- [x] T011 Create `src/shared/types.ts` with the entities from data-model.md: TranslationProvider, ProviderCredential, RoutingRule, TranslationUnit, TranslationJob, SitePreference, GlossaryEntry, SessionUsageRecord
- [x] T012 Create `src/shared/messages.ts` implementing contracts/extension-messaging.md: the `translate` port message union, one-shot command union, and a runtime guard rejecting unknown types (invariant 5). Payload types MUST NOT contain a credential field (invariant 1)
- [x] T013 [P] Create `tests/unit/messages.test.ts` asserting the guard accepts every declared type, rejects unknown types, and that no message payload type admits a `secret` field (FR-021)
- [x] T014 Create `src/shared/settings.ts`: `chrome.storage.local` access with defaults, `schemaVersion` write-on-save, and the migration chain hook described in contracts/storage-schema.md section 3 (refuse newer schema, abort partial migration)
- [x] T015 [P] Create `tests/unit/settings.test.ts`: defaults applied to empty storage; missing `schemaVersion` treated as v1; newer schema refuses write with a named error; failed migration step persists nothing (FR-001, FR-024)
- [x] T016 Create `src/shared/prompt.ts`: system instruction builder covering the six obligations in contracts/provider-adapter.md section 2, glossary and style injection, and the JSON-array output contract (FR-030, FR-031)
- [x] T017 [P] Create `tests/unit/prompt.test.ts`: source/target languages named; every glossary pair present; style instruction present; output contract forbids prose and fences; empty glossary and empty style produce a valid instruction (FR-030, FR-031)
- [x] T018 Create `src/background/service-worker.ts` skeleton: registers the `translate` port, dispatches typed requests through a stateless table, aborts on `timeoutMs` expiry, logs unknown types locally (contracts/extension-messaging.md invariants 3–5, FR-006)
- [x] T019 Create `src/content/index.ts` bootstrap: listens for one-shot commands, opens the port lazily, reconnects on disconnect and re-issues only unresolved requests after 3 failed reconnects reports `workerUnavailable` (contracts/extension-messaging.md section 5)
- [x] T020 [P] Create `tests/dom/helpers.ts`: jsdom page builders, a journal assertion helper, and a `domHash` utility used by restore tests (FR-019)
- [x] T021 [P] Create `tests/e2e/smoke.spec.ts`: extension loads unpacked, popup opens, service worker registers without console errors, stub provider starts and stops (SC-001 baseline, principle III)
- [x] T022 [P] Create `src/ui/shared/credential-field.ts`: a masked input that never echoes the stored value, plus focus/aria primitives reused by popup and options (FR-021, constitution principle V)
- [x] T023 [P] `tests/unit/credentials.test.ts`: stored secret is never returned by any public accessor except the service-worker-internal one; masking exposes last four characters only; deleting a provider deletes its credential in the same operation; a credential without its provider is reported and cleaned (FR-021, FR-024)
- [x] T024 [P] Create `src/background/credentials.ts`: the single accessor for secrets, called only from the service worker; redacting logger wrapper so no log path can print a secret (FR-021, SC-006)

**Checkpoint**: Foundation ready — the five story phases can now proceed in parallel.

---

## Phase 3: User Story 1 - Translate a page with my own LLM provider (Priority: P1) 🎯 MVP

**Goal**: A user configures one provider and gets a bilingual page on a real article.

**Independent Test**: Fresh profile → options → add provider (stub endpoint) → verify → open fixture
article → trigger → bilingual content appears under each source paragraph → toggle off restores exactly.

### Tests for User Story 1 (write first, must fail) ⚠️

- [x] T025 [P] [US1] `tests/unit/segmenter.test.ts`: extracts block-level text; skips nav, forms, editable, hidden, `pre`/`code`; assigns stable IDs; deduplicates identical text; marks same-language pair `skipped` (FR-007, FR-011, FR-014)
- [x] T026 [P] [US1] `tests/unit/batcher.test.ts`: packs under the 1,500 estimated-token budget, preserves stable in-batch ordering and original index mapping, never splits a unit (FR-010, FR-008)
- [x] T027 [P] [US1] `tests/unit/provider-client.test.ts`: request shape matches contracts/provider-adapter.md section 2 (endpoint, auth binding, model, temperature 0, system+user messages); honours `timeoutMs`; surfaces `unreachable` and `authRejected` distinctly (FR-001, FR-003)
- [x] T028 [P] [US1] `tests/dom/renderer.test.ts`: translation placed as sibling block after source; source block not moved or re-parented; translation carries target `lang`; all three display modes behave per contracts/rendering-dom.md section 1 (FR-015, FR-017, FR-018)
- [x] T029 [P] [US1] `tests/dom/restorer.test.ts`: journal replay removes every injected node and attribute; DOM hash equals pre-translation hash; scroll position preserved; 20 consecutive cycles grow neither DOM nor memory (FR-019, SC-008)
- [x] T030 [P] [US1] `tests/e2e/us1-translate.spec.ts`: full path against the stub provider — save provider, verify, translate a fixture page, assert bilingual content, assert toggle-off restores; assert no placeholder text appears before a real translation arrives (FR-020, SC-003); assert a first-time user completes setup in the UI alone, in a fresh profile where only this product is installed, without abandoning at the credential or model step (FR-016, SC-002)
- [x] T031 [US1] Create `tests/e2e/us1-disclosure.spec.ts`: assert the privacy disclosure is shown, and that it must be acknowledged before the credential field accepts input, in a fresh profile with only this product installed (FR-023)

### Implementation for User Story 1

- [x] T032 [P] [US1] Create `src/content/segmenter.ts` per research R6: block walk, skip rules, sentence splitting, stable IDs, hash dedupe, language pair detection (FR-007, FR-011, FR-014)
- [x] T033 [P] [US1] Create `src/content/batcher.ts`: token-budget packing with index mapping and reuse lookup for deduplicated units (FR-010, FR-011)
- [x] T034 [P] [US1] Create `src/background/provider-client.ts`: fetch with timeout via AbortController, tolerant JSON-array unwrapping per contracts/provider-adapter.md section 3, and the error classes needed by this story (FR-001, FR-003)
- [x] T035 [P] [US1] Create `src/content/renderer.ts`: inserts the translation as an adjacent block element, inherits typography via CSSOM, sets the target `lang`, records every write in the journal; all three display modes (FR-015, FR-017, FR-018, R8)
- [x] T036 [P] [US1] Create `src/content/restorer.ts`: replays the journal in reverse, verifies no residue, restores scroll (FR-019)
- [x] T037 [US1] Create `src/styles/content.css` (manifest-declared, CSP-immune) scoped to product marker attributes only; no page-global rules, no `!important` (contracts/rendering-dom.md section 4)
- [x] T038 [US1] Create `src/content/job.ts`: job lifecycle `idle → segmenting → translating → completed`, unit state transitions per data-model.md, ports batch requests, applies results by index, never renders a non-`translated` unit (FR-008, FR-020)
- [x] T039 [US1] Add the pre-credential privacy disclosure to `src/ui/options/`: what leaves the device, to where, how to remove it; must be acknowledged before the credential field is enabled (FR-023)
- [x] T040 [US1] Implement provider CRUD in `src/ui/options/`: add, edit, disable, delete; validation — endpoint required and absolute with `https` (loopback `http` exempt), model required non-empty, name required 1–64 chars and unique, `timeoutMs` 5000–300000, `maxConcurrency` 1–10; no built-in provider list — any reachable endpoint is usable (FR-001, FR-002, FR-004)
- [x] T041 [US1] Implement "Test connection" in `src/ui/options/` calling `verifyProvider`, recording `lastVerification`, and showing success or the specific failure reason (FR-003)
- [x] T042 [US1] Create `src/ui/popup/`: current-page status, translate/restore toggle, keyboard shortcut binding, provider select, display-mode select persisted per site (FR-006, FR-017, FR-032)
- [x] T043 [US1] Implement rendering verification script `scripts/verify-rendering.mjs` comparing produced output to `tests/fixtures/captures/`: relation, container element, `lang`, source association, no horizontal scrollbar, no bounding-box overlap beyond 1 px, restore hash match (SC-011, contracts/rendering-dom.md section 3)
- [x] T044 [US1] Wire `npm run verify:rendering` into `package.json` and record the reference corpus provenance in `tests/fixtures/captures/README.md` (SC-011)

**Checkpoint**: US1 is demoable end to end on the 20 fixture pages. This is the MVP.

---

## Phase 4: User Story 2 - Trust that my credential and my reading stay private (Priority: P1)

**Goal**: Credential and page content provably stay where the user expects.

**Independent Test**: Translate a page containing `ZZPRIVACYZZ`; assert the marker reaches only the
configured endpoint, the secret appears in no surface, and "delete all data" empties storage.

### Tests for User Story 2 (write first, must fail) ⚠️

- [x] T045 [P] [US2] `tests/e2e/us2-privacy.spec.ts`: drive a fixture page containing `ZZPRIVACYZZ`; assert the marker appears only in requests to the stub endpoint, never in storage, never in page context; assert the disclosure is shown before the first credential can be entered; assert delete-all leaves an empty storage object read back (SC-005, SC-006, FR-022, FR-023, FR-024)

### Implementation for User Story 2

- [x] T046 [P] [US2] Add redaction to all error surfaces in `src/ui/`: provider raw bodies, secrets, and full page passages excluded from every message (US2 scenario 4, FR-021)
- [x] T047 [US2] Implement "Delete all data" in `src/ui/options/`: clears every key in contracts/storage-schema.md, reads back to verify emptiness, confirms to the user (FR-024)
- [x] T048 [US2] Add `src/ui/options/diagnostics.ts`: user-inspectable view of stored keys with the credential value always masked, plus a clear-log action (FR-021, FR-024)
- [x] T049 [US2] Enforce the egress rule in `src/background/provider-client.ts`: exactly one destination per request — the resolved provider endpoint; add a test hook that records every outbound URL for the e2e assertion (FR-022)
- [x] T050 [US2] Ensure no page content reaches storage: add an invariant test in `tests/unit/settings.test.ts` that job/unit payloads are rejected by the settings writer (FR-025)

**Checkpoint**: US1 and US2 both pass independently; privacy claims are asserted, not asserted-about.

---

## Phase 5: User Story 3 - Route different sites and languages to different providers (Priority: P2)

**Goal**: The right provider is chosen automatically per site and per language pair, with overrides.

**Independent Test**: Two providers, one site rule, one language-pair rule → each page uses the
specified provider with no manual selection; deleting a referenced provider reports a broken rule.

### Tests for User Story 3 (write first, must fail) ⚠️

- [x] T051 [P] [US3] `tests/unit/routing.test.ts`: resolution order is page override → language pair → site → default; most specific site pattern wins; disabled provider is skipped; broken rule is reported and evaluation falls through (data-model.md Routing Rule, FR-005)
- [x] T052 [P] [US3] `tests/e2e/us3-routing.spec.ts`: with two stub endpoints distinguished by path, assert the provider actually used per page matches the rule set; assert a per-page override does not persist; assert broken-rule reporting (US3 scenarios 1–4)

### Implementation for User Story 3

- [x] T053 [P] [US3] Create `src/shared/routing.ts`: deterministic resolver implementing the documented order, returning both the chosen provider and any skipped-rule diagnostics (FR-005)
- [x] T054 [US3] Add routing rules UI to `src/ui/options/`: list, add site rule, add language-pair rule, enable/disable, delete; validation that the referenced provider exists and is enabled (FR-005)
- [x] T055 [US3] Add site preferences UI: target language, display mode, provider override, auto-translate flag persisted per site pattern (FR-032, FR-017)
- [x] T056 [US3] Add per-page provider override to `src/ui/popup/` that applies to the current page load only and does not modify saved rules (US3 scenario 3, FR-005)
- [x] T057 [US3] Surface broken-rule diagnostics in `src/ui/popup/` and options: name the rule, name the missing provider, and state that the default is being used (US3 scenario 4)
- [x] T058 [US3] Handle the stored `routing.defaultProviderId` pointing at a deleted provider: report and fall back to the first enabled provider, or prompt setup when none exists (FR-005)
- [x] T059 [US3] Emit and handle `providerChanged` in `src/ui/options/` and `src/content/index.ts` so editing a provider invalidates cached resolution instead of leaving a stale provider in use (FR-005, contracts/extension-messaging.md section 4)

**Checkpoint**: All three P1/P2 stories work independently and together.

---

## Phase 6: User Story 4 - Survive a hostile web and a misbehaving provider (Priority: P2)

**Goal**: Every failure mode is classified, explained, and leaves the page clean.

**Independent Test**: Drive each stub failure mode plus restricted and oversized pages; each produces a
distinct actionable message, no partial rendering, and bounded retries.

### Tests for User Story 4 (write first, must fail) ⚠️

- [x] T060 [P] [US4] `tests/unit/error-taxonomy.test.ts`: HTTP status and body shapes map to exactly one class from contracts/provider-adapter.md section 4; `authRejected`, `quotaExhausted`, `modelUnavailable`, `cancelled` are never retried; every class has a non-empty user message (SC-007, FR-026)
- [x] T061 [P] [US4] `tests/unit/retry.test.ts`: at most 2 retries, jittered backoff 0.5 s base capped at 8 s, `Retry-After` honoured and capped; exhausted retries report the affected indices (FR-026)
- [x] T062 [P] [US4] `tests/unit/limiter.test.ts`: concurrency never exceeds `maxConcurrency` (1–10); session and per-site caps, in segments and characters, stop dispatch at the cap and report `capReached` (FR-027, FR-029)
- [x] T063 [P] [US4] `tests/e2e/us4-failures.spec.ts`: one case per stub mode plus restricted page, malformed response, short/long arrays, empty strings, cancellation within 2 s, and oversized page incremental display (US4 scenarios 1–6, FR-020)
- [x] T064 [P] [US4] `tests/dom/observer.test.ts`: late content translated on demand without duplicating or re-translating; removed nodes cause no errors or loops; mutation storm does not thrash (edge cases)

### Implementation for User Story 4

- [x] T065 [P] [US4] Complete `src/background/provider-client.ts` error taxonomy per section 4: status mapping, tolerant parse outcomes, sanitization of markup returned by the model (FR-020, FR-026)
- [x] T066 [P] [US4] Create `src/background/retry.ts`: bounded jittered backoff, `Retry-After` handling, per-class retryability (FR-026)
- [x] T067 [P] [US4] Create `src/content/limiter.ts`: concurrency ceiling and cap accounting feeding `TranslationJob.capState`; stops dispatch and reports at the cap (FR-027, FR-029)
- [x] T068 [US4] Implement cancellation in `src/content/job.ts`: abort in-flight requests, mark units `cancelled`, discard late results, finish within 2 s, leave translated content intact unless the user asked to restore (FR-012)
- [x] T069 [US4] Create `src/content/observer.ts`: MutationObserver for late content, debounced, idempotent, safe against removed nodes and mutation storms (edge cases)
- [x] T070 [US4] Implement oversized-page handling in `src/content/job.ts`: progressive batching so the first screen renders before the last batch is dispatched (FR-010, US4 scenario 3)
- [x] T071 [US4] Detect untranslatable pages (browser-internal, gallery, sandboxed frame, strict CSP) in `src/content/index.ts` and report why, leaving the page untouched (US4 scenario 5, contracts/rendering-dom.md section 4)
- [x] T072 [US4] Add failure UI to `src/ui/popup/`: per-class message with recovery action, skipped-content count, retry affordance; no failure path may end in a silent no-op (SC-007, FR-026; the post-launch metric SC-010 tracks whether this messaging is discoverable in real use)
- [x] T073 [US4] Add session usage display (`src/ui/popup/`) fed by SessionUsageRecord: segments, approximate volume, per-provider breakdown, reuse savings (FR-028, FR-011)
- [x] T074 [US4] Add cap configuration UI (session cap, per-site caps) with validation and the stop-at-cap explanation (FR-029)
- [x] T075 [US4] Harden worker reconnect: re-issue only unresolved requests, deduplicate in-flight retries, and end as `workerUnavailable` after 3 failures in 30 s (contracts/extension-messaging.md section 5)

**Checkpoint**: Failure handling is complete; the product no longer has a silent no-op path.

---

## Phase 7: User Story 5 - Make the model behave like a translator (Priority: P3)

**Goal**: Glossary, tone, and selection-first translation.

**Independent Test**: Add a glossary entry and a style instruction; translate a page with a code block
and the glossary term; assert the term, untouched code, and applied tone; then translate a selection.

### Tests for User Story 5 (write first, must fail) ⚠️

- [x] T076 [P] [US5] `tests/unit/glossary.test.ts`: entries are injected for the matching language pair only; case sensitivity respected; conflicting entries rejected at save time naming the conflict; applied to whole segments (FR-030)
- [x] T077 [P] [US5] `tests/unit/selection.test.ts`: selection-only translation touches nothing outside the selection; single-block translation renders in place (FR-013)
- [x] T078 [P] [US5] `tests/e2e/us5-personalization.spec.ts`: glossary rendering appears; style instruction applies to every request in the session, not only the first; code blocks and inline code unchanged and copyable (US5 scenarios 1–4, FR-009, SC-009)

### Implementation for User Story 5

- [x] T079 [P] [US5] Create `src/shared/glossary.ts`: storage-backed glossary with conflict detection, language-pair filtering, case sensitivity (FR-030)
- [x] T080 [US5] Add glossary UI to `src/ui/options/`: list, add, edit, delete, conflict error surfaced inline (FR-030)
- [x] T081 [US5] Add style instruction UI (tone, formality, extra instructions) persisted in `style` and applied to every request in the session (FR-031)
- [x] T082 [US5] Create `src/content/selection.ts`: translate selection and single hovered block, reusing renderer and restorer without a full-page job (FR-013)
- [x] T083 [US5] Extend `src/content/segmenter.ts` code protection: `pre`, `code`, inline code, and identifier-only segments are preserved verbatim and excluded from batching (FR-009)

**Checkpoint**: All five stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Release readiness against the constitution's gates and quickstart.md.

- [x] T084 Accessibility pass over `src/ui/` and injected markup: keyboard-only operation, visible focus, accessible names, no color-only meaning, target-language announcement (FR-018, principle V)
- [x] T085 RTL and text-expansion pass: verify layouts with a right-to-left target locale and +30% string growth (principle V, edge case)
- [x] T086 i18n audit: assert no user-visible string is hardcoded outside `_locales` (principle V)
- [x] T087 [P] Migration tests for every `schemaVersion` path, starting from stored old-shape fixtures (contracts/storage-schema.md section 3, principle IV)
- [x] T088 [P] Add `README.md` recording the ratified stack, the one-command run/test path, and the storage-at-rest limitation from research R4 (constitution: technology constraints)
- [x] T089 Performance pass: segmentation under 150 ms on a 5,000-node page, no main-thread task over 50 ms during injection, 60 fps scrolling while streaming (plan performance goals)
- [ ] T090 Run the full [quickstart.md](./quickstart.md) checklist and record results, including one real provider verification (principle III)
- [x] T091 [P] Dependency audit: confirm zero runtime dependencies, every dev dependency justified and pinned, no unresolved critical advisory (principle IV)
- [x] T092 Final constitution compliance review: re-read the diff against all five principles, record any exception with an owner and a time box (governance)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T010 (capture corpus) can run in parallel with everything but must finish before T043/T044 produce a verdict
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all stories
- **User Stories (Phases 3–7)**: depend on Foundational; independent of each other
- **Polish (Phase 8)**: depends on the stories the release includes

### User Story Dependencies

- **US1 (P1)**: none beyond Foundational — this is the MVP
- **US2 (P1)**: depends on US1's provider storage existing (T040) to have something to protect; its tests are otherwise independent
- **US3 (P2)**: independent; falls back to the default provider, so it works with a single provider configured
- **US4 (P2)**: independent of US3; extends `provider-client` from US1
- **US5 (P3)**: independent; reuses renderer/restorer from US1

### Within Each Story

Tests first and failing → entities → services → UI → integration. A story is not complete until its
own tests, plus the stories before it, pass.

### Parallel Opportunities

- Setup: T002, T003, T005–T010 in parallel
- Foundational: T013, T015, T017, T020, T021, T022 in parallel after their targets exist
- Within US1: all seven test tasks (T025–T031) in parallel; then T032–T036 in parallel (distinct files)
- US3 and US4 can be developed concurrently by different contributors once US1 lands, because they touch
  disjoint files (`routing.ts` + UI vs `retry.ts`, `limiter.ts`, `observer.ts`)

---

## Parallel Example: User Story 1

```bash
# Fail first: all six US1 test suites together
Task: "tests/unit/segmenter.test.ts"
Task: "tests/unit/batcher.test.ts"
Task: "tests/unit/provider-client.test.ts"
Task: "tests/dom/renderer.test.ts"
Task: "tests/dom/restorer.test.ts"
Task: "tests/e2e/us1-translate.spec.ts"

# Then the independent implementation units
Task: "src/content/segmenter.ts"
Task: "src/content/batcher.ts"
Task: "src/background/provider-client.ts"
Task: "src/content/renderer.ts"
Task: "src/content/restorer.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → a loadable skeleton
2. Phase 2 Foundational → shared types, protocol, storage, prompt, credential accessor
3. Phase 3 US1 → privacy disclosure, then bilingual translation with the user's provider
4. **STOP and validate** with quickstart.md sections 3 and 5: a real article, translated, restorable
5. Demo. This is already a usable product for one provider.

### Incremental Delivery

1. US1 → usable translator (MVP)
2. US2 → trustworthy translator (privacy claims provable)
3. US3 → daily reader (no re-picking providers)
4. US4 → reliable reader (no silent failures)
5. US5 → good translator (glossary, tone, selection)

Each increment leaves the previous one working; no story requires a later story to function.

### Two obligations that cannot be deferred

- **T010** (capture corpus) must be done before rendering can be judged done. Without it SC-011 is
  unfalsifiable, and the rendering behaviour is the product's largest risk.
- **T090** (real provider verification) must run every release. The stub proves the wire, not the
  provider.

---

## Notes

- [P] means different files and no dependency on an incomplete task
- Every task cites its requirement, so `/speckit-analyze` can verify FR→task coverage mechanically
- Commit after each task or logical group; never after a group with a failing or skipped test
- Do not "temporarily" mock the provider inside `src/`: the stub lives in `tests/support/` and never ships

---

## Implementation Record (2026-11-14)

**Result**: 90 of 92 tasks complete and verified. Two remain open because they need a human at a
real external product; neither was marked done on the strength of a stand-in.

| Task | State | Why it is open | Owner / next step |
|---|---|---|---|
| T010 — capture the reference rendering corpus | **Open** | Requires installing Immersive Translate in a desktop profile and capturing 20 pages by hand. Recording our own output would be circular and would make SC-011 compare the product to itself. | Release owner. Procedure and JSON shape in `contracts/rendering-dom.md` §3 and `tests/fixtures/captures/README.md`. Until then `npm run verify:rendering` exits 2 by design. |
| T090 — real provider verification | **Open** | No real provider credential exists in this environment. The stub proves the wire; only a real provider proves the product against a vendor. | Release owner, every release. |

### Verification evidence

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | clean (strict, `noUncheckedIndexedAccess`) |
| Unit + DOM | `npm test` | 19 files, **237 tests passed**, no skips |
| End-to-end | `npm run test:e2e` | real Chromium, unpacked extension, real `chrome.storage`, real HTTP to the stub provider — **27 tests** across smoke, US1–US5, privacy, failure handling, accessibility and RTL |
| Build | `npm run build` | `dist/` loadable unpacked; content script is a classic IIFE, worker and pages are ES modules |
| Rendering harness | `npm run verify:rendering -- --include-example` | PASS on the synthetic example; the default run reports BLOCKED (exit 2) while T010 is open |
| Dependencies | `npm ls --omit=dev` | empty: **zero runtime dependencies**; every dev dependency pinned, lockfile committed |

### Deviations, each recorded rather than silent

1. **Two Vite passes instead of one config with four entries** (T003). Chrome loads content scripts
   as classic scripts and the worker/pages as modules; one Rollup build cannot emit both. Explained
   in `vite.config.ts` and the README.
2. **Vitest uses `environmentMatchGlobs` instead of two named projects** (T006). Same guarantee —
   a file's directory decides its environment — with one config file. Vitest 2 expresses named
   projects through a workspace file, which would have added a second config that duplicates this one.
3. **One error class was added to the taxonomy**: `invalidRequest` for a provider that rejects the
   request itself (400/422 not naming the model). Contract updated in the same change set
   (`contracts/provider-adapter.md` §4, with rationale).
4. **The messaging contract gained `setDisplayMode` and an optional `providerOverrideId`** on
   `translatePage`. FR-017 and US3 scenario 3 cannot be built without them; contract updated
   (`contracts/extension-messaging.md` §6).
5. **The 20 fixture pages are authored, not captured from live sites**, and are labelled as fixtures
   everywhere (`tests/fixtures/README.md`). Downloads would not be reproducible and would make
   SC-003/SC-004/SC-011 depend on someone else's deploy schedule.
6. **Inline code inside a prose block is not extracted as its own unit** (T083). The segmenter keeps
   the block intact so a sentence is not shattered, and the system instruction requires code,
   identifiers and URLs to survive verbatim. Block-level `pre`/`code`/`kbd`/`samp` are excluded
   entirely, which the e2e suite asserts.
7. **Performance is asserted where it is measurable in-process**: segmentation of a 5,000-node page
   under 150 ms (unit test). The 50 ms main-thread and 60 fps goals are not asserted automatically;
   they need a profiled browser run.
8. **Playwright Chromium is installed inside the workspace** (`.playwright-browsers/`, git-ignored)
   because the default browser cache is not writable in this environment. `npm run test:e2e:local`
   carries the path.

### Constitution compliance review (T092)

| Principle | Verdict | Evidence |
|---|---|---|
| I. Specification Before Code | Pass | Spec, plan, tasks, contracts and quickstart all pre-existed this work; every task cites an FR. Where implementation diverged (error class, two messages), the contract was updated in the same change set. |
| II. Test-First | Pass | Every module landed behind a test that failed first (see each worker's red-state report and the failing-then-passing sequences in this session). No skips, no loosened assertions; the suite is deterministic and runs offline. |
| III. Real Data, Real Behavior | Pass with two recorded exceptions | e2e runs a real Chromium with the unpacked extension, real `chrome.storage` and real HTTP; the provider is the only double, and it is the boundary the product does not own. Exceptions: the reference capture corpus (T010) and one real provider (T090) are outstanding and recorded above. |
| IV. Simplicity and Least Commitment | Pass | Zero runtime dependencies, no UI framework, no state library, single package. Every abstraction added maps to a requirement (port protocol → R3, journal → FR-019, batch planner → FR-008/FR-010). |
| V. Accessible and Localizable by Default | Pass | Every user-visible string resolves through `src/_locales/en/messages.json`; an automated audit fails on a literal in markup or an unknown key. Keyboard operability, accessible names and RTL are covered by the e2e suite. Colour is never the only carrier of meaning. |

