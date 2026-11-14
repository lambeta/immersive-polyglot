# Phase 1 Data Model: Complete Translation of Long Source Blocks

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contract**: [block-rendering.md](./contracts/block-rendering.md)

## Scope

Everything in this model is **ephemeral**. Nothing is added to `chrome.storage`, to the settings
schema, or to any message payload. A translation run lives in the content script and is discarded on
restore or page unload, exactly as today's unit list is. The only persisted artifact this feature
touches is the test fixture set on disk.

## Entities

### Source Block

A leaf passage of readable page content that the reader perceives as one paragraph.

| Field | Type | Notes |
|---|---|---|
| element | Element | The DOM node; its identity keys the rendered block. Never moved or rewritten. |
| parts | Ordered list of Translation Part or Duplicate Part | Ordered by `partIndex`; one entry per collected unit or duplicate occurrence. |
| rendered | Rendered Block or null | Present once at least one part has a translation. |

A Source Block is not stored or serialized; it exists as the grouping of parts that share one
`domRef`.

### Translation Part

The existing Translation Unit, extended with its position in its block.

| Field | Type | Notes |
|---|---|---|
| id | string | Stable unit id, position plus content hash (feature 001). |
| sourceText | string | The part's source text, already whitespace-normalized. |
| **partIndex** | number | **New.** 0-based position within the source block; the concatenation of parts in this order is the block's complete translation. |
| sourceLang / targetLang | string | As today. |
| translatedText | string? | Present once a real translation arrives; never cleared. |
| state | UnitState | queued, translating, translated, failed, skipped, cancelled. |
| errorClass / skipReason | enum? | As today. |
| attempts | number | As today. |
| domRef | Element? | The source block element (unchanged). |

**Ordering rule**: two parts of the same block never share a `partIndex`. When the page is
re-segmented unchanged, ids and parts repeat exactly, so the aggregate is idempotent.

### Duplicate Part

A later occurrence of a text already translated elsewhere (feature 001, FR-011).

| Field | Type | Notes |
|---|---|---|
| unitId | string | Identity of this occurrence. |
| ofUnitId | string | The Translation Part whose translation is reused. |
| **partIndex** | number | **New.** Position within *this* duplicate source block; matches the part's position in the original block. |
| element | Element | The duplicate Source Block's DOM node. |

**Identity rule**: a duplicate entry is unique per (element, partIndex). This is what allows a
repeated long block to register four parts instead of one.

### Block Aggregate

The job's ephemeral grouping used to compose a block's text.

| Field | Type | Notes |
|---|---|---|
| element | Element | Key of the aggregate. |
| parts | Translation Part[] | Built during collection; ordered by `partIndex` at render time. |
| duplicates | Duplicate Part[] | Only for duplicate blocks. |

There is one aggregate per source element; no aggregate crosses blocks.

### Rendered Block

The one container the product presents for a source block.

| Field | Type | Notes |
|---|---|---|
| container | HTMLElement | `div`, marked `data-ipt="target"`, carries the target language. |
| source | Element | The block it belongs to; marked `data-ipt="source"` and `data-ipt-unit` = block id. |
| text | string | Non-empty composition of translated parts joined by one space. |
| displayMode | bilingual / above / only | Placement follows the existing rules; `only` hides the source once. |
| hidden | boolean | Whether the source is currently hidden. |
| journal | one insert + attributes | Recorded once, at first render. |

**Block id**: the unit id of the part with the lowest `partIndex`, known at collection time before
any translation arrives. It identifies the rendered block in `data-ipt-unit`, does not change as
parts arrive, and is not a new persisted identifier.

### Restore Record

The existing Journal entries for the block: one insert of the container and the attribute records for
the container and the source. In-place text growth adds no entries.

## Relationships

```text
Source Block 1 ──< Translation Part   (partIndex orders them)
Source Block 1 ──< Duplicate Part     (only when the block repeats existing text)
Duplicate Part >── 1 Translation Part (reuses its translatedText)
Source Block 1 ── 0..1 Rendered Block (one container, composed from parts)
Rendered Block 1 ──< Journal entries  (one insert, attributes)
```

A Translation Part belongs to exactly one Source Block. A Duplicate Part belongs to exactly one
Source Block and points at exactly one Translation Part. A Source Block has at most one Rendered
Block.

## Validation Rules

- **V1**: Only parts whose state is `translated` and whose `translatedText` is non-empty contribute
  text. A failed, empty, skipped or cancelled part contributes nothing.
- **V2**: Parts compose in ascending `partIndex`. Two parts of one block with the same index are a
  collection defect and MUST be rejected in tests, not silently ordered by arrival.
- **V3**: A block renders only when at least one part contributes text; an empty composition renders
  nothing.
- **V4**: A source block has at most one container at any time. Updating the block replaces the
  container's text and keeps its identity.
- **V5**: The composed text never shrinks while the run is active: a part's `translatedText` is not
  cleared and a later composition includes every earlier contributing part.
- **V6**: The container carries the run's target language; the source block carries no language
  change from this feature.
- **V7**: A duplicate block's composition uses the original parts' `translatedText`; it never sends
  its own request.
- **V8**: Restore removes the one container and restores every journalled attribute, leaving the
  baseline DOM hash and no `data-ipt` residue.

## State Transitions

**Part**: `queued → translating → translated | failed | cancelled`, or `queued → skipped` (cap,
same language, code, navigation). Terminal states never change.

**Block** (derived, not stored):

| State | Condition | Rendering |
|---|---|---|
| empty | No part contributes text | No container |
| partial | Some parts contribute, others still queued/translating | Container with the contributing parts in order |
| complete | Every part is terminal and contributes text | Container with the full passage |
| incomplete | Every part is terminal, at least one failed/cancelled/skipped, at least one contributes | Container with the successful parts in order |
| failed | Every part is terminal, none contributes | No container; the run reports the failure |

`partial` is allowed on the way to `complete`; it is never treated as final. Leaving a block partial
when the run ends is the `incomplete` state, and it is visible as a shorter passage rather than
fabricated text.

## Persistence

None. The model introduces no storage key, no schema version, no message field and no settings
change. The only file artifacts are the fixtures described in the quickstart, which live under
`tests/fixtures` and never ship in `dist/`.
