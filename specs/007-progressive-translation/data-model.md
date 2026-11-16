# Phase 1 Data Model: Progressive Mark and On-Demand Demand

Every entity below is **ephemeral page state**. None is persisted, none enters
`chrome.storage.local`, and none changes the stored schema (FR-034). The persisted shapes of feature
001 are untouched; a reader who never translates a page never causes any of this to exist.

---

## 1. Passage

One leaf block of readable page content — what a reader perceives as one paragraph. It is the unit of
marking, requesting, charging and restoring. It is *not* a new stored entity: it is the existing
"source block" the renderer and the segmenter already share, given a name and a state.

| Field | Type | Notes |
|---|---|---|
| element | `Element` | The page's own block element. Identity, never a selector (a page may reuse class names). |
| parts | `TranslationUnit[]` | The block's translation units in `partIndex` order. More than one when the block exceeded the unit character limit and was split at sentence boundaries. |
| occurrences | `SegmentDuplicate[]` | Later occurrences of the same text *inside this block*, which render as extra parts of this passage. |
| state | `idle \| pending \| translated \| failed \| skipped` | Derived from its parts and from whether a mark or a container is attached. |
| demand | `outside \| lookahead \| visible` | Recomputed on every window change; never persisted. |
| mark | `HTMLElement \| null` | The pending container, when one exists (see §3). |
| container | `HTMLElement \| null` | The translation container once rendered; the same node the mark used (R3). |

**Relationships**: one Passage has 1..n Parts; a Part belongs to exactly one Passage; a Passage that
repeats another Passage's text appears in `TranslationJob.duplicates` as an occurrence pointing at an
original part, and is filled from that original without a request (FR-015).

**Identity and uniqueness**: a Part's id is derived from its document position plus a content hash
(today's rule). A Passage's identity is its element. Two passages with identical text remain two
passages with two distinct elements and two distinct marks; the *translation* is reused, the *mark* is
per passage.

---

## 2. DemandWindow

The set of passages the reader is about to read. A value object, recomputed from measurement.

| Field | Type | Notes |
|---|---|---|
| viewportTop | number | Top of the visible area, in the same coordinate space as the measured rectangles. |
| viewportBottom | number | Bottom of the visible area. |
| lookaheadPx | number | `DEMAND_LOOKAHEAD_RATIO × (viewportBottom − viewportTop)`, with the ratio fixed at 1. Not configurable (FR-010). |

**Predicate** (`inDemand(rect, window)`):

```text
rect.bottom > window.viewportTop  AND  rect.top < window.viewportBottom + window.lookaheadPx
```

**Rules that follow from the predicate, and the requirement each encodes**:

| Case | Result | Requirement |
|---|---|---|
| Rect intersects the visible area | in demand, group `visible` | FR-010 |
| Rect sits entirely between the visible bottom and one viewport below | in demand, group `lookahead` | FR-010 |
| Rect sits entirely above the visible top | not in demand (until the reader scrolls back) | FR-012 |
| Rect sits below visible bottom + lookahead | not in demand | FR-012, SC-002 |
| Passage taller than the screen, any part visible | in demand | Edge case |
| Zero-height or collapsed rect | not in demand | Edge case (hidden containers) |
| Page not visible to the reader | window is not actionable; nothing new is requested | FR-016 |

**Ordering**: `visible` group first, then `lookahead`; within a group, document order of the passage's
first part. This is the order batches are dispatched in (FR-013) and re-sorted to (R5).

---

## 3. PendingMark

The product's per-passage progress indicator. A DOM node with journalled ownership.

| Field | Type | Notes |
|---|---|---|
| container | `HTMLElement` | The node inserted into the page. Always the node the translation will later use. |
| source | `Element` | The passage it belongs to. The reverse lookup lives in `Renderer#pending`. |
| unitId | string | The id of the passage's first part, carried as `data-ipt-unit` for identification. |

**Attributes written onto the node** (all journalled, so replay removes them with the node):

| Attribute | Value | Why |
|---|---|---|
| `data-ipt` | `"pending"` | The single ownership marker. The observer ignores any `[data-ipt]` subtree; the segmenter prunes it; restore removes it; residue auditing sees it. |
| `data-ipt-unit` | the passage's first part id | Lets a test or a diagnostic name the passage without reading text. |
| `data-ipt-position` | `"before"` when translations are shown above | Shared placement code with translations. |
| `aria-hidden` | `"true"` | Never announced as content (FR-028). |

**Attributes deliberately absent**:

| Attribute | Why absent |
|---|---|
| `data-ipt-style` | Every one of the fifteen display styles selects on it; a mark must never be blurred, underlined, highlighted or concealed (FR-005). |
| `data-ipt-conceal`, `tabindex` | A mark is not concealed content and must never take focus (FR-028). |
| `lang` | The mark holds no words, so declaring a language on it would be noise and could affect shaping. |

**Text content**: empty. The rotation is drawn by `src/styles/content.css` from the box itself, so the
mark is wordless and the locale catalog gains no key (FR-034, FR-005).

**Invariants**:

- **I1** A passage holds at most one mark, and at most one of {mark, translation container} is visible.
- **I2** A mark exists only while one of its passage's parts is queued-for-dispatch, in flight, or
  awaiting its result. It never outlives the run (FR-021).
- **I3** The mark node and the translation container are the same node (conversion in place, R3), so
  restoration removes it exactly once.
- **I4** A mark never appears for a passage whose state is `skipped` (FR-006) or which is outside the
  demand window (FR-012).
- **I5** Removing every mark is a prefix of restoring the page: after `restore`, no `[data-ipt]`
  element remains (FR-023).

---

## 4. QueuedBatch (dispatch entry)

One outbound request waiting to be started, or in flight. Held by the pump, not the job.

| Field | Type | Notes |
|---|---|---|
| requestId | string | `${jobId}_${n}`, unique per run — the existing scheme. |
| units | `TranslationUnit[]` | 1..n parts, all from passages inside the demand window when planned (FR-014). |
| group | `visible \| lookahead` | The group of the *best* passage it serves; decides its place in the order. |
| sequence | number | Monotonic per run; breaks ties inside a group so a re-sort is stable and testable. |
| phase | `queued \| started \| settled` | Only `queued` entries may be reordered or dropped; `started` entries are immutable (R5). |

**Transition rules**:

| From | Event | To | Consequence |
|---|---|---|---|
| — | passages enter the window | `queued` | Marks shown for those passages (FR-001), budget not yet reserved |
| `queued` | a slot is free | `started` | Budget reserved per part; refusal removes the mark and marks the part skipped (FR-019) |
| `queued` | window moves | `queued` | Re-sorted by group then sequence; never cancelled (R5) |
| `started` | reply applied | `settled` | Marks removed or converted; translations rendered in place (FR-003) |
| `started` | failure | `settled` | Mark removed, part failed, failure reported once (FR-022) |
| `queued` | run cancelled | dropped | Marks removed; parts cancelled (FR-024) |
| `started` | run cancelled | aborted | Abort signal reaches the provider call; marks removed |

---

## 5. OpenRun

One page's translation run. Reuses `RunSlot` and `TranslationJob` from feature 005; nothing in the
slot's decision table changes.

| Field | Type | Notes |
|---|---|---|
| slot | `RunSlot` | Same claim/absorb/settle rules (FR-025). |
| job | `TranslationJob` | Owns units, journal, renderer, budget. One per page at a time. |
| watcher | viewport watcher | Started with the run, stopped on stop or restore. |
| pump | dispatch queue | Drained by demand, not by "the end of the page". |
| roundsInFlight | number | At most one round's planning runs at a time; a window change during a round schedules the next round. |

**Lifecycle**:

```text
idle --activate--> running(round 1 published) --> running(idle between rounds) --> ...
running --demand drained--> (run stays open; reported "completed" for what the reader reached)
running --reader scrolls--> running(next round)
any     --cancel--> cancelled (marks removed, translations kept, restorable)
any     --turn off--> restored (journal replayed, slot reset, watcher stopped)
any     --failure--> failed (first failure reported once; marks removed for failed passages only)
```

**The invariant that matters**: at most one `TranslationJob` and therefore at most one `Journal` ever
exists for a page (005's rule). Windows are rounds inside it, not runs.

---

## 6. What is deliberately *not* modelled

- **No per-passage persisted record.** Passages are re-derived by segmentation on the next page load;
  nothing about a reader's position, demand or queue survives a reload (out of scope).
- **No new unit state.** `UnitState` keeps its six values; "pending" is a *render* state of a passage,
  derived from its units, so no consumer of unit state has to learn a new value.
- **No new message or status field.** `JobStatusPayload` is unchanged; counts keep their meaning and
  simply grow as later rounds complete (R9).
- **No budget model change.** `VolumeBudget.tryReserve` is still called per part at dispatch, so a
  passage that never enters the window is never reserved, and a refusal still sets `reached`
  (FR-019).

---

## Validation rules

| Rule | Source |
|---|---|
| A mark may only exist for a passage with at least one part in `queued` or `translating` | FR-001, I2 |
| A passage in state `skipped` never carries a mark | FR-006, I4 |
| A passage outside the demand window is never dispatched, marked or reserved | FR-010, FR-012 |
| A dispatched part is never dispatched again in the same run | FR-020 |
| A part's budget is reserved exactly once, at dispatch | FR-019, §6 |
| `data-ipt-style` is never written on a mark node | FR-005 |
| Every `[data-ipt]` node is journalled before it is inserted | FR-009, I3 |
| Restoring leaves zero `[data-ipt]` nodes and a DOM hash equal to the pre-translation capture | FR-023, SC-007 |
| A failed part yields no mark and no text in the translation slot | FR-022 |
| The lookahead is one viewport height and is not read from storage | FR-010, FR-034 |

---

## State transition: one passage, end to end

```text
outside window                  (no mark, no charge)
   | reader scrolls toward it / it arrives in the lookahead
   v
in window, queued               mark inserted (journalled), no request yet
   | a batch containing it starts
   v
dispatching                     budget reserved; refusal --> skipped, mark removed
   | provider answers
   +--> translated: mark node becomes the translation (text, lang, style, typography)
   +--> failed:     mark removed, nothing in the slot, failure recorded once
   |
   v
settled                         passage shows exactly one of {translation, nothing}
```
