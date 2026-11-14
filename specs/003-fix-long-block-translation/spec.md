# Feature Specification: Complete Translation of Long Source Blocks

**Feature Branch**: `003-fix-long-block-translation`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "修复 https://martinfowler.com/articles/tests-as-data.html 正文摘要没有全部翻译的问题"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read an entire long abstract or paragraph, beside the original (Priority: P1)

A reader opens a long-form article whose abstract runs to about a thousand characters across four
sentences, and turns translation on with translations shown next to the original. The translation
beside that abstract must contain all of it: every sentence, in the order the author wrote it, as one
uninterrupted passage. On the reported article it does not. The product translates the abstract in
several parts, and only one of those parts survives on the page. The reader sees roughly a quarter of
the summary, with nothing on screen to say that the rest was translated and then discarded.

**Why this priority**: This is the reported defect and the worst kind of translation failure. A
reader who receives a fragment of a summary has no way to know what was omitted, and cannot trust any
other translation on the page. A visibly failed block would at least be honest; a silently truncated
one is not. Until every part of a block survives, no other improvement to this path matters.

**Independent Test**: Load a page whose abstract or paragraph runs to about a thousand characters and
is translated in several parts, translate it in bilingual placement, and confirm that the rendered
translation contains every source sentence exactly once, in source order, as one continuous passage
next to the source block.

**Acceptance Scenarios**:

1. **Given** the reported article and bilingual placement, **When** translation completes, **Then**
   the translation beside the abstract contains every sentence of the source abstract exactly once,
   in source order, as one continuous passage, with no other page content between its parts.
2. **Given** any readable block whose translation is requested in more than one part, **When** all
   parts complete, **Then** the rendered translation contains every part exactly once, in source
   order, and no part has removed or replaced another.
3. **Given** a page holding a block that fits in one translation part next to a block that needs
   several, **When** translation completes, **Then** each block has exactly one complete translation,
   the short block is unchanged in appearance, and neither block is duplicated.
4. **Given** the same page translated twice while the provider returns the parts in different orders,
   **When** translation completes, **Then** the rendered translation is identical in content and in
   order both times.
5. **Given** a completed translation, **Then** the source block has not been moved, wrapped in a new
   element, or rewritten, and the translation reads immediately next to it in the reading flow.

---

### User Story 2 - Translation-only mode shows the whole paragraph, not a fragment (Priority: P1)

A reader prefers translations instead of the original, so the product hides the source block and
shows only the translation. For a long paragraph, that must mean the whole paragraph: if a fragment
is shown in place of a thousand-character abstract, the article's summary effectively disappears
from the reading flow and cannot be recovered by translating again.

**Why this priority**: This is the same defect in its most damaging mode. In bilingual placement the
reader can still read the original; in translation-only placement the dropped parts leave the page
with a hole where the abstract was. It is a separate journey with its own verification, and it raises
the severity of the same root cause.

**Independent Test**: Translate a long paragraph in translation-only placement and confirm the source
is hidden once, the complete translation is visible in its place, and turning translation off
restores the source exactly.

**Acceptance Scenarios**:

1. **Given** translation-only placement and a long source block, **When** translation completes,
   **Then** the source block is hidden exactly once and the entire translation is visible; no source
   sentence remains visible untranslated and no translated sentence is missing.
2. **Given** translation-only placement, **When** the reader turns translation off, **Then** the
   source block is restored exactly as it was, and no translated text, translation block, or
   translation styling remains.
3. **Given** a completed bilingual page, **When** the reader switches to translation-only, **Then**
   the complete translation remains, in order, with no duplicate and no lost part.
4. **Given** parts are still arriving, **When** the reader switches placement, **Then** the finished
   page still shows the complete translation exactly once, in source order.

---

### User Story 3 - Long blocks that repeat, arrive late, or fail part-way (Priority: P2)

Real pages repeat paragraphs, load content after the first translation pass, and sometimes a provider
returns nothing for one part. A long block must behave consistently in all three situations: every
occurrence complete, late content complete, and a partial failure shown honestly rather than patched
with invented text.

**Why this priority**: These are the same block-level completeness rules applied at the boundaries of
the product's existing behaviour. They do not block the first two stories, but shipping without them
would leave the defect reproducible through ordinary page behaviour and would break the product's
existing promises about duplicates, late content, and honest failure.

**Independent Test**: On one page, repeat an identical long paragraph, inject a long paragraph after
the first pass, and make the provider return an empty translation for exactly one part; confirm all
three behave as specified and that restore still returns the page to its original state.

**Acceptance Scenarios**:

1. **Given** an identical long block repeated on the page, **When** translation completes, **Then**
   every occurrence shows the complete translation, even though the translation work is reused.
2. **Given** a long block that appears after the initial translation pass, **When** its translation
   completes, **Then** it shows the complete translation, and re-collecting the page does not add a
   second copy.
3. **Given** one part fails or comes back empty, **Then** the other parts still appear in order, no
   invented or placeholder text is inserted, and the run still reports the failure it already
   reports today.
4. **Given** translation is cancelled while some parts are complete, **Then** the completed parts may
   remain, the cancelled parts are not fabricated, no duplicate appears, and turning translation off
   still restores the page exactly.
5. **Given** a single long block is selected on the page and translated on its own, **Then** it
   receives the same complete treatment as a full-page translation.

---

### Edge Cases

- **A block that sits exactly at the boundary between one and several translation parts**: both
  sides of the boundary MUST render as one complete translation, with no duplication.
- **A single sentence with no internal sentence boundary**: it stays whole in one part and MUST
  render complete; the product MUST NOT cut it into invented pieces.
- **A block containing inline formatting** (emphasis, links): the complete translation MUST render
  while the source block's structure and inline elements are left untouched.
- **A long block inside a list item, table cell, or definition list**: the complete translation MUST
  render in the valid position for that container, without breaking the list marker, cell border, or
  alignment.
- **Several long blocks translated at the same time**: every one of them MUST end complete; one
  block's parts MUST NOT be applied to another block.
- **Provider returns the parts of one block at different times or out of order**: the final page MUST
  be identical to the ordered case.
- **Repeated placement switches** (bilingual, above, translation-only): no accumulation of translation
  elements, no duplicate text, and the last chosen placement is the one shown with the complete
  translation.
- **A translation 30 percent longer than its source**: no clipping, no overlap with neighbouring
  blocks, no horizontal page scroll.
- **Right-to-left target language**: the complete translation remains correctly ordered and laid out.
- **A page with many long blocks**: no duplicate translation work and no regression in completion
  time beyond the stated success criterion.
- **Restore after a partial failure or a cancellation**: the page MUST return to its original state,
  and a later translation MUST NOT inherit fragments from the failed run.
- **The target language equals the source language**: the block is skipped as before; this is not a
  translation and completeness does not apply.

## Requirements *(mandatory)*

### Functional Requirements

**Completeness of one block**

- **FR-001**: When a readable source block is translated in more than one part, the product MUST
  present the complete translation of all parts, in source order, as one uninterrupted passage
  adjacent to the source block.
- **FR-002**: No part of a block's translation may be removed, replaced, or hidden by another part of
  the same block's translation, regardless of the order in which the parts complete.
- **FR-003**: Completion order MUST NOT affect the visible result: for the same page and the same part
  translations, any arrival order MUST produce identical rendered content and order.
- **FR-004**: A block that fits in a single translation part MUST render exactly as before: one
  translation, no duplication, and no change to its placement.

**Display modes and restore**

- **FR-005**: Every display mode the product offers (translation beside the original, above it, and
  instead of it) MUST show the complete translation of the block.
- **FR-006**: In translation-only mode the source block MUST be hidden exactly once and the entire
  translation shown; switching modes MUST neither lose nor duplicate any translated text.
- **FR-007**: Turning translation off MUST remove every translated part and restore the page to its
  pre-translation state, with no translated text, translation block, or translation styling left
  behind, including after a run in which some parts failed or were cancelled.
- **FR-008**: Switching display mode while parts are still arriving MUST end in the same complete,
  ordered result as if every part had arrived before the switch.

**Existing content rules preserved**

- **FR-009**: Identical source blocks MUST each show the complete translation; reused translation work
  MUST NOT merge, truncate, or misattribute the parts of one occurrence to another.
- **FR-010**: A long block that arrives as late content MUST receive the same complete treatment, and
  re-collecting the same content MUST NOT duplicate rendered translations.
- **FR-011**: Selection-only and single-block translation of a long block MUST receive the same
  complete treatment as a full-page translation.
- **FR-012**: If one part fails or returns empty, the other parts MUST still be rendered in order; the
  product MUST NOT insert placeholder or invented text, and the run's existing failure reporting MUST
  remain accurate.
- **FR-013**: The change MUST NOT increase the number of translation requests needed for a page, and
  MUST NOT request again a part that already succeeded.

**Accessibility and layout**

- **FR-014**: The complete translation of a source block MUST be exposed as a single translated
  passage carrying the target language, readable in source order by assistive technology and
  locatable by the browser's find feature.
- **FR-015**: The complete translation MUST preserve layout at all supported widths and zoom levels:
  no horizontal page scroll, no overlapping or clipped text, and no broken list, table, or
  code-block structure, while tolerating a translation at least 30 percent longer than its source.
- **FR-016**: The reported article MUST be a covered case: after translation, every sentence of its
  abstract appears exactly once in the rendered translation, in source order.
- **FR-017**: The behaviour MUST be language-agnostic: completeness holds for every supported source
  and target language, including right-to-left target languages.

### Key Entities

- **Source Block**: one leaf passage of readable page content, such as a paragraph, heading, list
  item, or table cell, identified by its position and content so that repeated or late content can be
  matched. It is the unit a reader perceives as one paragraph.
- **Translation Part**: one portion of a source block's text requested and returned as a single
  translation. A short block has one part; a long block has several, and their concatenation in source
  order is the block's complete translation.
- **Rendered Translation**: the visible translated text presented next to one source block. It is
  complete when it contains every part of that block exactly once, in source order.
- **Restore Record**: the record of everything the product added to the page for a translation, so
  that turning translation off can remove all of it exactly, including every part of a split block.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the reported article, measured against a captured copy of the page, the rendered
  abstract translation contains 100 percent of the abstract's sentences, each exactly once, in source
  order.
- **SC-002**: Across the reference page set, every source block that needs more than one translation
  part shows 100 percent of its parts exactly once and in source order — zero dropped parts over at
  least 100 such blocks.
- **SC-003**: Delivering the same part translations in reversed order and in shuffled order produces
  rendered content and order identical to the ordered run in 100 percent of at least 20 trials.
- **SC-004**: For every long block in every display mode, the complete translation is present;
  in translation-only placement, zero source sentences remain visible untranslated and zero
  translated sentences are missing.
- **SC-005**: Turning translation off after a complete run, after a partly failed run, and after a
  cancelled run returns the page to a state identical to the capture taken before translation, with
  the scroll position unchanged and no translated text, translation block, or translation styling
  left behind, in 100 percent of trials.
- **SC-006**: The number of translation requests for each reference page does not increase relative to
  the same page before the fix, and no part that already succeeded is requested a second time.
- **SC-007**: The reference page set shows zero horizontal scroll, overlap, clipping, or structure
  breakage caused by split blocks, at 100 percent and 200 percent zoom, in left-to-right and
  right-to-left target languages.
- **SC-008**: A screen reader reads each block's complete translation as one continuous passage in the
  target language, and the browser's find feature locates text in every part of it.
- **SC-009**: A page holding 100 blocks that each need several parts completes translation within 10
  percent of the time the same page took before the fix, with no additional requests.
- **SC-010**: The full existing test suite passes with no test skipped, weakened, or excluded, and the
  regression test for this defect fails before the fix and passes after it.

## Out of Scope

Excluded by decision; each item is a settled boundary, not a gap awaiting later work.

- **Changing how source blocks are split into translation parts**: the split threshold, sentence
  grouping, request batching, and provider prompt are unchanged. This feature makes every part of a
  block survive on the page; it does not re-architect what is sent.
- **Translation quality and wording**: the feature governs completeness and placement, not the choice
  of words returned by the provider.
- **A new reader-visible warning or badge for incomplete blocks**: a part that fails remains reported
  through the run's existing failure state; no new interface element is introduced.
- **Re-translating already translated content** on a mode switch or a style change.
- **Translating page chrome**: navigation, the article's table of contents, sidebars, and code keep
  their existing treatment under feature 001.
- **The display-style catalogue**: feature 002's styles are untouched, and the complete translation
  inherits the same style treatment as a single-part translation.
- **Non-web content**: PDF, video, subtitle, image, and e-book translation remain out of scope.
- **Structural performance work**: no new caching, streaming, or scheduling design; only the stated
  no-regression bound applies.
- **New settings, storage keys, or interface text**: the fix is invisible as configuration.

## Assumptions

- **"正文摘要" means the italicized abstract directly under the article title**, above the date and
  byline. The defect is not specific to that paragraph: it affects any readable block long enough to
  be translated in several parts, and this specification fixes the class while using the reported
  article as its acceptance case.
- **"Fully translated" means every sentence of the source block appears exactly once in the rendered
  translation.** Repetition of a sentence in the source is reproduced as repetition in the
  translation; nothing is paraphrased away or merged.
- **The reported article was observed on 2026-11-14, English source, Chinese target.** Its abstract is
  roughly one thousand characters long and was translated in four parts, of which one survived. The
  requirement itself is language-agnostic.
- **The existing split-and-request mechanism stays.** Long blocks are already translated in
  sentence-grouped parts; this feature changes how those parts are presented, not how many are sent or
  how they are worded.
- **The provider returns one translation per requested part.** Provider choice, prompt, retries, and
  failure taxonomy are unchanged; only a part that fails or returns empty has a specified page
  behaviour (FR-012).
- **The reported article is captured once as an offline fixture**, a page snapshot that includes the
  abstract and its surrounding blocks, so the regression test is deterministic and runs without
  network access, consistent with the project's testing rules.
- **The same surfaces as feature 001 are covered**: full-page translation, late content, selection-only
  translation, and single-block translation. Viewer-style content remains out of scope.
- **No preference, storage key, or interface string is added.** The fix must be invisible to readers
  who never meet a long block.
- **The reference page set and the rendering capture corpus from feature 001 are reused**, extended
  with a long-block case so the completeness of split blocks is captured alongside placement and
  restore.
