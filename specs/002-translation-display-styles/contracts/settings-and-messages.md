# Contract: Settings v2 and the Style Message

**Feature**: [spec.md](../spec.md) | **Date**: 2026-11-14

This is the contract behind FR-002, FR-004, FR-005, FR-019..FR-022 and SC-003/SC-010/SC-013. It is
the delta on feature 001's [storage contract](../../001-llm-web-translator/contracts/storage-schema.md)
and [messaging contract](../../001-llm-web-translator/contracts/extension-messaging.md); everything not
restated there still applies.

---

## 1. Persisted shape (schemaVersion 2)

```json
{
  "schemaVersion": 2,
  "ui": {
    "targetLang": "zh",
    "sourceLang": "auto",
    "displayMode": "bilingual",
    "displayStyle": "highlight"
  },
  "sites": [
    {
      "sitePattern": "news.example",
      "targetLang": "zh",
      "displayMode": "bilingual",
      "displayStyle": "quote",
      "providerId": null,
      "autoTranslate": false
    }
  ]
}
```

Only two fields are added. No new storage key is introduced, and `STORAGE_KEYS` is unchanged, so the
existing writer, page-content guard, quota handling and delete-all path all keep working.

**Invariants**

1. `ui.displayStyle` and `sites[].displayStyle`, when present, MUST be one of the fifteen catalogued
   ids. An unknown value is ignored at resolution time (treated as absent), never stored back, and
   never causes an error (FR-020).
2. Absence means `none`. A fresh profile, an upgraded profile, and a pre-existing site rule all render
   unchanged until the reader chooses a style (FR-004).
3. The style preference is configuration only: no page content, no per-page choice, and nothing added
   to the storage guard's page-content key set (FR-021).
4. `deleteAll` clears the style with everything else and the next load reports `none` (FR-021,
   SC-013).
5. A profile written by a newer build is never overwritten; a profile at v1 is migrated before use.

---

## 2. Migration v1 → v2

| Step | Name | Behaviour |
|---|---|---|
| 2 | `add-display-style` | If `ui` is an object, add `displayStyle: "none"` when absent. For each `sites[]` entry, remove a `displayStyle` that is not catalogued. Return the new object; the store writes `schemaVersion: 2` only after all steps succeed. |

- Pure and idempotent: running it twice yields the same object.
- A failure aborts the whole chain with `migrationFailed` naming the step; nothing is persisted
  ([001 storage contract](../../001-llm-web-translator/contracts/storage-schema.md) section 3).
- Tested from `tests/fixtures/storage/v1.json`; the migrated result is frozen as
  `tests/fixtures/storage/v2.json`.
- `mergeDefaults` accepts the new fields independently of the migration, so a partially written
  profile still loads.

---

## 3. Resolution (recap of the catalogue contract)

```text
site override (catalogued)  →  ui.displayStyle (catalogued)  →  "none"
```

Site matching reuses feature 001's matcher, so language, mode and style always agree about which site
a page belongs to. Changing the global style MUST NOT rewrite a site override, and removing an
override MUST NOT change the global style (FR-019).

---

## 4. Messages

### 4.1 New command: `setDisplayStyle` (UI → content script)

```json
{ "type": "setDisplayStyle", "style": "marker" }
```

- Sent by the page control to its tab, and relayed by the service worker to every tab after an
  options-page change.
- Payload validation: `style` MUST be a string; an unknown id is accepted and resolves to `none`
  rather than being rejected, so a newer UI talking to an older page agent degrades gracefully
  (FR-020).
- Effect on a page with an active job: every rendered block is restyled through the renderer's
  `setDisplayStyle`; no request is issued, no unit state changes, and the job is not restarted
  (FR-002, FR-003).
- Effect on a page with no job: only the cached settings are updated; the next render uses the new
  style.
- Response: `{ "ok": true }`.

### 4.2 New relay: `styleChanged` (options → service worker)

```json
{ "type": "styleChanged", "style": "quote" }
```

- Persisted by the options page first, then sent to the service worker, which forwards a
  `setDisplayStyle` command to every tab and answers `{ "ok": true }`.
- A tab without the content script is not a failure; the forward call's rejection is ignored, exactly
  as the existing `providerChanged` relay does.
- The relay carries no credential, no page content and no per-tab state.

### 4.3 Existing command now handled: `setDisplayMode`

The page control has always sent `{ "type": "setDisplayMode", "mode": ... }`, but the content script
did not handle it. The style work routes it through the same live-update path (renderer
`setDisplayMode`), because leaving one setting of the pair silently inert would be a defect the
picker exposes immediately. The message shape is unchanged.

### 4.4 Cross-window agreement (FR-005)

- Both UI surfaces subscribe to `chrome.storage.onChanged` for the `ui` and `sites` keys and
  re-render their picker from the stored value.
- Neither surface writes to storage in response to a change notification, so the listener cannot
  loop.
- The page control reads the resolved style for its site on open, so opening it after an options
  change shows the same selection.

---

## 5. Error handling

| Situation | Behaviour |
|---|---|
| Unknown style id in storage | Resolve to `none`; keep the stored value untouched until the next save normalises it; no error surface |
| Unknown style id in a message | Accept, resolve to `none`, answer `{ok:true}`; never throw on the page |
| Storage write fails (quota, newer schema) | Existing error surfaces apply unchanged; the picker shows the failure and keeps the previous selection |
| Worker unavailable when broadcasting | The options page still saved; pages pick the new style up on their next render or reload; no retry loop |
