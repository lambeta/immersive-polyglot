# Contract: Prices, Tiers, Currency and Rounding

Feature 008, FR-006..FR-013, FR-025, FR-026, FR-028. The single place that turns tokens into money.

## 1. Eligibility (all-or-nothing)

A run is priced **only** when every counted response satisfies all three:

1. its provider's endpoint host is in `PRICE_SNAPSHOT.hosts`;
2. its model, after the documented aliases, is in `PRICE_SNAPSHOT.models`;
3. it reported an input/output split.

If any response fails 1, the run is `noPriceList`. If any fails 2, `modelNotPriced`. If any fails 3,
`usageIncomplete`. Exactly one reason is reported, in that precedence order. A partial price is never
shown (FR-010).

A run resolves exactly one provider when it starts, so in practice tests 1 and 2 collapse to that
provider. The per-response form is kept deliberately: if a future release lets one run use two
providers, this rule prices it conservatively (no price at all) instead of wrongly.

## 2. Tier classification

Instant `t` → `Asia/Shanghai` wall clock `(date, time)`:

```text
if weekday ∈ {Sat, Sun}                                    → offPeak
else if time ∈ [09:00, 12:00) ∪ [14:00, 18:00)
        and date ∈ PRICE_SNAPSHOT.holidays                 → offPeak
else if time ∈ [09:00, 12:00) ∪ [14:00, 18:00)             → peak
else                                                       → offPeak
```

- The boundaries are half-open: 09:00:00 is peak, 12:00:00 is off-peak (lunch), 14:00:00 is peak,
  18:00:00 is off-peak.
- The tier is decided by the **request's start** instant, not the response's arrival.
- Holiday coverage: 2026 only. A date outside the covered years has no holiday entries, so a weekday
  inside a peak window is priced as peak — the conservative reading FR-011 requires.

## 3. Arithmetic

Per counted response, using its own tier and the run's one currency:

```text
amount = Σ [(hit × hitRate[tier]) + (miss × missRate[tier]) + (out × outRate[tier])] / 1e6
hit  = cacheHitTokens ?? 0
miss = cacheMissTokens ?? promptTokens        // no split ⇒ all input at the miss rate
out  = completionTokens
```

Rates are per 1M tokens, as published. No rounding happens inside the sum; only the displayed value is
rounded.

## 4. Currency

`targetLang` starting with `zh` → the CNY list; every other target → the USD list. The two lists are
independent published prices: no conversion, no cross-check, no fallback if one is missing (both are
always present).

## 5. Display

- The amount is wrapped by a catalogue message (`≈ ¥{amount}` / `≈ ${amount}`), so the symbol's
  position is a translation decision, not a formatting accident.
- Precision: at least two significant digits, at most six fraction digits, using the interface
  language's separators. A non-zero amount never renders as `0`; if the default precision would, one
  more fraction digit is used (up to six).
- The basis (`{provider} list · {snapshot}`) is on the same row and is reachable as text (FR-009,
  SC-015).
- The estimate is never called a bill, invoice, charge or amount due.

## 6. Worked example (the fixture every test reuses)

Request: `deepseek-flash`, target `zh`, made 2026-03-10 at 22:10 Beijing (off-peak), usage
`prompt 5000 (hit 4000, miss 1000), completion 500, total 5500`.

```text
hit  4000 × 0.02 / 1e6 = 0.00008
miss 1000 × 1.00 / 1e6 = 0.00100
out   500 × 4.00 / 1e6 = 0.00200
amount                  = 0.00308  →  displayed  ≈ ¥0.0031
tokens shown            = 5,500
```

The same request at 10:00 Beijing (peak) costs `0.00616` → `≈ ¥0.0062`: exactly double, which is the
published relation and SC-006's assertion.

## 7. Refusals the contract makes explicit

| Situation | Behaviour |
|---|---|
| Provider host unknown | tokens only + `noPriceList` note |
| Model unknown after aliases | tokens only + `modelNotPriced` note naming that model; a legacy name the provider still serves must be in the aliases, not here |
| A response reported only a total | tokens only + `usageIncomplete` note |
| No usage at all | no token row, no price row, no note |
| Snapshot older than the provider's current list | price still shown, with its date (FR-025) |
| Snapshot missing a holiday | that weekday peak window is priced at peak |
| Any response priced by a second provider's rates | forbidden — the run is unpriced instead |
| The run's translations are gone from the page | no price is reported; the panel shows no row (FR-023) |
| A run is cancelled with translations still on screen | the price reached so far is kept; only turning translation off clears it (R11) |

## 8. Testing seam

`estimateSpend(runSpend, snapshot = PRICE_SNAPSHOT)` accepts the catalogue as a parameter. Production
never passes one; the unit suite passes an older snapshot to prove that age changes neither the amount
nor the basis (FR-025). No runtime path chooses a snapshot.
