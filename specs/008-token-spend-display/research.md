# Research: Token Spend and Its Price

Feature 008. Every decision below is settled; nothing is left as NEEDS CLARIFICATION. Each entry names
the requirement it serves and the alternative that was rejected, so a reviewer can disagree with the
choice rather than guess at it.

---

## R1 — Usage enters at the provider client and travels as integers

**Decision**: the provider's `usage` object is read in `callProvider` from the same parsed body it
already inspects, normalised into at most five non-negative integers
(`promptTokens`, `completionTokens`, `totalTokens`, `cacheHitTokens`, `cacheMissTokens`), and carried
in `BatchOutcome.usage`. The service worker forwards the accepted outcome's usage in
`batchResult.usage`. The content port client passes it into `BatchReply.usage`. Nothing else reads the
provider body.

**Why**: the service worker is the only context that holds the credential and sees the raw response
(research R3 of feature 001). Pricing needs the cache split, which only that body has. Reading it
anywhere else would mean a second parse of a response nobody else is allowed to see.

**Alternatives rejected**: (a) Have the service worker compute the price — it would then need the
catalogue and the reader's target language, and it would become a second owner of a display rule it
currently knows nothing about. (b) Re-request the provider's usage endpoint — DeepSeek has none, and
the product's promise is that page text leaves the device exactly once per translation request
(FR-024).

---

## R2 — One catalogue module, one provider, plain data

**Decision**: `src/shared/price-catalog.ts` exports one `PRICE_SNAPSHOT` constant: its date, the
endpoint hosts it applies to, the models it covers with their CNY and USD rates, the documented model
aliases, the two peak windows, and the holiday dates the snapshot can classify. `src/shared/pricing.ts`
exports the pure functions that consume it. There is no registry, no interface with one implementation,
and no runtime lookup.

**Why**: a price table is data with a different lifecycle from logic — it changes when a provider
publishes an announcement, which is a release, not a refactor. Keeping it in one file with one date is
also what makes FR-025 ("never hide a price because it is old") safe: the date beside the number is the
whole staleness story.

**Alternatives rejected**: (a) a plug-in registry keyed by provider id — a speculative extension point
for a second provider that does not exist (Constitution IV). (b) Fetching prices at runtime — it
contradicts FR-024 and the product's no-extra-destination promise. (c) Storing prices in
`chrome.storage` — a stored price is a user-editable price, with validation and currency questions of
its own; out of scope.

The estimator takes the catalogue as a parameter whose default is the shipped snapshot. That is a
testing seam, not a setting: it is what lets FR-025 ("age never hides the amount") be proven by
pricing a run against an injected 2025 snapshot, instead of being a promise no test can reach.

**Catalogue contents, as published on 2026-11-16** (per 1M tokens; off-peak is half of peak, and the
plan stores both, not a ratio, so a future announcement can break the halving without a code change):

| Model | Currency | Cache-hit | Cache-miss | Output |
|---|---|---|---|---|
| `deepseek-flash` | CNY | 0.02 / 0.04 | 1 / 2 | 4 / 8 |
| `deepseek-v4-pro` | CNY | 0.15 / 0.30 | 4.5 / 9.0 | 13.5 / 27 |
| `deepseek-flash` | USD | 0.003 / 0.006 | 0.15 / 0.3 | 0.6 / 1.2 |
| `deepseek-v4-pro` | USD | 0.022 / 0.044 | 0.66 / 1.32 | 1.98 / 3.96 |

Each cell is `off-peak / peak`. Documented aliases: `deepseek-v4-flash` and
`deepseek-v4-flash-vision-exp` are billed at the Flash price. **Corrected by the product owner on
2026-11-16:** `deepseek-chat` and `deepseek-reasoner` are in the catalogue too, at the Flash price.
A profile configured before the preset changed still says `deepseek-chat`, DeepSeek still serves it,
and leaving it unpriced told a working DeepSeek reader that its own provider had no price. The
preset still moves to `deepseek-flash`, and a model the catalogue cannot map is now named in the note
instead of being anonymous (FR-026, FR-028).

---

## R3 — Peak is decided window-first, holiday-second

**Decision**: a request's tier is computed from its own start instant in `Asia/Shanghai`:

1. If the local date is Saturday or Sunday → **off-peak**.
2. Else if the local time is in `[09:00, 12:00)` or `[14:00, 18:00)` → **holiday lookup**: if the date
   is one of the snapshot's holiday dates, **off-peak**; otherwise **peak**.
3. Else → **off-peak**.

The snapshot's holiday list is the official State Council notice for 2026: 1–3 Jan, 15–23 Feb, 4–6 Apr,
1–5 May, 19–21 Jun, 25–27 Sep, 1–7 Oct. Its coverage year is 2026; a date in any other year has no
holiday entries, so a weekday inside a peak window is priced as **peak** — which is what FR-011 asks
for: an unclassifiable moment is charged at the peak rate.

**Why window-first**: a holiday can only make a moment cheaper, never dearer. Classifying by window
first, and letting the holiday list subtract, means an unknown year is wrong only inside a peak window
(6 hours × ~11 holiday weekdays a year), never across a whole night. A "no holiday data ⇒ always peak"
implementation would double the price of every night time request from 2027 onward — a far worse error
for a feature whose purpose is honesty about cost.

**Alternatives rejected**: (a) Classify by start date only, ignoring clock time — wrong by 2× for most
of the day. (b) Ignore holidays entirely — overstates 2026 holiday peak hours by 2×, and the user
explicitly asked to follow DeepSeek's published definition. (c) Treat make-up working weekends (14 Feb,
28 Feb, 9 May, 20 Sep, 10 Oct in 2026) as weekdays — the published peak definition is "Monday to
Friday, excluding statutory holidays", so a Saturday that becomes a working day is still a Saturday;
the catalogue follows the published words.

---

## R4 — Pricing lives in the content job; the panel only formats

**Decision**: `TranslationJob` accumulates the run's parts and calls `estimateSpend()` from
`src/shared/pricing.ts` when it builds its status. `SpendRecord` carries either a price
`{ amount, currency, snapshot }` or an `unavailable` reason. `popup.ts` renders and formats; it never
prices.

**Why**: the job already owns everything the price needs — the provider used, the run's target
language, each response's request time — and it is the object that survives across batches. The panel
is stateless between openings and would otherwise need the catalogue, the tier rule and the provider's
rates, turning a display concern into a pricing one.

**Alternatives rejected**: (a) Price in the panel — duplicates the arithmetic and widens the blast
radius into the UI. (b) Price per response in the service worker — it lacks the run's target language
and would make a stateless context own a display rule.

---

## R5 — Attribution: delivered-only, once per response, at request time

**Decision**: in `#applyReply`, the job adds a response's usage to the run **only if that response put
at least one translation on the page**, exactly once, and it attributes the usage to the tier of the
moment the request was made (recorded in `#runBatch` before the call). Reused passages, skipped
passages, cap refusals, cancelled runs and responses whose results were discarded add nothing. The
accumulator keeps two tier buckets of `{ hit, miss, out }` plus a separate total, because a provider's
reported total may disagree with input + output (spec edge case).

**Why**: this is the sentence the spec repeats three times (FR-002, FR-009, FR-018), and it is the only
attribution that is both ownable and honest: the product cannot see the provider's cache, retry or
billing pipeline, so it reports the responses it actually received and that actually reached the page.

**Consequences, accepted and stated in the spec**: tokens the provider may have billed for requests
that never answered are not counted; the record reports what it can prove. The existing failure line
already reports the failures.

**Alternatives rejected**: (a) Count every request sent, including failed ones — it would report a
number the product cannot substantiate and violate FR-003. (b) Estimate tokens from characters when
usage is missing — explicitly forbidden (FR-003), and the panel says nothing instead.

---

## R6 — Currency follows the target language, not the device locale

**Decision**: `targetLang` beginning with `zh` prices in the provider's CNY list; every other target
prices in its USD list. No conversion, no exchange rate, no rounding across currencies.

**Why**: the product owner's answer (clarify session 2026-11-16) was "the currency of the target
language"; those are also the only two lists the provider publishes, so the mapping never invents a
rate. It also keeps the choice stable per run: a reader translating into Chinese sees yuan even when
their interface language is English.

**Alternatives rejected**: (a) The interface locale — the product ships one locale today, so the
figure would always be USD. (b) A setting — a preference nobody asked for, and a second place to be
wrong. (c) Convert one list into the other — the product holds no exchange rate and must not invent
one.

---

## R7 — Rounding keeps two significant digits and never prints zero

**Decision**: the amount is rendered with `Intl.NumberFormat` at `minimumSignificantDigits: 2` and at
most six fraction digits; the currency symbol comes from the catalogue message that wraps it
(`≈ ¥{amount}` / `≈ ${amount}`). If a formatted value would be `0`, one more fraction digit is used,
up to six, and the value is never rendered as zero.

**Why**: a single small batch can cost ¥0.0004; printing `¥0` would say the translation was free, which
is exactly the misreading FR-026 exists to prevent. Two significant digits is the smallest precision
that still distinguishes two different small runs.

**Alternatives rejected**: (a) Fixed two decimals — everything under ¥0.005 reads as zero. (b) Full
floating point — noise that implies a precision the list price does not have.

---

## R8 — One row, the characters fact intact, and no live region

**Decision**: the panel's session record gains one row holding the token total and the price, plus the
basis (`{provider} list · {snapshot}`) on the same row, wrapping when it must. The characters-sent line
keeps its place and value. When no price can be computed, a muted line beneath the row names the reason
(no published price for this provider / for this model / the provider did not report enough usage). No
element in the record is a live region; the existing status line remains the only thing that speaks.

**Why**: the record is a record, not a chart — the same rule feature 006 wrote. Merging the two figures
into one row is what keeps the panel under its 600 px contract while the characters fact stays useful
(it is the unit the volume caps are expressed in). Silence about a missing price would read as
"free", which the owner explicitly rejected.

**Alternatives rejected**: (a) Two rows — verified to risk the panel height contract. (b) Replacing the
characters fact with tokens — the caps are still expressed in characters, so that fact still earns its
line. (c) `aria-live="polite"` on the record — a page translated in 40 batches would interrupt a screen
reader 40 times.

---

## R9 — The pre-filled model is the one that still exists

**Decision**: `DEEPSEEK_PRESET.draft.model` changes from `deepseek-chat` to `deepseek-flash`. No other
field changes. `presets.test.ts` gains an assertion that the preset's model is priced by the shipped
catalogue, so the two cannot drift.

**Why**: the default provider must be able to produce the very thing this feature displays. The
current price page lists `deepseek-flash` and `deepseek-v4-pro`. Shipping a price feature on top of a
pre-filled name the provider has retired would produce "no tokens, no price, and a model error" for
the most common first run. The spec records this as a separate defect the plan settles (Assumptions).

**Post-implementation correction (2026-11-16)**: a real profile that still carried `deepseek-chat`
was served and billed by DeepSeek but shown as "no published price for this model". The preset still
moves to `deepseek-flash`, and the catalogue now prices the legacy names at the documented Flash rate
so an existing profile needs no migration; a model it cannot map is named in the note.

**Alternatives rejected**: (a) Leave the preset alone — it makes the feature's own acceptance path
unprovable by default. (b) Migrate stored providers from `deepseek-chat` to `deepseek-flash` — a silent
rewrite of the reader's configuration, which the product never does. (c) Price only the current names —
the owner's report showed that leaves a working DeepSeek profile unpriced, which is the defect this
correction fixes.

---

## R10 — What this feature refuses to add, and how it is proven

**Decision**: no new permission, no new storage key, no new message *type*, no outbound field, no
dependency, and no network destination. The amendments to feature 001 FR-029 and feature 006's panel
contract land in the same change set as the code.

Proof strategy: unit tests own the arithmetic (catalogue, tiers, boundaries, holidays, aliases,
currency, rounding, refusal); the message and provider-client tests own the wire; the job test owns
attribution; a DOM test owns the row; two e2e specs own the rendered outcome against a stub that mimics
DeepSeek's response shape (including a mode that omits usage and a mode that returns garbage). The
stub is the only double, and it sits at the one boundary the product does not own (Constitution III).
A real-provider check stays available through `npm run verify:real-provider`, extended to print the
token and price lines.

**Why**: every number this feature shows is either measured or absent. The test split mirrors that
claim: arithmetic is proven without a browser, and the browser proves that the arithmetic reaches the
panel unchanged.

---

## R11 — Cancel keeps the record; only turning translation off clears it

**Decision**: the spend record is cleared inside `restore()` — the path that turning translation off
takes — and nowhere else. A bare `cancel()` stops the run and leaves the figures of the translations
already on the page, adding nothing for the response that was in flight.

**Why**: the spec's edge case is explicit — "translations already on the page keep their figures"
(the "cancelled while a response is in flight" edge case in [spec.md](./spec.md)) — and `restore()`
calls `cancel()` internally, so a clearing rule written inside
`cancel()` would erase a cost the reader is still looking at while its translations are still on the
page. Two behaviours, two places: `cancel()` stops, `restore()` clears.

**Alternatives rejected**: (a) Clear on both and redefine the edge case — that would make the panel
report nothing exactly when the reader has a partly translated, partly paid page, which contradicts
the feature's purpose. (b) Keep the record after restore — the page no longer shows any translation,
so a figure would describe text that is no longer there (FR-023).

---

## R12 — A figure is reported only while its translations are on the page

**Decision**: the job reports `spend` only while at least one counted translation is still connected to
the document. When a page re-renders itself and drops every translation, the status carries no `spend`
and the panel shows neither figure; the record is not cleared, it simply stops being reported, so a
page that restores its own content has nothing to recover.

**Why**: FR-023 says a page that shows no translations shows no figures. Reload and turn-off are
covered by "the content script is gone" and "restore clears"; the remaining case is a single-page app
that replaces the subtree the extension rendered into. Counting rendered translations that are still
connected is the one check the job can make without trusting the page.

**Alternatives rejected**: (a) Clear the record when a translation disappears — a transient removal
(the page re-rendering a node and putting it back) would erase a legitimate cost. (b) Ignore the case
and let the panel report a figure for invisible translations — that is a number describing nothing.

**Consequence**: the check runs when a status is built, so it costs one pass over the units the job
already holds, and it cannot make a figure decrease while translations remain.
