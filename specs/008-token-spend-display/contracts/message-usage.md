# Contract: Usage and Spend on the Wire

Feature 008, FR-014..FR-017. Extends feature 001's message protocol by one optional member on one
existing response, and one optional member on the existing status payload. No new message type.

## 1. `batchResult`

```text
{ type: "batchResult", requestId: string,
  results: { index: number, text: string }[],
  usage?: { promptTokens: number, completionTokens: number, totalTokens?: number,
            cacheHitTokens?: number, cacheMissTokens?: number } }
```

- Sent by the service worker after the accepted provider response; `usage` is present only when the
  provider reported one and it survived the refusals in [provider-usage.md](./provider-usage.md).
- The content port client resolves the batch with it; `BatchReply.usage` is optional for exactly the
  same reason.
- A `batchError` never carries usage: an errored response delivered nothing to attribute.

## 2. `JobStatusPayload.usage.spend`

```text
spend?: {
  tokens: { total: number, prompt: number, completion: number, hit: number, miss: number },
  price: { amount: number, currency: "CNY" | "USD", snapshot: string } | null,
  unavailable?: "noPriceList" | "modelNotPriced" | "usageIncomplete",
}
```

Carried by the existing `jobUpdated` command and returned by `getJobStatus`; both already accept an
optional `usage`. `spend` is **absent**, never zero-valued, when no response reported usage.

## 3. Validation

- `parsePortResponse` accepts `usage` only when every present field is a finite non-negative integer;
  an invalid object is dropped as a whole, and the rest of the batch result stands.
- `parseCommand` passes `jobUpdated.status` through as today; the panel must therefore treat
  `status.usage?.spend` as untrusted and render nothing it cannot read.
- **Forbidden key**: `assertNoCredentialFields` rejects a key named exactly `token` (case-insensitive).
  The wire therefore uses `tokens`, `promptTokens`, `cacheHitTokens` — never a bare `token`.

## 4. What may never travel

- No page text, no passage id, no provider credential, no endpoint, no model name.
- No per-response array: the job aggregates, so the largest addition is six integers.

## 5. Invariants a reviewer checks

1. A payload with `usage: { promptTokens: 10, completionTokens: 5 }` parses.
2. A payload with `usage: { promptTokens: -1 }` parses with `usage` dropped.
3. A payload carrying a key `token` is refused as a credential field, as today.
4. A `batchResult` from an older build (no `usage`) still resolves, and the panel shows no token row.
5. Nothing in the payload distinguishes a page's text from another page's: usage is numeric only.
