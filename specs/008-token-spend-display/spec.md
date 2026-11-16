# Feature Specification: Token Spend and Its Price for the Translations a Page Already Shows

**Feature Branch**: `008-token-spend-display` (no branch was created: this project registers no
`before_specify` hook, and the working tree stays on `master`)

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "在首页显示token花费的数量，已经翻译的花费"

## Clarifications

### Session 2026-11-16

- Q: Does "花费" mean a token quantity only, or a monetary amount? → A: Both. The panel shows token
  quantities and a monetary figure computed from each provider's published unit prices, **including
  its cache pricing**; DeepSeek is the first provider covered.
- Q: What is the scope of the figures? → A: The current page's translation run — the same boundary
  as the panel's existing "This session" record. No lifetime ledger.
- Q: Which currency, and how is peak/off-peak handled? → A: The currency follows the translation's
  target language; the peak/off-peak schedule follows DeepSeek's published definition.
- Q: Which surface is "首页"? → Interpreted as the extension's toolbar panel, the product's only home
  surface (feature 006). Noted as an assumption.
- Q: When the shipped price snapshot is older than the provider's current published prices, should the
  panel stop showing an amount? → A: No. The amount stays, always accompanied by the date of the
  snapshot it was computed from; age never hides it.
- Q: When a provider has no shipped price list, should the panel stay silent or explain the missing
  amount? → A: Explain it in one muted line, so the absence cannot be misread as "this was free".
- Q: The figures change with almost every batch; should a screen reader announce each change? → A: No.
  The figures update silently and are read on demand, so a long page does not turn into a stream of
  interruptions.
- Q: The panel already carries a "characters sent" fact and has a 600 px height limit — how do the new
  figures fit? → A: Keep the characters fact unchanged, and put the token total and the price on one
  shared row, so the record grows by exactly one row.
- Q: The product's pre-filled model name "deepseek-chat" is a legacy alias that DeepSeek's current
  price page no longer lists — which model names should the shipped price list cover? → A: The two
  models DeepSeek currently publishes, plus every legacy name it still serves, at the rate the
  provider documents. _(Corrected by the owner on 2026-11-16: a profile configured before this
  feature still carries `deepseek-chat`, and it is served and billed; the name is priced at the Flash
  rate rather than left unpriced — see the last clarification entry.)_
- Q: The edge cases and SC-001 spoke of "a run served by two providers" — can one run use two? → A: No. A
  run resolves exactly one provider when it starts. Those scenarios are rewritten as two tabs, one priced
  and one not, which is the real shape of the situation; the price rule itself stays phrased per response
  so that a future mixed-provider run would be priced conservatively rather than wrongly.
- Q: A reader's profile still says `deepseek-chat` (the model the preset pre-filled before this feature).
  Should DeepSeek show "no published price for this model"? → A: No. The owner reported that outcome as
  a defect on 2026-11-16. The price list covers the legacy model names DeepSeek still serves, priced at
  the rate the provider documents for them (its current page states legacy names are billed at the
  Flash price), and when a model genuinely cannot be priced the note names **which** model.
- Q: FR-013 caps the price at six decimal places, but the smallest charge a single token can produce is
  ¥0.00000002 — which promise wins below ¥0.000001? → A: Never showing a non-zero estimate as zero. Six
  decimals stay the normal ceiling; below ¥0.000001 the formatter keeps as many decimals as two
  significant digits need, up to eight, and no amount is ever rounded down to `0` (2026-11-16,
  convergence T052).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The panel says what this page has cost, in tokens and in money (Priority: P1)

A reader translates a foreign article, reads for a few minutes, and then opens the extension's panel
from the toolbar. The panel already reports how much was translated, in passages and characters.
Neither number can be checked against the provider's invoice: characters are not tokens, and tokens
are not currency.

What must happen instead: the panel shows, on one row, the tokens the provider reported spending on
the translations that are now on the page, and next to it an estimated price derived from the
provider's own published price list — including the cheaper cache-hit rate for input the provider
served from its cache. The figures rise during the run as each batch of translations arrives, without
the reader reopening the panel.

**Why this priority**: This is the request. The reader pays per token and, for cached input, at a
different rate again; a number that ignores either cannot answer "is this article worth translating?"

**Independent Test**: Point the extension at DeepSeek's endpoint (or a stand-in that returns DeepSeek's
response shape) and translate a fixed page. Read the panel, then hand-compute the expected spend from
the shipped price snapshot and the usage each response reported. The token total must match to the
token and the price must match to the displayed precision.

**Acceptance Scenarios**:

1. **Given** a page that shows no translation, **When** the panel is opened, **Then** no token figure
   and no price figure are present.
2. **Given** a page whose translations came from DeepSeek responses that report usage, **When** the
   panel is opened, **Then** one row states the total tokens spent and, beside it, an estimated amount
   in the currency named by the price list, each figure carrying its own label.
3. **Given** a run in progress, **When** one more response's translations reach the page, **Then** both
   the token total and the price have risen by exactly that response's contribution within one second.
4. **Given** a response whose input was largely served from the provider's cache, **When** it is
   counted, **Then** its cached input is priced at the cache-hit rate and only its uncached input at
   the cache-miss rate.
5. **Given** the same page and the same run, **When** the reader closes and reopens the panel,
   **Then** every figure is identical to what it was before closing.
6. **Given** a translated page, **When** the reader turns translation off, **Then** the row and any
   muted note disappear with the rest of the run's record.
7. **Given** a translated page that shows a price, **When** the reader inspects that row, **Then** the
   provider whose list was used and the date of that list are stated with it, in text the reader — or
   their screen reader — can reach from the row itself.

---

### User Story 2 - The price is an estimate the panel can defend, or it is absent (Priority: P1)

Most readers never open a provider's billing dashboard. That makes anything the panel prints
authoritative, whether or not it is real. A price is harder to stand behind than a token count: it
depends on a published list that changes, on a peak-hour schedule, on cache hits, and on which
provider actually served the request.

What must happen instead: the price is shown only for a provider whose published list ships with the
product and only when every counted response can be priced; it is always presented as an estimate
with its basis named (provider and price snapshot), never as a bill; cached input is discounted only
when the provider says it was cached, otherwise the dearer uncached rate is used; and when any part
of the run cannot be priced, no price is shown at all rather than a partial total. Token figures,
which are measured, keep their own honesty rules: they are never estimated, never counted twice, and
never derived from characters.

**Why this priority**: Once printed, an estimate is indistinguishable from a measurement. The product
promises honest failures; a made-up or quietly incomplete price is the same betrayal in a quieter
voice, and it would make this feature worse than having no figure.

**Independent Test**: Run the same fixed page three ways — a provider with no shipped price list, a
provider whose reported usage omits the cache split, and a second tab translated through a provider
with no price list — and assert: no price in the first case (tokens still correct), the uncached rate
applied to all input in the second, and in the third that tab shows tokens plus the muted note while
the priced tab keeps its own amount. Then repeat with a provider that reports no usage and
assert that no token figure and no price appear anywhere.

**Acceptance Scenarios**:

1. **Given** a provider with no shipped price list, **When** a page is fully translated, **Then** the
   token figures are shown and no price is shown, with no message implying the price was zero.
2. **Given** a provider that reports no usage, **When** a page is fully translated, **Then** neither a
   token figure nor a price appears, and neither is derived from the character count.
3. **Given** a response whose usage has no cache-hit/cache-miss split, **When** it is priced, **Then**
   all of its input is charged at the cache-miss rate, so the estimate cannot understate it.
4. **Given** a page whose provider has no published price list, **When** the panel is opened, **Then**
   no price is shown for the run, and the token total still reports what the provider said it consumed.
5. **Given** responses whose translations were discarded (malformed alignment, cancelled run,
   restored page), **When** the panel is opened, **Then** they contribute neither tokens nor price.
6. **Given** passages served by reusing an earlier translation, **When** the panel is opened, **Then**
   they add nothing to either figure and the existing reuse line still reports them.
7. **Given** a provider that reports a real zero for a cached response, **When** the panel is opened,
   **Then** zero tokens and zero price are shown as measured values, distinguishable from an absent
   report.
8. **Given** a translated page whose provider has no shipped price list, **When** the panel is opened,
   **Then** the token figure is shown with one muted line saying that no price is published for this
   provider, and that line cannot be read as an amount or as zero.

---

### User Story 3 - The figures hold up in the ways the panel is actually opened (Priority: P2)

The panel is opened in short glances, on a laptop at 100 % zoom and at 200 %, in a second tab, after
the run finished long ago, with the interface in a longer language. Both figures must stay readable
and must never describe another tab's spending.

What must happen instead: both figures read as facts in the panel's existing record, at the panel's
existing width and height limits; they are scoped to the page whose translations the reader is looking
at; they update live; they are announced to a screen reader as complete quantities; and every label,
unit and currency symbol comes from the translation catalogue.

**Why this priority**: A correct number that cannot be read, or that silently belongs to a different
tab, is not cost visibility. The panel's size, localization and accessibility guarantees already
exist and must not regress.

**Independent Test**: With two tabs translated, open the panel on each and confirm each shows its own
figures. Then measure the panel at 384 px wide, at 200 % zoom and with labels 30 % longer than English:
no clipped label, no overlapping row, no vertical scrolling, no sideways overflow. Finally, read the
record with a screen reader and confirm each number carries its own label and unit.

**Acceptance Scenarios**:

1. **Given** translations in two tabs, **When** the panel is opened on the first tab, **Then** both
   figures belong to the first tab only.
2. **Given** a translated page with the full record, **When** the panel is measured at the browser's
   600 px panel height, **Then** both figures are visible without scrolling and nothing overflows
   sideways at 200 % zoom.
3. **Given** labels 30 % longer than English, **When** the record is shown, **Then** no label is
   clipped and no unit or currency symbol is lost.
4. **Given** a screen reader on the record, **When** it reads the row holding the token and price
   figures, **Then** each number is announced with its label and unit as a complete phrase, together
   with the provider and snapshot date that form the basis.
5. **Given** a reader who has just opened the panel on a translated page, **When** asked what the page
   cost, **Then** they can point at one row that answers it in tokens and in money.

---

### Edge Cases

- A response reports input and output but no total: the total shown is their sum; the price uses the
  two reported parts.
- A response reports a total that does not equal input + output: the provider's total is the token
  figure, and the price uses the parts the provider actually split, never a re-derived total.
- A response reports only a total, with no input/output split: the token total is shown; that response
  cannot be priced, so the run's price is not shown.
- A request is made at 08:59:59 Beijing time and answered at 09:00:01: the price tier is the one in
  effect when the request was made.
- A run spans the peak/off-peak boundary: each response is priced at its own tier; the total is the
  sum, not the tier of the last response.
- A day the shipped snapshot cannot classify (a holiday the snapshot does not list): its requests are
  charged at the peak rate, so the estimate never understates.
- Two tabs translate through different providers, one priced and one not: each panel shows only its own
  page's figures — an amount in the priced tab, tokens plus the muted note in the other — and no run mixes
  providers, because a run resolves exactly one provider when it starts.
- A translated page whose provider has no shipped price list: tokens and the muted note appear; no
  amount, no zero and no empty price slot is shown.
- The configured model name is one the provider has retired: no translation is produced, so neither
  figure appears; the panel reports the failure through its existing failure line, and the price list
  stays silent about that name rather than guessing a successor's price.
- A provider returns usage with zero prompt and zero completion tokens (its own cache): the figures
  show measured zeros.
- A price so small that four decimals would render it as zero: more decimals are used — six normally, up
  to the eight that one off-peak cache-hit token (¥0.00000002) can demand — so a non-zero estimate never
  reads as zero.
- A run is cancelled while a response is in flight: translations already on the page keep their
  figures; the in-flight response contributes nothing because its usage was never seen.
- A page is translated, then reloaded: the record is empty, because it belongs to the run, not to the
  page.
- The reader changes the target language between runs: the currency of the price follows the target
  language of the run being reported.
- The installed price snapshot is years old: the amount is still shown, with that old date beside it,
  rather than being replaced by a warning or by nothing.
- The provider republishes its prices in a release that the reader has not installed yet: the panel
  keeps using the snapshot it ships with, and says when that snapshot was taken.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The panel MUST show the total tokens the provider reported for the translations currently
  on the page, labelled as tokens, whenever at least one response reported usage.
- **FR-002**: Each provider response that delivers at least one translation to the page MUST contribute
  its full reported usage to the token total exactly once, whether it is a first attempt or a retry.
- **FR-003**: The product MUST NOT estimate, infer or approximate token counts; a response that reports
  no usage contributes nothing, and no figure may be derived from characters, request payloads or
  earlier runs.
- **FR-004**: When no counted response reported usage, the panel MUST show no token figure and MUST NOT
  display a zero, a placeholder, or a character-derived number in its place.
- **FR-005**: A measured zero MUST be displayable and MUST be distinguishable from an absent report.
- **FR-006**: When every counted response comes from a provider covered by a price list that ships with
  the product, the panel MUST show an estimated price for those same responses; otherwise it MUST show
  no price at all.
- **FR-007**: The estimate MUST be computed per response from the provider's published per-token rates:
  cache-hit input tokens times the cache-hit rate, plus cache-miss input tokens times the cache-miss
  rate, plus output tokens times the output rate.
- **FR-008**: When a response does not report a cache hit/miss split, all of its input MUST be charged
  at the cache-miss rate, so the estimate never understates that response.
- **FR-009**: The price MUST be presented as an estimate and MUST name its basis — the provider whose
  list was used and the date of the price snapshot — and MUST NOT be described as a bill, invoice,
  charge or amount due.
- **FR-010**: When any counted response cannot be priced (unknown provider, unknown model, or no
  input/output split), the panel MUST show no price for the run rather than a partial total, and MUST
  NOT convert another provider's rates, invent rates, or apply an exchange rate.
- **FR-011**: The price MUST follow the provider's published peak/off-peak schedule in the time zone
  that schedule states, evaluated at the moment each request was made; a moment the shipped snapshot
  cannot classify MUST be charged at the peak rate.
- **FR-012**: The currency MUST be the one used by the translation's target language when the provider
  publishes a list in it, and the provider's international list otherwise; no currency conversion MAY
  be performed.
- **FR-013**: The price MUST be displayed with at least two significant digits and at most six decimal
  places, using the interface language's decimal separator. Two significant digits is a floor, not a
  rounding target, so a larger amount keeps the decimals it needs. Where six decimals would render a
  non-zero estimate as zero, the estimate keeps the decimals it needs — up to eight, the precision the
  smallest charge a single token can produce requires — rather than being rounded to zero. A non-zero
  estimate MUST NOT be displayed as zero.
- **FR-014**: The token figures and the price MUST cover exactly the same set of responses.
- **FR-015**: Both figures MUST be scoped to one translation run on one page, MUST belong to that
  tab's page, and MUST NOT include any other page's run.
- **FR-016**: Both figures MUST update while the run is in progress, so that a translation appearing on
  the page is reflected within one second without the reader reopening the panel.
- **FR-017**: Reopening the panel, refreshing its status, or letting the run finish MUST NOT change
  either figure.
- **FR-018**: Tokens attributable to passages that were reused, skipped, capped, cancelled, or that
  never produced a visible translation MUST NOT be counted, and neither MUST their price.
- **FR-019**: Turning translation off MUST clear both figures with the rest of the run's record;
  turning it on again MUST begin a new record.
- **FR-020**: Each figure MUST be exposed to assistive technology as a complete labelled quantity
  (name, number, unit) and MUST NOT rely on colour, position alone, or a legend elsewhere to be
  understood.
- **FR-020a**: As the figures rise during a run, they MUST NOT announce themselves; the current values
  MUST be readable on demand, and no change of theirs may interrupt the reading of the page.
- **FR-021**: Every user-visible label, unit, currency symbol and basis note for these figures MUST
  come from the translation catalogue, with localized number formatting.
- **FR-022**: The panel MUST keep its existing size and layout contract: at its 384 px width, the record
  including the new row — and, when it applies, the muted line of FR-026 — fits inside the 600 px panel
  without vertical scrolling and without sideways overflow, at 200 % zoom and with labels 30 % longer
  than English.
- **FR-027**: The existing characters-sent fact MUST remain, unchanged in value and place; the token
  total and the price MUST share one row of the record, each with its own label, so the record grows
  by exactly one row.
- **FR-028**: The price list MUST cover every model name the provider currently publishes **and**
  every legacy name it still serves, each at the rate the provider documents for it (a legacy name the
  provider spells out as billed at a current model's price is priced as that model). The product MUST
  NOT attach a price to a name the provider documents as withdrawn, and MUST NOT infer a price from an
  unrelated model's rates.
- **FR-023**: The panel MUST show neither a token figure nor a price for a page that shows no
  translations, including after a reload or after translations were removed.
- **FR-024**: The product MUST NOT send any request, anywhere, to obtain prices or token counts; the
  price list ships with the product and usage comes only from the translation responses themselves.
- **FR-025**: The age of the price snapshot MUST NOT hide or alter the price: an amount computed from
  an old snapshot is shown exactly like a fresh one, and the snapshot's date — already required by
  FR-009 — is the reader's means of judging how current it is.
- **FR-026**: When tokens are shown but no price can be computed, the panel MUST explain the absence
  in one muted line that names the reason — and, when the reason is a model the price list does not
  cover, names the **model** the reader configured. The line MUST NOT read as an amount, as zero, or
  as "free".

### Key Entities *(include if feature involves data)*

- **Token Spend Record**: The run's measured consumption — total tokens, and the input/output and
  cache-hit/cache-miss parts needed to price it — plus whether any report exists at all. Belongs to one
  translation run on one page; reported, never invented.
- **Usage Report**: What one provider response states it consumed, including its cache split when the
  provider supplies one, and possibly disagreeing with its own total. The only admissible source of
  both figures.
- **Price Snapshot**: The provider price lists the product ships with — per model, the cache-hit,
  cache-miss and output rates; the peak/off-peak windows with their stated time zone; the calendar days
  it can classify (its holiday list); its currency; and the date it was taken. Versioned with the
  product; the basis the panel names.
- **Price Estimate**: The result of applying the snapshot to the counted responses' usage at their own
  request times. An estimate, always labelled as one, never a bill.
- **Translation Run**: The existing per-page run whose facts the panel already reports; the owner of
  the record and the boundary at which it is cleared.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On five differently shaped pages (short article, long article, partially failing page, a
  page open in two tabs where only one tab's provider is priced, page with heavy reuse), the token total
  equals the sum of every counted response's reported total to the token — a 100 % match with zero
  unexplained tokens.
- **SC-002**: For a fixture of counted responses whose usage and request times are fixed, the displayed
  price equals the hand-computed value from the shipped snapshot at the displayed precision, for both
  a Chinese target language and an English one — 100 % match across 20 fixtures.
- **SC-003**: Against a provider with no shipped price list, exactly zero price figures appear while
  the token total remains correct — measured on every panel state.
- **SC-004**: Against a provider that reports no usage, exactly zero token figures and zero price
  figures appear across all panel states — no zero, no estimate, no placeholder.
- **SC-005**: On a page where 60 % of displayed translations were reused, the figures equal the spend of
  the remaining fresh responses exactly, with no contribution from the reused passages.
- **SC-006**: Two requests with identical usage, one minute apart and straddling the peak/off-peak
  boundary, are priced in the ratio the published schedule states (off-peak at half of peak for
  DeepSeek), to the displayed precision.
- **SC-007**: A response without a cache split is priced identically to the same usage with zero
  cache-hit tokens — the uncached rate applied to every input token.
- **SC-008**: A translation arriving on the page is reflected in both figures within one second,
  measured over 20 consecutive arrivals, with no figure ever moving backwards.
- **SC-009**: With a non-zero estimate smaller than the panel's default precision, the displayed value
  still shows at least two significant digits and is never `0` — verified across six such values.
- **SC-010**: The panel's translated layout including the new row measures under 600 px tall at 384 px
  wide with no vertical scrollbar and no sideways overflow, in light and dark, at 200 % zoom and with
  labels 30 % longer than English — and remains so when the muted unpriced-provider line is present.
- **SC-011**: With two translated tabs open, 100 % of panel openings show the figures of the tab the
  panel was opened on.
- **SC-012**: In a check with five readers who have never seen the panel, all five can state the page's
  token spend and its estimated cost within ten seconds of opening it, without being told which line
  to look at.
- **SC-013**: No pre-existing panel fact changes value or position because of this feature: passages
  translated, characters sent, reused, skipped and failed remain identical for the same run.
- **SC-014**: Over a run that produces 20 updates to both figures, a screen reader receives zero
  unsolicited announcements of them, while focusing the record reads the current complete values —
  measured with a screen reader on both surfaces' supported widths.
- **SC-015**: For every price shown, the provider name and the price-snapshot date are reachable from
  the price row as text — visible caption or the row's accessible description — and a screen reader
  announces both when reading the row; verified in three panel states (fresh run, completed run, run
  with the muted unpriced note).

## Out of Scope

- **Price lists for providers other than DeepSeek.** DeepSeek is the first and, in this release, the
  only provider whose published prices ship with the product. Everything else shows tokens only.
- **Reader-editable prices, per-model overrides, currency conversion, or exchange rates.** A price is
  only ever a number the provider published in its own currency.
- **Fetching prices or balances from the network.** The snapshot ships with the release; the product
  adds no destination and no request.
- **Lifetime totals and history.** No ledger across pages, tabs, sessions or days; no charts, exports,
  "spend this month", or per-provider breakdown.
- **Token-based budgets or caps.** Volume caps stay in passages and characters; this feature reports
  spending, it does not enforce a budget.
- **Invoices, reconciliation, billing dashboards, or free-quota accounting.**
- **Estimating tokens or prices the provider did not report**, including character heuristics and
  request-payload tokenizers.
- **Holiday coverage beyond the shipped snapshot.** Days the snapshot cannot classify are priced as
  peak; extending the calendar is a snapshot update, not product logic.

## Assumptions

- "首页" means the extension's toolbar panel — the product's only home surface, which already reports
  the current run's facts (feature 006). The settings page is not part of this feature.
- "已经翻译的花费" means the spending attributable to translations already on the page, not a projection
  of what the rest of the page would cost.
- The figures are scoped to the current page's run, matching the panel's existing "This session"
  record; closing translation clears them, and a new run starts from zero.
- The readers' providers are OpenAI-compatible chat endpoints; some report usage with a cache split
  (DeepSeek does), some report usage without one, and some report none. All three are first-class.
- A price snapshot taken 2026-11-16 covers DeepSeek's two currently published models and the legacy
  names it still serves, including `deepseek-chat` and `deepseek-reasoner` — the names a profile
  configured before the preset changed still carries — priced at the provider's documented Flash rate
  (owner correction, 2026-11-16). A model the catalogue cannot map is named in the note rather than
  silently leaving the row without a price.
- The currency follows the target language: Chinese targets use DeepSeek's CNY list, every other target
  uses its USD list, because those are the only two lists the provider publishes. No conversion.
- DeepSeek's peak windows are taken from its published schedule (Beijing time, weekdays 09:00–12:00 and
  14:00–18:00, with its published holiday exceptions), and off-peak is every other hour.
- Tokens reported as input include whatever the provider counts as prompt tokens — system instruction,
  glossary and passages. The product repeats the provider's number rather than re-deriving it.
- Tokens the provider billed for requests whose usage was never received cannot be counted; the record
  reports what it can prove, and the existing failure line reports the failures.
- This feature revises feature 001's FR-029 (which forbids a monetary figure) for the single provider
  whose published prices ship with the product; the plan MUST record that amendment.
- No new permission, storage area, network destination or dependency is introduced.
- The panel keeps feature 006's width, height, accessibility and localization contract; the new row
  joins the existing session record rather than forming a new section, and the characters-sent fact
  keeps its place.

## Dependencies

- Feature 001's session usage record and the panel's existing record section (feature 006).
- DeepSeek's published model prices and peak/off-peak definition, and the usage fields its responses
  carry (prompt, cache-hit, cache-miss and completion tokens, plus the total).
- The translation catalogue and localized number formatting the panel already uses.
