# Feature Specification: A Loading Mark on the Passage Being Translated, and Translation Requested on Demand

**Feature Branch**: `007-progressive-translation` (no branch was created: this project registers no
`before_specify` hook, and the working tree stays on `master`)

**Created**: 2026-11-15

**Status**: Draft

**Input**: User description: "渲染优化，翻译行为和Immersive Translate一致，即在对应需要翻译的文本段落后有转圈Loading的标识，表示对该段落文字进行翻译。不要整段翻译，而是要按需翻译。"

## Clarifications

### Session 2026-11-15

- Q: When translation has caught up with everything the reader can see and they stop scrolling, what
  should the extension's panel say, and what action should it offer? → A: Report the page as
  translated with the figures translated so far, and offer the existing action for turning
  translation off; a progress state appears again only while passages are actually being requested or
  awaited, and no new status label is introduced for a partly translated page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The passage being translated says so, in the place its translation will appear (Priority: P1)

A reader opens a foreign-language article and presses **Translate**. From that moment the page shows
no sign of work per passage. The only feedback is a status line inside the extension's panel; a
paragraph simply sits there, then later a translation appears under it — or does not, and the reader
cannot tell whether that paragraph is still being translated, was skipped, or failed. On a long
article the reader has no reason to start reading, because nothing tells them which paragraphs are on
their way.

What must happen instead: as soon as translation begins for a passage, a small rotating loading mark
appears directly after it — in the exact place its translation will occupy — and the moment that
passage's translation arrives, the mark is replaced by the translation, in the same place, with no
intermediate state where both are visible.

**Why this priority**: This is the requested change and it is the product's only per-passage
feedback. Without it a reader cannot tell a working translation from a stalled one, and the
page-by-page filling that on-demand translation requires (Story 2) would look like a page that loads
in random order. The mark is what makes progress legible.

**Independent Test**: Load a fixed page of 40 readable passages, press the translate control, and
sample the page every 100 milliseconds until the passages on screen are translated. For every passage
record the sequence of states it shows: no mark, mark, translation. Each sampled passage must pass
through *mark* and then *translation* in that order, must never show both at once, and must never
show a translation that was not preceded by a mark for that passage.

**Acceptance Scenarios**:

1. **Given** an untranslated page and translation starting, **When** the control is pressed, **Then**
   each passage whose translation has been requested shows exactly one loading mark, placed where its
   translation will appear, before any translation for that passage is on the page.
2. **Given** a passage showing its loading mark, **When** that passage's translation arrives **Then**
   the mark is gone in the same frame the translation appears, and the passage never shows a mark and
   a translation at the same moment.
3. **Given** a passage that already shows its translation, **When** the rest of the page continues to
   translate, **Then** no loading mark appears for that passage again.
4. **Given** translations are shown below the original, **Then** the mark sits after the passage;
   **given** translations are shown above the original, **Then** the mark sits before it; **given**
   only translations are shown, **Then** the mark sits in the translation's position while the
   original paragraph stays visible until the translation arrives.
5. **Given** a passage the product skips for any existing reason — its text is already in the target
   language, it is hidden, editable, code or navigation, or the site opts out — **Then** no loading
   mark ever appears for it.
6. **Given** a passage showing a loading mark, **When** the reader turns translation off, **Then**
   every mark disappears with the translations, leaving no rotating element behind.
7. **Given** a mark on screen, **Then** it holds no words, cannot be selected or copied as text, and
   is not styled as a translation, so it cannot be mistaken for translated prose.

---

### User Story 2 - Only what the reader is about to read is translated (Priority: P1)

A reader opens a very long entry — a wiki article, a documentation page, an endless forum thread —
and presses **Translate**. Today the whole page is sent to the reader's own provider at once: every
paragraph, every footnote, down to the last item the reader will never scroll to. The reader pays for
all of it before reading a single line, the first screenful queues behind content far below, and on a
slow provider the top of the article is often the last part to appear.

What must happen instead: translation is requested for the passages the reader is about to read —
the passages on screen first, then the ones just below the fold — and everything further down costs
nothing until the reader scrolls towards it. Scrolling is what asks for the next stretch of text, and
what the reader passes on the way is filled in behind them.

**Why this priority**: Every character sent is paid for by the reader, out of their own provider
account, and the product promises to spend only what reading requires. Sending an unread page is both
a cost defect and the reason the visible text is slow to arrive. It is also the half of the request
that the loading mark exists to narrate: without a bounded demand, the marks would simply all appear
at once and the change would be cosmetic.

**Independent Test**: Load a fixed page of 200 readable passages with exactly one screenful visible,
press the translate control, wait for the visible passages, and record the passages the provider was
asked for. Then scroll down one screenful at a time to the end, recording the passages requested at
each step. Only passages inside the visible area plus one screenful below it, at the moment they
entered it, must ever be requested; each must be requested exactly once.

**Acceptance Scenarios**:

1. **Given** a 200-passage page with one screenful visible, **When** translation starts, **Then** only
   passages inside the visible area plus one screenful below it are requested, and no passage further
   down is requested or marked.
2. **Given** the reader scrolls down one screenful, **When** passages newly enter that range,
   **Then** they are requested once each and show their loading marks.
3. **Given** the reader reads the first screenfuls and stops, **Then** the passages below are never
   requested, never marked, and never consume any of the reader's session or per-site allowance.
4. **Given** a page whose readable passages all fit on the screen at once, **When** translation
   starts, **Then** the whole page is translated as it is today, and the reader takes no extra step.
5. **Given** the reader jumps to the end of the page, jumps by anchor, resizes the window or zooms,
   **Then** the range they now see is requested as if they had scrolled to it.
6. **Given** a passage whose text repeats one that is already translated on screen, **Then** it is
   filled from that translation without a request and without waiting on the provider.
7. **Given** the reader scrolls quickly past several passages, **Then** the passages they passed are
   still translated (they were on screen when they were requested), and their marks still end in
   translations rather than being left behind.
8. **Given** the page is in a background tab, **Then** no further passages are requested until the
   reader returns, at which point the range they see is requested then.

---

### User Story 3 - No mark ever dangles: every mark ends in a translation, a failure, or nothing (Priority: P1)

Once a page carries a rotating mark per passage, a mark that outlives its reason becomes the product's
most visible lie: a paragraph spinning forever after the reader has cancelled, after the session cap
was reached, after the page was turned back to its original, or after the provider refused that
paragraph. The product's promise is that nothing is ever shown as a translation until a real
translation arrives; the same honesty has to hold for the mark.

What must happen instead: a mark exists only while its passage's translation is genuinely on its way.
It ends in exactly one of two ways — replaced by that passage's translation, or removed and leaving no
trace — and turning translation off removes every mark as exactly as it removes every translation.

**Why this priority**: The restore promise ("the page returns to exactly how it was found") and the
honest-failure promise are the two things readers trust most. Both are directly at risk from a new
element that the product inserts and removes many times per run.

**Independent Test**: Across one full run, stop the run at ten fixed moments (immediately after start,
mid-run, after a passage fails, after a cancel, at a volume cap, after turning translation off, and
during a second run afterwards) and at each moment count the marks on the page and compare the page
with a capture taken before translation. Any moment with a stray mark, and any restored page that
differs from the capture, fails the test.

**Acceptance Scenarios**:

1. **Given** marks on screen, **When** the reader turns translation off, **Then** every mark is gone at
   once and the page matches the pre-translation capture: no mark, no translation, no added marking or
   styling, and the scroll position unchanged.
2. **Given** marks on screen, **When** the reader cancels the run, **Then** every mark is removed
   immediately and no mark from that run reappears.
3. **Given** a passage whose translation fails, **Then** its mark disappears and nothing resembling
   its translation is left in its place, and the failure is reported once through the existing failure
   reporting — not once per passage, and not as a translation.
4. **Given** the reader's session or per-site allowance is exhausted part-way down the page, **Then**
   any mark already showing for a refused passage is removed the moment the refusal is known, no
   further passage gains one, and the existing cap notice is unchanged.
5. **Given** a run that was stopped, failed, or turned off, **When** the reader presses translate
   again, **Then** exactly one new run starts, it carries no mark from the earlier run, and the
   existing rule that a press during a run is absorbed still holds — no second mark, no second
   request.
6. **Given** any moment during any run, **Then** no passage shows two marks, and no passage shows a
   mark and a translation together.
7. **Given** a restored page, **Then** no mark, no leftover marking and no added styling remains
   anywhere in the page, including in passages that had been scrolled past.

---

### User Story 4 - Filling in above does not move what the reader is reading (Priority: P2)

With translation arriving paragraph by paragraph, translations appear above the reader's position as
well as below it. Each block of remembered text pushes the article down, and the line the reader was
on jumps away — the page seems to fight the reader. Accessibility is the same problem from the other
side: a rotating element inserted before every paragraph must not be read out as page text, must not
take keyboard focus, and must not spin for a reader who has asked their system to reduce motion.

What must happen instead: the passage the reader is looking at stays where it is on screen while
translations land above it, the mark stays out of the reading flow and out of the focus order, and its
motion is suppressed when the reader's system asks for less motion.

**Why this priority**: This is not the requested change but a regression it would otherwise introduce.
A feature that makes the page jump would be worse than the page that does not translate paragraph by
paragraph at all. It is below the first three stories only because the page can be read at all while
it is fixed; it cannot be read while the text runs away.

**Independent Test**: Put the reader's viewport on a fixed passage, let the passages above it
translate one at a time, and measure that passage's position on screen after each; then run the
existing accessibility and reduced-motion checks against a page carrying marks.

**Acceptance Scenarios**:

1. **Given** the reader is looking at a passage, **When** the passages above it are translated one by
   one, **Then** that passage stays at the same place on the screen throughout, within a few pixels.
2. **Given** a screen reader, **When** marks appear and are replaced, **Then** no mark is announced as
   text, each translation is still announced once with its target language, and the reading order is
   unchanged.
3. **Given** a keyboard-only reader, **Then** a mark never takes focus, the tab order of the page's
   own controls is unchanged, and the control still starts and stops translation as before.
4. **Given** the reader has asked their system to reduce motion, **Then** marks do not rotate, and
   they remain visible and distinguishable from translations.
5. **Given** the reader has set a translation type size of 200 percent, **Then** the mark stays at its
   own small fixed size and does not grow with the translation text.
6. **Given** a page in a right-to-left target language, **Then** the mark appears on the correct side
   of its passage and does not disturb the mirrored layout.

---

### Edge Cases

- **A passage taller than the screen**: a long block (a single enormous paragraph, a table row, a
  quoted speech) must be requested as soon as any part of it is on screen, not only when its whole
  height fits.
- **A passage inside a collapsed container, an accordion, or a hidden comment thread**: no mark and no
  request while it is hidden; both happen when it is revealed and comes into range.
- **A page of one screenful or less**: everything is in range at once; the reader must see the same
  result as today, with no extra press and no visible difference beyond the marks.
- **Scrolling up again**: passages already translated must not be re-requested, must not be re-marked,
  and must not flicker.
- **Fast scroll to the bottom**: the range that ends up visible is what gets requested. A passage
  that was on screen even for one frame is requested and ends in a translation; a passage no frame
  ever showed is not requested, must not be marked, and is taken when the reader comes back to it.
- **Zoom change, window resize, on-screen keyboard or browser sidebar narrowing the reading width**:
  the range recalculates; passages that became visible are requested; nothing already translated is
  touched.
- **Page printed, saved, or opened in print preview**: a mark is transient progress, so a printed or
  saved copy must not present one as page content, and printing must not itself request anything.
- **Two windows, or two tabs, on the same page**: each page keeps its own marks and its own requests;
  one page's scrolling must not mark or charge the other.
- **Late content — infinite scroll, a single-page app navigating, a comment box expanding**: it is
  treated like any other passage: marked and requested when it comes into range, not merely because
  it arrived.
- **A passage whose translation arrives while the reader has scrolled far away**: its mark is still
  replaced by its translation, wherever it is.
- **A mark whose request is refused by the provider for one passage only**: that mark ends; the rest
  of the run continues.
- **The provider never answers**: the mark ends when the run's timeout or failure reporting ends it;
  no mark may outlive the run.
- **A page whose text is already in the target language**: nothing is marked, nothing is requested,
  and the panel reports the same skips as today.
- **Very long words, right-to-left target, 200 percent translation type, and the fifteen display
  styles**: the mark is unaffected by all of them; it is not concealed, blurred, underlined or marked
  by the style chosen for translations.

## Requirements *(mandatory)*

### Functional Requirements

**The loading mark, one per passage, in the translation's place**

- **FR-001**: When a passage's translation is requested, the product MUST show exactly one loading
  mark for that passage, in the position that passage's translation will occupy, before the request
  for it is issued. No mark may appear on a page whose translation has not been asked for.
- **FR-002**: The mark MUST sit after the passage when translations are shown below the original,
  before it when they are shown above, and in the translation's position when only translations are
  shown — while in that last mode the original passage stays visible until its translation arrives.
- **FR-003**: When the passage's translation arrives, the mark MUST be replaced by that translation in
  the same position, and the two MUST NOT be visible for that passage at the same moment, including
  transiently.
- **FR-004**: A passage that already shows its translation MUST NOT show a mark again during the same
  run, and a passage MUST NOT show two marks at any moment.
- **FR-005**: The mark MUST contain no words, MUST NOT be given the chosen translation display style
  or the reader's translation typography, and MUST NOT be selectable, copyable or focusable, so that
  it is distinguishable from translated prose at a glance.
- **FR-006**: A passage the product skips for an existing reason — its text is already in the target
  language, it is hidden, editable, code or navigation, or the site opts out — MUST NOT show a mark.
- **FR-007**: The mark MUST be identifiable against the page backgrounds the product already supports
  (light, dark, tinted and mid-gray), and at every supported zoom level.
- **FR-008**: A mark MUST NOT be counted as a translated passage, MUST NOT contribute to the reported
  translated, failed, skipped or reused figures, and MUST NOT be treated as a passage's translation by
  any later step of the run.
- **FR-009**: The mark MUST be part of what the product added to the page, so turning translation off
  removes it exactly as translation blocks are removed.

**Requesting only what the reader is about to read**

- **FR-010**: The product MUST request translations only for a bounded demand window: the passages
  intersecting the visible area, plus passages up to one screenful below it as a lookahead. This
  lookahead MUST be a fixed product default, MUST NOT require configuration, and MUST NOT exceed one
  screenful.
- **FR-011**: As scrolling, paging, jumping to an anchor, resizing the window, changing zoom, or new
  content moves further passages into that window, they MUST be requested — exactly once per passage
  per run.
- **FR-012**: Passages outside the window MUST NOT be requested, MUST NOT show a mark, and MUST NOT
  consume any of the reader's session or per-site allowance.
- **FR-013**: Within a round of requests, passages in the visible area MUST be requested ahead of
  lookahead passages, so the reader's current screen is filled before content further down.
- **FR-014**: The existing concurrency ceiling and batching MUST continue to hold: one request may
  still carry several passages, provided every passage in it lies inside the demand window, and the
  number of requests per passage MUST NOT increase because translation became on demand.
- **FR-015**: A passage repeating text that is already translated inside the window MUST be filled
  from that translation without a request, exactly as repeats are handled today.
- **FR-016**: While the page is not visible to the reader — a background tab, a minimised window —
  no further passage MUST be requested; when the page becomes visible again, the window the reader
  then sees MUST be requested.
- **FR-017**: A page whose readable passages all lie inside the window when translation starts MUST be
  translated in full, exactly as it is today, without an extra step from the reader.
- **FR-018**: Content that arrives after the run started MUST be requested when it enters the demand
  window, not merely because it arrived; while it is outside the window it MUST NOT be marked or
  requested.
- **FR-019**: The volume caps MUST keep being applied at the moment each passage is dispatched; a
  passage refused by a cap MUST NOT be left showing a mark, and the existing cap notice MUST be
  unchanged.
- **FR-020**: At no point may the product request the same passage twice in one run, whether the
  second attempt would come from scrolling back, from late content, or from a repeated activation.

**Every mark ends, and turning translation off leaves no trace**

- **FR-021**: Every mark MUST end in exactly one of two ways: replaced by its passage's translation,
  or removed. A mark MUST be removed when its passage fails, when a cap refuses it, when the run is
  cancelled, and when translation is turned off.
- **FR-022**: A passage whose translation fails MUST NOT show anything that reads as its translation;
  the failure MUST be reported once through the existing failure reporting, and the remaining passages
  MUST continue to be translated.
- **FR-023**: Turning translation off at any moment MUST remove every mark and every motion of it, and
  MUST return the page to the state captured before translation began: no mark left in the page, no
  marking added to the page's own text, no added styling, and the reader's scroll position unchanged.
- **FR-024**: Cancelling or stopping a run MUST remove every mark immediately, and no mark from a
  stopped run MUST reappear — including for a request that finishes after the stop.
- **FR-025**: The rule that an activation during a run is absorbed MUST still hold: a press while marks
  are on screen MUST NOT add a mark, MUST NOT issue a request, and MUST NOT start a second run. A new
  run can begin only after the previous one has been stopped or turned off.
- **FR-026**: A run started after translation was turned off MUST NOT inherit a mark, a marking or a
  styling from the earlier run.

**Reading continuity and access**

- **FR-027**: While translations fill in elsewhere on the page, the passage the reader is looking at
  MUST keep its position on screen; the page MUST NOT jump away from the reader's place in the text.
- **FR-028**: The mark MUST NOT be announced as page text or as a translation, MUST NOT enter the
  keyboard focus order, MUST NOT change the reading order, and MUST NOT change the target-language
  marking of translations.
- **FR-029**: The mark's motion MUST respect the reader's reduced-motion preference: with motion
  reduction requested, the mark MUST be static and still visible.
- **FR-030**: The mark's size MUST NOT scale with the reader's translation type size, and the mark MUST
  remain identifiable at every supported zoom level.
- **FR-031**: The product's reported state MUST stay truthful while only part of a page has been
  translated: figures MUST count only passages actually translated, a page MUST NOT be reported as
  translated while passages the reader is looking at are still being requested or awaited, and the
  existing action for turning translation off MUST remain available for as long as the run is open.
  When every passage the reader can see has been translated and nothing is in flight, the product MUST
  report the page as translated, with the figures translated so far, and MUST keep offering that same
  action; a progress state MAY return only while passages are actually being requested or awaited, and
  no new status label MAY be introduced for a partly translated page.

**Preserved behaviour**

- **FR-032**: Placement of translations, the three display modes, the fifteen display styles, the
  translation typography, target-language marking and right-to-left handling MUST be unchanged.
- **FR-033**: One translation per passage, reuse of repeated text, exact restoration, scroll-position
  restoration, the failure taxonomy and its single-notice reporting, the honesty rule that nothing is
  shown as a translation before a real one arrives, and the volume caps MUST all be unchanged.
- **FR-034**: The change MUST NOT add a setting, preference, stored value, new user-visible text, or
  anything new sent to the provider, and MUST NOT require the reader's existing configuration to
  change.
- **FR-035**: Selection-only translation and single-block translation MUST keep working, showing marks
  for the passages they target with the same rules.
- **FR-036**: Pages and tabs are independent: activity in one MUST NOT mark, absorb, delay, duplicate
  or charge passages in another.
- **FR-037**: Every journey MUST remain operable by keyboard alone with the existing accessibility
  guarantees intact.

### Key Entities

- **Source Passage**: one leaf passage of readable page content — what a reader perceives as a single
  paragraph — identified by its position and text. It is the unit of marking, requesting, charging and
  restoring.
- **Loading Mark**: the transient progress indicator belonging to exactly one source passage,
  occupying the position that passage's translation will take. It exists only while that passage's
  translation is genuinely on its way, and it always ends in that translation or in its own removal.
- **Demand Window**: the set of passages the reader is about to read — the visible area plus a fixed
  one-screenful lookahead. Only passages inside it may be requested or marked.
- **On-Demand Run**: one open attempt over one page, from activation to being turned off, cancelled or
  failed. It stays open while scrolling may still bring new passages into the window; it owns every
  mark and every translation on the page, and at most one run exists per page.
- **Translation Block**: the visible translated text belonging to one source passage, in the reader's
  chosen display mode and style. Valid only for the current run and only when it translates page text.
- **Allowance Charge**: the cost of sending one passage to the reader's provider, counted against the
  session and per-site allowance at the moment it is dispatched. A passage never inside the demand
  window incurs no charge.
- **Restore Record**: the record of everything a run added to the page — translations, marks and the
  marks' styling — so that turning translation off removes all of it exactly.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a fixed page of 200 readable passages with one screenful visible, in 20 trials, 100
  percent of the passages on screen show either a loading mark or their translation within 1 second of
  the control being pressed.
- **SC-002**: In the same trials, zero passages more than one screenful below the visible area are
  requested or marked, and zero characters are sent for them.
- **SC-003**: Sampling the page every 100 milliseconds for the whole duration of the run across 20
  trials yields zero observations of a passage showing both a mark and a translation, zero
  observations of two marks on one passage, and zero passages whose translation appeared without a
  mark preceding it.
- **SC-004**: Reading the first 20 passages of that 200-passage page and then turning translation off
  sends at most 30 percent of the characters the same page sends today when translated in full, and
  zero characters attributable to passages the reader never brought into view.
- **SC-005**: Scrolling that page from top to bottom one screenful at a time requests every passage
  exactly once, and 100 percent of the passages the reader passes end with a translation rather than a
  mark.
- **SC-006**: At ten sampled moments across a run — start, mid-run, after a failure, after a cancel,
  at a cap, after turning translation off, and during a second run — the page shows zero stray marks
  in 100 percent of trials.
- **SC-007**: Turning translation off at a random moment while marks are on screen returns the page to
  the pre-translation capture in 20 of 20 trials: identical content, no added marking or styling,
  unchanged scroll position.
- **SC-008**: With the reader's viewport parked on one passage while the 19 passages above it are
  translated one at a time, the parked passage stays within 4 pixels of its original screen position
  in 20 of 20 trials.
- **SC-009**: A screen-reader user hears each translation exactly once when it arrives, hears no mark
  at all, and encounters no focus change; the keyboard-only journey from turning translation on to
  turning it off is unchanged.
- **SC-010**: With motion reduction requested of the system, 100 percent of marks are static and
  remain visible.
- **SC-011**: On a page whose readable passages all fit on one screen, translation issues the same
  number of requests as today and produces the same result, with no extra step for the reader.
- **SC-012**: A scripted 30-second scroll across a 300-passage page during translation never delays
  the page's response to scrolling by more than 50 milliseconds on account of the product, and shows
  no burst of visibly dropped frames.
- **SC-013**: The full existing test suite passes with no test skipped, weakened or excluded.

## Out of Scope

Excluded by decision; each item is a settled boundary, not a gap awaiting later work.

- **Translating the whole page in the background anyway.** Pre-fetching unread passages is exactly
  what this change removes; a "translate the whole page now" action is not part of it.
- **Preferences for the lookahead distance, the mark's appearance, or the ordering policy.** The
  lookahead is a fixed product default and the mark has one product-wide look.
- **Per-passage retry or refresh controls.** Recovery stays as it is today: the reader can turn
  translation off and on again.
- **Progress bars, skeleton text, estimated remaining text, or a translated-percentage figure** in
  place of the mark.
- **Caching translations across page loads or browser sessions.** No page content is persisted.
- **Changing the prompt, the provider request format, or the batching rules beyond restricting which
  passages may be included.**
- **Changing the three display modes, the fifteen display styles, the translation typography, or the
  settings page.**
- **Non-web content**: PDF, image, video subtitle, e-book, and text inside input fields.
- **Cross-tab scheduling, pre-warming of pages, or translating a page before the reader opens it.**
- **Automatic translation on page load** beyond the site preference starting the same on-demand
  behaviour.

## Assumptions

- **"与 Immersive Translate 一致" is read as: one rotating mark per passage, in the slot that passage's
  translation will occupy, replaced in place when the translation arrives, so the page fills in from
  the reader's position outward.** It does not imply copying any other behaviour of that product, and
  nothing about its implementation is used.
- **"不要整段翻译，而是要按需翻译" is read as a change of scope, not of granularity.** A passage remains
  the smallest unit — a paragraph is never split into several requests — but a page is no longer sent
  as a whole. Sending only the passages the reader is about to read is what "on demand" means here.
  An alternative reading (per-sentence requests) is rejected because it would raise the request count
  and break the existing batching guarantee.
- **"在文本段落后" means below the passage, which matches the product's default "translation below
  original" mode.** In the other two modes the mark sits where that mode puts the translation, because
  a mark below a passage whose translation appears above would point at the wrong place.
- **The lookahead default is one screenful below the visible area.** It is fixed rather than
  configurable: enough that ordinary scrolling never waits, small enough that unread text is not paid
  for. This default is the product decision the specification asks, not an implementation detail.
- **A run stays open for the page.** Scrolling and late content extend the same run rather than
  starting new ones; the one-run rule of the earlier fix — a press during a run is absorbed — is
  preserved unchanged. Only turning translation off, cancelling, or a failure ends a run.
- **Reported figures describe what has been translated, not what remains below the fold.** A page with
  untranslated passages further down is reported as translated once the reader's own screen is done,
  exactly as a reader would describe what they can see, and the reading position is never blocked
  waiting for the bottom of the page. The panel's existing wording covers that state, so the run being
  still open stays invisible and no new label is added.
- **A failed passage shows nothing in its place.** It is not decorated with an error block, retry
  button or placeholder text; the existing failure report is the only notice, and recovery is turning
  translation off and on again, as today.
- **The mark is a small rotating indicator with a fixed, product-wide size**, independent of the
  reader's translation type size and of the page's own typography, and it is suppressed when the
  system asks for reduced motion. Being wordless, it introduces no new translatable string.
- **Charges only fall.** Restricting requests to the demand window can only lower what the reader's
  provider is asked to translate; no passage is sent twice, and the same allowance rules apply.
- **Short pages, selection-only translation and single-block translation keep their current
  behaviour**, gaining only the mark.
- **The reference page set is reused and extended** with one deterministic long page of at least 200
  passages, so the request scope and the mark lifecycle can be judged offline against a fixed input.
- **Depends on behaviour that already exists and must keep working**: translation placement per
  passage, the record of everything a run added to the page, the concurrency ceiling, the volume caps
  and the one-run rule. This change constrains *when* a passage may be requested and adds the mark to
  what a run adds to the page; it replaces none of them.
- **Behaviour is language-, provider- and page-agnostic**, including right-to-left targets, every
  supported zoom level, and every one of the fifteen display styles.
