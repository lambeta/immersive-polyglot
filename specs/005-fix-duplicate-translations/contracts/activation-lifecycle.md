# Contract: Activation Lifecycle

**Feature**: 005-fix-duplicate-translations | **Status**: ratified by this plan | **Version**: 1

This contract fixes what happens when the reader asks for a translation — once, twice, or ten times.
It is the normative statement that spec FR-001..FR-009 rest on. Anything not stated here is unchanged
from feature 001's messaging and rendering contracts.

---

## 1. Participants and scope

| Participant | May activate? | May render? |
|---|---|---|
| Popup translate control | yes — `translatePage`, or `toggleTranslation` when the page is in its restore state | no |
| Keyboard shortcut (`Alt+T`) | yes — `toggleTranslation` | no |
| Selection command (`translateSelection`) | yes | no |
| Page agent (content script) | **no** — it never activates itself | **yes**, and only it |
| Service worker | no — relays settings changes and shortcuts only | no |

Scope: one page in one tab (`all_frames: false`, so one content-script instance per page). Activations in
different tabs are independent by construction and MUST NOT influence each other (FR-009).

## 2. Definitions

- **Activation**: a command that asks for translation — `translatePage`, `translateSelection`, or
  `toggleTranslation` while the page holds no translation.
- **Target**: what the activation asks for. Either **whole page**, or a **selection** — an ordered list
  of source block elements resolved at activation time.
- **Same target**: both activations are whole-page, or both are selections whose resolved element lists
  are equal element-for-element (reference identity). Element identity is the selection's identity: the
  same paragraph is the same element.
- **Run**: one bounded attempt over one page, owning one journal and every rendered translation. A run
  ends `completed`, `failed` or `cancelled`.
- **Absorbed activation**: an activation that starts nothing, requests nothing, renders nothing, and
  changes no status counter.

The specification's *Translation Run*, *Rendered Translation* and *Restore Record* are this contract's
**run**, **translation container** and **journal** respectively (the mapping is restated in
[data-model.md](../data-model.md) § Vocabulary).

## 3. The decision (normative)

The page agent MUST decide synchronously, before its first `await`, using this table and no other rule:

| Slot state | Requested target | Decision |
|---|---|---|
| empty | any | **start** |
| `starting` or `running` | any | **absorb** |
| `finished`/`cancelled` | any | **replace** |
| `finished`/`completed` or `failed` | same as the finished run | **absorb** |
| `finished`/`completed` or `failed` | different from the finished run | **replace** |

Obligations:

- **start** — resolve settings and provider, build one run, run it.
- **absorb** — reply immediately and do nothing else. No storage read, no segmentation, no request, no
  DOM write, no counter change, no broadcast beyond the current status.
- **replace** — before constructing the new run: abort the previous run, then replay its journal, then
  start. The previous target's output MUST be gone before the new run's first write. A whole-page
  activation after a selection-only run is such a *different target*: the selection's output is removed
  first and those passages are translated again, so the page ends with exactly one translation per
  passage (spec edge case "Page-wide press after a selection-only run").

## 4. Ordering guarantees

1. **Claim before await.** The decision and the claim that records it MUST happen in the same
   synchronous step, before settings, provider resolution, storage or any timer.
2. **Absorb is terminal.** An absorbed activation MUST NOT schedule work that could later start a run.
3. **One reply per command.** Every activation command replies exactly once and returns immediately; a
   reply MUST NOT wait for the run to finish.
4. **Status reflects the run, not the press count.** Broadcasts come from the run's own state machine; an
   absorbed activation adds no broadcast of its own.
5. **Settle on every exit.** Every claim ends in exactly one outcome: `completed`, `failed`, or
   `cancelled`. A refusal taken before a run exists (restricted page, unsupported content, no enabled
   provider) also settles, and settles as `failed`, so the slot is never left in `starting`.

## 5. Wire contract

```text
popup/worker ──▶ content script
  { type: "translatePage", providerOverrideId? }        → { ok: true } | { ok: true, absorbed: true, reason }
  { type: "translateSelection" }                        → { ok: true } | { ok: true, absorbed: true, reason } | { ok: false, errorClass: "selectionEmpty" }
  { type: "toggleTranslation" }                         → { ok: true }        (toggles: starts, or restores)
  { type: "cancelJob" }                                 → { ok: true }
  { type: "getJobStatus" }                              → JobStatusPayload

content script ──▶ popup
  { type: "jobUpdated", status: JobStatusPayload }
```

- `reason` is `"running"` or `"repeat"`. It is diagnostic: no shipped surface displays it, and no
  status field is added (R8).
- Command names, payload shapes and `JobStatusPayload` are unchanged from feature 001. No new command
  type, no new status field, no new storage key.
- The reply of an absorbed activation MUST arrive without waiting for the run in progress.

## 6. Restore contract

Turning translation off MUST, in this order:

1. stop accepting new activations for the run (claim the slot as `cancelled`);
2. abort the run — in-flight batches, pending wire requests, the observer;
3. replay the journal (the only restoration mechanism);
4. reset the slot and drop the run, broadcasting `idle`;
5. leave the page byte-identical to the pre-translation capture: no translated text, no translation
   container, no `data-ipt` marker, no translation styling, unchanged scroll position.

Restore MUST be safe to call while a run is in progress (FR-011), and MUST be idempotent: a second
turn-off on an untranslated page changes nothing and is not an error.

After restore, the next activation takes the `start` row: one run, from a clean page, inheriting no
unit, identifier, attribute or styling from the previous run (FR-012).

## 7. Independence and preservation

- A page MUST have at most one run in progress (FR-007).
- Activation in one page MUST NOT absorb, delay or duplicate activation in another page (FR-009).
- A single activation MUST behave exactly as it does today: same segmentation, batching, placement,
  display mode, display style, typography, language handling, caps, cancellation and failure taxonomy
  (FR-016). This contract only governs the second and later activations, and the replacement and
  restoration paths that make them safe.

## 8. Conformance

A build conforms to this contract when all of the following hold:

| Check | Where |
|---|---|
| The decision table is a pure function of (slot state, same-target) | `run-slot.test.ts` |
| The claim is recorded before the handler's first `await` | code review + `run-slot.test.ts` race case |
| Five activations in one second issue one run's requests | `repeat-translate.spec.ts` (stub `requests`) |
| Five activations produce one translation per passage | `repeat-translate.spec.ts`, `job-repeat.test.ts` |
| Turn-off after five activations leaves no residue | `repeat-translate.spec.ts`, `restorer.test.ts` |
| Turn-off during a run stops it and leaves no late render | `repeat-translate.spec.ts` |
| Ten activations during a failing run give one failure notice | `repeat-translate.spec.ts` |
| Ten activations at a cap give one cap notice and no over-cap passage | `repeat-translate.spec.ts` |
| Two tabs are independent | `repeat-translate.spec.ts` |
