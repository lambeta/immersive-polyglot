# Contract: Translation Record

**Feature**: [spec.md](./spec.md) | **Model**: [data-model.md](../data-model.md) | **Date**: 2026-11-19

The durable unit that makes "reading it again costs nothing" true (FR-020, FR-021). One record per
translated answer, in DSH's storage domain, never in the session log.

---

## 1. Key and version

| Aspect | Rule |
|---|---|
| Key | `<sessionId>/<messageId>`; on the medium `hex(sessionId)_hex(messageId)`, because the per-record layout names one file after the key and file names allow only `[a-zA-Z0-9_-]` |
| `schemaVersion` | `1`; a record with a higher version is treated as absent, never guessed |
| Owner | only the Host half writes or deletes it |
| Readers | the Host; the Client sees it only through the HTTP API |

## 2. Shape

```json
{
  "schemaVersion": 1,
  "sessionId": "s-1",
  "messageId": "m-1",
  "targetLang": "zh",
  "sourceHash": "sha256:9f2c…",
  "sections": [
    { "blockIndex": 0, "kind": "text", "text": "这是译文的第一段。" },
    { "blockIndex": 2, "kind": "list-item", "text": "这是译文的列表项。" }
  ],
  "provider": { "model": "deepseek-chat", "endpointHost": "api.deepseek.com" },
  "usage": { "prompt": 812, "completion": 640 },
  "price": { "amount": 0.00042, "currency": "USD", "basis": "deepseek-chat" },
  "batchId": "b-7",
  "createdAt": "2026-11-19T03:55:02.000Z",
  "updatedAt": "2026-11-19T03:55:02.000Z"
}
```

## 3. Rules

1. **Binding.** A record is shown only for the `messageId` it was written for. A regenerated or edited
   answer changes `sourceHash`, and the record then reads as stale and is not displayed (FR-021).
2. **One per answer.** Re-translating replaces the record; the previous text is not retained.
2a. **Section text is Markdown.** Each section carries the block's Markdown as the provider returned
   it (headings keep `#`, list items keep `-`/numbering, inline code and links keep their markers), so
   the Client renders structure from the record alone. `kind` stays a display hint, not the source of
   truth; a record never contains a `fence` section because fenced code is not translated.
3. **Price.** From the shipped catalogue for the reported model and usage, or
   `{ "unknown": "reason" }` — never zero as a stand-in (FR-024, FR-025).
4. **No secrets, no page context.** The record carries no credential, no request body, no text the
   reader never saw, and no other session's identifiers.
5. **Durability.** Survives plugin disable/enable and DSH restart; readable after a restart with no
   provider request (FR-020).
6. **Pruning.** A record whose session no longer exists is deleted when the Host starts; a record whose
   `schemaVersion` is newer is left untouched until the plugin catches up.
7. **Atomicity.** A page's records are written one answer at a time; a crash mid-page leaves earlier
   answers stored and the rest untranslated, never half-written text.
8. **Size.** A record is bounded by `maxCharsPerBatch` times the catalogued expansion allowance; a
   record that would exceed it is refused with `capReached` instead of being stored truncated.

## 4. Verification hooks

- Read a record back after a real DSH restart and compare the sections byte for byte (FR-020).
- Change the source answer, reopen the conversation, and confirm the record is neither displayed nor
  deleted until a new translation replaces it (FR-021).
- Inspect a stored record for the credential value and for reasoning or tool text: zero occurrences
  (FR-009, FR-028).
