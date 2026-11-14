# Contract: Storage Schema

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-13

Persisted state lives in `chrome.storage.local`. There is no other durable store. This schema is the
compatibility surface for FR-001..FR-005, FR-024, FR-030..FR-032, and the migration obligation in
constitution principle IV.

---

## 1. Shape

```json
{
  "schemaVersion": 1,
  "providers": [
    {
      "id": "p_01H",
      "name": "Local Qwen",
      "endpoint": "https://example.test/v1/chat/completions",
      "model": "qwen2.5-32b",
      "extraHeaders": {},
      "enabled": true,
      "timeoutMs": 60000,
      "maxConcurrency": 3,
      "lastVerification": { "at": "2026-11-13T12:00:00Z", "ok": true }
    }
  ],
  "credentials": {
    "p_01H": { "secret": "<opaque>", "masked": "a1b2", "updatedAt": "2026-11-13T12:00:00Z" }
  },
  "routing": {
    "defaultProviderId": "p_01H",
    "rules": [
      { "id": "r_01H", "kind": "site", "match": "news.example", "providerId": "p_01H", "enabled": true },
      { "id": "r_02H", "kind": "languagePair", "match": { "sourceLang": "ja", "targetLang": "zh" }, "providerId": "p_01H", "enabled": true }
    ]
  },
  "sites": [
    { "sitePattern": "news.example", "targetLang": "zh", "displayMode": "bilingual", "providerId": null, "autoTranslate": false }
  ],
  "glossary": [
    { "sourceTerm": "transformer", "targetTerm": "变换器", "sourceLang": "en", "targetLang": "zh", "caseSensitive": false }
  ],
  "style": { "instruction": "Formal register; keep product names in English.", "temperature": 0 },
  "limits": { "maxConcurrency": 3, "sessionCapSegments": 500, "siteCaps": {} },
  "ui": { "targetLang": "zh", "sourceLang": "auto", "displayMode": "bilingual" }
}
```

## 2. Invariants

1. `credentials[providerId]` exists for at most the providers present in `providers`; deleting a provider
   removes its credential atomically (FR-001, FR-024).
2. The plaintext secret is read only inside the service worker. Storage reads from a content script never
   request the `credentials` key (FR-021).
3. `schemaVersion` is written on every save; a missing or newer value is handled explicitly (section 3).
4. No page content, translation unit, or job state is persisted (FR-025).
5. Deleting all configuration (FR-024) clears every key above and is verified by reading back an empty
   object, not by assuming the call succeeded.

## 3. Migration

- On access, read `schemaVersion`. Absent means version 1, and it is written.
- Lower than current: run the ordered migration chain, each step pure and idempotent, then write the new
  version. A failed step aborts the migration and names the step; a partial migration is never persisted.
- Higher than current: refuse to write and tell the user the profile was written by a newer build.
  Silent downgrade would corrupt configuration.
- Every migration has a test that starts from a stored fixture of the old shape.

## 4. Quotas

`chrome.storage.local` allows 10 MB without an extra permission. Realistic usage (a few providers, dozens
of rules, hundreds of glossary entries) is far under 1 MB. No `unlimitedStorage` permission is requested;
a quota failure surfaces as a specific, actionable error rather than a silent partial save.
