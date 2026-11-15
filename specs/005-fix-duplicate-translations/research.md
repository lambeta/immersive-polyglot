# Phase 0 Research: One Translation Per Passage, However Often Translate Is Pressed

All findings below were established by reading the shipped source and by running the repository's own
harnesses, not by assuming how a translator extension "usually" behaves. Where a claim is about
observed behaviour it says how it was observed. No item remains NEEDS CLARIFICATION.

---

## R1 — Which surface owns the single-run rule

**Decision**: The **page agent** (`src/content/index.ts`), because it is the only context that both
receives every activation and owns the page mutation.

**Evidence**:

- Three surfaces can activate translation and none of them passes through a common gate:
  the popup's `translatePage` (the `#translate` click handler in `popup.ts`), the keyboard shortcut which sends
  `toggleTranslation` (`service-worker.ts:302-311`), and the `translateSelection` command
  (`messages.ts:62`, handled at `index.ts:352-361`).
- The popup decides between translate and restore from a **status snapshot** that only updates when a
  `jobUpdated` broadcast arrives (`render()` in `popup.ts`, driven by its `jobUpdated` listener). Two
  clicks in the same frame read
  the same stale `idle` status and both send `translatePage`.
- The page agent already owns the invariants this feature is about: the job, the journal, the observer
  and the rendered DOM. A guard anywhere else would still leave the agent able to start a second run.

**Alternatives considered**:

- *Guard in the popup* (disable the button while a run is pending): closes one surface, leaves the
  keyboard shortcut and selection translation able to duplicate, and adds UI state the spec forbids
  (FR-019). Rejected.
- *Guard in the service worker*: the worker holds no job state by design (`service-worker.ts` header:
  "owns the wire, holds no job state"); adding run state there would move the domain into the wrong
  context and would still race the content script. Rejected.

---

## R2 — What "in progress" and "already translated" mean, and absorb vs. replace

**Decision**: The page keeps one **run slot** with a phase and an outcome, plus the identity of the
target it was claimed for. The decision table is:

| Previous slot state | Requested target | Decision |
|---|---|---|
| none | anything | **start** |
| `starting` or `running` | anything | **absorb** (`running`) |
| `finished` + `cancelled` | anything | **replace** |
| `finished` + `completed` or `failed` | same target as the previous run | **absorb** (`repeat`) |
| `finished` + `completed` or `failed` | a different target | **replace** |

"Same target" means: both were whole-page activations, or both were selection activations whose
resolved element lists are element-for-element identical.

**Rationale**:

- A press while a run is in progress asks for what is already happening (spec FR-001, FR-003).
- A press after a *completed* run asks for what the control is already showing; the spec makes that
  state the restore state (FR-002), and SC-006 forbids the extra requests a restart would issue.
- A press after a *failed* run must also absorb: SC-008 requires that ten repeat presses during a
  failing run produce **one** failure notice, and a failing provider can fail in milliseconds, so a
  "retry on failure" rule would mint a second run before the second press arrives. Absorbing changes no
  reachable reader flow: after a failure the popup already shows the restore action
  (`render()` maps every non-idle state to the restore label), so the reader's retry path is
  restore → translate, as today.
- An **explicit stop** is a real end of a run, so the spec's edge case ("a press afterwards starts
  exactly one new run") is honoured by the `cancelled` → replace row.
- A **different** target is a new request, not a repeat. It is allowed, but only through the replace
  path, so the page never holds two runs' output (FR-008). Today no shipped surface sends
  `translateSelection` — it exists on the wire and in `selectedBlocks` — so this row is a correctness
  guarantee rather than a change to a flow readers can reach, which is why absorbing during a run is
  acceptable instead of the more complex "tear down the page run and start a selection run" path.
- The **whole-page-after-selection** direction is settled by the spec's edge cases rather than left to
  the implementer: it is a replacement, and the passages the selection had translated are translated
  again rather than kept. Keeping them would leave two runs' output on one page, which the
  one-translation-per-passage rule forbids.

**Alternatives considered**:

- *Restart on every repeat press, discarding the previous run's output first*: satisfies "one
  translation per passage" but spends the reader's quota for an identical result (violates FR-006,
  SC-002) and visibly flickers the page. Rejected; recorded as out of scope in the spec.
- *Time-window debounce* (ignore presses within N ms of the last): timing-dependent, unpredictable for
  the reader, and unmeasurable as an outcome; also fails a slow-provider run where the second press
  arrives seconds later. Rejected.
- *Absorb failures too, but only when output exists*: still mints a second run when the first failed
  before rendering — exactly the case SC-008 covers. Rejected.

---

## R3 — Closing the claim race

**Decision**: Claim the slot **synchronously**, before the handler's first `await`, inside a pure
state machine (`src/content/run-slot.ts`). `claim()` both decides and records the claim in one
synchronous step, so a second activation cannot observe a stale empty slot.

**Evidence**: `startTranslation` is `async` and its first step is `await settings(true)`
(`index.ts:258`); the job is only assigned at `index.ts:287`. Between the command arriving and the job
existing there is at least one microtask and, on a cold settings read, more. Two `translatePage`
commands arriving in that window both survive any check placed after the await — which is precisely
the reported defect. The current code's only serialisation is `if (job) job.cancel()`
(`index.ts:279`), which is too late and, worse, destroys the previous run's *state* while leaving its
*output* on the page.

**Rationale**: A synchronous claim is the only ordering primitive available in a single-threaded
content script that does not rely on timers, locks or message ordering. Putting it in a pure module
makes the race directly testable: two `claim()` calls in a row, no timers, assert the second is
absorbed.

**Alternatives considered**:

- *Re-check after the await and return early*: leaves the window open for the case where the first
  activation is still awaiting settings; the second would see `job === null` and start. Rejected.
- *A promise chain / queue that serialises activations*: correct but heavier, and it would still need a
  policy for what the queued activation does when it reaches the front. Rejected (principle IV).
- *Async mutex in a shared module*: adds state without a testable decision; rejected.

---

## R4 — Stopping the segmenter from reading the product's own output

**Decision**: Prune `[data-ipt="target"]` subtrees silently at the top of the segmentation walk
(`segmenter.ts`, in the loop at line ~451, before `skipReasonFor`). Move `TARGET_MARKER` and
`SOURCE_MARKER` into `src/content/markers.ts`, import them in `renderer.ts` (re-exported for
compatibility), `segmenter.ts` and `observer.ts`.

**Evidence**: Segmentation walks every element and takes `element.textContent` for leaf candidates
(`segmenter.ts:470`). The renderer writes `data-ipt="target"` on the container and `data-ipt="source"`
on the source (`renderer.ts:176-191`). Nothing in the walk consults those markers, so a second run
re-segments the rendered translation. The repro confirms the consequence: a second run over a
two-paragraph page produced **four** `[data-ipt="target"]` blocks, and `job2.units` contained the
already-rendered translations among its source texts. In that run the two re-segmented translations were
declined as `sameLanguage` only because the test provider's prefix contains a CJK character; with a
Latin-only target the same units would have been queued and sent. The guard therefore cannot rely on
language detection — the outcome of segmentation would otherwise depend on the provider's output.

Pruning also matters for the placement rule: for `LI`, `TD`, `TH`, `DD`, `DT`, `CAPTION` and
`SUMMARY` the renderer appends the container **inside** the source (`CONTAINER_TAGS`,
`renderer.ts:42`, `#place` at line 236). Without the guard, a later collection of that container sees a
block descendant and drops the list item's own text — the passage silently disappears from later
passes, which is the opposite failure to duplication but from the same root cause.

**Rationale**: The product's output is not page content, so the correct action is to not read it at
all. Silently pruning (rather than a new `SkipReason`) keeps every existing count, message and locale
entry exactly as they are: a reader must never see "1 passage skipped" because the extension's own
block was ignored (FR-019, and feature 001's skipped-count contract).

**Alternatives considered**:

- *A new `SkipReason` such as `productOutput`*: would change skip counts, require a locale string, and
  surface an implementation detail to the reader. Rejected.
- *Matching our container by text instead of attributes*: fragile (a site could legitimately show the
  same text) and slower. Rejected.
- *Always restoring before any collection*: hides the symptom but leaves the invariant unenforced for
  late content and for cloned nodes. Rejected as the primary mechanism; restore-then-start is still
  used for replacement (R5).

---

## R5 — What happens to the previous run's journal on replacement

**Decision**: Replacement is composed in the page agent as **cancel, then replay the previous run's
journal, then start the new run**. One journal for the page at a time; the residue audit stays a last
resort for foreign clones, never the mechanism that makes replacement safe.

**Evidence**: `TranslationJob.restore()` calls `restorePage(journal, …)`, which replays the journal and
then counts `[data-ipt]` nodes, removing any it finds (`restorer.ts:104-121`). In the repro, where run
two's journal was replayed over a page still carrying run one's output, the residue audit removed the
**source paragraphs themselves** — they carry `data-ipt="source"` — leaving `<article></article>`. That
is the concrete cost of letting the audit do the work: it cannot distinguish "our translation" from
"our marker on the page's own node", so a lost journal entry turns into lost page content.

With one journal per page, the replay itself removes every marker and container the product added
(attribute entries restore the previous value, including "no attribute"), and the residue count is
zero, so the audit never fires.

**Rationale**: The invariant "at most one journal has ever written to this page" is cheap to hold and
makes both restoration and the residue audit trustworthy. It is also what FR-012 means by a run not
inheriting anything from an earlier run.

**Alternatives considered**:

- *Let each run keep its own journal and restore all of them on turn-off*: requires a registry of dead
  journals, grows unboundedly with presses, and turns a single button press into a loop over N
  journals. Rejected (principle IV).
- *Narrow the residue audit to containers only*: tempting, but it cannot be decided from the DOM —
  a source node and a container node are distinguished only by the attribute *value*, which a cloned or
  rewritten node may not preserve. Keeping the audit broad while guaranteeing one journal is safer than
  keeping many journals while narrowing the audit. Rejected.

---

## R6 — Turning translation off during a run

**Decision**: `restore()` in the page agent must **cancel the run first** (aborting in-flight batches
via the job's controllers and rejecting pending wire requests), then replay the journal, then reset the
slot and clear the run. `cancelJob` keeps its current meaning (stop, leave output until turn-off).

**Evidence**: Today `restore()` (`index.ts:328-336`) stops the observer, calls `job.restore()` and drops
the job, but never calls `job.cancel()`. The job's state stays `translating` and its `AbortController`s
stay live, so a reply that arrives after the replay still reaches `#applyReply` → `#render`
(`job.ts:286-300`), creating a container after restoration and journalling it into a journal that has
already been replayed — permanent residue, and a page that can no longer be restored by turning
translation off again. No test covers this path (the only `cancelJob` use in the suite is a
provider-timeout test).

**Rationale**: FR-011 says turning translation off during a run must stop it and remove what it
rendered. Cancelling first is also what makes the single-journal invariant hold on the way out.

**Alternatives considered**:

- *Leave it and let the residue audit clean up on the next restore*: the audit already runs during the
  restore that just happened, so the residue is created after it. A second turn-off would only be
  reachable if the UI still offered one. Rejected.
- *Make the job ignore replies when restored*: a second source of truth beside `cancel()`; aborting is
  the existing mechanism and already tested at the job level. Rejected.

---

## R7 — Test strategy

**Decision**: Four layers, each proving a different sentence of the spec, in the existing harnesses.

| Layer | File | Proves |
|---|---|---|
| Unit (node) | `tests/unit/run-slot.test.ts` (new) | the decision table (R2), the claim race (R3), settle/reset, same-target identity (SC-001, SC-009 in miniature) |
| Unit (node + JSDOM) | `tests/unit/segmenter.test.ts` (extend) | product output is never segmented and never counted (FR-005, FR-017) |
| DOM (jsdom) | `tests/dom/job-repeat.test.ts` (new) + `tests/dom/restorer.test.ts` (extend) | two runs over one page produce four target blocks **without** the fix and one set with discard-then-run; replay leaves an exact DOM (SC-003, SC-004, SC-005) |
| E2E (real Chromium) | `tests/e2e/repeat-translate.spec.ts` (new) | five activations over the real wire produce one translation per passage, the provider receives the single-run number of requests, counts/usage match, restore is exact, one failure notice, one cap notice, popup double press is harmless (SC-001, SC-002, SC-006..SC-010) |

**Evidence for feasibility**:

- `tests/dom/job-harness.ts` already exposes `startJob`, `FakeCaller` (with `requests`),
  `DeferredCaller` and `AbortableCaller`, so a "two runs over one page" test needs no new double.
- `tests/support/e2e-fixtures.ts` already provides `sendToTab`, `waitForTranslation`,
  `translationTexts`, `jobStatus` and `expectNoResidue`; the stub provider exposes `requests`, so the
  request count is a first-class assertion rather than an inference.
- `tests/unit/segmenter.test.ts` builds its own JSDOM documents in the node environment, so the
  ownership guard test belongs there rather than in a new project.

**Rationale**: The guarantee is a state machine, so its proof is fast, deterministic and offline; the
end-to-end proof exists to show the real wire, the real provider count and the real rendered page, which
is what the constitution calls real behaviour. Splitting them means a flaky browser test cannot hide a
broken decision table, and a passing table cannot substitute for a real page.

**Alternatives considered**:

- *Driving the popup by clicking `#translate` five times as the only e2e proof*: the popup targets the
  "active tab" found by `chrome.tabs.query` in `boot()`, which is a Playwright-context
  detail rather than a product fact, so it is kept as one focused case and not as the authoritative
  request-count proof. Rejected as the only surface.
- *A Playwright-only proof*: minutes per run, and it cannot express the claim race deterministically.
  Rejected.

---

## R8 — Observing an absorbed activation without new strings

**Decision**: The `translatePage`/`translateSelection` handler replies `{ ok: true, absorbed: true,
reason: "running" | "repeat" }` when it absorbs; the `JobStatusPayload` broadcast, the status line, the
counts and every locale entry stay exactly as they are.

**Evidence**: `handleCommand` already replies with an untyped `unknown` (`sendResponse({ ok: true })`),
and `parseCommand` validates only *incoming* commands — adding a field to the reply touches no schema,
no test type and no popup code path (the `#translate` click handler ignores the reply body and only calls
`refreshStatus()`).

**Rationale**: Tests need to distinguish "started" from "absorbed" without timing tricks, and a log
line is not enough for an e2e assertion. A reply field is the smallest observable that adds no user
interface (FR-019).

**Alternatives considered**:

- *A new message type `{ type: "translationAbsorbed" }`*: a wire change for an internal detail. Rejected.
- *A new status field on `JobStatusPayload`*: would be rendered by nothing and persisted by nothing,
  but it widens a contract every suite compares. Rejected.
- *Inferring absorption from absence of a second request*: true but indirect; keep it as the primary
  e2e assertion (SC-002) and use the reply only as a convenience for directed tests. Adopted both, in
  that order of authority.

---

## R9 — Performance and scale

**Decision**: No performance work is planned beyond the stated bound. An absorbed activation is O(1)
(slot read + reply); a replacement is one journal replay (DOM-only, no network) followed by the same
work as a first activation.

**Evidence**: The expensive parts of a run are segmentation, batching and the provider call
(`job.run`), all of which are skipped entirely by absorption. A journal replay is the operation the
product already performs on every turn-off, so replacement cannot cost more than a turn-off.

**Rationale**: SC-007 asks only that repeated activations stay within 5% of a single activation on a
100-passage page. Since absorbed activations do no work, the bound holds by construction; the test
asserts it to catch accidental re-segmentation (for example a guard that re-collects before deciding).

**Alternatives considered**:

- *Caching the segmentation between activations*: that is a performance feature no requirement asks
  for (principle IV), and it would add a cache-invalidation surface to the very path being fixed.
  Rejected.
