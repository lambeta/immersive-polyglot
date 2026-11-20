---
description: "Task list for 011-dsh-plugin"
---

# Tasks: A Page of Chat Answers Translates In Place

**Input**: Design documents from `/specs/011-dsh-plugin/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included and required. Constitution II (Test-First, NON-NEGOTIABLE) makes every behaviour
start with a failing test, and Constitution III requires the end-to-end proof to run the real DSH
client. A task is not complete while its test is skipped, loosened or deleted.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested and
demonstrated on its own. Phase order follows dependency, not only priority: US4 (provider settings)
comes first because no other story can translate anything without a configured provider; the priority
labels in each heading are the spec's own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no incomplete dependency)
- **[Story]**: US1–US5, mapped to the user stories in [spec.md](./spec.md)
- Every task names the file it touches and the requirement it satisfies

## Path Conventions

Single project, existing repository. Plugin sources under `src/plugin/`, the installable package under
`plugin/`, tests under `tests/unit/plugin`, `tests/dom/plugin` and `tests/e2e`. The extension's
`src/`, `dist/` and suites are untouched.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the stack amendment, the build target and the installable package skeleton. No behaviour
is implemented in this phase.

- [X] T001 Amend `.specify/memory/constitution.md` *Technology and Environment Constraints* with a PATCH amendment recording the DSH SDK peer types, the React peer type and the second build target (plan Constitution Check; FR-001, FR-039). Version bump and amendment-log line included; this task precedes every other task.
- [X] T002 Record the exact versions of the installed DSH SDK packages the plugin compiles against (`@deepseek-ai/cordis`, `dsh-client-ui-slots`, `dsh-client-ui-renderer`, `dsh-client-locale`, `dsh-client-ui-conversation`, `dsh-session`, `dsh-settings`, `dsh-credentials`, `dsh-storage-domain`, `dsh-host-webserver`) as pinned dev dependencies in `package.json`, plus `@types/react` (dev-only; no runtime dependency, FR-039)
- [X] T003 [P] Add `build:plugin`, `test:plugin` and `test:plugin:e2e` scripts to `package.json` and create `tsconfig.plugin.json` (strict, `noUncheckedIndexedAccess`, ESM) for the Host half
- [X] T004 [P] Create the installable package skeleton in `plugin/`: `package.json` (name, `exports`, `dsh.bundle.patch`, `dsh.client`, `files`), `cordis.patch.yml` with one insert row, `locale/en.json`, `locale/zh.json`, `icon.svg`, `docs/DETAIL.md` (FR-002, FR-033, FR-034)
- [X] T005 [P] Create `scripts/build-plugin.mjs`: compile the Host with `tsc -p tsconfig.plugin.json` to `plugin/lib/index.js`, bundle the Client with a Vite config emitting the CommonJS `window.__ModuleLoader__.load({ id, factory })` form with `react` and `react/jsx-runtime` external, and copy the committed manifest, patch, locale, icon and detail document (FR-001; research R8)
- [X] T006 [P] Add `plugin/lib/` to `.gitignore` and confirm `npm run build` still produces `dist/` unchanged (FR-038)

**Checkpoint**: both artifacts build from one checkout; nothing user-visible yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the Host/Client skeleton, the one bridge, the shared engine import boundary, the durable
store and the test fixtures every story needs.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

- [ ] T007 [P] Add `tests/unit/plugin/engine-boundary.test.ts` asserting that `src/background/provider-client.ts`, `src/content/batcher.ts`, `src/shared/prompt.ts`, `src/shared/pricing.ts` and `src/shared/sanitize.ts` contain no `chrome.` reference and are the only definitions of the prompt, batching, error classes and price used by the plugin (FR-040)
- [ ] T008 [P] Record session fixtures from a real DSH session into `tests/fixtures/plugin/`: answers with text, reasoning and tool-call blocks, fenced code, inline code, links, list items, headings, a streaming answer and an interrupted answer (needed by T013, T017)
- [ ] T009 [P] Extend the stub provider into `tests/support/plugin-stub.ts` to record every request body, answer in the engine's JSON-array shape, and simulate 401, 429, 5xx, timeout, non-JSON and short-array responses (FR-017)
- [X] T010 Create the Host entry `src/plugin/host/index.ts`: `apply(ctx, config)`, the `Config` schema from data-model §1, the `inject` list (`webServer`, `credentials`, `storageDomain`, `session`, `sessionPersistence`), and inactive-not-broken behaviour when a service is missing (FR-005)
- [X] T011 Create `src/plugin/host/routes.ts`: one prefix registration, loopback refusal, same-origin and marker-header refusal, 64 KiB body limit, JSON error shape from `contracts/http-api.md` §2, and the `GET /api/health` route (FR-005, FR-028)
- [ ] T012 Create `src/plugin/host/records.ts`: record key `<sessionId>/<messageId>` (spelled `hex(sessionId)_hex(messageId)` for the per-record medium), `schemaVersion 1`, read/write/prune through `ctx.storageDomain`, and absence on an unknown or newer version (`contracts/translation-record.md` §2–3)
- [X] T013 Create the Client entry `src/plugin/client/index.tsx`: locale namespace registration, theme-token styles in `styles.ts`, and a no-op `apply` with its disposers, plus `api.ts` calling the routes with the marker header and mapping the error shape to typed failures (FR-032, FR-037)
- [ ] T014 [P] Add `tests/unit/plugin/routes.test.ts` proving the refusals of T011 (non-loopback, foreign origin, missing marker, oversized body) each fail with their named class and no side effect (FR-028, SC-006)
- [ ] T015 [P] Add `tests/unit/plugin/records.test.ts` proving round-trip durability, pruning of a missing session, and that a newer `schemaVersion` reads as absent (FR-020)

**Checkpoint**: the plugin installs, stays inactive when services are missing, answers `/api/health`,
and stores and reads records — with no user-visible behaviour yet.

---

## Phase 3: User Story 4 - One provider setting, and the key stays where the reader put it (Priority: P1)

**Goal**: endpoint, model, target language and glossary configured inside DSH; the credential in the
credential store, masked in the UI and never in a log, record or response.

**Independent Test**: install in a fresh profile, save a provider with a credential, press Test and
see the provider's own verdict; delete the credential and see the next request refuse without
contacting the provider; inspect logs, session record, built directory and repository for the
credential value and find none.

### Tests for User Story 4

- [ ] T016 [P] [US4] `tests/unit/plugin/settings.test.ts`: endpoint must be HTTPS or loopback, model non-empty, credential non-empty on set; a rejected save names the rule and persists nothing (FR-030); `describe` returns configured/masked/writable and never the value (FR-029); a deleted credential makes the next page fail with `providerMissing` and zero requests (FR-029)
- [ ] T017 [P] [US4] `tests/unit/plugin/provider-test.test.ts`: the Test action reports the provider's own status and sample, and its usage is reported as a test, never merged into a page's usage (FR-031)
- [ ] T018 [P] [US4] `tests/dom/plugin/settings.test.tsx`: masked key field, save rejection message naming the rule, Test result rendering, keyboard reachability of every control (FR-029, FR-030, FR-035)

### Implementation for User Story 4

- [ ] T019 [US4] Implement the settings routes in `src/plugin/host/routes.ts`: `GET /api/settings`, `PUT /api/settings` (through the config editor), `PUT /api/credential`, `DELETE /api/credential`, `POST /api/provider/test` (contracts §3)
- [ ] T020 [US4] Implement credential access in `src/plugin/host/credentials.ts`: one fixed reference, `resolve` per request, `describe` for the UI, `set`/`unset`, and a redacting error path so no message can carry the value (FR-028, FR-029)
- [ ] T021 [US4] Implement the settings surface in `src/plugin/client/settings.tsx` and register it in the settings slot from `index.tsx`, with target language, glossary and bounds fields and the Test action (FR-026, FR-031)
- [ ] T022 [US4] Wire config validation and defaults in `src/plugin/host/index.ts` and `src/plugin/client/settings.tsx` so a fresh install shows the documented prefill (endpoint, model, target `zh`) with an empty credential (FR-027, FR-032)
- [ ] T023 [US4] Add the e2e scenario to `tests/e2e/plugin-settings.spec.ts`: save through the real UI, Test against the stub, delete the credential and assert a refusal with zero requests, then reload and assert the configuration survived (FR-029, FR-032)

**Checkpoint**: a provider can be configured, tested and revoked; every later story can now translate.

---

## Phase 4: User Story 1 - One gesture translates the page I am reading (Priority: P1) 🎯 MVP core

**Goal**: turning translation on translates the visible page as one batch, and each answer shows its
own translation section beneath the turn's answer, with code preserved and cost reported.

**Independent Test**: with a stub endpoint recording requests, open a conversation page of five
answers containing a fence and an inline path, turn translation on, and observe one batch request
carrying only those five answers' prose and five sections in page order; then repeat with 401 and with
no credential and observe named failures with no invented text.

### Tests for User Story 1

- [X] T024 [P] [US1] `tests/unit/plugin/answers.test.ts`: prose extraction from a session fixture — text blocks in, reasoning and tool-call blocks out, streaming answers skipped, fences excluded from segments, source hash stable and change-sensitive (FR-009, FR-011, FR-019)
- [X] T025 [P] [US1] `tests/unit/plugin/page-batch.test.ts`: segment packing by the shared batcher, `maxAnswersPerPage` and `maxCharsPerBatch` splitting and reporting, order preservation, a short returned array failing the whole request, per-answer failure attribution (FR-008, FR-014, FR-015, FR-016)
- [ ] T026 [P] [US1] `tests/unit/plugin/page-route.test.ts`: `POST /api/page` contract — request and response shape, `capReached` on an oversized page, `sameLanguage` and `alreadyTranslated` skips, page-level usage and price, never a per-answer price (contracts §3; FR-010, FR-018, FR-024, FR-025)
- [ ] T027 [P] [US1] `tests/dom/plugin/turn-tail.test.tsx`: sections render beneath the answer in order, fenced code and inline code byte-identical, a failure renders a named failure with retry and no translated text, keyboard and accessible names present (FR-008, FR-017, FR-019, FR-035)
- [ ] T028 [P] [US1] `tests/dom/plugin/page-coordinator.test.tsx`: visible anchors plus one viewport below define the page; an answer whose own anchor is off-screen but whose turn top is visible is included (research R4; FR-007, FR-012)

### Implementation for User Story 1

- [X] T029 [US1] Implement `src/plugin/host/answers.ts`: resolve a message id through the session services, split blocks, compute `sourceHash`, detect settled state and source language (data-model §3)
- [X] T030 [US1] Implement `src/plugin/host/page-batch.ts`: page → segments → bounded batches through `src/content/batcher.ts`, one request per chunk, index↔block mapping, per-answer outcomes and caps (FR-008, FR-014, FR-015, FR-016)
- [ ] T031 [US1] Implement `src/plugin/host/translate.ts`: call the shared `provider-client` with the shared `prompt`, parse the array, price through `src/shared/pricing.ts`, map failures to the engine taxonomy (FR-017, FR-024)
- [ ] T032 [US1] Implement `POST /api/page` and `GET /api/state` in `src/plugin/host/routes.ts`, including `requestId` dedupe and in-flight exclusion (FR-022)
- [ ] T033 [US1] Implement the Client control in `src/plugin/client/control.tsx` and register it in the session-header actions slot as a `role="switch"` with visible state, including `POST /api/control` (FR-007, FR-013, FR-035)
- [ ] T034 [US1] Implement the Client page coordinator in `src/plugin/client/page.ts`: one `IntersectionObserver` per session over the plugin's own anchors, one-viewport bottom margin, ordered page computation and a debounced single in-flight request (FR-012, FR-022)
- [ ] T035 [US1] Implement the section renderer in `src/plugin/client/turn-tail.tsx`: one section per answer, order and labels, a bounded block renderer for paragraphs, headings, list items, quotes, inline code and links, fenced code rendered verbatim and never translated (FR-008, FR-019)
- [ ] T036 [US1] Register the turn-tail entry from `src/plugin/client/index.tsx` and render the translating/failed/translated states for each section (FR-008, FR-017)
- [ ] T037 [US1] Add the e2e scenario to `tests/e2e/plugin-page.spec.ts`: five-answer page, one recorded request carrying only prose, five sections, fence and path byte-identical, 401 and missing-credential failures with no request (FR-008, FR-009, FR-017; SC-003, SC-004)

**Checkpoint**: the MVP works — configure once (US4), then read a translated page (US1).

---

## Phase 5: User Story 2 - Reading on continues the translation, and costs only what I read (Priority: P1)

**Goal**: scrolling translates the next page and nothing else; turning off stops sending; each page
reports requests, tokens and price.

**Independent Test**: in a 20-answer conversation turn translation on, scroll two pages, stop: exactly
three page requests, no text from the 14 answers never displayed; turn off and scroll: no further
request.

### Tests for User Story 2

- [ ] T038 [P] [US2] `tests/dom/plugin/page-continuation.test.tsx`: reaching a new page issues one request; a page that leaves the screen before its request issues none; turning off stops requests and keeps sections; rapid scrolling never issues two requests for the same page (FR-012, FR-013, FR-022)
- [ ] T039 [P] [US2] `tests/unit/plugin/page-report.test.ts`: a page reports requests actually made after splitting, provider usage and catalogue price, and `unknown` with a reason for an uncatalogued model, never zero (FR-014, FR-024, FR-025)
- [ ] T040 [P] [US2] `tests/e2e/plugin-scroll.spec.ts`: the 20-answer, three-page, 3-request assertion of SC-005, plus no request after turning off (FR-012, FR-013)

### Implementation for User Story 2

- [ ] T041 [US2] Extend `src/plugin/client/page.ts` with continuation: page diffing, in-flight exclusion, cancellation on leaving the screen before dispatch, and the off switch short-circuit (FR-012, FR-013)
- [ ] T042 [US2] Extend `src/plugin/client/turn-tail.tsx` with the page report line — requests, tokens, price or unknown with reason — attached to the page, never to a single answer (FR-024, FR-025)
- [ ] T043 [US2] Extend `src/plugin/host/page-batch.ts` to report skipped answers and the cap that was hit, and to split oversized pages rather than refusing them (FR-014, FR-015)

**Checkpoint**: reading costs only what was read, and the reader can see what each page cost.

---

## Phase 6: User Story 3 - Reading it again costs nothing (Priority: P1)

**Goal**: translations survive scrolling, session switching, plugin disable/enable and DSH restart;
a regenerated answer never shows the old translation; two windows share one answer.

**Independent Test**: translate three pages, scroll back, switch session and return, disable and
re-enable the plugin, reload: blocks are present and the stub's request count is unchanged; regenerate
one answer and confirm no old translation appears under it.

### Tests for User Story 3

- [X] T044 [P] [US3] `tests/unit/plugin/record-binding.test.ts`: a record is served only when `sourceHash` matches; a regenerated answer reads as stale and is not served; re-translation replaces rather than appends (FR-021; contracts §3)
- [ ] T045 [P] [US3] `tests/unit/plugin/records-route.test.ts`: `GET /api/records` returns one payload for a session, excludes stale records, and carries no credential or reasoning text (FR-009, FR-020)
- [ ] T046 [P] [US3] `tests/dom/plugin/hydration.test.tsx`: a reopen paints from stored records with zero calls to `/api/page`; a stale record renders as untranslated (FR-020, FR-021)

### Implementation for User Story 3

- [ ] T047 [US3] Implement record writing in `src/plugin/host/page-batch.ts` and `records.ts`: one record per answer with `batchId`, usage, price, provider host, written atomically per answer (contracts §3; FR-020)
- [ ] T048 [US3] Implement `GET /api/records` and include translated/stale/pending in `GET /api/state` (FR-020, FR-022)
- [ ] T049 [US3] Implement Client hydration in `src/plugin/client/page.ts` and `turn-tail.tsx`: paint from records on mount and after reconnect, merge a second window's in-flight state, never request what is already current (FR-020, FR-022)
- [ ] T050 [US3] Add the e2e scenario to `tests/e2e/plugin-persistence.spec.ts`: scroll back and switch sessions with an unchanged request count; disable/enable and reload with sections intact; regenerate an answer and assert SC-010 (FR-020, FR-021; SC-005, SC-010)
- [ ] T051 [US3] Prove durability outside the process: read the stored record from the storage file on disk and compare its sections byte for byte with what the UI shows (FR-020; constitution III)
- [ ] T052 [US3] Record the one manual check no harness owns — a full DSH application restart — in `quickstart.md` §5E with the observed request count, and mark it as the only manual verification of SC-005

**Checkpoint**: translations are durable and never re-billed, and regeneration cannot mislabel them.

---

## Phase 7: User Story 5 - The row in Plugins reads like a product (Priority: P2)

**Goal**: a real title, description, icon and detail page in English and Chinese; disabling removes the
control and the sections, re-enabling restores them.

**Independent Test**: install in an English profile and a Chinese one; read title, description and icon
in both; disable, confirm no control in a new session; re-enable and confirm it returns with stored
translations intact.

### Tests for User Story 5

- [ ] T053 [P] [US5] `tests/unit/plugin/locale.test.ts`: `locale/en.json` and `locale/zh.json` carry the same keys, no template copy, and every key used by the Client exists in both (FR-032, FR-033; SC-008)
- [ ] T054 [P] [US5] `tests/e2e/plugin-row.spec.ts`: the installed row shows the product's title, one-sentence description and its own icon in English and in Chinese, and disabling removes the control from a new session (FR-003, FR-004, FR-033)

### Implementation for User Story 5

- [ ] T055 [US5] Complete `plugin/package.json` display metadata, `exports`, `files`, and the locale `meta.title`/`meta.description` entries in both languages (FR-033)
- [ ] T056 [US5] Draw the product's own `plugin/icon.svg` (≤256 KiB, inside the package) and write `plugin/docs/DETAIL.md` stating what is sent, to which host, what is stored, the per-page cost and what stops when disabled (FR-029 detail, FR-034)
- [ ] T057 [US5] Implement disable/enable cleanup: every registration released through `ctx.effect`, the control and sections gone from new sessions, stored records retained (FR-004, FR-013)

**Checkpoint**: the plugin is presentable and reversible.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: the regression gate, accessibility, documentation and the final validation run.

- [ ] T058 [P] Run the extension's `npm run typecheck`, `npm test` and `npm run test:e2e` unchanged and add `tests/unit/plugin/extension-untouched.test.ts` asserting `dist/` holds no plugin module and `package.json` declares no runtime dependency (FR-038, FR-039; SC-007)
- [ ] T059 [P] Add `tests/dom/plugin/a11y.test.tsx`: focus order, visible focus, accessible names, 30 percent text expansion and no colour-only state, in light and dark (FR-035, FR-036; SC-008)
- [ ] T060 [P] Document the plugin in `README.md`: build command, local installation path, provider configuration, what is sent, and the extension's unchanged guarantees (FR-001, FR-034)
- [ ] T061 [P] Security sweep and test: credential redaction across logs, records, errors and responses; the same-origin/loopback refusals; no request to a host other than the configured endpoint (FR-009, FR-028; SC-003, SC-006)
- [ ] T062 Measure SC-009 in `tests/e2e/plugin-page.spec.ts`: a page of six answers and 3,000 characters renders every section within 3 seconds of the provider's response, and nothing is requested while an answer streams
- [ ] T063 Execute `quickstart.md` end to end and record the results, including the manual checks of §8 (light/dark, keyboard, Chinese locale, one real provider) and the one open verification named in §5E

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependency. T001 (constitution amendment) precedes everything.
- **Foundational (Phase 2)**: depends on Setup; blocks every story.
- **US4 (Phase 3)**: depends on Foundational; every other story needs a configured provider, which is
  why it is delivered first although the spec lists it fourth.
- **US1 (Phase 4)**: depends on Foundational and on US4 for a live provider; its independent test uses
  the stub endpoint.
- **US2 (Phase 5)**: depends on US1 (it extends the same coordinator and renderer).
- **US3 (Phase 6)**: depends on US1 (records are written by the page path); independent of US2.
- **US5 (Phase 7)**: depends on Foundational; can run parallel to US2/US3.
- **Polish (Phase 8)**: depends on all delivered stories.

### Within Each Story

Tests are written first and must fail for the right reason; models and Host modules before routes;
routes before Client wiring; Client wiring before the story's e2e scenario.

### Parallel Opportunities

- Setup: T003, T004, T005, T006 are independent files.
- Foundational: T007–T009 and T014–T015 are independent; T010–T013 form one ordered chain.
- US1 tests T024–T028 are five independent files; implementations T029–T036 touch distinct files
  except `routes.ts` (T032 after T011) and `turn-tail.tsx` (T035 before T036).
- US4 tests T016–T018 are independent; US4 implementation T019–T022 is one chain ending in T023.
- Polish T058–T061 are independent.

---

## Parallel Example: User Story 1

```bash
# Five failing tests, five files, one command:
npm test -- tests/unit/plugin/answers.test.ts tests/unit/plugin/page-batch.test.ts \
            tests/unit/plugin/page-route.test.ts tests/dom/plugin/turn-tail.test.tsx \
            tests/dom/plugin/page-coordinator.test.tsx
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup (T001–T006)
2. Phase 2 Foundational (T007–T015)
3. Phase 3 US4 (T016–T023) — configure a provider once
4. Phase 4 US1 (T024–T037) — translate one page
5. **STOP and VALIDATE**: quickstart §4–§5 steps A, B, H — a real page, one request, honest failures

### Incremental Delivery

US4 + US1 is the MVP; US2 makes reading continuous and shows cost; US3 makes it durable; US5 makes it
presentable. Each phase ends at a checkpoint that is demonstrable on its own.

---

## Notes

- `[P]` marks different files with no incomplete dependency — never two tasks touching one file.
- A task citing a test task must not pass by weakening that test (constitution II).
- Every task that changes behaviour names the FR or SC it serves.
- `tasks.md` is regenerable; if the spec or plan changes, re-run `/speckit-tasks` rather than editing
  task text by hand.

---

## Status: first clickable increment (2026-11-20)

US1's surfaces exist and are live: the header control registers as
`conversation.session.header.actions` entry `immersive-polyglot-control`, the sections register as
`conversation.chat.turnTail` entry `immersive-polyglot-sections`, and both are active in the shell.
The credential is settable through `PUT /api/credential` (DSH's own store) and a page translates,
persists in `~/.dsh/storages/immersive_polyglot/` and renders. Turning the control off removes the
sections from the transcript without deleting them; turning it back on paints from storage, and the
Host skips answers whose record still matches the source hash (`alreadyTranslated`, `requests: 0`).

Deviations from the tasks as written, recorded rather than hidden:

- T033 — a `<button aria-pressed>` instead of `role="switch"`; same keyboard reachability, fewer
  promised semantics than the switch role names.
- T034 — no `IntersectionObserver`: "the page" is the last `maxAnswersPerPage` finished answers, so
  the reader's viewport does not decide the page yet (FR-012).
- T035 — sections still carry `kind: "text"` on the Host side, but the text keeps its Markdown, so
  the Client renders each section through `src/plugin/client/markdown.tsx` (headings, lists, quotes,
  rules, fenced code verbatim, inline code/bold/italic/strike/links). A relative path link renders as
  a label rather than an anchor; pipe tables are still plain paragraphs (FR-019).
- T012 — `prune` per `contracts/translation-record.md` §3.6 is still missing; records accumulate.
- Markdown — translations render as Markdown: the Host was already translating block-shaped text
  whose markers survived (`## 具体做法`, `1. **…**`), and the Client used to flatten every section
  into a paragraph. Stored records need no re-translation; the renderer reads them as they are. The
  system instruction now names Markdown preservation explicitly (rule 6), so new translations keep
  their markers.
- Route — a page now defaults to `route: "dsh"`: `ctx.llm.stream()` with the model from
  `agentDefaultModel.currentSelection()`, so a reader who already signed into DSH needs no second
  credential. Records name the provenance `dsh:<provider>`; `route: "own"` keeps the endpoint and the
  plugin's secret. The DSH route issues one call per batch and does not retry (DSH's adapter owns its
  retry policy); a live page through `deepseek-official/deepseek-flash` returned 21 sections and
  persisted with usage 941/1163 tokens.
- Release — the increment ships as **0.2.0** (2026-11-20): plugin half only, installed from
  `plugin/` into a DSH profile. Self-test before tagging: `npm run check:plugin` (13 files),
  `npm test` (70 files, 656 tests), then a live page through `route: dsh` on a session with a model
  selected — the last check translated a 23-section answer in one request and stored the Markdown
  sections, which the Client then rendered without a second provider call.
