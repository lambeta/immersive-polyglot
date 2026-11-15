# Phase 1 Data Model: One Translation Per Passage, However Often Translate Is Pressed

**Nothing in this feature is persisted.** No `chrome.storage` key is added or changed, no migration
runs, `schemaVersion` stays 2, and no value survives a page reload. Every entity below is in-memory
state of the content script for the lifetime of one page, exactly like the `job` variable it replaces.
The sections that follow therefore describe a state machine, not a schema.

**Vocabulary.** The specification (§ Key Entities) names three things that this model and the shipped
code name differently. One mapping, used consistently below: **Translation Run** = *run* (the job);
**Rendered Translation** = *translation container* (`data-ipt="target"`); **Restore Record** =
*journal*. **Source Passage** is used as-is. Where a contract or a task says "journal", read the
specification's "Restore Record"; both refer to the same record.

---

## 1. Run Slot

The one authoritative record of "what has this page's translation slot been used for".

| Field | Type | Meaning | Rules |
|---|---|---|---|
| `phase` | `"starting" | "running" | "finished"` | `starting`: a claim is held but no job exists yet (the handler is still resolving settings and provider). `running`: a job exists and has not reached a terminal state. `finished`: the claim ended, for better or worse. | Set synchronously by `claim()` before any `await` (R3). |
| `outcome` | `"completed" | "failed" | "cancelled"` — present only when `phase === "finished"` | How the run ended. | Absent in every other phase (invariant I2). Written once by `settle()`. |

The slot also answers, for the *requested* activation only, whether the requested target is the same as
the finished run's target. Target identity is not stored as a string: the page agent keeps the last
target beside the slot and compares whole-page against whole-page, or element-for-element for a
selection (`sameTarget` in `claim()`).

### 1.1 Phases and transitions

```text
        claim()                 start()                settle(outcome)
  ∅ ──────────────▶ starting ──────────────▶ running ─────────────────▶ finished
        ▲                 │                                            │
        │                 │ settle("failed")  (provider missing,       │
        │                 │ stop before a job exists)                  │
        │                 └────────────────────────────────────────────┤
        │                                                              │
        └──────────────────────────── reset() ◀───────────────────────┘
                                        (restore only, after replay)

        finished ──claim(replace)──▶ starting        # new run, old journal already replayed
        finished ──claim(absorb)───▶ finished        # unchanged, no work performed
        starting/running ──claim(any)──▶ unchanged   # absorbed
```

### 1.2 Decisions

| Value | When | Obligation on the page agent |
|---|---|---|
| `start` | no slot, or the slot belongs to a different target and its output was already replayed | resolve settings and provider, build the job, call `start()` |
| `replace` | slot `finished` with `cancelled` (explicit stop), or slot `finished` for a **different** target — including a whole-page activation after a selection-only run (spec edge case) | `previous.cancel()`, `previous.restore()` (replay), then behave as `start` |
| `absorb-running` | slot `starting` or `running` | reply `{ ok: true, absorbed: true, reason: "running" }`; touch nothing |
| `absorb-repeat` | slot `finished` with `completed` or `failed` for the **same** target | reply `{ ok: true, absorbed: true, reason: "repeat" }`; touch nothing |

The decision table, its rationale and the rejected alternatives (restart-on-repeat, time-window
debounce, absorb-only-when-output-exists) are in [research.md](./research.md) R2.

### 1.3 Validation and invariants

- **I1** — At most one claim exists per page at any time. `claim()` is synchronous and total: it either
  records a claim or records nothing, never throws, never awaits.
- **I2** — `phase === "finished"` if and only if `outcome` is present.
- **I3** — `settle()` is called at most once per claim, on every exit path of the run: completion,
  failure, cancellation, and refusal before a job was built (provider missing, unsupported page,
  restricted scheme). A claim that is never settled would absorb every later press — the failure mode
  that the traceability tests target.
- **I4** — `reset()` is called only by the restore path, and only after the run's journal has been
  replayed.
- **I5** — Absorption performs no DOM read, no DOM write, no storage read, no message send beyond the
  reply (FR-013, SC-002, SC-007).
- **I6** — On `replace`, the previous run's journal is replayed **before** the new job is constructed,
  so no two journals have ever written to the page (R5).
- **I7** — Restore cancels before replaying (R6).

---

## 2. Page-Agent Run Record

The page agent keeps, beside the slot, exactly the handles a decision and a restore need. This is a
re-statement of state the agent already holds (`job`, `observer`, `lastStatus`); the only addition is
the target identity and the slot.

| Field | Type | Why it exists |
|---|---|---|
| `job` | `TranslationJob \| null` | the run's units, journal and renderer; `cancel()` and `restore()` are its primitives |
| `slot` | `RunSlot` | the decision surface of §1 |
| `target` | `"page" \| Element[]` | supplies `sameTarget`; element arrays are kept as references because those references *are* the selection |
| `observer` | `PageObserver \| null` | started with a run, stopped on restore |
| `lastStatus` | `JobStatusPayload` | the reply to `getJobStatus` and the payload broadcast to the popup; unchanged shape |

**Unchanged by this feature**: `JobStatusPayload` (including `counts`, `usage`, `capReached`,
`failure`), `TranslationUnit`, `JobCounts`, `SkipReason`, and every `CommandMessage`. No `SkipReason`
value is added: product output is pruned silently (R4).

---

## 3. Marker Vocabulary

The page markup is the third participant, and this feature makes its ownership explicit
([contracts/page-markup-ownership.md](./contracts/page-markup-ownership.md)).

| Marker | Written by | Read by | Meaning |
|---|---|---|---|
| `data-ipt="target"` | renderer, on the translation container | restorer (removal), segmenter (**prune**), observer (ignore), tests | this element is product output, never source text |
| `data-ipt="source"` | renderer, on the source block | restorer (attribute replay), segmenter (not a prune reason — the source is still page text), observer (ignore) | this element is a page block that owns a translation |
| `data-ipt-unit`, `data-ipt-style`, `data-ipt-position`, `data-ipt-conceal` | renderer | renderer, stylesheets, tests | presentation metadata for the translation container |
| `data-ipt` (bare query) | — | `restorePage` residue audit | any product marker; the audit removes what a lost journal entry left behind |

The critical rule this feature introduces: **`data-ipt="target"` is never a segmentation root, a
segmentation candidate, or a segmentation descendant.** It is pruned at the top of the walk before any
text is read, and it is not counted as a skipped passage.

---

## 4. Data Flow of One Activation

```text
command (translatePage | translateSelection | toggleTranslation)
   │
   ▼
slot.claim({ sameTarget })            ← synchronous; no await above this line
   │
   ├─ absorb-running | absorb-repeat ──▶ reply { ok, absorbed, reason }; nothing else happens
   │
   ├─ unsupported page / restricted scheme ─▶ failure report once; slot.settle("failed")
   │
   ├─ replace ──▶ previous.cancel(); previous.restore();  (journal replayed, slot output gone)
   │
   ▼
await settings(true) → resolveProvider → build job → slot.start()
   │                                     │
   │                                     └─ provider missing: report failure, slot.settle("failed")
   ▼
job.run()  ──▶ broadcast(status) ──▶ renderer writes [data-ipt] ──▶ journal records every write
   │
   ├─ completed ──▶ slot.settle("completed")
   ├─ failed    ──▶ slot.settle("failed")
   └─ cancelled ──▶ slot.settle("cancelled")      (cancelJob or restore)

turn-off: cancel (if running) → replay journal → reset slot → broadcast idle
```

---

## 5. Requirement Traceability

| Requirement | Model element / rule | Test |
|---|---|---|
| FR-001 absorb while running | `absorb-running` row, I1 | `run-slot.test.ts`, e2e case 1 |
| FR-002 absorb after completion | `absorb-repeat` row (`completed`) | `run-slot.test.ts`, e2e case 2 |
| FR-003 timing/phase independence | synchronous `claim()`, `starting` vs `running` | `run-slot.test.ts` (race), e2e case 1 |
| FR-004 never two translations for one passage | I5 + I6 + segmenter prune | `job-repeat.test.ts`, e2e case 1 |
| FR-005 never translate a translation | segmenter prune of `data-ipt="target"` | `segmenter.test.ts` |
| FR-006 N activations = one run's requests | `absorb-*` rows perform no work (I5) | e2e case 1 (request count) |
| FR-007 at most one run per page | I1 | `run-slot.test.ts` |
| FR-008 replacement never leaves two sets | I6, `replace` obligation | `run-slot.test.ts`, e2e case 4 |
| FR-009 pages are independent | slot is per content-script instance; no shared state | e2e case 6 (two tabs) |
| FR-010 exact restore after repeats | journal replay + residue audit | `restorer.test.ts`, e2e case 3 |
| FR-011 turn-off stops a run | I7, restore = cancel → replay → reset | e2e case 3b (restore mid-run) |
| FR-012 no inheritance after restore | I4, I6 | `restorer.test.ts` |
| FR-013 absorbed activation consumes nothing | I5 | e2e case 2 (counts/usage) |
| FR-014 one failure, one cap notice | `absorb-repeat` covers `failed`; single settle (I3) | e2e cases 5, 5b |
| FR-015 stop available, state visible | unchanged status broadcast; no new UI | e2e case 5 |
| FR-016 first press unchanged | slot starts `∅ → starting`, decision `start` | whole existing suite |
| FR-017 late content translated once | observer ignore rule + segmenter prune | `observer.test.ts`, `segmenter.test.ts` |
| FR-018 selection obeys the same rule | `sameTarget` for element lists | `run-slot.test.ts` |
| FR-019 no new setting/string/label | no storage, no locale, no popup edit | `i18n-audit.test.ts`, review |
| FR-020 accessibility unchanged | absorption touches no focus, scroll or DOM | existing a11y suite, e2e case 6 |
