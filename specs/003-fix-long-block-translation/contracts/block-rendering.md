# Contract: Block Rendering

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Data model**: [data-model.md](../data-model.md)

This contract fixes the observable DOM behaviour of a translated source block. It refines feature
001's [rendering contract](../../001-llm-web-translator/contracts/rendering-dom.md) for the case where
one block is translated in several parts. Where the two disagree about how many translations a source
block may own, this document wins.

## 1. Invariants

An observing reviewer, given only the rendered page and its DOM, must be able to check every
obligation here.

| # | Obligation | Requirement |
|---|---|---|
| C1 | A source block has **exactly one** translation container at any time, however many parts it was translated in. | FR-001, FR-002 |
| C2 | The container is a block-level element (`div`) marked `data-ipt="target"`, carrying the target language in `lang`, with `data-ipt-unit` set to the block id. | FR-014 |
| C3 | The source block is marked `data-ipt="source"` with the same block id; it is not moved, wrapped, re-parented, truncated or rewritten. | FR-001, FR-014 |
| C4 | The container's text is the composition of every contributing part, in ascending part position, joined by exactly one space; it contains no markup and no placeholder. | FR-001, FR-002, FR-012 |
| C5 | The container is placed by the existing mode rules: sibling after the source (bilingual), sibling before it (above), or sibling after with the source hidden (only); for `LI`, `TD`, `TH`, `DD`, `DT`, `CAPTION` and `SUMMARY`, inside the source. | FR-005, FR-006 |
| C6 | Exactly one insert is journalled per rendered block; in-place text growth adds no journal entries. | FR-007 |
| C7 | Turning translation off removes the container, restores every source attribute and leaves zero `data-ipt` residue and the baseline DOM fingerprint. | FR-007 |

Block id: the unit id of the part with the lowest position, known at collection time. It is an
internal marker, not a new persisted identifier, and it is stable while the page content is stable.

## 2. Composition

Given parts P0..Pn-1 with positions 0..n-1 (not necessarily all contributing):

1. Drop every part whose translation is absent, empty, failed or cancelled.
2. Trim each remaining translation.
3. Sort the remaining parts by position.
4. Join them with one U+0020 space.

Examples:

| Parts (position: translation) | Composed text |
|---|---|
| 0: "Alpha.", 1: "Beta." | `Alpha. Beta.` |
| 0: "Alpha.", 1: (failed), 2: "Gamma." | `Alpha. Gamma.` |
| 1: "Beta." only (0 still translating) | `Beta.` — a partial block, allowed while the run is active |
| none contributing | nothing rendered |

The composition is a function of the part set, not of arrival order: replaying the same part
translations in any order MUST yield the same string.

## 3. Update semantics

- First contributing part: insert the container, apply attributes, inherit typography, place it, and
  journal the insert and attributes.
- Later contributing part for the same block: **update the existing container's text in place**. Do
  not remove it, do not insert a second one, do not move it, and do not re-run typography
  inheritance.
- Re-rendering the same block with the same contributing parts is idempotent: the DOM ends identical
  and the journal does not grow.
- A part that arrives after a later part still lands in the correct position, because composition
  sorts by part position.

The composed text is monotonically non-decreasing while the run is active (V5 in the data model): an
already-contributing part is never dropped from a later composition.

## 4. Display modes

- `bilingual`: container after the source; source visible.
- `above`: container before the source; source visible.
- `only`: container after the source in DOM order; source hidden exactly once with `hidden` plus
  `display:none`, both journalled.
- Switching modes moves the existing container and toggles the source's hidden state; the composed
  text is unchanged. Switching while parts are still arriving MUST end in the same final composition
  as switching after they arrive.
- Repeated switches MUST NOT accumulate containers or journal entries beyond the first render and the
  attribute records of the switch.

## 5. Duplicates

- Every occurrence of an identical source block is its own source block with its own container.
- A duplicate block composes its text from the original parts' translations, in the same positions,
  and sends no request of its own.
- Registering a duplicate MUST keep all of its parts: identity is (element, part position), not
  element alone.
- A duplicate that shares only one part with an original (for example one sentence repeated inside a
  different paragraph) composes only that part; it MUST NOT borrow the original block's other parts.
- A repeated sentence inside one block is reproduced as many times as it occurs.

## 6. Partial results, failures and cancellation

- A failed or empty part is absent from the composition; the other parts still render in order.
- The block is not hidden merely because one part failed.
- No ellipsis, placeholder, "unavailable" text or partial markup is inserted.
- The run's existing failure state and failure message remain the reader-visible signal; this feature
  adds no new interface text.
- Cancellation leaves already-composed text on the page, never fabricates the cancelled parts, and
  leaves restore able to unwind the one container.

## 7. Restore

- The journal holds one insert per block, the container's attribute records, the source's attribute
  records and the source's style record (only in `only` mode).
- Replaying it in reverse removes the container, restores the source's attributes and style, and
  returns the scroll position held by the caller.
- The restored DOM fingerprint MUST equal the fingerprint taken before translation, including after a
  partial or cancelled run.
- No `data-ipt` or `data-ipt-unit` residue remains; the residue counter is zero.

## 8. Accessibility, find and layout

- The complete translation is one element with one text node, so a screen reader reads the block's
  translation continuously in the target voice and the browser's find feature locates text in every
  part.
- No `aria-hidden`, `role` or `tabindex` is added by this feature.
- Typography is inherited once from the source; a longer composition MUST NOT clip, overlap a
  neighbour, or introduce horizontal page scroll, including for a translation 30 percent longer than
  the source.
- Right-to-left targets keep correct order and alignment through the existing placement rules; this
  feature adds no direction assumptions.

## 9. Test obligations

| Obligation | Test | Type |
|---|---|---|
| C1, C2, C3, C4 | long abstract: one container, every sentence once, source order | jsdom |
| C4 | reversed and shuffled arrival gives identical text | jsdom |
| C3, C4 | single-part block unchanged | jsdom / existing |
| C5 | bilingual, above, only placement of a split block | jsdom |
| C6 | journal holds one insert for a four-part block | jsdom |
| C7 | restore after complete, partial and cancelled runs matches baseline hash | jsdom |
| C4, C5 | duplicate long block both occurrences complete | jsdom |
| C4 | repeated sentence inside one block reproduced | jsdom |
| C4, C6 | partial failure: successful parts visible, no placeholder, one insert | jsdom |
| C2, C6 | a growing block keeps its `data-ipt-style` and feature 002's style switch still works | jsdom |
| C1..C7 | reported page through the real extension and real storage | e2e |
| C1, C2, C7 | same on the authored long-block fixture in all three modes | e2e |
