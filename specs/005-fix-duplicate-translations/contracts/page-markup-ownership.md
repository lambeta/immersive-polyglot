# Contract: Page Markup Ownership

**Feature**: 005-fix-duplicate-translations | **Status**: ratified by this plan | **Version**: 1

The product writes markers into someone else's page. This contract states who may write them, who may
read them, and — the rule this feature exists to enforce — that **product output is never source text**.

It documents and tightens a convention feature 001 introduced (`data-ipt`) rather than inventing a new
one; no rendered output, stylesheet or message shape changes.

---

## 1. Markers

| Marker | Value | Owner (writer) | Meaning |
|---|---|---|---|
| `data-ipt` | `"target"` | renderer | the element **is** a rendered translation container |
| `data-ipt` | `"source"` | renderer | the element is a page block that owns a translation |
| `data-ipt-unit` | unit id | renderer | which unit the element belongs to |
| `data-ipt-style` | style id | renderer | which display style is applied |
| `data-ipt-position` | `"before"` | renderer | translation placed above its source |
| `data-ipt-conceal` | `"true"` | renderer | blur/study-mode concealment is active |

Definitions live once, in `src/content/markers.ts`. The renderer imports them and re-exports them, so
existing imports keep working; the segmenter and the observer import them directly. No module may
repeat these literals (R4).

## 2. Ownership matrix

| Module | `data-ipt="target"` | `data-ipt="source"` | Other `data-ipt-*` |
|---|---|---|---|
| renderer | writes, rewrites text, restyles, removes via journal | writes | writes |
| restorer | removes on replay; removes on residue audit | attribute replay only (never removes the element by choice) | restores |
| segmenter | **MUST prune the subtree and read no text from it** | reads as page text (it is a page block) | ignores |
| observer | MUST ignore it as new content | MUST ignore it as new content | ignores |
| stylesheets | may target it | may target it | may target it |

## 3. Segmentation contract

1. A `data-ipt="target"` element MUST NOT become a segmentation unit, a duplicate entry, a skipped
   passage, or a source-text contribution to an ancestor's text.
2. The prune MUST be silent: it MUST NOT increment the skipped count, MUST NOT create a unit, and MUST
   NOT require a new `SkipReason` value or a new locale string.
3. The prune MUST happen before any text is read from the element (top of the walk), so no substring of
   a translation can reach a provider.
4. A page that contains no product markers MUST segment exactly as it does today — same units, same ids,
   same order, same skip count.
5. Pruning MUST NOT hide page content: `data-ipt="source"` elements are page text and MUST remain
   eligible for segmentation once their marker is replayed away.

Requirement mapping: FR-005 (never translate a translation), FR-017 (late content), FR-004 (one
translation per passage), FR-019 (no new strings).

## 4. Rendering contract (unchanged, restated because the guard depends on it)

- One container per source block per run. A second translation write for the same block rewrites the
  container's text; it never builds a second container.
- For `LI`, `TD`, `TH`, `DD`, `DT`, `CAPTION` and `SUMMARY` the container is placed **inside** the
  source element; for every other block it is placed as a sibling. This is why the segmentation prune
  is load-bearing: an ancestor with a container child has a block descendant and would otherwise lose its
  own text from later passes.
- Every write goes through the journal at the moment it is made.

## 5. Restoration contract

1. Journal replay is the **only** mechanism by which the product removes what it added.
2. The residue audit (remove any remaining `[data-ipt]` node) is a last resort for foreign clones, not
   the primary path, and never a substitute for a correct journal.
3. Because the audit cannot distinguish a translation container from a page block that merely carries
   `data-ipt="source"`, the product MUST hold the **single-journal invariant**: at most one run's journal
   has ever written to a page. Replacement replays the previous journal before the new run writes
   (research R5).
4. After restore, no `[data-ipt]`, `data-ipt-*`, `lang`, `dir`, `tabindex` or `style` value the product
   wrote may remain, and the structural `domHash` of the page MUST equal the pre-translation capture.

## 6. Conformance

| Check | Where |
|---|---|
| Product output yields no unit and no skip count | `segmenter.test.ts` (new cases) |
| A page without markers segments identically | `segmenter.test.ts` (existing cases stay green) |
| A source inside a container tag keeps its text available after marker replay | `restorer.test.ts`, `job-repeat.test.ts` |
| Restore leaves zero residue and an equal hash | `restorer.test.ts`, `repeat-translate.spec.ts` |
| Observer does not re-translate product mutations | `observer.test.ts` (existing cases stay green) |
| No module repeats the marker literals | `grep`-style review + `typecheck` |
