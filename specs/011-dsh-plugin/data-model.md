# Data Model: A Page of Chat Answers Translates In Place

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-19

Three things are durable — configuration, the credential, and one record per translated answer — and
the rest is derived per request. Nothing here is written to the session log: DSH refuses new event
types, and a translation is the plugin's data, not the conversation's.

---

## 1. Plugin configuration (patch row)

Read through `Config`, written only through the config editor. Secrets are not part of it (see §2).

| Field | Type | Default | Validation | Requirement |
|---|---|---|---|---|
| `route` | `"dsh"` \| `"own"` | `dsh` | one of the two literals; `dsh` needs no plugin credential | FR-030, FR-040 |
| `endpoint` | string | `https://api.deepseek.com/chat/completions` (prefill, editable) | absolute URL; `https`, or `http` only for loopback | FR-030 |
| `model` | string | `deepseek-chat` (prefill) | non-empty, trimmed | FR-030 |
| `targetLang` | string | `zh` (the extension's current default) | one of the language codes the prompt defines | FR-032 |
| `glossary` | array | `[]` | each entry needs non-empty source and target terms | FR-026 |
| `maxAnswersPerPage` | integer | `12` | 1..50 | FR-014, FR-015 |
| `maxCharsPerBatch` | integer | `6000` | 200..20000 | FR-014, FR-015 |
| `timeoutMs` | integer | `60000` | 1000..180000 | FR-015 |
| `maxRetries` | integer | `2` | 0..5 | FR-015 |

`route: dsh` sends the page through DSH's own model services (`ctx.llm` + `agentDefaultModel`), so
the record's `provider` becomes `{ "model": <selected model>, "endpointHost": "dsh:<provider>" }`;
`route: own` calls `endpoint` with the plugin's credential (contracts/provider-adapter.md).

A rejected save names the rule that failed and persists nothing (FR-030). An edit restarts the plugin,
which is why no cached state may assume the previous configuration.

## 2. Credential

| Aspect | Value |
|---|---|
| Store | `ctx.credentials` |
| Reference | one fixed credential reference owned by the plugin |
| Readable by | the Host only, per request |
| Exposed to the Client | only through `describe`: configured, source, writable, masked preview |
| Written by | the settings routes (`set`), removal (`unset`) |
| Never | in configuration, in a record, in a log line, in an error message, in an HTTP response |

Empty values are refused by the credential service; removing means `unset`, and the next page then
fails with a named cause and no request (FR-029).

## 3. Derived: answer prose

Computed on the Host per message id; never stored verbatim.

| Field | Meaning | Rule |
|---|---|---|
| `messageId` | the durable identity the Chat also uses | the record key's second part |
| `turn` | the turn the answer belongs to | used only for ordering sections |
| `settled` | the answer is final | a streaming answer is skipped, not queued (FR-011) |
| `blocks[]` | ordered `{ index, kind, text }` | kinds: `text`, `heading`, `list-item`, `quote`, `fence`, `other` |
| `segments[]` | the blocks that will be sent | every kind except `fence` and `other` |
| `sourceHash` | hash of the segments' text in order | detects regeneration and edits (FR-021) |
| `language` | detected source language | equals the target ⇒ reported, never sent (FR-018) |

An answer with no prose segment is reported as untranslatable and produces no request. Reasoning and
tool-call blocks never appear here (FR-009).

## 4. Derived: page

| Field | Meaning | Rule |
|---|---|---|
| `sessionId` | the session being read | a pending page belongs to it, never to the session on screen (FR-023) |
| `turnIds[]` | turns whose anchors are visible plus one viewport below | ordered by anchor position (FR-007, FR-012) |
| `messageIds[]` | settled answers in those turns, in order | already-translated answers excluded (FR-010) |
| `skipped[]` | `{ messageId, reason }` | reasons: `streaming`, `alreadyTranslated`, `noProse`, `sameLanguage`, `overCap` |

## 5. Durable: translation record

One record per translated answer, in the storage domain (`immersive_polyglot.translations`, `per-record` layout), keyed `<sessionId>/<messageId>` — spelled `hex(sessionId)_hex(messageId)` on the medium, where only file-name-safe keys are storable.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | integer (1) | a record with a newer version reads as absent |
| `sessionId`, `messageId` | string | the key; message id is the Chat's own |
| `targetLang` | string | the language this translation was made in |
| `sourceHash` | string | must equal the current answer's hash or the record is stale (FR-021) |
| `sections` | array of `{ blockIndex, kind, text }` | translated text per block, in order |
| `provider` | `{ model, endpointHost }` | host only — never the full URL with credentials |
| `usage` | `{ prompt, completion }` | as reported by the provider for the batch that produced it |
| `price` | `{ amount, currency, basis } \| { unknown: reason }` | from the shipped catalogue (FR-024) |
| `batchId` | string | ties several records to the one page request that produced them |
| `createdAt`, `updatedAt` | ISO-8601 string | |

**Rules**

- A record is displayed only when `sourceHash` matches the answer's current hash and `schemaVersion`
  is current; otherwise the answer shows as untranslated (never the stale text).
- One record per message: re-translating replaces it, and the previous value is not kept.
- Records outlive plugin disable/enable and DSH restart (FR-020) and are pruned when their session no
  longer exists.
- No record contains the credential, the raw request body, or any text the reader did not see.

## 6. Transient: page result and failure

| Entity | Fields | Rules |
|---|---|---|
| Page result | `sessionId`, `batchId`, `results[]`, `requests`, `usage`, `price`, `skipped[]` | `results[]` holds one entry per requested answer, in order |
| Answer outcome | `{ messageId, status, sections?, failure? }` | `status`: `translated`, `failed`, `skipped` |
| Failure | `{ class, message, recovery, retriable }` | classes are the engine's own taxonomy plus `noProvider`, `capExceeded`, `storageUnavailable`; a failure never carries translated text (FR-017) |

## 7. Transient: control state

| Field | Meaning | Rule |
|---|---|---|
| `sessionId` | one control per conversation | persisted so a reopen keeps it |
| `on` | translation is on | off stops requests immediately and keeps finished sections (FR-013) |
| `lastPageAt` | when the last page was requested | debouncing and in-flight dedupe (FR-022) |

## 8. State transitions

```text
answer:      untranslated --(page request)--> pending --> translated | failed --(retry)--> pending
record:      absent --(translated)--> current --(answer regenerated)--> stale --(re-translate)--> current
control:     off --(reader turns on)--> on --(reader turns off)--> off
page request: idle --(visible page, on)--> in-flight --(result)--> idle
```

**Invariants**

1. A message id appears in at most one in-flight request at a time (FR-022).
2. A record is never displayed under a different message id (FR-021).
3. No request is issued while the control is off (FR-013).
4. Every request carries only the segments of answers on the page (FR-009).
5. A batch that returns the wrong number of segments fails whole; it is not partially applied (FR-017).
