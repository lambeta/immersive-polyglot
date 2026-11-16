---
description: "Task list for feature 008 — token spend and its price"
---

# Tasks: Token Spend and Its Price for the Translations a Page Already Shows

**Input**: Design documents from `/specs/008-token-spend-display/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED for every behaviour. The project constitution makes test-first non-negotiable
(Principle II), so each behaviour below starts as a failing test: the test task precedes the
implementation task that makes it pass, and no task is done while its test is red. One task
(T041) is a regression guard over behaviour that already exists; it is marked as such.

**Organization**: Tasks are grouped by user story so each story is independently implementable and
testable. `Proves` cites [plan.md's test table](./plan.md#tests-this-feature-owes) (T1–T23); `FR-` and
`SC-` cite [spec.md](./spec.md). Every requirement is cited by at least one task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different file, no dependency on an incomplete task)
- **[Story]**: which user story the task belongs to (US1, US2, US3)
- Every task names its exact file path

## Path Conventions

Single project: `src/` and `tests/` at the repository root; specs under `specs/008-token-spend-display/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the test boundary must be able to answer with usage — and with it deliberately absent —
before any code reads usage.

- [X] T001 [P] Extend the stub provider with usage modes `deepseek` (prompt/completion/total/cache-hit/cache-miss), `openaiDetails` (`prompt_tokens_details.cached_tokens` only), `none`, `garbage` and `totalOnly`, selectable through `StubOptions` and `setMode`, in `tests/support/stub-provider.ts` (Proves T2, T3, T14, T17)
- [X] T002 [P] Add a deterministic spend fixture helper exporting the worked example (prompt 5000, hit 4000, miss 1000, completion 500, total 5500), its peak twin, and a stale-snapshot variant, in `tests/support/spend-fixtures.ts` (Proves T5, T8, T9, T21)
- [X] T003 [P] Make the local dev provider answer with DeepSeek-shaped usage so the row is visible without a key, in `scripts/dev-provider.mjs` (Proves quickstart §3, FR-026)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: shapes, catalogue, arithmetic, wire and accumulator. Everything here blocks all stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Add `UsageReport`, `TokenParts`, `SpendRecord` and `SpendUnavailable` to `src/shared/types.ts` and extend `SessionUsageRecord` with optional `spend`; keep every existing member and its meaning; **no key is named exactly `token`** (data-model §1/§6; FR-001, FR-014)
- [X] T005 [P] Write failing tests for the catalogue and the arithmetic — tier boundaries (08:59:59/09:00:00, 11:59:59/12:00:00, weekend, listed 2026 holiday, 2027 weekday peak/off-peak), **identical usage across the 09:00 boundary priced at exactly 2×**, cache-hit vs cache-miss vs output rates, missing split charged at the miss rate, currency by target language, two-significant-digit rounding with no `0` display, **and an injected stale snapshot (`{ ...PRICE_SNAPSHOT, snapshot: "2025-01" }`) still producing an amount that carries that older date** — in `tests/unit/pricing.test.ts` (Proves T8, T9, T10, T11, T21; FR-007, FR-008, FR-011, FR-012, FR-013, FR-025, SC-006, SC-007, SC-009)
- [X] T006 Create `src/shared/price-catalog.ts`: `PRICE_SNAPSHOT` with `snapshot: "2026-11"`, hosts `["api.deepseek.com"]`, models `deepseek-flash` and `deepseek-v4-pro` with both CNY and USD rates (`hitOff/hitPeak/missOff/missPeak/outOff/outPeak`), aliases `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, `deepseek-chat` and `deepseek-reasoner` → flash, `peakWindows` 09:00–12:00 and 14:00–18:00, `timeZone: "Asia/Shanghai"`, the 2026 official holiday dates, and `coverageYears: [2026]`; **the legacy names `deepseek-chat` and `deepseek-reasoner` are priced at the Flash rate** (R2; FR-007, FR-011, FR-028)
- [X] T007 Implement `src/shared/pricing.ts`: `classifyTier(instant)` per [pricing contract §2](./contracts/pricing-and-tiers.md) (window-first, holiday-second, half-open boundaries), `estimateSpend(runSpend, snapshot = PRICE_SNAPSHOT)` returning either `{ amount, currency, snapshot }` or one `unavailable` reason in the precedence `noPriceList → modelNotPriced → usageIncomplete`, and `formatAmount(amount, currency, locale)` using `Intl.NumberFormat` with `minimumSignificantDigits: 2` (R3, R7; FR-006–FR-013, FR-025)
- [X] T008 [P] Write failing tests for reading usage — DeepSeek body, OpenAI `prompt_tokens_details.cached_tokens` body, absent `usage`, string `"12"`, `-1`, hit > prompt, total disagreeing with the sum, retry keeping only the accepted outcome — in `tests/unit/provider-client.test.ts` (Proves T2, T3; FR-001, FR-003, FR-008)
- [X] T009 Implement usage reading in `src/background/provider-client.ts`: add `usage` to `BatchOutcome` and normalise the five integers; **"drop the whole report if `promptTokens` or `completionTokens` is not a finite non-negative integer"** and never synthesise a total ([provider-usage contract §2–§4](./contracts/provider-usage.md); FR-003, FR-008)
- [X] T010 [P] Write failing tests for the wire — a valid `usage` parses, an invalid one is dropped while the batch result stands, a payload with a key named `token` is still refused, a `batchResult` without `usage` still resolves — in `tests/unit/messages.test.ts` (Proves T4; FR-003)
- [X] T011 Implement `batchResult.usage` in `src/shared/messages.ts` (`parsePortResponse` validates five finite non-negative integers and drops an invalid object) and document the shape in [message-usage contract](./contracts/message-usage.md) (FR-003; T4)
- [X] T012 Carry usage from the service worker's accepted outcome into `src/background/service-worker.ts`'s `batchResult` and through `src/content/index.ts`'s `TranslatePort` into `BatchReply.usage` (FR-001; contract message-usage §1)
- [X] T013 [P] Write failing tests for attribution — counted once when a response delivers translations, not at all when every result fails, once when a retry finally delivers, nothing for reused or skipped passages, tier buckets taken from the request instant, **a bare `cancel()` keeping the figures of translations already on the page**, **`restore()` clearing them**, **no `spend` reported while no counted translation is still connected to the document**, and totals that survive a status re-read — in `tests/dom/job-spend.test.ts` (Proves T5, T6; FR-002, FR-018, FR-019, FR-023)
- [X] T014 Implement the `RunSpend` accumulator in `src/content/job.ts`: capture provider/model/target at run start, record `requestedAt` in `#runBatch` before the call, add parts in `#applyReply` only when at least one unit reached `translated`, keep `peak`/`offPeak` `TokenParts` plus the reported total, call `estimateSpend` in `status()`, **clear the record only inside `restore()`** (a bare `cancel()` keeps it), and **omit `spend` while no counted translation is still connected** ([data-model §3](./data-model.md), [R11](./research.md), [R12](./research.md); FR-002, FR-009, FR-016, FR-018, FR-019, FR-023)
- [X] T015 [P] Change `DEEPSEEK_PRESET.draft.model` to `deepseek-flash` in `src/ui/options/presets.ts`; extend `tests/unit/presets.test.ts` to assert both the preset's model and the legacy `deepseek-chat` are priced by `PRICE_SNAPSHOT`; update the two pre-filled-model expectations in `tests/e2e/preset.spec.ts` (R9; FR-028; Proves T1)

**Checkpoint**: the numbers exist and are correct in tests; nothing is rendered yet.

---

## Phase 3: User Story 1 - The panel says what this page has cost, in tokens and in money (Priority: P1) 🎯 MVP

**Goal**: a translated page shows one row with the token total and the price, plus its basis, rising live.

**Independent Test**: translate a fixed page against the stub's `deepseek` usage mode, open the panel,
and compare the row with the hand-computed worked example; reopen the panel and confirm the figures are
identical; turn translation off and confirm the row is gone.

### Tests for User Story 1 ⚠️ Write these FIRST and watch them fail

- [X] T016 [P] [US1] Write failing DOM tests for the row renderer — one `li` containing the token figure and the price, the basis naming provider **and the snapshot date actually returned in `spend.price.snapshot`**, the characters fact untouched, and the row order segments → characters → spend → reused/… — in `tests/dom/spend-row.test.ts` (Proves T12, T16; FR-009, FR-025, FR-027, SC-013)
- [X] T017 [P] [US1] Write failing end-to-end tests — exact token total and price for the worked example, a second batch raising both figures, reopen stability, turn-off clearing the row, **and 20 consecutive translation arrivals each reflected in the row within 1 s with neither figure moving backwards** — in `tests/e2e/spend.spec.ts` (Proves T14; FR-016, FR-017, FR-019, SC-001, SC-002, SC-008)

### Implementation for User Story 1

- [X] T018 [P] [US1] Add the source-locale keys `popupSpendTokens`, `popupSpendPriceCny`, `popupSpendPriceUsd`, `popupSpendBasis`, `popupSpendNoPriceList`, `popupSpendModelNotPriced` and `popupSpendUsageIncomplete` to `src/_locales/en/messages.json` (all seven are added here so no phase edits this file twice) ([panel contract §3](./contracts/panel-spend-row.md); FR-021)
- [X] T019 [US1] Implement `src/ui/popup/spend-row.ts`: a pure `renderSpendRow(document, spend)` that builds `li.usage__spend` with the token figure, the price, and `span.usage__basis`, using `t()` for every string and `formatAmount` for the number (FR-001, FR-009, FR-027)
- [X] T020 [US1] Call `renderSpendRow` from `src/ui/popup/popup.ts`'s `render()`, inserting the row after the characters-sent row and leaving every existing row untouched (FR-027)
- [X] T021 [US1] Add the row's rules to `src/ui/popup/popup.css` (`.usage__spend`, `.usage__basis`, wrapping, muted basis, monospace figures) without changing the existing `#usage li` rules (FR-022)
- [X] T022 [US1] Run T016 and T017 to green in `tests/dom/spend-row.test.ts` and `tests/e2e/spend.spec.ts`; record the displayed figures in a comment so a reviewer can check them by hand (SC-001, SC-002, SC-013)

**Checkpoint**: US1 alone is a demonstrable MVP.

---

## Phase 4: User Story 2 - A price the panel can defend, or none (Priority: P1)

**Goal**: no invented number. Unpriced providers, unknown models, incomplete usage, discarded
responses and reuse are excluded, and each refusal is explained in one muted line.

**Independent Test**: run the same page against the stub in `none`, `totalOnly` and no-price-list modes
and assert that the token row is present exactly when usage exists, that the price appears exactly when
it is defensible, and that the muted note names the right reason.

### Tests for User Story 2 ⚠️ Write these FIRST and watch them fail

- [X] T023 [P] [US2] Write failing tests for the refusal precedence and all-or-nothing rule — one unpriced response suppresses the whole run's price; `noPriceList` beats `modelNotPriced` beats `usageIncomplete`; the amount is never shown without its basis — in `tests/unit/pricing-refusals.test.ts` (Proves T9; FR-006, FR-010, FR-026)
- [X] T024 [P] [US2] Write failing DOM tests for the refusal states — tokens without price plus exactly one note per reason, no note when priced, no token row when no usage, measured zero rendered as zero, and no spend row once the page holds no connected translation — in `tests/dom/spend-row-note.test.ts` (Proves T12; FR-004, FR-005, FR-023, FR-026)
- [X] T025 [P] [US2] Write failing job tests for excluded work — a response whose results are discarded, a reused passage (60 % of the page), and a skipped passage add neither tokens nor price — in `tests/unit/job-spend-refusal.test.ts` (Proves T5; FR-018, SC-005)
- [X] T026 [P] [US2] Write failing end-to-end tests — a stub with `usage: none` shows no token row and no price; a stub whose host is not in the catalogue shows tokens and the `noPriceList` note and no amount; `totalOnly` shows tokens and the `usageIncomplete` note — in `tests/e2e/spend-unpriced.spec.ts` (Proves T17; FR-003, FR-004, FR-026, SC-003, SC-004)

### Implementation for User Story 2

- [X] T027 [US2] Thread `unavailable` from `estimateSpend` through `TranslationJob.status()` into `SpendRecord` in `src/content/job.ts`, keeping the token figures intact when the price is refused (FR-010, FR-014)
- [X] T028 [US2] Render the muted note in `src/ui/popup/spend-row.ts` as `span.usage__note` **inside the spend row** (one record row, not two) selected by reason, and render a measured zero as zero while an absent report renders nothing (FR-004, FR-005, FR-026)
- [X] T029 [US2] Make the panel omit both rows when `spend` is absent and keep `section.usage` hidden when the list is empty, in `src/ui/popup/popup.ts` and `src/ui/popup/popup.css`; a restored page must carry no counts, no provider and no usage into the idle status (FR-004, FR-019, FR-023)
- [X] T030 [US2] Confirm the job stops reporting `spend` when the page removes every rendered translation (the R12 gate), and that a cancel keeps the row while turn-off clears it, in `src/content/job.ts` and `tests/unit/job-spend-refusal.test.ts` (FR-019, FR-023; R11, R12)
- [X] T031 [US2] Run T023–T026 to green in `tests/unit/pricing-refusals.test.ts`, `tests/unit/job-spend-refusal.test.ts`, `tests/dom/spend-row-note.test.ts` and `tests/e2e/spend-unpriced.spec.ts`; confirm no amount appears anywhere in the DOM (FR-010, SC-003)

**Checkpoint**: US1 and US2 both hold; the panel never prints a number it cannot defend.

---

## Phase 5: User Story 3 - The figures hold up where the panel is actually opened (Priority: P2)

**Goal**: per-tab figures, the panel's height and zoom contract, localized numbers, a silent row, and
a basis that survives a right-to-left layout.

**Independent Test**: with two translated tabs open, each panel reports its own figures; the panel with
the row and note measures under 600 px at 384 px, at 200 % zoom, with 30 % longer labels and under a
right-to-left locale; a screen reader reads the row on demand and is never interrupted.

### Tests for User Story 3 ⚠️ Write these FIRST and watch them fail

- [X] T032 [P] [US3] Write failing end-to-end tests — two tabs, each panel showing its own figures; panel height under 600 px with the row and with the note; no sideways overflow at 384 px and 200 % zoom; the long-label fixture clips nothing; **and a right-to-left locale where the row wraps without losing the currency symbol or reversing the digits** — in `tests/e2e/spend-surfaces.spec.ts` (Proves T17, T19; FR-015, FR-022, Constitution V, SC-010, SC-011)
- [X] T033 [P] [US3] Write failing DOM/a11y tests — the record contains no live region, the row's accessible text carries both figures and the basis, and 20 updates produce zero announcements — in `tests/dom/spend-row-a11y.test.ts` (Proves T13; FR-020, FR-020a, SC-014, SC-015)

### Implementation for User Story 3

- [X] T034 [US3] Format both figures with `Intl.NumberFormat` in the interface language inside `src/ui/popup/spend-row.ts`, and keep the currency symbol inside the catalogue message so its position is a translation decision (FR-012, FR-013, FR-021)
- [X] T035 [US3] Ensure the basis is always reachable as text on the row (visible, wrapping) in `src/ui/popup/spend-row.ts` and `src/ui/popup/popup.css`, with no live region added anywhere (FR-009, FR-020a, SC-015)
- [X] T036 [US3] Scope the figures to the page being shown — the panel already reads one tab's status; assert it and add no cross-tab state — in `src/ui/popup/popup.ts` (FR-015)
- [X] T037 [US3] Run T032 and T033 to green, and record the measured heights and the RTL result in `tests/e2e/spend-surfaces.spec.ts` (SC-010)

**Checkpoint**: all three stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T038 [P] Amend feature 001 FR-029 in `specs/001-llm-web-translator/spec.md`: permit a **list-price estimate for a provider whose published prices ship with the product**, keep the ban on an invented bill (Constitution I; plan T18)
- [X] T039 [P] Amend `specs/006-popup-settings-redesign/contracts/page-control-surface.md` §6: the record now carries one spend row and an optional muted note; "no money" becomes "no figure that is not a labelled estimate" (plan T18)
- [X] T040 [P] Amend `specs/001-llm-web-translator/data-model.md`: the session usage record gains the optional `spend` member (data-model §6)
- [X] T041 [P] Write the regression guard for FR-024: one translated run adds exactly one `egressLog` entry per provider request and nothing else, the outbound body still carries only `model`, `temperature` and `messages`, and `src/manifest.json`'s permissions and hosts are unchanged — in `tests/unit/egress.test.ts` (Proves T22; FR-024)
- [ ] T042 **BLOCKED (owner key)**: the harness is extended and prints the token and price lines; the one real run needs `DEEPSEEK_API_KEY`. Extend `scripts/verify-real-provider.mjs` to print the token and price lines with their basis, never the key, and run it once with the owner's key; the printed token count must exceed zero and the price must equal the catalogue arithmetic for the reported usage (plan T15; FR-001, FR-007)
- [ ] T043 **PARTIAL**: §1 (unit), §2 (e2e) and the automated parts of §5 are green; §4 needs the owner's key. Run [quickstart.md](./quickstart.md) §1–§5 end to end — including the 2× boundary case (SC-006) and the five-reader comprehension protocol (SC-012) — and record any discrepancy between the displayed figures and the hand-computed ones (SC-001, SC-002, SC-006, SC-012)
- [X] T044 Ran the full suite over `tests/` — `tsc --noEmit` clean, 497 Vitest tests green, 121/122 e2e green with one browser-launch timeout that passes 18/18 when rerun alone, `verify:styles` PASS. Run the full suite over `tests/` — `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run verify:styles` — with nothing skipped, weakened or excluded (plan T20; Constitution II)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks every story**.
- **US1 (Phase 3)**: depends on Foundational. Delivers the MVP.
- **US2 (Phase 4)**: depends on Foundational and on the renderer US1 builds; start after T019.
- **US3 (Phase 5)**: depends on Foundational and on US1's row; its layout tests need the row and note.
- **Polish (Phase 6)**: after all stories; T038–T040 may land earlier, but must ship in the same change
  set as the code (Constitution I).

### Within Each Story

- Tests first (T016/T017, T023–T026, T032/T033), each watched failing for the right reason.
- Then the renderer, then the wiring, then the styles, then green.

### Parallel Opportunities

- T001–T003 — three different files.
- T004, T005, T008, T010, T013, T015 — different files, all testable in isolation.
- T018 can be written while T019 is in progress (different file), but T019 needs its keys to pass.
- T023–T026 — four different files, all failing first.
- T032 and T033 — different files.
- T038–T041 — four different files.

---

## Parallel Example: Foundational Phase

```bash
# Tests that can be written at the same time (different files):
Task: "T005 failing catalogue/arithmetic tests in tests/unit/pricing.test.ts"
Task: "T008 failing provider-usage tests in tests/unit/provider-client.test.ts"
Task: "T010 failing wire tests in tests/unit/messages.test.ts"
Task: "T013 failing attribution tests in tests/unit/job-spend.test.ts"

# Then their implementations, in dependency order:
Task: "T006 price catalogue in src/shared/price-catalog.ts"
Task: "T007 pricing functions in src/shared/pricing.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 → Phase 2 → Phase 3.
2. **STOP and VALIDATE**: translate one page against the stub's `deepseek` mode; the panel must show
   `5,500 tokens spent · ≈ ¥0.0031` with `DeepSeek list · 2026-11`.
3. That is the product owner's requested feature, demonstrable without US2 or US3.

### Incremental Delivery

1. Foundation ready (usage travels, arithmetic correct, preset priced, cancel/restore semantics pinned).
2. US1 → the figure appears; demo.
3. US2 → the figure can refuse; ship, because honesty is the feature's premise.
4. US3 → layout, localization, RTL and silence; ship.

### Reviewer's short path

T001 → T004 → T006 → T007 → T009 → T011 → T012 → T014 → T017 → T019 → T020 → T022 gives a runnable
row; everything else hardens it.

---

## Notes

- [P] tasks are different files with no unfinished dependency.
- Tests must fail before their implementation; a green test that never failed is not evidence.
- The one **changed** expectation is the session record's contents (T016/T022); it is required by
  FR-027 and the spec, and no assertion is removed.
- T041 is a regression guard over behaviour that already exists, not a new behaviour; it is the only
  test task that may be written after its implementation.
- T038–T040 keep specification and code coherent; they are part of this feature's change set, not a
  follow-up.
- Commit after each task or logical group.
- Stop at each checkpoint to validate the story independently.

---

## Phase 7: Convergence

- [ ] T045 Prove that reused and skipped work is excluded at the scale SC-005 states: on a page where 60 % of the displayed translations came from reuse the record equals the fresh responses' spend exactly, and a skipped (capped) passage adds neither tokens nor price — add the tests T025 named in `tests/unit/job-spend-refusal.test.ts`, or fold them into `tests/dom/job-spend.test.ts` and correct T025's citation per SC-005, FR-018 (missing)
- [ ] T046 Replace the vacuous FR-008 assertion in `tests/unit/pricing.test.ts` (it calls `estimateSpend` twice with identical input and compares the results, so it cannot fail) with one that prices a usage report carrying no cache split and asserts it equals the same usage with zero cache-hit tokens — every prompt token at the miss rate — and add the job-level twin in `tests/dom/job-spend.test.ts` where `cacheHitTokens`/`cacheMissTokens` are absent per FR-008, SC-007 (partial)
- [ ] T047 Measure the priced spend row, not only the muted-note state, in `tests/e2e/spend-surfaces.spec.ts`: 200 % zoom, labels injected 30 % longer, light and dark, no clipped label, no overlapping row, no sideways overflow, panel under 600 px — and let `span.usage__basis` wrap in `src/ui/popup/popup.css` instead of `white-space: nowrap`, so FR-022's no-sideways-overflow promise holds when the basis cannot fit one line per FR-022, SC-010 (partial)
- [ ] T048 Strengthen the live-update test in `tests/e2e/spend.spec.ts` to SC-008's shape: sample 20 consecutive translation arrivals, assert each arrival is reflected in both the token figure and the price within one second, and that neither figure ever moves backwards per SC-008, FR-016 (partial)
- [ ] T049 Add the refusal-precedence tests T023 named in `tests/unit/pricing-refusals.test.ts`, or fold them into `tests/unit/pricing.test.ts` and correct T023's citation: a run that is at once on an unpriced provider, on an unlisted model and missing its split reports exactly one reason in the order `noPriceList` → `modelNotPriced` → `usageIncomplete`, and no amount is ever produced without the provider and snapshot basis that justify it per FR-006, FR-010, FR-026 (missing)
- [ ] T050 Take the pricing tier at the instant the request is actually sent rather than when the batch is queued, in `src/content/job.ts`'s `#runBatch` — `requestedAt` is read before `limiter.run`, so a batch that waits behind the concurrency ceiling is priced at its enqueue tier — and pin it with a test that queues a batch across a peak boundary per FR-011 (partial)
- [ ] T051 Correct the comment above the model table in `src/shared/price-catalog.ts`, which says `deepseek-chat` and `deepseek-reasoner` are "deliberately absent (FR-028, owner confirmation)" while the alias table immediately below prices both at the Flash rate; the comment contradicts FR-028 and the spec's 2026-11-16 owner correction, and invites a future reader to delete a required alias per FR-028 (contradicts)
- [ ] T052 Reconcile FR-013's six-decimal ceiling with the spec's rule that a non-zero estimate is never shown as zero: `formatAmount` currently prints seven or eight decimals below ¥0.000001 (`0.0000004` for 4e-7, reachable because one off-peak cache-hit token is ¥0.00000002). Choose one rule, express it in `src/shared/pricing.ts` with a test, and record the amendment the specification needs per FR-013 (contradicts)

