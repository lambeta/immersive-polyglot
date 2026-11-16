# Contract: The Dispatch Queue

**Feature**: 007-progressive-translation | **Status**: ratified by this plan | **Version**: 1

One sentence: **what the reader is looking at goes first, what has already been sent is finished, and
nothing is ever sent twice.**

---

## 1. Structure

```text
DemandPump
├── queued   : QueuedBatch[]   ordered; only these may be reordered or dropped
├── started  : Map<requestId, QueuedBatch>   immutable until settled
└── ceiling  : provider.maxConcurrency
```

## 2. Ordering

1. `queued` is ordered by (group, document order), group ∈ {visible, lookahead} (FR-013).
2. On every window change, `queued` is re-sorted to the new order. `started` is never touched.
3. Sorting MUST be stable and MUST be observable from outside (a test asserts the sequence of
   `requestId`s that reach the provider).

## 3. Concurrency

1. At most `ceiling` batches are `started` at any moment.
2. A batch is started only when a slot is free; the pump then takes the head of `queued`.
3. Every started batch goes through `RequestLimiter.run()`, which remains the hard ceiling. The pump
   never hands it more than it can start, so its internal FIFO stays empty on this path (R6).

## 4. Cancellation and failure

| Event | Effect on `queued` | Effect on `started` |
|---|---|---|
| reader cancels | dropped; their marks removed | aborted through the job's controllers |
| translation turned off | dropped; journal replayed | aborted before replay, so a late reply cannot render |
| a batch fails | untouched | settled; that batch's passages marked failed, marks removed |
| cap refuses a part | untouched | settled; the part is skipped, its mark removed |
| window moves away | **untouched** (R5): still dispatched in the new order | untouched |

1. A failure of one batch MUST NOT cancel the rest of the queue (FR-022).
2. A request that has been started MUST NOT be cancelled because its passage left the window (R5).
3. A passage left behind by a fast scroll keeps its mark until its translation arrives, and MUST end in
   that translation rather than being dropped.

## 5. What the queue guarantees

1. **No duplicate charge**: a part appears in at most one batch per run (FR-020).
2. **No stranded mark**: every mark created by this queue is ended by a settlement or a cancellation
   (FR-021).
3. **No unbounded work**: the number of `started` batches is bounded by the ceiling, and the number of
   `queued` batches is bounded by the passages inside the window.
4. **No starvation**: within a group, order is document order, so the passage nearest the reader's eye
   is never behind a passage further down it.

## 6. Observability

A test can observe, without reaching into internals: the `requestId`s that reached the provider, the
order they arrived in, the passages each carried, and the peak number started at once. Those four
signals are what SC-002, SC-004, SC-005 and FR-014 are judged on.

Requirement mapping: FR-013..FR-016, FR-020..FR-022, FR-024, SC-002, SC-005.
