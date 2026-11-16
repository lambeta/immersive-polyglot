# Implementation Plan: Token Spend and Its Price for the Translations a Page Already Shows

**Branch**: `008-token-spend-display` (the working tree stays on `master`; this project registers no
`before_plan` hook) | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-token-spend-display/spec.md`

## Summary

The panel already reports volume in passages and characters. This feature turns the provider's own
`usage` block into two numbers a reader can check against a bill: tokens spent, and what they cost
under the provider's published price list — cache-hit input at the cache-hit rate, everything else at
the rate its tier says.

Four small additions, each replacing a place where the product currently throws information away:

1. **The provider's `usage` survives the wire.** `callProvider` reads it from the same JSON body it
   already parses, the service worker forwards the accepted response's usage untouched, and
   `parsePortResponse` validates it as five non-negative numbers. No new request, no new field in the
   outbound body, no new permission.
2. **The job counts only what arrived.** `TranslationJob` attributes one response's usage to the run
   exactly when that response put at least one translation on the page, at the moment the request was
   made — which is what peak/off-peak pricing needs and what keeps reused, skipped, failed and
   discarded work out of the figure.
3. **A price catalogue ships as code.** `src/shared/price-catalog.ts` carries DeepSeek's two
   published lists (CNY and USD), its documented model aliases, its two peak windows and its published
   2026 holiday exceptions, with the date the snapshot was taken. `src/shared/pricing.ts` prices the
   run from it and refuses to price anything the catalogue does not cover. Nothing is fetched.
4. **One row in the panel.** The token total and the price share a single row of the existing session
   record, with the basis (provider and snapshot date) on the same row and a muted line when no price
   exists. The characters-sent fact keeps its place, and the panel's 600 px / 200 % / longer-label
   contract is unchanged.

Preserved deliberately: the storage schema (no new key, no migration), the provider request body, the
outbound message types, the quote-cap semantics, the fifteen display styles, and the panel's existing
facts, order and vocabulary.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict, `noUncheckedIndexedAccess`), classic IIFE bundle for
the content script, ES modules for the service worker and the two extension pages; Node.js 20 LTS for
tooling only.

**Primary Dependencies**: none at runtime (platform APIs only). `Intl.NumberFormat` is the only
platform surface this feature leans on for formatting. Build Vite 5.4.10; tests Vitest 2.1.4,
jsdom 25.0.1, Playwright 1.48.2, @types/chrome 0.0.287 — all pinned already. No package is added.

**Storage**: unchanged. The spend record is ephemeral run state in the content script, reported through
the existing `JobStatusPayload.usage`; the price catalogue is code, not storage. No schema version
bump, no migration.

**Testing**: Vitest unit tests for the price catalogue and arithmetic (tiers, boundaries, holidays,
aliases, currency, rounding, unavailable states), for reading `usage` from provider responses, for the
message validator, and for the job's attribution rules (delivered-only, once per response, retries,
reuse, cancellation). jsdom DOM tests for the panel row and the muted note. Playwright end-to-end in
real Chromium against the repository's stub provider, which will answer with DeepSeek-shaped `usage`,
so the displayed figures are checked against arithmetic rather than against a mock of our own code.
The estimator takes its catalogue as a parameter (defaulting to the shipped one), so a stale snapshot
is a unit-test input rather than a code edit, and the panel's row renderer is exercised in jsdom
because it is a pure module rather than part of `popup.ts`'s boot.

**Target Platform**: Chromium-family desktop browsers, Manifest V3. `Intl.NumberFormat` with
significant digits, `Intl.DateTimeFormat` with a time zone, and `Date` arithmetic over
`Asia/Shanghai` are all available; no polyfill.

**Project Type**: Single browser-extension project (service worker, content script, panel, settings
page) — no backend.

**Performance Goals**: pricing is a constant-time fold over two tier buckets, recomputed only when the
job already emits a status (once per batch); the panel's render cost is unchanged. A 200-passage page
adds at most one extra line and no extra message.

**Constraints**: no new runtime dependency; no new permission; no network call for prices or usage; no
new storage key; the price catalogue is a maintenance commitment updated with releases; every new
user-visible string goes through the catalogue; the wire may never carry a key named exactly `token`
(the validator treats that as a credential field).

**Scale/Scope**: 3 user stories, 29 functional requirements, 15 success criteria. Touch points: 3 new
modules (`pricing.ts`, `price-catalog.ts` and the panel's `spend-row.ts`), modifications to `provider-client.ts`,
`service-worker.ts` (pass-through only), `messages.ts`, `types.ts`, `job.ts`, `content/index.ts`,
`popup.ts`, `popup.css`, `_locales/en/messages.json`, `presets.ts`, the stub provider, and the
amendments to feature 001's FR-029 and feature 006's panel contract.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Gate | How this plan satisfies it | Verdict |
|---|---|---|
| I. Specification Before Code (NON-NEGOTIABLE) | `spec.md` carries 3 prioritised stories, 29 FRs, 15 SCs, edge cases, recorded assumptions, explicit out-of-scope items and nine clarifications (2026-11-16). This plan and `research.md` record every decision with its rejected alternative; `contracts/` pin the usage wire, the pricing rules and the row. The one older requirement this feature contradicts — feature 001 FR-029, which forbids a monetary figure — is amended in the same change set (T18), and feature 006's panel contract, which says "no money", is amended with it. **No behaviour ships that the spec does not state.** | PASS |
| II. Test-First (NON-NEGOTIABLE) | Every behaviour maps to a test in [Tests this feature owes](#tests-this-feature-owes), including refused and boundary paths: usage absent, usage malformed, split missing, model retired, provider unpriced, a second tab whose provider is unpriced, holiday and non-holiday peak windows, the 08:59:59/09:00:01 boundary, identical usage across it priced at 2×, a price that rounds below four decimals, a stale snapshot that must not hide the amount, cancellation mid-flight **keeping** the record, the absence of any new outbound request, and reuse. Each is a failing test first. No existing assertion is deleted or loosened. Two expectations change because the specification changes them: the panel's session-record content (T16) and the preset's pre-filled model in `tests/e2e/preset.spec.ts`, which now reads `deepseek-flash` (R9, T1). Both are enumerated here and in [Tests this feature owes](#tests-this-feature-owes). | PASS |
| III. Real Data, Real Behavior (NON-NEGOTIABLE) | The displayed figures are proven end-to-end in real Chromium against a real HTTP server over the real extension, with the stub answering DeepSeek's response shape (the single permitted double: the provider boundary). The arithmetic itself is proven against the shipped catalogue in unit tests, so a passing e2e cannot be explained by a mock agreeing with itself. One real-provider check is available on demand through the existing `verify:real-provider` harness (T15), which uses the reader's key and never prints it. | PASS |
| IV. Simplicity and Least Commitment | Two new modules and one data module; no framework, no database, no settings screen, no price editor, no history. The catalogue is plain data with a stated snapshot date, and the pricing function is pure, so the one irreversible commitment (what a price is computed from) is visible in a single file. The cost this plan accepts is recorded in [Complexity Tracking](#complexity-tracking): the holiday list and the second currency list exist only because the provider prices by wall clock and publishes two lists. | PASS |
| V. Accessible and Localizable by Default | Every label, unit, currency symbol and basis string comes from the catalogue (T7's audit); numbers are formatted with `Intl.NumberFormat` in the interface language; the row is ordinary list content with no live region, so a rising figure never interrupts a screen reader (FR-020a); the row wraps rather than clips at 200 % zoom and with labels 30 % longer (FR-022, T12). | PASS |
| Workflow: no secrets; traceability; no unjustified dependency | The credential path is untouched: the service worker still reads the secret and the usage it forwards is five integers. No dependency is added. Every task cites its FR and its test. | PASS |

**Gate result**: PASS. No principle is violated; the Complexity Tracking table records choices that
were made and the data that made them necessary, not violations.

### Post-design re-check (after Phase 1)

Re-read against [data-model.md](./data-model.md), the four [contracts](./contracts/) and
[quickstart.md](./quickstart.md):

1. **A new stored value.** None: the record lives in the job, travels in the existing status payload,
   and dies with the run. The catalogue is code. No storage key, no schema bump (data-model §6).
2. **A second pricing path.** `pricing.ts` is the only place that turns tokens into money; the panel
   only formats. The provider client never prices, and the service worker never sees a rate.
3. **A new user-visible string outside the catalogue.** Seven new keys, all audited by the existing i18n
   test; no literal text in markup.
4. **A widened blast radius.** The service worker's change is a pass-through of a value it already
   parses; the outbound request body is untouched, so no provider sees a new field and no credential
   path changes.
5. **A clearing rule that contradicts the story.** Turning translation off clears the record; a bare
   cancel does not, because the translations it leaves on screen still have a cost. `restore()` is the
   only clearing path, and T6 pins both halves ([R11](./research.md)).
6. **A figure for translations that are no longer on the page.** The record is reported only while at
   least one counted translation is still in the document; a page that removed them shows no spend row
   ([R12](./research.md), data-model §3).

No new violation was found; the gate result stands.

## Risks and decisions the reviewer should see

| Risk | Treatment |
|---|---|
| **A shipped price list goes stale.** DeepSeek has changed prices substantially before, and the plan ships a snapshot dated 2026-11. | The spec makes staleness visible rather than hidden: the price always carries its snapshot date and is never suppressed by age (FR-025, [R3](./research.md)). The catalogue is one file with one date, so an update is a one-line change plus fixtures. |
| **Peak pricing depends on Chinese statutory holidays.** A wrong tier is a 2× error. | The tier rule is window-first and holiday-second, so unknown years are wrong only inside peak windows, never across a whole night ([R3](./research.md), [pricing contract §4](./contracts/pricing-and-tiers.md)). The 2026 list is the official State Council notice. |
| **The product's preset model name was a legacy alias.** A profile configured before this feature still says `deepseek-chat`; the owner reported (2026-11-16) that such a profile was served and billed yet shown as unpriced. | Fixed twice over: the preset moves to `deepseek-flash`, and the catalogue prices the legacy names DeepSeek still serves at the documented Flash rate, so an existing profile is priced too. When a model genuinely cannot be mapped, the note now **names it** (T1, spec Q5 corrected). |
| **A partial price would understate the bill.** One response without a price must not silently reduce the total. | The rule is all-or-nothing: any unpriced or unsplittable response suppresses the price for the whole run and raises the muted note (FR-010, FR-026). Tokens are still reported. |
| **Feature 001 FR-029 forbids a monetary figure.** | Amended, not ignored: T18 rewrites that FR to permit a *list-price estimate for a provider whose published prices ship with the product*, and keeps its ban on an invented bill. Feature 006's panel contract §6 changes "no money" to "no figure that is not a labelled estimate". |
| **Screen-reader announcement storms** as figures rise with every batch. | No live region anywhere in the record; the row is read on demand (FR-020a, T13). |
| **A cancel could erase the cost of translations the reader can still see.** The job's `cancel()` is also the first step of `restore()`, so a careless implementation clears on both. | The clearing seam lives in `restore()` only; `cancel()` keeps the record ([R11](./research.md), T6). |
| **"The price is never hidden for being old" is a promise with no test**, and the catalogue is a constant, so a stale snapshot is hard to simulate. | The estimator accepts the catalogue as a parameter; T21 prices a run with an injected 2025 snapshot and asserts both the amount and the older basis (FR-025). |

## Project Structure

### Documentation (this feature)

```text
specs/008-token-spend-display/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output: decisions and rejected alternatives
├── data-model.md        # Phase 1 output: usage report, spend record, price catalogue, estimate
├── quickstart.md        # Phase 1 output: how to see and prove each figure
├── contracts/
│   ├── provider-usage.md         # What usage may be read, and what is refused
│   ├── message-usage.md          # How usage and spend travel, and what may not travel
│   ├── pricing-and-tiers.md      # Catalogue shape, tier rule, currency, rounding, refusal
│   └── panel-spend-row.md        # The row, its states, its labels, its a11y rules
└── checklists/
    └── requirements.md  # Spec quality checklist (16/16 passing)
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── pricing.ts            # NEW: pure tier classification, price arithmetic, rounding
│   ├── price-catalog.ts      # NEW: DeepSeek lists, aliases, windows, 2026 holidays, snapshot date
│   ├── types.ts              # MODIFIED: UsageReport, SpendRecord, SessionUsageRecord.spend
│   └── messages.ts           # MODIFIED: batchResult.usage schema and validation
├── background/
│   ├── provider-client.ts    # MODIFIED: read usage from the response payload into BatchOutcome
│   └── service-worker.ts     # MODIFIED: pass the accepted response's usage through
├── content/
│   ├── job.ts                # MODIFIED: attribute usage per delivered response, per tier, per run
│   └── index.ts              # MODIFIED: carry usage from the port reply into the batch reply
├── ui/popup/
│   ├── popup.ts              # MODIFIED: call the row renderer with the run's spend record
│   ├── spend-row.ts          # NEW: pure renderer for the row, its basis and the muted note
│   └── popup.css             # MODIFIED: the row's layout, wrap and muted note
├── ui/options/presets.ts     # MODIFIED: the pre-filled model is one the catalogue prices
└── _locales/en/messages.json # MODIFIED: six new keys

tests/
├── unit/
│   ├── pricing.test.ts       # NEW: tiers, boundaries, holidays, aliases, currency, rounding
│   ├── provider-client.test.ts  # EXTENDED: usage reading, absence, garbage
│   ├── messages.test.ts      # EXTENDED: usage schema, forbidden key, invalid usage dropped
│   ├── job-spend.test.ts     # NEW: delivered-only, once, retries, reuse, cancel, tiers
│   ├── presets.test.ts       # EXTENDED: the preset's model is priced
│   └── i18n-audit.test.ts    # EXTENDED only by the catalogue's new keys
├── dom/
│   └── spend-row.test.ts     # NEW: row content, note states, a11y labels, no live region
├── e2e/
│   ├── spend.spec.ts         # NEW: exact figures from DeepSeek-shaped usage, two tabs, layout
│   └── spend-unpriced.spec.ts# NEW: tokens without price, muted note, no amount anywhere
└── support/stub-provider.ts  # EXTENDED: DeepSeek-shaped usage, switchable omission/garbage
scripts/
├── dev-provider.mjs        # EXTENDED: DeepSeek-shaped usage, so the row is visible without a key
└── verify-real-provider.mjs  # EXTENDED: prints token and price lines, never the key
specs/001-llm-web-translator/spec.md                     # MODIFIED: FR-029 amendment
specs/001-llm-web-translator/data-model.md               # MODIFIED: the usage record's new field
specs/006-popup-settings-redesign/contracts/page-control-surface.md  # MODIFIED: §6 record contents
```

**Structure Decision**: The existing single-project layout is kept. Pricing is a shared concern (the
content job prices, the panel displays), so it lives in `src/shared` beside the other cross-context
modules rather than in either context; the catalogue is split from the arithmetic because the data
changes on a different schedule (a provider's announcement) from the logic. The row itself is a small
pure renderer (`spend-row.ts`) rather than inline code in `popup.ts`, because `popup.ts` boots against
`chrome.*` on import and cannot be exercised in jsdom — the same reason `style-picker.ts` and
`style-preview.ts` exist as separate modules. No new directory, no framework-style boundary
(Constitution IV).

## Complexity Tracking

No principle is violated. Five recorded choices: three more elaborate designs rejected, one precision
decision (per-tier buckets), and one accepted data cost:

| Considered | Why rejected | Where recorded |
|---|---|---|
| A general plug-in registry for provider prices | One provider ships today; a registry would be an extension point nobody asked for, and the interface would be guessed before a second provider exists | [research R2](./research.md) |
| A price editor in the settings page | The reader asked for the provider's published price, not for a spreadsheet; editable prices would need validation, currency choice and a "why is my number wrong" story of their own | spec Out of Scope |
| Recomputing the price in the panel from raw responses | Two places would own the arithmetic and the panel would need the provider's rates, widening the blast radius into the UI | [research R4](./research.md) |
| **Accumulating per tier** (peak/off-peak buckets) rather than one flat total | Two buckets are what makes a run that crosses 09:00 Beijing price correctly; a flat total would force a single tier for the whole run | [research R3](./research.md) |
| **Shipping a holiday list and two currency lists as data** | They are ~40 lines of constants, and without them the price is wrong by 2× on holiday peak hours and undefined in one currency; the maintenance cost is one dated file | [pricing contract](./contracts/pricing-and-tiers.md) |

## Phases

- **Phase 0**: `research.md` — twelve decisions (R1..R12), each with rationale, alternatives and the
  exact requirements they serve. No item is left as NEEDS CLARIFICATION. R2 carries the owner's
  2026-11-16 correction: the legacy DeepSeek names are priced, not refused.
- **Phase 1**: `data-model.md`, four contracts, `quickstart.md` — shapes, invariants, and the runnable
  way to see each success criterion.
- **Phase 2** (`/speckit-tasks`): dependency-ordered tasks, each citing its FR and its test.

## Tests this feature owes

Every row names a behaviour the spec requires that no test pins today. Rows marked **changed** rewrite
an existing expectation because the specification changes that behaviour; none deletes an assertion.
Two expectations are rewritten: the session record's contents (**changed**, T16) and the preset's
pre-filled model (T1, `tests/e2e/preset.spec.ts`).

| # | Behaviour | Level | Proves |
|---|---|---|---|
| T1 | The preset's model is one the shipped catalogue prices; `deepseek-flash`, `deepseek-v4-pro`, `deepseek-v4-flash` **and the legacy names `deepseek-chat` / `deepseek-reasoner`** do; an unknown name does not | unit | FR-028 |
| T2 | Usage is read from a DeepSeek-shaped body (prompt, completion, total, cache hit, cache miss), from an OpenAI-shaped `prompt_tokens_details.cached_tokens` body, and is absent when the body has none | unit | FR-001, FR-003 |
| T3 | Garbage usage (negative, string, NaN, huge) is treated as absent, never as a number | unit | FR-003, FR-005 |
| T4 | `parsePortResponse` accepts a valid usage object, drops an invalid one, still rejects a payload carrying a key named `token` | unit | FR-003, message contract |
| T5 | The job counts a response once when it delivers translations, not at all when every result fails, and exactly once when a retry finally delivers | unit | FR-002, FR-018 |
| T6 | A cancelled run keeps the figures of translations already rendered and adds nothing for the in-flight response | unit | FR-018, edge case |
| T7 | The catalogue's new strings exist and the audit stays green; no literal text in markup | unit | FR-021 |
| T8 | Tier classification: 08:59:59 vs 09:00:01 Beijing; lunch break 11:59 vs 12:00; weekend; a listed 2026 holiday at 10:00; a 2027 weekday at 10:00 (peak) and at 02:00 (off-peak); and identical usage sent across the boundary priced at exactly 2× | unit | FR-011, SC-006 |
| T9 | Price arithmetic: cache hit at the hit rate, miss at the miss rate, output at the output rate, per tier; split missing means every input token at the miss rate; total-only usage suppresses the price | unit | FR-007, FR-008, FR-010 |
| T10 | Currency: a `zh` target prices in CNY, an `en` target in USD, no conversion anywhere | unit | FR-012 |
| T11 | Rounding: six tiny amounts keep two significant digits, none renders as `0`, none exceeds six decimals, the separator follows the interface language | unit | FR-013, SC-009 |
| T12 | The panel row shows tokens and price on one row with the basis; the muted note appears for unpriced provider, unpriced model and incomplete usage; no number appears when no usage was reported | dom | FR-001, FR-004, FR-009, FR-026, FR-027, SC-002, SC-003 |
| T13 | No live region in the record: 20 updates produce zero polite announcements; the row's accessible text contains both figures and the basis | dom + a11y | FR-020a, SC-014, SC-015 |
| T14 | End to end: a page translated against a stub that reports DeepSeek usage shows the hand-computed total and price; reopening the panel does not change them; turning translation off clears them; and 20 sampled arrivals are each reflected within one second with neither figure moving backwards | e2e | FR-016, FR-017, FR-019, SC-001, SC-002, SC-008 |
| T15 | One real DeepSeek request (owner-supplied key, via `verify:real-provider`) reports a token count above zero and a price that equals the catalogue arithmetic applied to the usage the provider returned | e2e (manual, opt-in) | FR-001, FR-007 |
| T16 | **changed**: the panel's session record now reads segments, characters, tokens + price, reused, skipped, failed — in that order, with the characters fact intact | dom + e2e | FR-027, SC-013 |
| T17 | Two translated tabs report their own figures; a provider without a price list shows tokens and the note, and no amount | e2e | FR-015, FR-026, SC-003, SC-011 |
| T18 | Feature 001 FR-029 and feature 006's §6 say what the product now does; the amendments are in the same change set | review | Constitution I |
| T19 | Layout: the record with the new row stays under 600 px at 384 px wide, at 200 % zoom, with labels 30 % longer, in light and dark, with and without the muted note, and under a right-to-left locale where the basis wraps without losing the currency symbol | e2e + measurement | FR-022, SC-010 |
| T20 | The full existing suite (unit, DOM, e2e, style verification) passes with nothing skipped, weakened or excluded | all | Constitution II |
| T21 | A run priced from an injected snapshot older than the provider's current list still shows its amount, and its basis names that older date — age never hides or changes it | unit + dom | FR-025 |
| T22 | A translated run adds exactly the same outbound requests, with the same request-body fields, as before this feature, and the manifest gains no permission or host | unit + review | FR-024 |
| T23 | Five readers who have never seen the panel state the token spend and the estimated cost within ten seconds, by the protocol in [quickstart §5](./quickstart.md) | manual | SC-012 |
