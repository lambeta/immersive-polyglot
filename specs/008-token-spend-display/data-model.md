# Data Model: Token Spend and Its Price

Feature 008. Six shapes, one of them new on the wire and none of them stored. Field names are shown in
TypeScript spelling; the wire spelling is the same, because the message payload is the type.

---

## 1. UsageReport — what one provider response says it consumed

Produced by `src/background/provider-client.ts`, one per accepted response.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `promptTokens` | integer ≥ 0 | when the provider splits | input tokens the provider says it read |
| `completionTokens` | integer ≥ 0 | when the provider splits | output tokens it says it wrote |
| `totalTokens` | integer ≥ 0 | no | the provider's own total; may disagree with the sum |
| `cacheHitTokens` | integer ≥ 0 | no | input served from the provider's cache |
| `cacheMissTokens` | integer ≥ 0 | no | input not served from cache |

**Canonicalisation rules** (applied once, in the provider client):

1. Read the OpenAI-compatible names: `prompt_tokens`, `completion_tokens`, `total_tokens`,
   `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`.
2. If the cache names are absent, accept `prompt_tokens_details.cached_tokens` as `cacheHitTokens`.
3. If a hit count exists and a miss count does not, `cacheMissTokens = max(0, promptTokens − hit)`. If
   neither exists, leave both undefined — meaning "no split reported", not "no cache".
4. A report stands only if it carries **both** halves of the split or a usable total. An invalid field
   is dropped; a lone half with no total is not a report at all. A dropped report is an absent report;
   it is never repaired. A total-only report stands with the split unknown, so its run is unpriced
   (`usageIncomplete`) but its tokens are still reported (spec edge case, FR-005).
5. Never synthesise a total: `totalTokens` stays undefined when the provider did not send it.

**Invariants**: no field is ever negative or fractional; no key is named exactly `token` (the message
validator treats that as a credential field); no page text accompanies a report.

---

## 2. TokenParts — the unit arithmetic runs on

```text
{ hit: number, miss: number, out: number }
```

Built per response for the price, and per tier bucket for the run:

- `hit` = `cacheHitTokens ?? 0`
- `miss` = `cacheMissTokens ?? promptTokens`
- `out` = `completionTokens`

A response with no cache split therefore contributes `hit: 0, miss: promptTokens` — the dearer rate, so
the estimate never understates (FR-008).

---

## 3. RunSpend — the accumulator owned by one translation run

Lives in `TranslationJob`; never persisted, never shared across tabs.

| Field | Type | Meaning |
|---|---|---|
| `providerId` | string | the provider resolved for this run |
| `endpoint` | string | its endpoint, for the catalogue's host test |
| `model` | string | its model, for the catalogue's model test |
| `targetLang` | string | decides the currency (FR-012) |
| `total` | integer | sum of every counted response's `totalTokens` (or its prompt+completion) |
| `peak` | TokenParts | parts of responses made inside a peak window |
| `offPeak` | TokenParts | parts of every other response |
| `usageIncomplete` | boolean | a counted response reported a total but no input/output split |

**Lifecycle**

| Transition | Effect on the record |
|---|---|
| run starts (idle → segmenting/translating) | a fresh, all-zero record with this run's provider/model/language |
| response delivers ≥ 1 translation | its parts added once, to the tier of its own request time |
| response delivers nothing (all results failed, malformed, discarded, cancelled) | nothing added |
| reader presses cancel mid-run | the record **survives** with the figures of translations already on the page; the in-flight response adds nothing ([R11](./research.md)) |
| reader turns translation off (`restore()`) | the record is dropped with the run; the panel shows none |
| reader turns translation on again | a new record from zero |
| panel reopened | no transition; the job's current record is read |
| the page removes every rendered translation | no transition; the record stops being **reported** while no counted translation is connected ([R12](./research.md)) |

**Invariants**: `total ≥ hit + miss + out` is not required (a provider's total may differ); the record
only grows while the run is live; a figure never decreases during a run; `spend` is reported only
while at least one counted translation is still connected to the document (FR-023).

---

## 4. PriceSnapshot — the catalogue

`src/shared/price-catalog.ts`, a constant, versioned by the release.

| Field | Type | Meaning |
|---|---|---|
| `snapshot` | string (`YYYY-MM`) | the date the prices were copied; shown as the basis |
| `hosts` | string[] | endpoint hosts the snapshot applies to (`api.deepseek.com`) |
| `models` | record | each model → `{ CNY: Rates, USD: Rates }` |
| `aliases` | record | legacy name the provider still serves → the model whose price applies |
| `peakWindows` | `{ start, end }[]` | local wall-clock windows, `[start, end)` |
| `timeZone` | string | the zone those windows are stated in (`Asia/Shanghai`) |
| `holidays` | string[] | dates the snapshot can classify as off-peak |
| `coverageYears` | number[] | the years `holidays` fully covers |

**Rates** per 1M tokens: `{ hitOff, hitPeak, missOff, missPeak, outOff, outPeak }` — both tiers stored,
never derived by halving, so a future announcement that breaks the ratio needs no code change.

**Invariants**: every model has both currencies; `snapshot` is immutable within a release; no entry
exists for a model name the provider no longer publishes or documents (FR-028).

---

## 5. PriceEstimate — what the run costs, or why it cannot be said

`price` when every counted response could be priced:

```text
{ amount: number, currency: "CNY" | "USD", snapshot: "2026-11" }
```

`unavailable` otherwise, exactly one of:

| Reason | Condition | What the panel says |
|---|---|---|
| `noPriceList` | the provider's endpoint host is not in `hosts` | no published price for this provider |
| `modelNotPriced` | the model (after aliases) is not in `models` | no published price for **{model}** — the configured name |
| `usageIncomplete` | a counted response had a total but no input/output split | the provider did not report enough usage to price this run |

**Arithmetic** (per counted response, at its own request instant):

```text
tier      = peak | offPeak                          (R3 rule, Asia/Shanghai)
amount   += hit × rate.hit[tier]   / 1_000_000
          + miss × rate.miss[tier] / 1_000_000
          + out  × rate.out[tier]  / 1_000_000
currency  = targetLang starts with "zh" ? CNY : USD
```

`estimateSpend(runSpend, snapshot = PRICE_SNAPSHOT)` takes the catalogue as a parameter. The default
is the shipped one at every call site; the parameter exists so a stale snapshot is a test input rather
than a code edit (FR-025).

**Invariants**: the estimate covers exactly the responses the token total covers (FR-014); no conversion
between currencies exists; the amount is never shown without its basis.

---

## 6. SpendRecord — the wire shape inside the existing status payload

`SessionUsageRecord` (feature 001) gains one optional member; every existing member keeps its meaning:

```text
SessionUsageRecord = {
  segmentsTranslated: number,
  approxChars: number,
  perProvider: Record<string, number>,
  reusedSegments: number,
  spend?: {
    tokens: { total: number, prompt: number, completion: number, hit: number, miss: number },
    price:   PriceEstimate["price"]   | null,
    unavailable?: PriceEstimate["unavailable"],
    model?: string,
  },
}
```

`spend` is absent — not zero — when no counted response reported usage (FR-004), and also absent
while no counted translation is still connected to the document (FR-023, R12). The record is
`usage` of `JobStatusPayload`, which already travels on `jobUpdated` and `getJobStatus`.

---

## 7. What is deliberately absent

| Not present | Why |
|---|---|
| Any storage key, schema version or migration | the record is run state; the catalogue is code (FR-015, R10) |
| A per-provider price breakdown | out of scope; the run has one provider |
| A history ledger, totals per day, exports | out of scope |
| A price for a retired model name | FR-028 |
| A token estimate derived from characters | FR-003 |
| An exchange rate | FR-012 |

---

## 8. Panel states

| Run state | `#usage` row | Muted note |
|---|---|---|
| no run / no translations | (record absent) | — |
| run with usage, priced | tokens · price · basis | — |
| run with usage, unpriced | tokens only | reason (one line) |
| run with measured zeros | `0 tokens` and a formatted `0` amount, only when genuinely measured | — |
| run with no usage reported | (no token row; other facts remain) | — |
| translation turned off | (record absent) | — |
| run cancelled with translations still on the page | the figures reached so far, unchanged | — |
| page removed every translation but the job is alive | (spend not reported) | — |
