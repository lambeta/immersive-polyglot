# Contract: Extension Messaging

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-13

The protocol between the three execution contexts (research R3). Typed in `src/shared/messages.ts`;
this document is the source of truth those types must match.

---

## 1. Topology

```text
popup/options   --runtime messages-->  content script (tabs.sendMessage)
popup/options   --runtime messages-->  service worker
content script  --long-lived Port "translate"-->  service worker
service worker  --Port messages-->  content script
```

**Why a port for translation**: a job outlives the worker's idle window, and port traffic resets that
window (R3). One-shot messages are used only for commands that must not carry results.

## 2. Invariants

1. **No credential in any payload.** The service worker reads the secret internally and never places it
   in a message, in either direction. A message type that would require it is a design error.
2. **No page text outside the port.** Page content travels only over the `translate` port to the
   configured endpoint, and is never written to extension storage (FR-025).
3. **Every request has a deadline.** A port request carries `timeoutMs`; the worker aborts at expiry.
4. **The worker is stateless.** No message assumes the worker remembers a previous one; every request is
   self-contained.
5. **Unknown message types are rejected and logged locally**, never swallowed.

## 3. Port protocol (`translate`)

Client to worker:

| Message | Fields | Meaning |
|---|---|---|
| `translateBatch` | `requestId`, `providerId`, `segments[]`, `glossary[]`, `style`, `sourceLang`, `targetLang`, `timeoutMs` | Translate a batch |
| `verifyProvider` | `requestId`, `providerId` | Connection check (FR-003) |
| `cancel` | `requestId` | Abort in-flight work for that request (FR-012) |
| `ping` | none | Keep-alive during long segmentation |

Worker to client:

| Message | Fields | Meaning |
|---|---|---|
| `chunk` | `requestId`, `index`, `text` | Progressive partial (optional, R7 section 6) |
| `batchResult` | `requestId`, `results[{index, text}]` | Completed batch |
| `batchError` | `requestId`, `errorClass`, `retryable`, `failedIndices[]`, `message` | Classified failure |
| `verifyResult` | `requestId`, `ok`, `errorClass?` | Connection check outcome |

## 4. Commands (one-shot)

| Message | Direction | Meaning |
|---|---|---|
| `translatePage` | UI to content | Start a job on this page (FR-006). Carries an optional `providerOverrideId` that applies to this page load only and is never stored (US3 scenario 3, FR-005) |
| `setDisplayMode` | UI to content | Apply a display mode to the current page's already-rendered translations (FR-017) |
| `translateSelection` | UI to content | Translate the current selection only (FR-013) |
| `toggleTranslation` | UI to content | Translate on / restore off (FR-019) |
| `cancelJob` | UI to content | Cancel (FR-012) |
| `getJobStatus` | UI to content | Counts, provider, cap state for the popup (FR-028) |
| `jobUpdated` | content to UI | Status push for a live UI |
| `providerChanged` | UI/options to content | Invalidate cached provider resolution |

## 5. Lifecycle and failure

- The content script opens the port lazily on first translation and closes it on job completion or tab
  unload.
- If the port disconnects mid-job (worker terminated), the content script reconnects and re-issues only
  the requests it has no result for. No duplicate rendering.
- If reconnection fails 3 times within 30 s, the job ends as `failed (workerUnavailable)` with a visible
  message; already-translated content stays, and no partial unit is rendered.
- Every `requestId` is unique per batch attempt; late results for a cancelled or superseded request are
  discarded by the client.

## 6. Change record (2026-11-14, during implementation)

- `setDisplayMode` was added: FR-017 requires the user's mode choice to be respected on every page,
  and the popup can change it after translations already exist. Without a command the popup would
  have to re-translate the page to change a presentation detail.
- `translatePage.providerOverrideId` was added: US3 scenario 3's per-page override has to reach the
  content script somehow, and storing it would violate "applies to this page load only".
- Credentials still cannot appear in any payload: the runtime guard of invariant 1 covers both
  additions, and the unit test asserts that a credential field is refused.
