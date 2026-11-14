# Feature Specification: Divider Style Fix and Custom Translation Typography

**Feature Branch**: `004-translation-divider-font`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "修复 Divider 模式不应该是一条横线，不应该是一个短短的虚线。翻译的字体可以自定义。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Divider style marks where the translation starts, not with a stray line (Priority: P1)

A reader turns on the Divider display style expecting each translation to be marked as a
self-contained block. Today the translation carries a full-column horizontal rule across its top,
which reads as a page-authored separator; the reference product instead draws a very short dashed
stub that looks like a stray mark. The reader wants a divider that belongs to the translation: a
thin dashed rule running down the translation's leading edge, the full height of the block, that
is unmistakably part of the translation and never a horizontal separator.

**Why this priority**: This is the defect the request opens with. A divider that looks like page
furniture makes every bilingual page noisier rather than clearer, and it can be confused with the
Quote style. Until this is fixed the style fails its only job.

**Independent Test**: Translate an article in bilingual mode, select Divider, and inspect each
translated block: a dashed vertical rule runs along the leading edge for the block's full height,
no horizontal rule appears anywhere in the block, the text itself is unchanged, and the same holds
after switching to "translation above" and "translation only" modes without re-translating.

**Acceptance Scenarios**:

1. **Given** a page translated with the Divider style, **When** the reader inspects any translated
   block, **Then** exactly one dashed rule is drawn along the block's leading edge, spanning its
   full height, and no rule crosses the block's top, bottom, or text lines.
2. **Given** a translation longer than its source (for example a paragraph 30% longer), **When** it
   is rendered, **Then** the rule spans the whole rendered block without clipping, overlap, or
   shortening, and the text is not pushed out of the block.
3. **Given** the Divider style, **When** the reader switches between "translation below", "above",
   and "replacing the source", **Then** the rule stays attached to the translation in every mode
   and no translation request is made again.
4. **Given** a right-to-left target language, **When** a translation is rendered, **Then** the rule
   appears on the right edge and the text keeps its correct reading direction.
5. **Given** a page with a dark or tinted background, **When** the Divider style is shown, **Then**
   the rule uses the translation's text colour and remains visible against that background.
6. **Given** the Divider and Quote styles side by side on the same page, **When** the reader
   compares them, **Then** Quote is a thick solid bar with italic, indented text while Divider is a
   thin dashed rule with the text's own styling, and the two cannot be mistaken for each other.

---

### User Story 2 - The reader chooses the typeface and size of translations (Priority: P1)

Translations currently inherit the page's typography verbatim. On a page set in a small serif face,
or in a face the reader finds hard to read, the reader wants translated text in a typeface and size
of their own choosing — for example a larger reading face for long articles — while the original
text keeps the page's design. The choice sticks and applies to pages that are already translated.

**Why this priority**: This is the second explicit request: translations should be readable in the
reader's preferred font. It is independent of the Divider fix and delivers value on its own.

**Independent Test**: Translate a page, open Display settings, enter a font family and set the size
to 125%, save, and confirm every translated block — headings, body paragraphs, list items and table
cells — renders in the chosen family at a size 25% larger than its source, while no page-authored
text changes; reload and confirm the setting persists.

**Acceptance Scenarios**:

1. **Given** a fresh profile, **When** the first translation renders, **Then** translations use the
   page's own typeface and size exactly as before this feature existed.
2. **Given** a translated page, **When** the reader saves a custom font family, **Then** every
   translated block switches to that family within one second, the original text is untouched, and
   no new translation request is made.
3. **Given** the reader sets the size scale to 125%, **When** translations render, **Then** each
   translated block is 25% larger than its own source block, headings remain larger than body text,
   and line spacing grows with the text so lines never overlap.
4. **Given** a saved typeface and size, **When** the reader reloads the page, restarts the browser,
   and opens a new tab, **Then** both settings are applied in all three cases.
5. **Given** a custom family that is not installed on the reader's device, **When** translations
   render, **Then** the text falls back to the page's font (or the fallback named in the entered
   stack) and remains fully legible, with no invisible or blank characters.
6. **Given** the reader chooses "keep the page's font" and 100%, **When** the setting is applied,
   **Then** translations return to the page's own typography with no residue from the custom font.
7. **Given** a font value the product refuses (for example one containing styling punctuation or a
   font download reference), **When** the reader saves, **Then** a specific message explains the
   refusal, the previously saved value stays in effect, and the page does not change.
8. **Given** the reader resets typography, **When** the reset is applied, **Then** translations
   immediately return to the page's own font at 100% without a reload or a new translation.

---

### User Story 3 - Preview the result before committing (Priority: P2)

Text fields cannot show what "Source Han Serif at 125%" will look like. Before saving, the reader
wants a live sample on the settings page that shows the currently selected style together with the
chosen typeface and size, so the decision is made by sight and not by guessing.

**Why this priority**: The product already promises a live sample for display styles; extending it
to typography keeps the settings honest and prevents trial-and-error on real pages.

**Independent Test**: On the Display settings page, select Divider, type a font family and change
the size: the sample updates immediately to show the vertical dashed rule in the chosen typeface and
size; navigating away without saving leaves both the sample and the stored settings unchanged.

**Acceptance Scenarios**:

1. **Given** the Display settings page, **When** the reader types a font family or changes the size,
   **Then** the live sample updates immediately without saving, showing both the chosen typography
   and the currently selected display style.
2. **Given** the reader changes the sample and leaves without saving, **When** they return,
   **Then** the fields and the stored settings show the last saved values and open pages are
   unchanged.
3. **Given** a keyboard-only or screen-reader user, **When** they edit typography, **Then** both
   controls have accessible names, the size control announces its current value and allowed range,
   and a refused value is announced as an error.
4. **Given** the interface is zoomed to 200%, **When** the Display settings page is shown, **Then**
   the labels, the inputs and the sample remain legible and unclipped.

---

### Edge Cases

- **Empty or whitespace-only font field**: means "keep the page's font"; no error is shown.
- **Font stack with quoted names or multiple families**: accepted as a well-formed family list;
  the fallback chain is preserved.
- **Extremely long font value**: refused past the documented length limit, with the previous value
  kept.
- **Size at the extremes (50% and 200%)**: accepted; out-of-range or non-numeric input is
  refused with a message and the previous value stays in effect.
- **A single short word as a translation**: the rule still runs the height of that one line and does
  not collapse to a dot.
- **A very long block (a paragraph spanning several screens)**: the rule spans the whole block and
  the page stays scrollable with no horizontal overflow.
- **Translations inside list items, table cells, captions, and inline placements**: the rule and the
  custom typography follow the translation without breaking the surrounding layout.
- **Page uses a background image or gradient**: the rule keeps at least non-text contrast against
  whatever is directly behind it.
- **Forced-colour / high-contrast mode**: the rule and the text remain visible, and the style is not
  carried by colour alone.
- **Reduced-motion preference**: no animation is introduced by either change.
- **Browser zoom at 200% and a 30% longer target text**: nothing overlaps, clips, or forces a
  horizontal scrollbar.
- **A custom font that lacks some glyphs (for example a Latin-only face with a Chinese target)**:
  missing characters render in the fallback without changing the size or line spacing.

## Requirements *(mandatory)*

### Functional Requirements

**Divider presentation**

- **FR-001**: The Divider style MUST mark every translated block with a dashed rule along the
  block's leading edge — left for left-to-right text, right for right-to-left text — spanning the
  block's full height and every one of its lines.
- **FR-002**: The Divider style MUST NOT draw a rule across the top, bottom, or between lines of a
  translated block, and MUST NOT draw a fixed-width stub that stops short of the block's height.
- **FR-003**: The rule MUST be visually thin (a hairline relative to the text) and clearly dashed;
  it MUST take the translation's text colour and reach at least 3:1 non-text contrast against the
  background directly behind it on light, tinted, dark, and image-backed pages.
- **FR-004**: The Divider style MUST leave the translation's font family, style, weight, alignment
  and colour unchanged, and MUST NOT indent the text by more than one character's width.
- **FR-005**: The rule MUST stay attached to the translation in every display mode (below the
  source, above it, or replacing it) and across every mode change.
- **FR-006**: Divider and Quote MUST remain visually distinct: Quote keeps its thick solid bar and
  italic, indented text; Divider uses a thin dashed rule and leaves text styling untouched.
- **FR-007**: The Divider entry's preview icon and the live sample MUST show a leading-edge vertical
  dashed rule at the same relative thickness and shape as the rendered translation, and MUST NOT
  show a horizontal stub. The icon MUST remain legible at 16 px and at 200% zoom.
- **FR-008**: Switching to or away from Divider MUST restyle translations already on the page
  without requesting translation again and without a reload.

**Translation typography**

- **FR-009**: The reader MUST be able to choose a translation font family: keep the page's font
  (default), or a custom family stack entered as one or more comma-separated family names. An empty
  or whitespace-only value MUST mean "keep the page's font".
- **FR-010**: The reader MUST be able to scale translation size from 50% to 200% of the source
  block's own size, in 5% steps, with 100% as the default.
- **FR-011**: The size scale MUST be applied per translated block relative to that block's source
  size, so headings remain larger than body text at every scale.
- **FR-012**: At the default settings (page font, 100%), translations MUST keep exactly the source
  block's typeface and size, so existing profiles see no change.
- **FR-013**: A custom family and size MUST apply to every translated block, including headings,
  list items, table cells, captions, and inline-positioned translations, and MUST NOT alter any
  page-authored text.
- **FR-014**: When a custom family cannot display some characters, the translation MUST fall back to
  the page's font or to the fallback named in the entered stack, so no glyph becomes invisible,
  blank, or unreadable.
- **FR-015**: When the size scale is not 100%, line spacing MUST stay proportional to the text size
  so consecutive lines never overlap; at 100% the page's own line spacing MUST be preserved exactly.
- **FR-016**: A non-default size scale MUST NOT widen the translation beyond its block or introduce
  horizontal scrolling at 1280 px and 400 px viewport widths.
- **FR-017**: A font value MUST be refused with a visible, specific message when it contains
  characters that can terminate a declaration or open a new one (semicolons, braces, angle
  brackets), when it references a download or URL, or when it exceeds 200 characters; the
  previously saved value MUST stay in effect and open pages MUST NOT change.
- **FR-018**: A size value that is non-numeric, non-finite, or outside 50%–200% MUST be refused with
  a visible message and MUST NOT be applied; the previous value stays in effect.
- **FR-019**: Saving a typography change MUST update translations already on the page within one
  second, without a reload and without any new translation request.
- **FR-020**: The chosen family and size MUST persist across page reloads, browser restarts, and new
  tabs, and MUST be shared by every page the reader translates.
- **FR-021**: A reset action MUST restore "keep the page's font" and 100% in a single step and apply
  that reset to open pages immediately.

**Preview, accessibility, and safety**

- **FR-022**: The Display settings MUST show a live sample combining the currently selected display
  style with the currently entered family and size before saving; leaving without saving MUST leave
  stored settings and open pages unchanged.
- **FR-023**: Both typography controls MUST be labelled, keyboard operable, and MUST expose their
  current value; refusals MUST be announced to assistive technology as errors.
- **FR-024**: Removing translations MUST remove the divider rule and every typography override, so
  the page returns to its pre-translation state with no residual styling on page-authored elements.
- **FR-025**: Custom typography MUST apply only to translated text; the extension MUST NOT restyle
  page-authored text, and MUST NOT load fonts over the network or add any font asset.

### Key Entities *(include if feature involves data)*

- **Typography preference**: The reader's device-wide translation typeface and size choice. Holds an
  optional font-family stack (empty means inherit the page's font) and a size scale between 50% and
  200% (default 100%). One preference per profile; it is not per site and not per language.
- **Display style entry (Divider)**: The catalogue entry for the Divider style, whose treatment is
  redefined from "horizontal rule above the translation" to "thin dashed rule on the translation's
  leading edge", together with the matching preview icon so the icon and the rendering cannot drift.
- **Translation block**: An extension-owned rendered translation; it carries the optional typography
  override and the Divider decoration, and both must be fully removable on restore.
- **Preview sample**: The settings-page sample line that previews the current style, family, and
  size without saving.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a fixture article with at least 20 translated blocks, 100% of Divider-styled blocks
  show exactly one dashed rule on the leading edge, at least 90% of the block's height and no wider
  than a hairline; zero horizontal decoration appears above, below, or between translated lines.
- **SC-002**: With an RTL target language, 100% of Divider rules appear on the right edge, with text
  direction unaffected.
- **SC-003**: Across the fifteen styles, every pair remains distinguishable: the Divider rule is
  dashed and at most half the thickness of Quote's solid bar, and Quote's text is italic while
  Divider's text is not. No two styles produce identical geometry and typography.
- **SC-004**: Applying a font family or size change to a page with at least 10 rendered blocks
  updates all translations within 1 second and produces 0 new translation requests.
- **SC-005**: With default settings, 100% of translation blocks render in the same typeface and size
  as their source block, with no visual change to the page.
- **SC-006**: At 200% size scale, 0 pairs of consecutive text lines overlap, and 0 blocks overflow
  their container horizontally at viewport widths of 1280 px and 400 px.
- **SC-007**: 8 of 8 representative invalid font inputs and 6 of 6 invalid size inputs are refused
  with a visible message, and in every case the previously saved setting remains in effect.
- **SC-008**: Typography settings survive a reload, a browser restart, and a new tab: 3 of 3.
- **SC-009**: Turning translation off returns every translated block to its pre-translation state:
  100% of blocks, including Divider decoration and typography overrides, leave no residual styling.
- **SC-010**: At 200% browser zoom, all typography controls, labels, and the live sample remain
  legible, unclipped, and operable by keyboard only.
- **SC-011**: On a page whose custom font is not installed, 100% of translated characters remain
  visible and legible through the fallback, with no change to line spacing.

## Assumptions

- The reader configures typography on the options page's Display section, next to the display
  style. The page-control popup keeps its current style picker; per-site typography is out of scope.
- "Font size" is a scale relative to each source block's own size, not an absolute pixel value, so
  the page's heading/body hierarchy is preserved at every scale.
- A custom font value is a comma-separated family list with optional quotes; the product
  never downloads fonts and only uses fonts already available to the browser.
- The default remains "keep the page's font at 100%", so profiles created before this feature look
  exactly the same afterwards.
- The divider's leading edge follows the translation's writing direction, so an RTL target mirrors
  the rule.
- Display styles continue to resolve per site as they do today; typography is one device-wide
  preference.
- The existing display-style preview, the live restyle of translations already on the page, and the
  exact-restore guarantee are reused behaviour; no new runtime dependency is introduced.

## Out of Scope

- Per-site or per-language typography overrides (for example a different font for one domain).
- Font weight, line-height, letter-spacing, alignment, or colour controls.
- Downloading, bundling, or syncing webfonts; any font that must be fetched over the network.
- Changes to any display style other than Divider (their appearance and icons stay as they are).
- Typography controls in the page-control popup.
- Printing-specific layouts or exported documents.
- Free-form styling injection by the reader.

## Dependencies

- The fifteen-style catalogue, the generated preview icons, and the live-restyle path delivered by
  feature 002.
- The source-typography inheritance and the exact-restore guarantee delivered by feature 001.
- The options page Display section and the shared style picker, both already shipped.
