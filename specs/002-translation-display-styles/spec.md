# Feature Specification: Translation Display Styles and Their Preview Icons

**Feature Branch**: `002-translation-display-styles`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "增加immersive translate译文显示样式和icon"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose how translations look and have it stick (Priority: P1)

A reader is put off by a page where every translated paragraph looks identical to the original
surrounding text. From the product's settings they pick a visual style for translations — a
highlight, a marker-pen look, a divider above each translation, a quote bar, or one of the other
styles the reference product offers — and every translation on the page immediately takes on that
look, without being translated again. The choice survives a reload, a browser restart, and a new
tab.

**Why this priority**: This is the request in one sentence. Without a persisted, immediately applied
style, the feature delivers nothing, and every other story only refines it.

**Independent Test**: Install the product, translate a page, choose "Highlight" in settings, and
confirm every translated block is highlighted while the original text is untouched; reload and
confirm the highlight is still applied with no new translation request.

**Acceptance Scenarios**:

1. **Given** a page translated with the default "None" style, **When** the reader selects
   "Solid underline" and applies it, **Then** every translated block on the page shows a solid
   underline, the page's original text is visually unchanged, and no content is sent to the
   translation provider again.
2. **Given** a saved style, **When** the reader reloads the page, restarts the browser, and opens a
   new page, **Then** the same style is applied in all three cases without re-selecting it.
3. **Given** no style has ever been chosen, **When** the first translation renders, **Then** the
   "None" style is applied and the page looks exactly as it did before this feature existed.
4. **Given** the style selector, **Then** it lists exactly these fifteen styles, in this order:
   None, Dashed underline, Solid underline, Dashed border, Solid border, Blur (study mode),
   Transparency, Dotted underline, Divider, Highlight, Marker pen, Marker pen 2, Quote, Weakened,
   Gray.
5. **Given** the reader changes the style in the settings page, **When** they open the extension's
   page control, **Then** the page control already shows the same selection, and the reverse holds.

---

### User Story 2 - See what a style looks like before committing to it (Priority: P1)

Text-only names such as "Marker pen 2" or "Weakened" tell a reader nothing. Each option in the
style picker carries a preview icon that demonstrates the style on sample text, and the picker
shows a live sample of the currently selected style, so the reader chooses by sight rather than by
guessing.

**Why this priority**: The request explicitly pairs the styles with their icons. Without visible
previews the catalogue is unusable: the reader cannot tell fifteen styles apart, and would have to
apply each one to a real page to find out what it does.

**Independent Test**: Open the style picker with a screen reader and by keyboard only; confirm every
style exposes a preview icon plus its name, that the icons are visually distinct and legible, and
that the live sample updates when the selection changes.

**Acceptance Scenarios**:

1. **Given** the style picker, **When** it is displayed, **Then** each of the fifteen options shows
   a preview icon that demonstrates that style's treatment on sample text, next to the style's
   name.
2. **Given** the picker, **When** the reader moves the selection to another style, **Then** the live
   sample line updates to show the new style without saving first.
3. **Given** assistive technology or keyboard-only use, **When** the reader navigates the picker,
   **Then** every style is reachable and selectable, its accessible name equals its style name, and
   no option is identifiable by icon alone.
4. **Given** the interface is zoomed to 200%, **When** the picker is displayed, **Then** every
   preview icon and every style name remains legible, undistorted, and unclipped.
5. **Given** a page whose background is dark, **When** the reader compares the picker with the
   rendered translation, **Then** the preview icon and the actual rendering agree in treatment and
   in legibility.

---

### User Story 3 - Study and low-emphasis styles stay readable and accessible (Priority: P2)

A language learner uses the blur style to hide the translation until they have tried the original,
and a reader catching up on a familiar site uses the weakened or gray style to keep translations
visually quiet. In every case the translation must become fully legible on demand, must be readable
by a screen reader, and must not disappear from copying or the browser's find feature.

**Why this priority**: Some of the requested styles intentionally reduce visibility. Shipping them
without a reveal path and an accessibility guarantee would make the product's own interface
inaccessible, which the project's constitution forbids. This story is what makes those styles safe
to ship at all.

**Independent Test**: Apply the blur style, then reveal each translation with the pointer and with
the keyboard, read the page with a screen reader, and use the browser's find feature and copy
commands; confirm that the text is always available and legible on demand.

**Acceptance Scenarios**:

1. **Given** the blur, transparency, or weakened style, **When** the reader points at or keyboard-focuses
   a translation, **Then** the translation becomes fully legible within 150 milliseconds, and returns
   to its subdued state when the pointer or focus leaves.
2. **Given** any concealment style, **When** a screen reader reads the page, the reader selects
   and copies a translation, or the reader searches for its text with the browser's find feature,
   **Then** the full translation text is available unchanged.
3. **Given** the weakened or gray style on both a light and a dark page, **Then** the translation's
   text meets a 4.5:1 contrast ratio for normal-size text and 3:1 for large text against the
   background it actually renders on.
4. **Given** the operating system is in a forced-colors or high-contrast mode, **When** any style
   is applied, **Then** the translation's text remains legible and the fact that it is a translation
   remains conveyed without relying on the style's colour alone.

---

### User Story 4 - Let each site decide how translations look (Priority: P2)

A reader wants highlights on a news site, where translations compete with dense body text, and
quiet quote styling on a documentation site, where highlights are distracting. They set a style
per site and expect the global choice everywhere else.

**Why this priority**: The product already lets readers vary target language and display mode per
site (feature 001). Without the same control over style, a single global choice forces a compromise
on every site, which undercuts the reason readers pick a style at all.

**Independent Test**: Set the global style to Highlight and a site override to Quote, then open one
page on each of two sites; confirm each uses the expected style, and that removing the override
returns the site to the global style without re-translating.

**Acceptance Scenarios**:

1. **Given** a global style and a site override for one domain, **When** a page on that domain is
   translated, **Then** the override is used, and pages on other domains use the global style.
2. **Given** a site override, **When** the reader removes it, **Then** that site immediately uses
   the global style, and the change requires no new translation request.
3. **Given** an existing site override, **When** the reader changes the global style, **Then** the
   override is preserved and only non-overridden sites change.
4. **Given** a site override that names a style the installed version no longer offers, **When** the
   site is opened, **Then** the page renders with the "None" style, the rest of the page's settings
   still apply, and the reader is not shown an error that blocks translation.

---

### Edge Cases

- **Style chosen while translation is still arriving**: translations that arrive after the change
  adopt the new style; the run is neither restarted nor duplicated.
- **Page has its own underlined links or highlighted callouts**: the translation's decoration must
  be scoped to translated blocks and must not be applied to page-authored text, and it must remain
  distinguishable from a link underline.
- **Dark or heavily coloured page background**: every style, and especially highlight, marker pen,
  weakened, and gray, must remain legible; the product must not assume a white background.
- **Translation rendered inside a list item, table cell, or definition list**: decoration must not
  break the list marker, cell borders, or alignment.
- **Very long paragraph or a translation 30% longer than its source**: borders, padding, and dividers
  must not clip text or force horizontal page scroll.
- **Right-to-left target language**: the quote bar, divider, and text alignment must mirror
  correctly; underline and border styles must remain centred on the text.
- **Turning translation off with any style applied**: the page returns to its exact original state,
  with no residual border, underline, background, or padding.
- **Switching styles repeatedly on the same page**: the page must not accumulate decorations or
  performance cost, and the last chosen style must be the one shown.
- **A page with no translated content**: selecting a style must not alter the page at all.
- **Style applied to a selection-only or single-block translation**: the same style applies as for a
  full-page translation.
- **Interface language change**: style names and preview icons' sample text must follow the interface
  language, and the interface language itself is independent of the target translation language.
- **Browser zoom at 200% and a narrow settings window**: the picker and its icons must remain usable
  without horizontal scrolling.

## Requirements *(mandatory)*

### Functional Requirements

**Style catalogue**

- **FR-001**: The product MUST offer exactly the following fifteen translation display styles, with
  stable identifiers and names matching the reference product: None, Dashed underline, Solid
  underline, Dashed border, Solid border, Blur (study mode), Transparency, Dotted underline,
  Divider, Highlight, Marker pen, Marker pen 2, Quote, Weakened, Gray.
- **FR-002**: A reader MUST be able to select one style as the device-wide default, and the selection
  MUST apply to translations rendered after the change and to translations already displayed on the
  current page.
- **FR-003**: Changing the style MUST NOT send page content to the provider again, MUST NOT restart
  or duplicate the translation run, and MUST NOT alter the translation text itself.
- **FR-004**: The selected style MUST persist across page reloads, tab changes, and browser restarts,
  and the default for a device that has never chosen a style MUST be "None", leaving existing
  behaviour unchanged.
- **FR-005**: The settings page and the page control MUST expose the same catalogue and the same
  current selection; a change made in one MUST be visible in the other without requiring a reload.
- **FR-006**: Styles MUST compose with every display mode the product offers (translation alongside,
  above, and instead of the original) and with the existing placement rules; no display mode MUST
  suppress or override the chosen style.

**Preview icons**

- **FR-007**: Every style option MUST show a preview icon that demonstrates that style's visual
  treatment on sample text, displayed together with the style's name.
- **FR-008**: Every preview icon MUST have an accessible name equal to its style name, and the style
  picker MUST be fully operable by keyboard and by screen reader; an icon alone MUST NOT be the only
  way to identify a style.
- **FR-009**: The style picker MUST include a live sample that renders the currently selected style
  using sample text, updating as the reader changes the selection before it is saved.
- **FR-010**: Preview icons MUST remain legible, distinguishable, and undistorted at 100% and 200%
  interface zoom, and MUST convey their style through shape or texture as well as colour.

**Rendering and accessibility**

- **FR-011**: Styles MUST apply only to the product's own translated blocks and MUST NOT restyle
  page-authored elements or text that has no translation.
- **FR-012**: Styles that reduce visibility (Blur, Transparency, Weakened) MUST reveal the full
  translation on pointer hover and on keyboard focus within 150 milliseconds, and MUST NOT remove the
  translation from the accessibility tree, from text selection, from copying, or from the browser's
  find feature.
- **FR-013**: Every style MUST keep translated text legible on both light and dark page backgrounds:
  at least 4.5:1 contrast for normal-size text and 3:1 for large text against the background actually
  rendered behind it.
- **FR-014**: Styles MUST preserve layout: no horizontal page scroll, no overlap, no clipped text, and
  no broken list, table, or code-block structure on the reference page set; they MUST tolerate
  translated text at least 30% longer than its source and MUST render correctly for right-to-left
  target languages.
- **FR-015**: Turning translation off MUST restore the page to its original state for every style,
  leaving no visible or structural residue behind.
- **FR-016**: Switching styles repeatedly on a translated page MUST be idempotent: no accumulation of
  decorations or page structure, and the last selection MUST be the one rendered.
- **FR-017**: Styles MUST apply equally to full-page translations, selection-only translations, and
  single-block translations.
- **FR-018**: The product MUST respect the operating system's forced-colors/high-contrast setting and
  reduced-motion preference: decoration may degrade, but text MUST remain legible and the translation
  MUST remain identifiable without relying on colour alone.

**Precedence, persistence, and resilience**

- **FR-019**: A reader MUST be able to set a per-site style override; a site override MUST take
  precedence over the device-wide style, and removing the override MUST return that site to the
  device-wide style without re-translating.
- **FR-020**: When a saved or site-specific style identifier is unknown or unavailable, the product
  MUST fall back to "None" for that page, MUST keep the rest of that page's settings in effect, and
  MUST NOT block translation or show a blocking error.
- **FR-021**: The style preference MUST be covered by the existing settings lifecycle: it MUST be
  removed by the product's "delete all local data" action and reset to the default, and it MUST NOT
  cause page content to be stored.
- **FR-022**: Style names, style descriptions, and preview sample text MUST come from the product's
  translation catalogue and MUST NOT be hardcoded in source, so that they follow the interface
  language.

### Key Entities

- **Translation Display Style**: one visual treatment a translation can take. Attributes: stable
  identifier, localized name, the treatment it applies (text decoration, border, divider, background
  marking, quote treatment, or reduced visibility), whether it reveals on hover and focus, and the
  preview icon that demonstrates it.
- **Style Preference**: the reader's choice of displayed style. Attributes: the device-wide default
  style and, optionally, a per-site override with the site it applies to.
- **Style Preview Icon**: a visual sample demonstrating one style. Attributes: the style it depicts,
  its accessible name, and the sample text it renders.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All fifteen styles are present in the picker and each renders differently from every
  other style on the same sample text: all 105 pairs are distinguishable in a side-by-side
  comparison of captured renderings.
- **SC-002**: Applying a style to a page holding at least 100 translated blocks restyles all of them
  within 1 second, with zero additional translation requests.
- **SC-003**: The chosen style is still in effect after a reload, a new tab, and a browser restart in
  100% of trials, and a device with no prior choice renders the "None" style.
- **SC-004**: For each of the fifteen styles, turning translation off restores the page to a state
  identical to its pre-translation state, verified by comparing the restored page against the
  pre-translation capture of the same page.
- **SC-005**: Each style renders without layout regression in all three display modes and in both a
  left-to-right and a right-to-left target language — 90 combinations, zero horizontal-scroll,
  overlap, or clipping failures.
- **SC-006**: Every style is reachable and selectable using only the keyboard, and a screen reader
  announces each option's style name and its selected state; no option is identifiable by icon
  alone.
- **SC-007**: For each of the three concealment styles, translations become fully legible on hover
  and on keyboard focus within 150 milliseconds in 100% of trials, and the full text remains
  available to screen readers, selection, copying, and browser find.
- **SC-008**: All fifteen styles meet the 4.5:1 (normal text) and 3:1 (large text) contrast thresholds
  on both a light and a dark reference page, measured per style against the rendered background.
- **SC-009**: Switching styles 20 times in a row on one page leaves the page's structure and the
  translation timing unchanged relative to a single application, and the final style is correct.
- **SC-010**: A site style override is applied on 100% of pages matching that site and on none of the
  pages that do not match; removing it returns the site to the device-wide style in the next render.
- **SC-011**: With the interface language set to a locale whose text runs 30% longer than English,
  no style name is clipped or overlapped, and every preview icon remains legible at 200% zoom.
- **SC-012**: On the reference page set, no style introduces horizontal page scroll, overlapping
  text, or clipped translations, and the captured rendering records the style in effect so that the
  rendering comparison can verify it.
- **SC-013**: After the product's delete-all-local-data action, the style is back to "None" and no
  style preference remains, verified by inspecting the stored configuration and the next rendered
  translation.

## Out of Scope

Excluded by decision; each item is a settled boundary, not a gap awaiting later work.

- **Custom colours and sizes, custom fonts, and the full-style preview gallery**: the reference
  product links to "custom colours and size", "font settings", and "preview all styles"; none of
  these are part of this request, and none are built here.
- **User-authored or importable styles**: no style editor, no theme import/export, and no
  style marketplace. The fifteen presets are the whole catalogue.
- **Restyling the original text**: the feature styles translations only. Dimming, hiding, or
  re-formatting the source text (other than the existing translation-only display mode) is not
  included.
- **Animated transitions between styles**: beyond the 150-millisecond reveal of concealment styles,
  no animation is required.
- **The extension's toolbar/action icon and in-page action icons**: this feature's "icons" are the
  per-style preview icons in the style picker. A toolbar icon, if wanted, is a separate change.
- **Document, PDF, subtitle, image, and e-book translation styles**: consistent with feature 001,
  only web pages are in scope.
- **Per-provider or per-language style selection**: style overrides are global and per site only.

## Assumptions

- **"Icon" means the per-style preview icon.** The request pairs the styles with an icon, and the
  reference settings surface shows each style as a selectable item; this specification therefore
  treats the icon as the preview that demonstrates a style inside the picker and the live sample.
  The extension's toolbar/action icon is a different concern and is left unchanged (see Out of
  Scope). If the intent was instead the toolbar icon, that is a small separate specification.
- **The catalogue mirrors the reference product as observed on 2026-11-14.** The fifteen names and
  their order match Immersive Translate's translation-style list; each style's visual treatment is
  reproduced as behaviour from observation, not copied from its code, assets, or icon files.
- **The default stays "None".** Feature 001 ships translations with no decoration, so a new install,
  an upgraded install, and a page whose site rule predates this feature keep the current appearance
  until the reader chooses otherwise.
- **Styling is device-local and not synced.** The preference follows the same storage and lifecycle
  rules as the rest of feature 001's settings: it survives browser restarts, is cleared by "delete all
  local data", and never leaves the device.
- **The same platform and accessibility obligations apply.** The target remains desktop
  Chrome-family browsers with keyboard and screen-reader support, right-to-left layouts, and all
  user-visible text supplied through the translation catalogue, exactly as feature 001 requires.
- **The reference page set and capture corpus from feature 001 are reused**, extended to record the
  style in effect so the rendering comparison can verify the style, per SC-012.
- **"Study mode" means reveal-on-demand, not a quiz.** The blur style hides the translation until the
  reader hovers or focuses it; it does not grade, score, or track the reader.
