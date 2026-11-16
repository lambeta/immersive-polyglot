# Contract: The Demand Window

**Feature**: 007-progressive-translation | **Status**: ratified by this plan | **Version**: 1

One sentence: **a passage may be requested only while the reader is about to read it.** This contract is
the gate; it is checked before a request and before a mark, and it is the only reason a passage with
readable text is ever left alone.

---

## 1. Geography

| Term | Meaning |
|---|---|
| visible area | the part of the document the reader can see now |
| lookahead | the span from the bottom of the visible area down to **one viewport height** below it |
| demand window | visible area ∪ lookahead |

The lookahead is a fixed constant (`DEMAND_LOOKAHEAD_RATIO = 1`). It MUST NOT be read from storage, MUST
NOT appear in the settings page, and MUST NOT be exposed as a message field (FR-034).

## 2. Predicate

A passage is in demand when its measured rectangle satisfies:

```text
bottom > visible.top   AND   top < visible.bottom + lookaheadHeight
```

Consequences, each stated as a rule:

1. A passage any part of which is visible is in demand, whatever its height (a passage taller than the
   screen included).
2. A passage entirely between the visible bottom and one viewport below is in demand, in the lookahead
   group.
3. A passage entirely above the visible top is **not** in demand until the reader scrolls back to it.
4. A passage below the lookahead boundary is **not** in demand.
5. A passage whose measured rectangle has zero height (collapsed container, `display: none`, hidden
   ancestor) is **not** in demand, and neither is one inside it.

## 3. Order

1. Passages in the visible group are dispatched before passages in the lookahead group (FR-013).
2. Inside a group, passages are dispatched in document order of their first part.
3. A re-sort on window change MUST be stable: two batches in the same group keep their relative order.

## 4. When the window is re-evaluated

Scrolling, paging, anchor jumps, window resize, zoom change, font load that changes metrics, content
arriving, and the tab becoming visible again. Evaluation is coalesced to at most one pass per animation
frame; no evaluation may walk the whole page (SC-012).

## 5. Page visibility

1. While the page is not visible to the reader (background tab, minimised window) no new passage is
   requested and no new mark is inserted.
2. Requests already in flight are not cancelled.
3. When the page becomes visible, the window the reader then sees is evaluated and dispatched.

## 6. Interaction with the rest of the run

| Situation | Rule |
|---|---|
| Volume cap | applied per part at dispatch; a refused part loses its mark, the cap notice is unchanged (FR-019) |
| Repeated text already translated inside the window | filled from the original, no request, no waiting (FR-015) |
| Late content | collected when it arrives, requested when it enters the window (FR-018) |
| Selection translation | the selected passages are the window, regardless of visibility (FR-035) |
| Page shorter than the window | every passage is in demand at once — today's behaviour (FR-017) |
| Passage already translated | never re-evaluated into the queue (FR-020, FR-004) |

## 7. Prohibitions

1. MUST NOT request, mark or reserve a passage outside the window.
2. MUST NOT request the same passage twice in one run.
3. MUST NOT widen the window to make a request cheaper — a wider window is a cost defect, not an
   optimisation.
4. MUST NOT segment the page again to answer "what is in the window"; segmentation is whole-page and
   once (R1).

Requirement mapping: FR-010..FR-020, FR-031, SC-002, SC-004, SC-005.
