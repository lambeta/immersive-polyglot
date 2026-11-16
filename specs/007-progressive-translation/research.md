# Phase 0 Research: A Loading Mark on the Passage Being Translated, and Translation Requested on Demand

Each decision records what was chosen, why, and the alternative that was rejected. Nothing in this
feature is left as NEEDS CLARIFICATION.

**One recorded gap, carried here deliberately**: the clarify session of 2026-11-15 settled the panel's
resting state and then ended before the second question — what happens to work already set in motion
for a passage the reader has scrolled past — was answered. R5 settles it at the recommended option and
lists the rejected alternatives, so the decision is visible and reversible rather than buried.

---

## R1 — The gate is at dispatch, not at segmentation

**Decision**: Keep segmenting the whole page once, on activation, exactly as today. A passage becomes
*requestable* only at dispatch time, when the demand window (R2) says the reader is about to read it.
Segmentation still produces units, ids, duplicates and skip reasons for the entire document.

**Rationale**: Segmentation is local, synchronous and free of egress — it costs a tree walk and a
language guess, not a provider call. Segmenting only what is visible would make passage ids depend on
scroll position, so a passage translated at scroll 0 and re-derived at scroll 900 would be a different
unit; duplicate detection across the page would break (a repeated paragraph near the bottom would no
longer reuse the translation already at the top); and every scroll would re-walk the DOM and re-detect
language. Gating at dispatch closes the actual gap — the provider request — while leaving identity,
deduplication and skip reporting exactly as they are.

**Alternatives considered**:
- *Segment only the demand window, re-segment on scroll*: rejected — unstable ids, lost cross-page
  duplicate reuse, repeated language detection, and a DOM walk per scroll frame that SC-012 forbids.
- *Segment the page lazily by chunk with a cursor*: rejected — the cursor has to be maintained across
  mutations and routes; it is a second traversal state machine for no provider-side benefit.
- *Send the whole page but render lazily*: rejected — it is the cost defect the feature exists to
  remove (SC-004, FR-012).

---

## R2 — The demand window is visible plus one screenful below

**Decision**: A passage is in demand when its measured rectangle intersects the visible area, or lies
fully between the bottom of the visible area and one viewport height below it. The lookahead is a
fixed constant (`DEMAND_LOOKAHEAD_RATIO = 1` viewport height), not a stored preference.

**Rationale**: The window has two jobs — never pay for unread text, and never make ordinary scrolling
wait. One screenful is the smallest lookahead that satisfies the second: a reader scrolling at a normal
pace issues their next demand notification before the text arrives on screen. Above the visible area
the window is a strict boundary: a passage the reader has scrolled past is not "about to be read"
again unless they scroll back, at which point it re-enters the window and is already translated. The
asymmetry is deliberate — reading direction is downward, and paying to pre-translate what is behind
the reader is the same waste as paying for what is far below.

**Alternatives considered**:
- *No lookahead (visible only)*: rejected — the reader outruns the provider on every scroll; marks
  appear only after the text is already being read, which is the complaint that produced the mark.
- *Two or more screenfuls*: rejected — halves the saving on SC-004 and buys latency nobody can perceive
  on a normal connection.
- *Symmetric lookahead above and below*: rejected — doubles cost for a direction the reader is not
  moving, and FR-012 makes unread text a defect.
- *Make it a setting*: rejected — FR-034 forbids new settings, and a knob nobody asked for is
  complexity with a UI.

---

## R3 — One renderer; the mark is a journalled container that becomes the translation

**Decision**: `Renderer` gains `showPending(source, unitId)` and `settlePending(source)`, plus
`#pending: Map<Element, PendingRecord>`. A pending container is created by the same placement code
that places translations, carries `data-ipt="pending"` and `data-ipt-unit` (never
`data-ipt-style`), is journalled with `recordInsert` + `recordAttribute` + `recordStyle`, and is
**converted in place** by `renderUnit` — the node keeps its identity, gets the translated text, and
has `data-ipt` rewritten to `target`.

**Rationale**: "The mark is replaced by the translation in the same position" (FR-003) is then a
structural property, not a hope that two independently placed nodes coincide: one node, one insert
entry in the journal, one removal on restore. Conversion also avoids a remove-then-insert pair whose
replay order would be fragile, and it keeps the mark out of the fifteen display styles automatically,
because every style selector matches `[data-ipt-style=...]` and the mark deliberately never carries
that attribute.

**Alternatives considered**:
- *A separate progressive renderer beside the existing one*: rejected — two renderers means two
  journals and a "who owns this node" question at restore time, which is the exact defect class of
  005; also two placement codepaths to keep in step with three display modes.
- *A pseudo-element on the source block*: rejected — pseudo-elements cannot be journalled or removed
  by attribute replay, host pages style `::before`/`::after` themselves, and a source with
  `display: contents` has no box to attach to.
- *A text placeholder ("translating…")*: rejected — it reads as content, breaks the honesty rule, and
  needs a new translatable string, which FR-034 forbids.
- *A floating overlay positioned over the slot*: rejected — out of flow, wrong place in "only" mode,
  and it would overlap page text rather than hold the slot open.
- *Reusing the target container from the start (empty, then filled)*: this is essentially the chosen
  design; the only difference is that it must be labelled distinctly while empty so that no consumer
  treats an empty target as a translation. `data-ipt="pending"` is that label.

---

## R4 — Viewport watching: IntersectionObserver, coalesced, with an injectable seam

**Decision**: `viewport.ts` observes each passage element with one `IntersectionObserver` whose
`rootMargin` is one viewport height below, and listens for `scroll`, `resize`,
`visibilitychange` and zoom-driven metric changes. Notifications are coalesced to at most one per
animation frame. The observer factory is injected through the same `view`-shaped seam
`PageObserver` already uses, so jsdom tests drive it by hand.

**Rationale**: The browser computes intersection off the main thread and reports only changes, so the
work per scroll frame is proportional to passages entering or leaving the window, not to the number of
passages on the page — which is what SC-012 requires, and what a `getBoundingClientRect` loop over
300 passages per frame cannot satisfy. An initial synchronous measurement still happens once, so the
first marks are placed without waiting for a frame.

**Alternatives considered**:
- *A scroll listener plus a rAF loop measuring every passage*: rejected — O(passages) layout reads per
  frame; the classic scroll-jank source, and directly against SC-012.
- *A precomputed offset index with binary search*: rejected — it must be invalidated on every mutation,
  resize and font load; that is a cache with a correctness problem where the browser already has a
  correct implementation.
- *Polling on a timer*: rejected — wakes the page constantly, misses fast scrolls, and burns battery for
  no benefit.

---

## R5 — The dispatch queue: visible first, unsent work yields, sent work is never cancelled

**Decision**: Batches are queued in demand order (visible passages first, then lookahead, document
order within each group). Whenever the window moves, batches **not yet started** are re-sorted into the
new order; a batch **already sent** runs to completion and its passages are never re-requested. Nothing
outside the window is cancelled.

**Rationale**: A request that has left the building has already been charged to the reader's provider
account. Cancelling it wastes that charge and, because FR-020 forbids requesting the same passage twice
in a run, would either strand the passage or force a second charge to finish it. Holding the rest of
the queue still, by contrast, would put passages the reader left behind in front of the passages now on
screen — the latency this feature exists to remove. So: keep what is spent, reorder what is not.

**Alternatives considered**:
- *Strict FIFO, no reordering*: rejected — the reader's current screen waits behind text they already
  scrolled past, and a fast scroll would drain the queue in exactly the wrong order.
- *Cancel out-of-window requests and re-request on return*: rejected — pays twice for the same passage
  (FR-020), converts completed work into failures, and makes "one passage, one charge" untestable.
- *Cap the queue and drop overflow silently*: rejected — the passage would be left with a mark that
  never resolves, which FR-021 forbids.

**Flag for the reviewer**: this is the option recommended during clarification and not answered. If the
reviewer prefers C (abandon out-of-window work), FR-020 and FR-024 plus this decision change together;
nothing else in the plan depends on it.

---

## R6 — Concurrency: the pump gates submissions, the limiter stays the hard ceiling

**Decision**: `demand-pump.ts` holds the ordered queue and starts at most `provider.maxConcurrency`
batches at a time; each started batch is still wrapped in `RequestLimiter.run()`. The limiter therefore
always has an empty internal queue on this path, and remains the hard ceiling for every caller.

**Rationale**: Ordering and reordering (R5) are demand concerns; the limiter's contract is a FIFO with
a ceiling and a `cancelAll` path, unit-tested in 001 and relied on by the selection path. Adding
priority to it would change a published contract to serve one caller, and reordering a FIFO underneath
a running pump would make both layers guess at each other's state. Keeping the queue in the pump and
the ceiling in the limiter leaves each with one job, and the pump reads `limiter.inFlight` — the getter
that already exists — as its evidence.

**Alternatives considered**:
- *Priority inside `RequestLimiter`*: rejected — rewrites tested behaviour and would force every caller
  to reason about priorities it does not have.
- *Remove the limiter from the page path and let the pump be the only gate*: rejected — weakens a
  contract another path depends on, and the limiter is also the cancellation fan-out.
- *Unbounded submission, let the limiter's FIFO do the ordering*: rejected — the FIFO cannot reorder, so
  R5 would be unimplementable.

---

## R7 — The run stays open; `run()` keeps its old meaning

**Decision**: `TranslationJob.runDemand(window)` translates the queued passages inside a window and
resolves when that window is drained. `TranslationJob.run()` becomes
`runDemand(document-wide window)` — the exact whole-target behaviour it has today, so
`translateElements()`, the selection path and every existing DOM test keep their meaning. A page run
(`page-run.ts`) re-issues `runDemand` as the window moves, without a second `TranslationJob`,
without a second journal and without claiming the page's `RunSlot` again.

**Rationale**: A demand-driven page is a *sequence* of windows, not a different kind of translation.
Keeping one job means one journal, one renderer and one set of unit states — so 005's absorption rules
and 001's restoration invariant hold without restatement. Keeping `run()` as a named special case
avoids rewriting tests whose subject (translate this target, in full) is still the product's behaviour
for a short page, a selection and a single block.

**Alternatives considered**:
- *A new `PageTranslationJob` that owns windows and delegates batches*: rejected — two owners of unit
  state and two journals; restoration gets a "which one wrote this" question.
- *One job per window*: rejected — a new journal per window means turning translation off replays only
  the last window; the earlier windows' output would survive, breaking FR-023.
- *Keep `run()` whole-page and add a separate scroll path that calls `translateElements`*: rejected —
  that is today's late-content path, and it requests whatever arrives regardless of visibility
  (the behaviour FR-018 changes).

---

## R8 — Reading position: browser anchoring, plus a measured guard

**Decision**: Rely on Chromium's scroll anchoring as the primary mechanism, and add a small guard in
`scroll-anchor.ts`: before a batch's renders, record the rectangle of the first passage whose bottom
is below the viewport top; after the renders, if that rectangle moved by more than 2 px, scroll by the
difference. The guard runs once per batch, never per frame.

**Rationale**: Scroll anchoring normally does exactly this, and relying on it costs nothing — but it is
suppressed on pages that set `overflow-anchor: none` (the product itself sets it during restore) and
it can pick a different anchor after a large insert. SC-008 is a hard 4 px budget, so the product needs
a mechanism it controls. Measuring one rectangle before and after is O(1) per batch and corrects only
when the browser did not already compensate, so it cannot fight the user's own scrolling: during a
batch's renders the reader is not scrolling, and a zero delta is a no-op.

**Alternatives considered**:
- *Trust the browser only*: rejected — unverifiable on the very pages that disable anchoring, and
  SC-008 would hold only where the page cooperates.
- *Freeze all page scrolling while translating*: rejected — hostile; the reader must be able to scroll,
  and the marks exist precisely so they can scroll while work continues.
- *Insert translations from the bottom upward to reduce shifts*: rejected — it changes which passage
  fills first, contradicting R5's visible-first order, and still shifts everything below.
- *Reserve height with an empty block of fixed size*: rejected — a guess at the translation's height;
  wrong guesses produce worse jumps than none.

---

## R9 — Reporting: no new state, no new words

**Decision**: No new `JobState` value, no new string, no new panel control. A run reports
`translating` while a round is in flight and `completed` when the demand the reader has reached is
drained, with counts that keep growing on later rounds. Turning translation off stays the single
action. This is the answer recorded in the 2026-11-15 clarification (option A).

**Rationale**: The panel's existing vocabulary already describes what the reader sees — "Translating…"
while text is on its way, "Translated" once their screen is done. Introducing a "partly translated"
label would add a string, a state and a translation for every locale in order to describe a difference
the reader cannot see. The run's continued openness is an implementation fact, and a product that
narrates its own implementation facts leaks complexity onto the reader.

**Alternatives considered**:
- *Keep showing "Translating…" while the run is open*: rejected — the panel would say work is happening
  during long idle stretches, which is a lie of the same family as a mark that never resolves.
- *A new "Translated so far" label*: rejected — a new string and a new translation for every reader, to
  distinguish something the reader does not need distinguished (and FR-034 forbids it).
- *Report the count of passages still waiting below the fold*: rejected — meaningless to a reader who
  has not scrolled there, and it would imply work is owed for text they may never read.
