# Contract: Provider Adapter

**Feature**: [spec.md](./spec.md) | **Entities**: [data-model.md](../data-model.md) | **Date**: 2026-11-13

Defines what a user-configured provider must supply, what the product sends it, and how every failure
is classified. Implements FR-001..FR-004, FR-026..FR-029, and the privacy constraints FR-021..FR-022.

---

## 1. What the user supplies

| Field | Required | Notes |
|---|---|---|
| Display name | yes | Shown in every provider menu |
| Endpoint | yes | Full URL. HTTPS required; `http` only for loopback (`127.0.0.1`, `localhost`) |
| Credential | yes | Sent as the provider requires; default binding is `Authorization: Bearer <secret>` |
| Model identifier | yes | Sent verbatim |
| Extra headers | no | For providers needing a second key or an api-version header |
| Timeout / concurrency | no | Defaults 60 s / 3 |

There is no built-in provider list: any reachable endpoint works, which is what FR-002 demands.

**Change record (2026-11-14, requested by the product owner).** The options page now pre-fills one
convenience preset on a fresh profile and offers a button to re-apply it: DeepSeek
(`https://api.deepseek.com/chat/completions`, model `deepseek-chat`). This is a prefill, not a
dependency: it sets the name, endpoint and model, leaves the credential blank, keeps every field
editable, and nothing in the request path references the preset module. FR-002 still holds —
a provider the user can reach with their own credential is usable, preset or not.

---

## 2. What the product sends

Chat-completion shaped, one batch per request:

```text
POST <user endpoint>
Authorization: Bearer <secret>        (or the user's chosen binding)
Content-Type: application/json
<user extra headers>

{
  "model": "<user model id>",
  "temperature": 0,
  "messages": [
    { "role": "system", "content": "<translation instruction + glossary + style + output contract>" },
    { "role": "user",   "content": "<JSON array of source segments>" }
  ]
}
```

**System instruction obligations** (implemented in `src/shared/prompt.ts`):

1. Identify the source and target languages.
2. Translate each array element, preserving order and count exactly.
3. Obey every glossary pair, applied to the whole segment.
4. Keep code, URLs, identifiers, placeholders and numbers untouched.
5. Return **only** a JSON array of strings, no prose, no markdown fence, no keys.
6. Preserve leading/trailing whitespace semantics and never merge or split elements.

**Batching**: elements are packed into a request under an estimated-token budget (default 1,500
estimated tokens per request, conservative to leave room for the model's expansion). Ordering inside a
batch is stable and recorded so results can be re-associated by index (FR-008).

---

## 3. What the product accepts back

A JSON array of strings with the same length as the input. Accepted after tolerant unwrapping of: a
fenced code block, a leading/trailing prose line, or an object with a single array-valued key. Anything
else is a parse outcome, not a silent guess.

| Response | Interpretation |
|---|---|
| Array, same length | Accepted |
| Array, shorter | Missing indices marked `failed (malformedResponse)`; present ones applied, or the batch retried once if the miss rate exceeds 20% |
| Array, longer | Extra entries discarded; the batch is retried once, since misalignment is likely |
| Non-array / unparsable | `failed (malformedResponse)`, one retry, then fail the batch |
| Empty strings for some indices | Those units `failed (emptyTranslation)`; never rendered (FR-020) |
| Markup or HTML in a string | Sanitized to text before rendering; markup never reaches the DOM (FR-020, US4.4) |

---

## 4. Error taxonomy

Every failure maps to exactly one class, and every class has a user-facing message and recovery action
(SC-007). No raw provider payload is ever shown.

| Class | Trigger | Retry | User-facing outcome |
|---|---|---|---|
| `unreachable` | DNS/connection failure, blocked | yes, bounded | "Cannot reach provider. Check the endpoint." |
| `timeout` | No complete response before timeout | yes, bounded | "Provider did not respond in time." |
| `authRejected` | 401/403 | no | "Credential rejected." with a link to settings |
| `rateLimited` | 429, or provider-specific rate signal | yes, honouring `Retry-After`, capped | "Rate limited; retrying." then "Skipped N passages" |
| `quotaExhausted` | 402, or 429 with quota semantics | no | "Your provider quota appears exhausted." |
| `modelUnavailable` | 404/400 naming the model | no | "Model not available; check the model id." |
| `malformedResponse` | Not an acceptable array per section 3 | once | "Unexpected response from the provider." |
| `emptyTranslation` | Blank outputs for non-blank inputs | once | Per-passage failure marker; page stays readable |
| `serverError` | 5xx | yes, bounded | "Provider returned a server error; retrying." |
| `invalidRequest` | 400/422 that does not name the model, or any other 4xx | no | "The provider rejected the request. Check the endpoint, extra headers and model id." |
| `cancelled` | User cancelled | no | Silent; counts reported |

Change record (2026-11-14, during implementation): `invalidRequest` was added. The original
taxonomy had no class for a provider that rejects the request itself (400/422, or a 4xx that is
none of 401/402/403/404/429), so such a response would have been reported as a server error or as
a malformed response — both untrue and neither actionable. It is not retryable: retrying an
unchanged rejected request only spends the user's budget.

**Retry policy**: at most 2 retries per request, jittered exponential backoff (0.5 s base, cap 8 s).
Never retried: `authRejected`, `quotaExhausted`, `modelUnavailable`, `cancelled`. Exhausted retries
report the affected passages (FR-026).

---

## 5. Verification (FR-003)

"Test connection" sends a minimal single-segment request and classifies the outcome with the same
taxonomy, so a success there means the real path works. It records `lastVerification` on the provider
and never logs the secret or the provider's raw body.

---

## 6. Streaming (optional)

If the provider streams, chunks are relayed as partial text for that unit and committed only when the
unit completes, unless progressive display is enabled for that provider. A stream ending mid-array is
`malformedResponse` for the units it did not complete.

---

## 7. Non-goals

- No provider plugins, no vendored SDKs, no vendor accounts, no proxying (Out of Scope).
- No request the user did not configure: the product contacts only the resolved provider endpoint
  (FR-022). Any other outbound call is a defect.
