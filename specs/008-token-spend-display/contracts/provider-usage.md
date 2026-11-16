# Contract: Reading Usage from a Provider Response

Feature 008, FR-001/FR-003. Implements the read side of feature 001's provider adapter; it adds no
field to the request and no request of its own.

## 1. Where it is read

`src/background/provider-client.ts`, in `callProvider`, from the same JSON body that already yields
`choices[0].message.content`. The parsed body is never stored, logged or forwarded.

## 2. Accepted shapes

| Source field | Becomes |
|---|---|
| `usage.prompt_tokens` | `promptTokens` |
| `usage.completion_tokens` | `completionTokens` |
| `usage.total_tokens` | `totalTokens` (kept even if it disagrees with the sum) |
| `usage.prompt_cache_hit_tokens` | `cacheHitTokens` |
| `usage.prompt_cache_miss_tokens` | `cacheMissTokens` |
| `usage.prompt_tokens_details.cached_tokens` | `cacheHitTokens`, only when the DeepSeek names are absent |

The response may be wrapped as it already is for content (`choices[0].message.content`,
`choices[0].text`, `output_text`, `content`); `usage` is looked for at the top level of the parsed
body only.

## 3. Refusals

| Case | Result |
|---|---|
| No `usage` object | no usage on the outcome; the translations still render |
| `prompt_tokens` and `completion_tokens` both valid | the split is known |
| Both missing but `total_tokens` valid | a total-only report stands; the run becomes unpriced (`usageIncomplete`) |
| Only one half valid, and no total | no usage — a lone half cannot become a token count |
| Any present counter is negative, fractional, a string, `NaN`, `Infinity`, or above `2^53 − 1` | that counter is dropped, and the report is kept only if it still has both halves or a total |
| Cache counters negative or fractional | the cache counters are dropped; the rest of the usage stands |
| Cache hit > prompt | `cacheMissTokens` = 0; the hit count stands as reported |
| Only a total, no input/output | usage stands with the split unknown; the run becomes unpriced (`usageIncomplete`) |

A refused usage is an **absent** usage. Nothing is repaired, estimated, back-filled from characters or
carried over from an earlier response.

## 4. Retries and discarded responses

- `withRetry` may call the provider several times; only the outcome it returns travels. A retried
  attempt's usage is not counted, because its translations were never delivered.
- The single malformed-response re-issue keeps only the second outcome.
- A cancelled request has no outcome and therefore no usage.

## 5. Test vectors (unit, `provider-client.test.ts`)

1. DeepSeek body with hit + miss + total → exact five numbers.
2. OpenAI body with `prompt_tokens_details.cached_tokens` → hit derived, miss computed.
3. Body with `usage` absent → outcome without usage, translations intact.
4. `prompt_tokens: "12"` → no usage.
5. `completion_tokens: -1` → no usage.
6. Hit 100, prompt 40 → miss 0, hit 100.
7. Total 999 with prompt 10, completion 10 → total kept as 999.
8. Retry after a 500 → the successful response's usage only; the failed attempt contributes none.
