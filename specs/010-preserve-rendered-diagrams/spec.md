# Feature Specification: Drawing Labels Translate In Place Without Breaking the Drawing

**Feature Branch**: `010-preserve-rendered-diagrams` (no branch was created: this project registers no
`before_specify` hook, and the working tree stays on `master`)

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "修复 https://deepeval.com/blog/eval-driven-development 对图（Here's a
visual diagram to show what this process looks like）翻译后渲染成了如下的代码：
AgentEvaluatorDatasetAgentEvaluatorDataset#mermaid-_R_8t9bsnt9fktb_-light{font-family:inherit;font-size:16px;fill:#333;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#mermaid-_R_8t9bsnt9fktb_-light .edge-animation-
期望的结果是切换成译文的图"

## Clarifications

### Session 2026-11-18

- Q: 图中文字是否需要翻译，还是只保证图不被破坏？ → A: 要翻译。图中可见的文字属于读者要读的内容，不能被当作图的一部分跳过。
- Q: 翻译图中的文字时，是把译文替换到图上原有的文字位置（框、连线、位置都不变），还是根据图的源码重新生成一张排版适配译文的图？ → A: 原地替换。译文替换图上可见标签的文字，图形本身的框、连线和位置保持不变；不重新绘制，也不引入图表渲染引擎。
- Q: 译文比原文长、在原位置放不下时，应该缩小这处标签的字号让它放下，还是保持字号、允许译文向周围延伸，或者保持字号、裁掉超出部分？ → A: 缩小字号放下。只缩小这一处标签，直到译文完整显示；字号不低于原字号的 75% 且不低于 10px；到这个下限仍放不下时保留原文，不延伸、不裁切、不压住相邻内容。
- Q: 图中含字母的可见文字，是所有成词文字都要翻译（包括 loop、alt、else 这类图形结构关键字），还是只翻译自然语言标签、把结构关键字保留原样？ → A（选 C）: 只翻译短语。带空格或标点的短语翻译；单一词元（participant 名称、loop/alt 等关键字、标识符）保留原样；纯数字、符号、单字母变量、公式符号也不发送。

## User Scenarios & Testing *(mandatory)*

### Observed failure

On the reported article, the sentence "Here's a visual diagram to show what this process looks like:"
is followed by a generated sequence diagram: four participant boxes, their lifelines, a loop frame,
five numbered messages, and the phrases "Curate ~100 goldens (inputs & expected outputs)", "Define
3-5 key metrics", "Update prompt, model, or logic", "Generate outputs for test cases", and "Return
metric scores". Today none of those phrases is translated as a label. The drawing's text is read as
one run-together passage together with its embedded style sheet, so what reaches the page is the line
"AgentEvaluatorDatasetAgentEvaluatorDataset#mermaid-…{font-family…}@keyframes…": first the labels and
then the drawing's own styling rules. In translation-only mode that line replaces the drawing; in the
bilingual modes it is inserted beside it. The captured drawing subtree's text matched the failing
line exactly, stylesheet included. The reader wants the drawing unchanged and its phrases in the
target language.

### User Story 1 - The drawing keeps its shape, and its phrases become the reader's language (Priority: P1)

A reader opens the eval-driven-development article and turns translation on. The sequence diagram
must stay the same drawing — the four participant boxes, their lifelines, the loop frame, the arrows,
and the numbering in exactly the same places as before translation — while the phrases inside it are
shown in the reader's language. The five message labels and the loop's description change; the
participant names and the "loop" keyword stay exactly as drawn, because a lone token is treated as an
identifier, not as prose. Nothing on the page may present the drawing's styling rules, keyframe
declarations, generated element identifiers, or its labels run together as a paragraph.

**Why this priority**: This is the reported defect and the whole reason for the change. The reader
must get both halves: the picture stays a picture, and the phrases in it become readable. Delivering
only one half either leaves the page looking broken or leaves the diagram unreadable.

**Independent Test**: Translate the reported article — or a saved fixture reproducing its diagram
structure — in each of the three display modes. Compare the drawing's shapes and positions with a
pre-translation capture, read every label, and search the visible page for the drawing's styling
text. The shapes must be unchanged, every eligible phrase must be translated, single-token labels
must stay exactly as drawn, and no styling text may appear.

**Acceptance Scenarios**:

1. **Given** the article translated in the bilingual (translation below) mode, **When** the reader
   looks at the diagram, **Then** every box, lifeline, frame, arrow, and number keeps its position,
   every eligible phrase shows a translation, every single-token label stays exactly as drawn, and
   no sibling block repeats the drawing or its styling text.
2. **Given** the article translated in the translation-above mode, **Then** the same holds: shapes
   unchanged, eligible phrases translated, no translation block inserted for the drawing itself.
3. **Given** the article switched to translation-only mode, **Then** the drawing stays visible and
   its phrases stay translated while the surrounding prose blocks are replaced by their translations;
   the drawing is not hidden, replaced, or duplicated.
4. **Given** a label that appears more than once, **Then** it is handled identically at every
   occurrence: a repeated phrase shows the same translation, and a repeated single token keeps the
   same original text.
5. **Given** translation is turned off after a translated view, **Then** every translated phrase is
   back to its original text, single-token labels were never changed, and the drawing's markup is
   identical to its pre-translation markup.
6. **Given** the reader switches display modes repeatedly, **Then** no second drawing appears, no
   label is duplicated, and no translated phrase reverts to its source text.

---

### User Story 2 - Only the phrases leave the device, and cost stays honest (Priority: P1)

A reader pays per character and expects only readable text to travel to the provider. A diagram can
carry kilobytes of styling rules, generated identifiers, markup, numbers, and lone names that are not
prose. The phrase labels are prose and must be translated, but the rest of the drawing must never be
sent, counted, or reported as a passage that failed or was skipped.

**Why this priority**: The product promises that page text reaches only the reader's provider and
that cost is visible and honest. Sending a style sheet breaks the first promise; counting it breaks
the second. A fix that only hides the garbage after sending it would leave both promises broken.

**Independent Test**: Translate the fixture with a provider that records every request, then compare
request bodies, the reported segment and character counts, and the page's failure and skip report
against the eligible phrases and the prose alone. Adding a purely visual drawing, or making its style
sheet ten times larger, must change nothing in those numbers except the phrases' own contribution.

**Acceptance Scenarios**:

1. **Given** a page with a drawing, **When** the page is translated, **Then** the request contains
   the drawing's eligible phrases as their own passages, no passage consists solely of a single-token
   label, and the request contains no styling rule, keyframe rule, generated identifier, markup,
   title, description, or attribute value from inside the drawing.
2. **Given** the same page, **Then** the session usage record counts the phrases' segments and
   characters, excludes everything else inside the drawing, and its totals equal the prose plus the
   phrases.
3. **Given** the same page, **Then** the drawing is not reported as a skipped passage merely for
   being a drawing, and increasing its style sheet without changing its phrases does not change the
   skipped or failed count.
4. **Given** a provider that echoes its input, **Then** the echoed style sheet or markup is still
   never shown as a translation; only the eligible phrases appear translated in the drawing.
5. **Given** a drawing that the page renders after translation has already begun, **Then** its
   eligible phrases are queued for translation under the same rules and none of its internals is
   sent.

---

### User Story 3 - Prose and captions still translate, and opaque graphics are preserved (Priority: P2)

The sentence that introduces the diagram, the paragraph after it, and a figure's caption are prose
and must be translated as they are everywhere else. An icon inside a translated link or sentence
must stay an icon. A chart painted onto a drawing surface, a photograph, an embedded frame, or a
media player exposes no editable text: it cannot be translated in place, so it must be preserved
exactly and never sent, rather than turned into fabricated text or OCR output.

**Why this priority**: Over-blocking is the easy failure mode of a fix like this: prose around a
drawing silently stopping its translation would be a new regression. And promising in-place
translation for content that has no editable text would create a second broken state for opaque
graphics.

**Independent Test**: Translate a fixture set containing a diagram between two paragraphs, a figure
with a caption, a sentence with an inline icon, a chart on a drawing surface, a typeset equation,
an embedded frame, a media player, and a page holding only a drawing. Confirm prose and captions translate, text-bearing
drawings get their eligible phrases translated, and opaque graphics are preserved and unsent.

**Acceptance Scenarios**:

1. **Given** prose immediately before and after a drawing, **When** the page is translated, **Then**
   both paragraphs receive translations and the drawing keeps its shapes and its translated phrases.
2. **Given** a figure whose caption sits beside a drawing, **Then** the caption is translated and the
   drawing's eligible phrases are translated in place.
3. **Given** a chart, photograph, embedded frame, media player, or typeset equation, **Then** it is
   preserved exactly, nothing from inside it is sent, and no translation is invented for it.
4. **Given** a sentence containing an inline icon, **Then** the sentence is translated, the icon is
   still drawn where it was, and no text or metadata from inside the icon is appended to the
   translation.
5. **Given** a page whose only words are a drawing's eligible phrases, **When** the reader translates
   it, **Then** those phrases are translated in place and no error is reported; **given** a page
   whose only content is opaque graphics or single-token names, **then** no request is made and no
   failed or skipped passage is reported.
6. **Given** a drawing that appears or is replaced after translation starts, **Then** its eligible
   phrases are translated in place and no duplicate drawing or sibling translation block appears.

---

### Edge Cases

- **A phrase is drawn across several adjacent text runs.** It is translated as one phrase; the reader
  must not see a sentence translated word-fragment by word-fragment.
- **A translation is longer than its label's space.** Only that phrase's type shrinks, down to the
  floor; below the floor the original phrase stays. No clipping, overflow, or overlap may appear.
- **The same phrase appears many times.** One translation is reused at every occurrence, including
  phrases repeated in the page's prose.
- **A label is a single token** — a participant name, a diagram keyword such as "loop", "yes", or
  "end", an identifier, or a one-letter variable. It is not sent and stays exactly as drawn, even
  when the same token repeats at both ends of a lifeline.
- **A label is a pure number, a sequence number, or punctuation.** It is not sent and stays as drawn.
- **A label is already in the target language.** It is skipped like any other same-language passage
  and stays exactly as drawn.
- **The drawing carries its own style sheet, scripts, titles, or descriptions.** None of that text
  is sent, counted, or displayed; titles and descriptions are not treated as labels.
- **The drawing's wrapper contains nothing but the drawing.** Its eligible phrases are translated;
  the wrapper itself is never a passage and never earns a skipped-passage count.
- **A wrapper contains both prose and a drawing.** The prose is translated as prose; the drawing's
  phrases are translated in place; neither absorbs the other's text.
- **A drawing sits in a table cell, list item, link, figure, custom element, or deeply nested
  wrappers.** The wrapper's element type must not change the outcome.
- **The drawing has its own scroll area or maximum height.** That scrolling and sizing survive
  translation and mode changes.
- **The drawing is hidden at first and revealed later, or is re-rendered by the page.** Its eligible
  phrases are still translated; nothing from its internals is captured; phrases awaiting translation
  keep their original text.
- **A drawing is drawn inside a region the site already marks as non-translatable.** The existing
  opt-out behaviour wins and the drawing is left untouched.
- **A diagram's source code is shown as a code block on the page.** Existing code handling applies;
  it stays skipped and is not turned into prose.
- **Typeset mathematics.** It is preserved as one graphic; its glyphs and any formula source are
  not sent, and the surrounding words still translate.
- **The reader selects only drawing content, or selects prose and a drawing together.** Only visible
  phrases are eligible; nothing else from inside the drawing is sent; phrases are translated in place
  rather than duplicated into a block.
- **The reader targets a single block that is a drawing.** Only its visible phrases are translated in
  place; no sibling translation block is created.
- **Display mode, display style, typography, or target language changes after translation.**
  Translated phrases update consistently, the drawing's shapes never move, and no phrase is
  duplicated or left in the old language.
- **A phrase's translation never arrives, or fails.** The phrase keeps its original text; it is never
  shown blank, truncated to nonsense, or replaced by a placeholder.
- **The drawing is very large (thousands of elements and hundreds of phrases).** It must not stall the
  reading experience, and its style sheet must not be serialized into any request, report, or log.
- **The page is right-to-left, has a dark background, is zoomed to 200%, or uses forced colours.**
  The drawing keeps its appearance and geometry; translated phrases render legibly in the target
  language's direction without moving the drawing.
- **The reader turns translation off.** Every translated phrase returns to exactly its original text,
  and the drawing's markup, links, and scroll position are as they were.

## Requirements *(mandatory)*

### Functional Requirements

**Label identification and extraction**

- **FR-001**: A rendered drawing's visible phrase labels MUST be translatable passages in their own
  right: each eligible phrase is queued, translated, and rendered in place. The drawing as a whole
  MUST NOT be treated as one passage, MUST NOT receive a progress mark or a sibling translation
  block, and MUST NOT be reported as skipped merely for being a drawing.
- **FR-002**: Extraction MUST include only text the drawing actually renders. A drawing's style rules,
  scripts, titles, descriptions, alternate text, markup, attribute values, generated identifiers, and
  geometry MUST NOT be sent, counted, or displayed.
- **FR-003**: Only a phrase is a translatable label: a visible run the drawing lays out as two or more
  words separated by spaces, or as a run containing clause punctuation (comma, semicolon, colon,
  parentheses, brackets, question mark, or exclamation mark). A single token — a lone participant
  name, a diagram keyword, an identifier, a number, a symbol, or a one-letter variable — MUST NOT be
  sent and MUST stay exactly as drawn.
- **FR-004**: The text runs a drawing lays out as one label MUST be grouped before eligibility is
  decided, so a phrase wrapped across lines or runs is translated as one phrase, never fragment by
  fragment. A label root is one text-bearing element — one rendered `<text>` element, or one HTML
  label element inside a `foreignObject` — and its runs are the text nodes inside it; sibling text
  elements are separate labels. Identical eligible phrases MUST reuse one translation and show it at
  every occurrence.
- **FR-005**: A phrase already in the target language MUST be skipped like any other same-language
  passage and MUST remain exactly as drawn.
- **FR-006**: Prose around drawings MUST still be translated: the introducing sentence, following
  paragraphs, headings, figure captions, and link text. Meeting a drawing MUST NOT suppress an
  enclosing or adjacent prose passage.
- **FR-007**: A graphic whose text is not prose — a chart painted on a drawing surface, a
  photograph, an embedded frame, a media player, a plugin object, or typeset mathematics — MUST be
  preserved untouched, MUST NOT be sent, and MUST NOT receive a fabricated or recognised translation.
- **FR-008**: Drawings created, hydrated, or replaced after translation starts MUST have their
  eligible phrases discovered and translated under the same rules. Their internals MUST never be
  captured, and a phrase awaiting its translation MUST keep its original text.

**In-place rendering**

- **FR-009**: A phrase translation MUST replace the phrase's own text at its own position. The
  drawing's shapes, connectors, frames, shape sizes, and positions MUST NOT change. No sibling
  translation block, duplicate label, or reordered drawing content may be introduced.
- **FR-010**: A translated phrase MUST keep the phrase's drawn typography and alignment — family,
  weight, style, text alignment, and fill; its direction stays as drawn except that a right-to-left
  target may set the label root's direction to right-to-left. When the translation does not fit the
  label's own rendered bounds, only that phrase's type size may be reduced, until the translation
  fits but never below either 75% of its drawn size or 10 px at 100% zoom. If it still does not fit at that floor, the original phrase MUST
  stay. The translation MUST NOT be clipped, MUST NOT overflow into neighbouring labels, shapes, or
  lines, and MUST NOT enlarge the drawing.
- **FR-011**: In every display mode — bilingual, translation above, and translation only — the
  drawing MUST remain visible with its translated phrases. Translation-only mode MUST hide only prose
  sources, never a drawing; the bilingual modes MUST NOT add a translation block for a phrase.
- **FR-012**: No progress mark, spinner, or placeholder text may be placed inside a drawing. A phrase
  keeps its original text until its translation arrives, then changes in one step; a failed phrase
  keeps its original.
- **FR-013**: Turning translation off MUST restore every translated phrase's original text and the
  drawing's markup exactly, with no residual element, attribute, style, or scroll change.
- **FR-014**: Nothing may be written into the drawing beyond the phrase text and the two presentation
  adjustments FR-010 requires: no product markers, no display style, no reader-configured typography
  override, no language attribute, no accessibility rewrite, and no decoration. The only style the
  product may set on a label root is the fit's own `font-size` and, for a right-to-left target, its
  `direction`; both are journalled and restored. The drawing's links, tooltips, keyboard behaviour,
  and scrolling MUST continue to work.
- **FR-015**: Changing display mode, display style, typography, or target language MUST update
  translated phrases consistently and idempotently: no accumulation, no duplicate label elements, and
  no drawing copy. A target-language change MUST re-translate eligible phrases the same way it
  re-translates prose.

**Safety, accounting, and resilience**

- **FR-016**: No request MAY contain a drawing's style rules, keyframe rules, generated identifiers,
  markup, titles, descriptions, attributes, or geometry. An eligible phrase MUST be sent as its own
  passage, not concatenated with other labels or with surrounding prose.
- **FR-017**: Phrase-label characters and passages MUST count in the session usage record exactly
  once, like prose; no drawing-internal character and no single-token label may be counted. The
  skipped-passage report MUST NOT count a drawing merely for being a drawing.
- **FR-018**: A phrase whose translation fails MUST keep its original text, MUST NOT render blank or
  partial, and MUST be reported through the existing failure channels, not as a skipped drawing.
- **FR-019**: A selection or single-block request that targets a drawing MUST translate only that
  drawing's visible eligible phrases, in place. It MUST NOT send or render anything else from inside
  the drawing and MUST NOT create a sibling translation block.
- **FR-020**: A page whose only translatable content is drawing phrases MUST translate those phrases
  with no error. A page whose only content is opaque graphics or single-token names MUST make no
  request and MUST report no failed or skipped passage.
- **FR-021**: A translated phrase MUST be what assistive technology reads. The drawing's role, name,
  description, reading order, and keyboard behaviour MUST otherwise remain intact, and no second
  accessible copy of the phrase may be introduced.
- **FR-022**: Meeting drawings MUST NOT abort or degrade the run: prose before and after them MUST
  still be translated, and the run's completion, cancellation, and progress behaviour MUST be
  unchanged.
- **FR-023**: A large drawing MUST NOT stall segmentation, translation start, or page interaction.
  The product MUST NOT serialize a drawing's internals for any purpose, including accounting,
  diagnostics, or logging.

### Key Entities

- **Rendered Graphic**: A region of a page whose visible content is a machine-drawn picture — a
  vector drawing, a chart, a typeset equation, an embedded frame, a media player, or a
  script-generated graphic. Attributes: the wrapper it occupies, the phrases it draws, the internals
  it hides, its accessible name and role, and any scrolling or sizing it owns. It is never one
  translation passage; its eligible phrases are.
- **Graphic Label**: One visible phrase a drawing renders. A single token — a lone name, keyword,
  identifier, number, or symbol — is not a graphic label and is never translated. Attributes: its
  source text, its source and target languages, the text runs that draw it, the occurrences that
  share it, its drawn typography and position, and its translation state (queued, translated, failed,
  skipped).
- **Phrase Translation**: The replacement of one eligible phrase's text with its translation.
  Attributes: the original text (kept for restore), the translated text, the target language, whether
  its type was reduced to fit, and whether it is currently applied.
- **Translation Passage**: The existing unit of translatable text. It may be page prose or an
  eligible drawing phrase; it can never be a drawing's stylesheet, markup, metadata, single token, or
  geometry.
- **Page Extraction Result**: What one page contributes to a run: its prose passages, its eligible
  drawing phrases, the internals and single tokens it excluded, and the counts the product reports.
- **Session Usage Record**: The existing cost-transparency record. Its segment and character totals
  now include eligible drawing phrases and still exclude every drawing-internal character and single
  token.
- **Display Mode**: The existing choice among bilingual, translation above, and translation only. Its
  meaning is extended by one rule: it selects what happens to prose, while a drawing and its
  translated phrases stay visible in all three.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the reported article's diagram, translated in each of the three display modes, all
  6 eligible phrases — the five message labels and the loop's description — show a translation, the
  4 participant names and the "loop" keyword remain exactly as drawn, the drawing's shape positions
  match the pre-translation capture exactly (0 px difference), and 0 visible strings contain styling
  rules, keyframe declarations, or generated identifiers.
- **SC-002**: Across the reference pages, every eligible phrase appears in a request as its own
  passage, no request body contains a passage consisting solely of a single-token label, and 0
  request bodies contain styling rules, keyframe declarations, generated identifiers, markup, titles,
  descriptions, or attribute values.
- **SC-003**: On a page with drawings, the reported segment and character totals equal the prose plus
  the eligible phrases exactly (difference of 0), and enlarging a drawing's style sheet tenfold
  changes neither total.
- **SC-004**: Turning translation off after a translated page with drawings restores every translated
  phrase's original text and markup identical to the pre-translation capture in 20 of 20
  translate-and-restore cycles, with no residual element, attribute, style, or scroll change.
- **SC-005**: On the reference pages, 100% of prose passages adjacent to a drawing are translated,
  including every figure caption and every sentence that introduces or follows a drawing; no prose
  is lost to over-blocking.
- **SC-006**: All 7 non-prose graphic reference cases — chart on a drawing surface, photograph,
  embedded frame, media player, plugin object, typeset equation, and icon inside a sentence — are
  preserved unchanged and none is sent.
- **SC-007**: A drawing that appears 3 seconds after translation starts has its eligible phrases
  translated within 5 seconds, sends 0 characters from its style sheet, shows its original texts
  until the translations arrive, and creates 0 duplicate or sibling translation blocks.
- **SC-008**: For eligible phrases repeated within a drawing and across the page, one translation is
  requested per distinct phrase and every occurrence shows it: 0 occurrences left in the source
  language.
- **SC-009**: Phrases already in the target language produce 0 requests and remain byte-identical to
  their drawn text.
- **SC-010**: Changing display mode, display style, and typography changes 0 pixels of the drawing's
  shape positions and creates 0 duplicate labels or translation blocks; after a target-language
  change, 100% of eligible phrases are shown in the new language.
- **SC-011**: A selection or single-block request on a drawing sends 0 drawing internals, creates 0
  sibling translation blocks, translates the drawing's visible eligible phrases in place, and leaves
  its single-token labels untouched.
- **SC-012**: In every display mode, assistive technology reads the translated text for 100% of
  translated phrases, the drawing's role and name are preserved, and no phrase is announced twice.
- **SC-013**: For every phrase whose translation fails, the original text remains visible: 0 blank
  labels and 0 partial or placeholder labels, and the failure is reported through the existing
  channels.
- **SC-014**: A drawing with at least 5,000 elements and 200 eligible phrases reaches its first
  visible translation within 2 seconds of the trigger, and its style sheet never appears in a
  request, a usage report, or a log.
- **SC-015**: A page whose only content is phrase-bearing drawings gets its phrases translated with 0
  errors; a page whose only content is opaque graphics or single-token names produces 0 requests and
  reports 0 skipped or failed passages.
- **SC-016**: On a reference page whose target language runs longer than the source, 100% of eligible
  phrases that need it are shrunk only to the floor, 0 translations are clipped or overlap
  neighbouring content, and 0 phrases are left partially displayed; phrases that cannot fit at the
  floor keep their original text.

## Out of Scope

Excluded by decision; each item is a settled boundary, not a gap awaiting later work.

- **Translating single-token labels**: participant names, diagram keywords (for example "loop",
  "alt", "else"), identifiers, and other lone words stay exactly as drawn and are not sent. This is
  the owner's recorded choice for this feature.
- **Re-rendering, redrawing, or resizing a drawing** so that its boxes, lanes, or canvas fit a
  translation: the drawing's geometry stays as drawn.
- **Opaque or non-prose graphics**: charts painted on a drawing surface, photographs, embedded
  frames, media players, plugin objects, and typeset mathematics expose no translatable prose; they
  are preserved, not translated, and never subjected to optical recognition.
- **Attribute-based accessible names and descriptions inside a drawing**: only text the drawing
  visibly renders is translated. A drawing whose only words are an accessible name is treated as
  opaque.
- **Diagram source-code translation**: fenced diagram source and on-page diagram code blocks remain
  code and follow the existing code rule.
- **Images, photographs, and image descriptions**: no optical recognition and no image-description
  translation.
- **Documents, PDFs, subtitles, and e-books**: consistent with feature 001, only web pages are in
  scope.
- **Translating the contents of interactive widgets**: maps, code sandboxes, and media controls keep
  their own text; this feature only ensures their internals are not captured and that the widget is
  not destroyed.
- **Drawings rendered inside a closed shadow root or a cross-origin frame**: their internals are not
  reachable from the page; this feature neither requires nor promises access to them.
- **Site-specific exceptions for the reported article**: no per-site allowlist or special case for
  the article's domain is part of the design.
- **New runtime dependencies or a diagram-rendering engine**: the product does not adopt a drawing
  library, and does not render a second copy of a diagram.

## Assumptions

- **The owner's decisions stand as recorded.** The drawing's visible phrases are translated, in place,
  with the drawing's geometry unchanged; a translation that does not fit shrinks only its own phrase
  to a floor and then falls back to the original; and only phrases are translated, while single
  tokens stay as drawn. These decisions supersede the earlier boundary in this specification that
  left all diagram labels untranslated.
- **Single tokens are identifiers.** A visible run must be a phrase — two or more words separated by
  spaces, or a run containing clause punctuation — to be a label. Lone names, keywords, identifiers,
  numbers, symbols, and one-letter variables are not labels. In a source language that writes without
  spaces between words, a space-less label is one token and therefore stays as drawn.
- **Only what the drawing visibly renders is translatable.** Titles, descriptions, alternate text,
  styling rules, scripts, and attribute values are not labels, even when they contain words. The
  reported article's diagram draws its five message texts and the loop's description as phrases, so
  those are labels; its participant names are single tokens, its "loop" keyword is structural, and
  neither is translated.
- **Opaque graphics are a different case.** A chart, photo, frame, or player with no editable text
  cannot be translated in place and is preserved as drawn; promising otherwise would require optical
  recognition or a rendering engine.
- **The fit rule is fixed, and "the space the label occupied" means its own rendered bounds.** When
  a translation does not fit, only that phrase's type shrinks, to no less than 75% of its drawn size
  or 10 px at 100% zoom; below that floor the original phrase stays. The product does not attempt to
  discover an enclosing box or lane, because a drawing does not expose a reliable "which shape frames
  this label" signal; the label's own footprint is the conservative bound. The drawing is never
  enlarged, and text is never clipped or allowed to overlap neighbouring content.
- **A translated phrase that cannot fit keeps its source text.** It is not a provider failure, not a
  skipped drawing and not a new state: the phrase was translated and counted, and the occurrence kept
  the words that were already there.
- **The existing display contract still applies.** Feature 001's placement for prose, its three
  display modes, restore journal, accessibility rules, and rendering capture corpus remain in force;
  this change adds an in-place phrase path and preserves drawings in every mode.
- **Detection is behavioural, not site-specific.** What is a label is decided from the text the
  drawing renders, its phrase structure, and its placement, not from a list of sites, CSS classes, or
  drawing-library names.
- **No new user-visible string is needed.** Existing surfaces — the translated/skipped usage report,
  the empty-run behaviour, and the failure reporting — are reused. If planning finds a new
  reader-facing sentence necessary, it must enter the translation catalogue like every other string.
- **Existing opt-outs and code rules keep their current meaning.** A page, region, or block the site
  marks as non-translatable stays non-translatable; a diagram shown as code stays code.
- **The reference page set from feature 001 is reused and extended** with diagram-bearing fixtures
  (diagram between prose, figure with caption, inline icon, text-bearing drawing with a style sheet,
  chart, equation, embedded frame, media, drawing-only page) so both phrase translation and the
  preservation rules are verifiable.
- **Live verification is recorded separately from fixtures.** The reported article is reachable and
  can be checked manually; the fixture proves the rule offline. Neither is presented as the other.
