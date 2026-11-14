# Phase 0 Research: Complete Translation of Long Source Blocks

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-14 | **Plan**: [plan.md](./plan.md)

Each decision records what was chosen, why, and what was rejected. The reproduction below was run
with the product's own modules against a verbatim copy of the reported page's front matter, before
any design was written.

## Reproduction of the defect

Page: https://martinfowler.com/articles/tests-as-data.html, observed 2026-11-14.

- The abstract is one paragraph of 996 characters, inside the article's front matter.
- Segmentation produced four translation units for it: 213, 324, 212 and 247 characters.
- All four completed with a translation. After rendering them, the page held **one** translation
  container for the abstract; the last unit to render had removed the other three.
- In translation-only placement the source paragraph is hidden, so three quarters of the abstract
  were not readable anywhere on the page.
- The same page produced a second, independent loss for a repeated long block: duplicate entries were
  keyed by element, so only the first part of a repeated long paragraph was ever registered.

## R1. Fix the presentation, not the segmentation

**Decision**: A long block keeps being split into sentence-grouped parts and sent as separate units,
exactly as feature 001 decided. The fix is confined to how the results of those units are presented.

**Rationale**: The split exists for translation quality and request sizing (feature 001, FR-010) and
is not the defect. Changing it would alter request count, batching, cost and prompt behaviour — all
outside this specification's scope. The reproduction shows every part *was* translated; only one was
left on the page.

**Alternatives considered**:
- *One request per whole block*: changes request sizing and cost, reintroduces over-long requests, and
  contradicts the scoped-out segmentation change.
- *Translate parts but keep only the longest*: still loses content.

## R2. One translation container per source block, updated in place

**Decision**: A source block owns exactly one translation container. When more parts of that block
become available, the existing container's text is replaced with the newly composed passage. The
container is never removed and re-created, and a second container is never inserted for the same
block.

**Rationale**: FR-001 requires one uninterrupted passage and FR-014 requires one accessible passage
carrying the target language. A container per part would be contiguous visually but would fragment
the accessibility tree and the browser's find behaviour, and the existing rendering contract already
says a translation belongs to exactly one source block. Updating in place also avoids flicker,
selection loss and journal churn.

**Alternatives considered**:
- *A sibling container per part, ordered after the source*: contradicts "one passage"; produces N
  blocks per paragraph and N screen-reader stops.
- *Remove and re-insert the container on every part, with the joined text*: visually identical in a
  screenshot, but discards the node on every arrival (focus, selection, animation), journals several
  inserts, and re-runs typography inheritance.
- *Leave each part in its own container and hide all but the first*: still only one visible part.

## R3. Source order is an explicit part position

**Decision**: A translation unit carries a 0-based `partIndex` giving its position within its source
block, and a duplicate entry carries the position it stands in for. Composition sorts by that index.

**Rationale**: FR-003 requires the result to be identical regardless of arrival order. Batching runs
requests concurrently, so arrival order is not document order. Relying on the order in which the job
happened to collect units makes correctness an accident of timing and cannot be stated in a test.
The field is ephemeral and never persisted, so it adds no storage or migration obligation.

**Alternatives considered**:
- *Rely on collection order*: true today because segmentation walks document order, but invisible in
  the domain model and fragile once late content or a second collection pass is involved.
- *Sort by the numeric prefix of the unit id*: couples the renderer and the job to an id format that
  exists for a different purpose (stable identity), and breaks if the format changes.
- *Persist the index*: unnecessary; a translation run does not survive a reload.

## R4. Join parts with a single space

**Decision**: Trim each translated part and join the non-empty parts with one U+0020 space.

**Rationale**: The segmenter normalizes the source block's whitespace before splitting, so the
original separation between parts is a single space. Latin target languages need that boundary; CJK
targets tolerate it. A space is the only separator that reconstructs the source's own phrasing.

**Alternatives considered**:
- *Concatenate with no separator*: glues Latin sentences into one word.
- *Insert a line break or paragraph per part*: invents paragraph structure the source block did not
  have and changes the visual rhythm the reader saw in the original.

## R5. Duplicate entries are keyed per element and part position

**Decision**: A duplicate block keeps one entry per source part it reproduces. Registration is keyed
by (element, part position), not by element alone, and duplicate blocks are composed through the same
ordered join as ordinary blocks.

**Rationale**: The current per-element key keeps only the first part of a repeated long paragraph, so
even a corrected renderer would show a quarter of the duplicate. Feature 001's promise (FR-011) is
reuse of translation work, not partial reuse of a block. Keying on part position also preserves a
legitimately repeated sentence inside one block, which a key on the source unit alone would collapse.

**Alternatives considered**:
- *Key on element alone (status quo)*: loses every part after the first.
- *Key on the source unit alone*: collapses two occurrences of the same sentence inside one block into
  one.
- *Re-request duplicates*: contradicts FR-013 and the product's cost promise.

## R6. Failed, empty or cancelled parts are absent, never replaced

**Decision**: A part that fails, returns empty, or is cancelled is left out of the composition. The
other parts still render in order, the block may show a subset, and no placeholder or invented text
is inserted. The run's existing failure state keeps reporting the failure.

**Rationale**: FR-012 and the product's honesty rule (feature 001, FR-020) forbid presenting anything
as a translation that is not one. Hiding the whole block because one part failed would discard real
translations the reader could use.

**Alternatives considered**:
- *Hide the block until every part succeeds*: loses usable translation and makes a slow part look like
  a broken page.
- *Mark the missing part with an ellipsis or "translation unavailable"*: fabricates page content and
  adds a user-visible string this feature does not introduce.

## R7. Journal and restore stay one insert per block

**Decision**: The container is inserted and journalled once, when the block first has text. Later
text growth mutates the container's own text node. Attributes are journalled when first applied. No
new journal entry kind is introduced.

**Rationale**: FR-007 and feature 001's SC-008 require exact restore. Because the container is ours
and is removed by replaying its insert, mutating its text needs no inverse. Recording each text change
would grow the journal without improving restoration. Feature 002's `data-ipt-style` is applied when
the container is created and is untouched by a text update, so style switching keeps working on a
block that is still growing.

**Alternatives considered**:
- *Journal every text update*: no restoration benefit; a larger journal for a long run.
- *Re-create the container per update and journal each insert*: R2 already rejects the churn; replay
  would still work but the journal would hold redundant nodes.

## R8. Verification is test-first, with a captured page and real boundaries

**Decision**: The regression is proven in three layers:
1. a jsdom test that runs the job over a long abstract and asserts one container containing every
   sentence in order, plus a variant that delivers replies in reverse order;
2. a verbatim capture of the reported page's front matter in the fixture set, used by an e2e test
   through the real extension, real `chrome.storage.local` and the local stub provider;
3. one manual check on the live page in real Chromium, recorded with mode, viewport and date.

**Rationale**: Constitution principles II and III require a failing test first and verification at the
real boundaries. The capture makes SC-001 decidable offline without letting a live page's changes
redefine correctness; the e2e run proves the wire; the manual check proves the real deployment.

**Alternatives considered**:
- *Only an e2e test against the live URL*: network-dependent, non-deterministic, and redefines
  "correct" whenever the site changes.
- *Only a jsdom test*: does not exercise real storage, the real content script or real HTTP.
- *Screenshot comparison alone*: cannot state "every sentence exactly once".
