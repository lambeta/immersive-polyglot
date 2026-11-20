# Contract: Plugin HTTP API (Client → Host)

**Feature**: [spec.md](./spec.md) | **Model**: [data-model.md](../data-model.md) | **Date**: 2026-11-19

The only channel between the Client half and the Host half. It exists so the credential, the session
log and the durable records stay on the Host, and so two windows of the same conversation share one
answer.

---

## 1. Mounting and refusals

| Aspect | Rule | Requirement |
|---|---|---|
| Mount | one prefix on the DSH web server, `/immersive-polyglot` | FR-005 |
| Host binding | refused when the web server is not loopback | FR-028 |
| Same-origin | `Origin` absent or equal to the server's own origin; otherwise 403 | FR-028 |
| Marker | every call carries `x-immersive-polyglot: 1`; a call without it is refused | FR-028 |
| Body limit | 64 KiB; larger is 413 with a named failure | FR-015 |
| Content type | JSON in, JSON out; a non-JSON body is 400 | FR-017 |
| Credential | never appears in any request body, response body or header | FR-028 |

## 2. Error shape

Every non-2xx response is:

```json
{ "error": { "class": "noProvider", "message": "…", "recovery": "…", "retriable": false } }
```

`class` is one of the engine's error classes (`providerMissing`, `providerAuth`, `providerRateLimit`,
`providerServer`, `providerTimeout`, `providerUnreachable`, `providerParse`, `providerInvalid`,
`sameLanguage`, `capReached`, `invalidConfiguration`) plus `storageUnavailable`, `tooLarge`,
`badRequest`. A response never contains a stack, a URL carrying a secret, or untranslated text labelled
as a translation (FR-017).

## 3. Routes

### `GET /immersive-polyglot/api/health`

`{ "ok": true, "version": "0.1.0" }` — used by the Client to stay inactive when the Host half is not
mounted, and by the e2e harness to wait for readiness.

### `GET /immersive-polyglot/api/state?sessionId=<id>`

```json
{
  "control": { "on": false, "lastPageAt": "2026-11-19T03:55:00.000Z" },
  "translated": [{ "messageId": "m-1", "targetLang": "zh", "stale": false }],
  "pending": ["m-4"]
}
```

The Client renders from this on mount and after every reconnect; `pending` lets a second window show
"translating" for work the first window started (FR-022).

### `POST /immersive-polyglot/api/control`

`{ "sessionId": "s-1", "on": true }` → `{ "on": true }`. Turning off stops new requests; an in-flight
page finishes and its records are stored (FR-013). Persisting this on the Host is what makes two
windows agree.

### `POST /immersive-polyglot/api/page`

Request:

```json
{
  "sessionId": "s-1",
  "requestId": "c1f0…",
  "messageIds": ["m-1", "m-2", "m-3"],
  "targetLang": "zh"
}
```

Response:

```json
{
  "batchId": "b-7",
  "results": [
    { "messageId": "m-1", "status": "translated",
      "sections": [{ "blockIndex": 0, "kind": "text", "text": "……" }] },
    { "messageId": "m-2", "status": "skipped", "reason": "sameLanguage" },
    { "messageId": "m-3", "status": "failed",
      "failure": { "class": "providerTimeout", "message": "…", "recovery": "…", "retriable": true } }
  ],
  "requests": 1,
  "usage": { "prompt": 812, "completion": 640 },
  "price": { "amount": 0.00042, "currency": "USD", "basis": "deepseek-chat" },
  "skipped": [{ "messageId": "m-2", "reason": "sameLanguage" }]
}
```

Rules:

- `messageIds` is at most `maxAnswersPerPage`; a longer list is refused with `capReached` and nothing
  is translated (FR-015).
- A `requestId` repeated within 60 seconds returns the earlier result and issues no second request
  (FR-022).
- Answers already holding a current record are skipped with `alreadyTranslated` (FR-010).
- `requests` counts the provider calls actually made after splitting by `maxCharsPerBatch` (FR-014).
- `price` is per page, never attributed per answer (FR-025).
- A `section.text` is **Markdown**: the Host sends each block with its markers (`## `, `- `, `> `,
  inline code, links) and stores the translation as the provider returned it, so the Client renders
  structure without a second pass over the transcript. Fenced code is never sent (it is not
  translated), so a record has no `fence` sections.
- A partial provider failure marks only the affected answers `failed`; the others keep their sections
  (FR-016).
- With `route: dsh` no plugin credential is read: a page goes through DSH's model services and the
  record's `provider` is `{ "model": "<selected model>", "endpointHost": "dsh:<provider>" }`. A
  session with `route: dsh` that has no model selected, or a DSH without the `llm` service, answers
  409 `providerMissing` with a message naming that cause (never "no credential").

### `GET /immersive-polyglot/api/records?sessionId=<id>`

Returns every current record for the session in one payload, so a reopen paints without a request per
answer:

```json
{ "records": [{ "messageId": "m-1", "targetLang": "zh", "sections": [ … ], "provider": { "model": "deepseek-chat" }, "price": { "amount": 0.0004, "currency": "USD", "basis": "deepseek-chat" }, "createdAt": "…" }] }
```

### `GET /immersive-polyglot/api/settings`

```json
{
  "config": { "route": "dsh", "endpoint": "https://api.deepseek.com/chat/completions", "model": "deepseek-chat", "targetLang": "zh",
    "glossary": [], "maxAnswersPerPage": 12, "maxCharsPerBatch": 6000, "timeoutMs": 60000, "maxRetries": 2 },
  "credential": { "configured": true, "masked": "sk-…7f2", "writable": true }
}
```

### `PUT /immersive-polyglot/api/settings`

Body `{ "config": { … } }` → the saved config, or 422 with `{ "error": { "class": "invalidConfiguration",
"rule": "endpointScheme", … } }`. Exactly one field may be invalid at a time in a response; the Client
shows the named rule (FR-030).

### `PUT /immersive-polyglot/api/credential` · `DELETE /immersive-polyglot/api/credential`

`{ "value": "sk-…" }` → `{ "configured": true, "masked": "sk-…7f2" }`. The value is written to the
credential store and discarded from memory; it is never echoed. `DELETE` unsets it (FR-029).

`GET /immersive-polyglot/api/credential` → `{ "configured": true, "writable": true, "masked": "sk-…7f2",
"source": "file" }`, the same description the settings surface will read; it exists because the
settings surface (US2) is not built yet and the credential has to be settable somehow.

### `POST /immersive-polyglot/api/diag` · `GET /immersive-polyglot/api/diag`

A diagnostic ring, not a product surface: a Client slot that crashes while rendering reports
`{ "source": "slot", "message": "…", "stack": "…" }`, and `GET` returns the last 20 entries (stack
truncated to 4000 characters). It exists because a crashed entry is silently retired by the shell and
would otherwise leave no trace; it carries no answer text and no credential.

### `POST /immersive-polyglot/api/provider/test`

`{ "config": { … } }` → `{ "ok": true, "sample": "…", "usage": { … }, "price": { … } }` or the error
shape above. Reported as a test, never merged into a page's usage (FR-031).

## 4. What the Client never sends

- Answer text, in any form (the Host reads it from the session log).
- The credential.
- Any identifier belonging to another session.

## 5. What the Host never returns

- The credential, in any form, including inside a masked string it did not construct.
- Any translation for a message whose source hash no longer matches (FR-021).
- A price for an individual answer (FR-025).
