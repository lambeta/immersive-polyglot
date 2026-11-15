# Feature Specification: One Translation Per Passage, However Often Translate Is Pressed

**Feature Branch**: `005-fix-duplicate-translations`

**Created**: 2026-11-15

**Status**: Draft

**Input**: User description: "修复连续点击多次Translate会导致译文重复展示的问题"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pressing Translate several times translates the page once (Priority: P1)

A reader opens an article and presses **Translate**. Nothing visible happens for a moment, so they
press it again — twice, then once more. Today each of those presses starts its own translation pass.
The page ends with two translation blocks under the same paragraph, and one of those blocks is a
translation of the translation that was rendered a second earlier. The reader cannot tell which block
is the real one, and the article is now harder to read than before they asked for help.

What must happen instead: however many times the control is pressed, the page is translated once, and
the result is indistinguishable from a single press — one translation per readable passage, in the
same place, with the same text.

**Why this priority**: This is the reported defect and it is self-defeating. The product exists to
make a page easier to read; pressing its main control makes the page worse, permanently, and spends
the reader's own provider quota doing it. Until the repeat press is harmless, no other work on this
control matters.

**Independent Test**: Open a fixed page, press the translate control five times within one second,
and compare the finished page with the same page translated by a single press: each readable passage
must hold exactly one translation, with identical text and identical placement, and the number of
translation requests must be the same in both cases.

**Acceptance Scenarios**:

1. **Given** an untranslated page and an idle control, **When** the reader presses the translate
   control five times within one second, **Then** the page is translated once and every readable
   passage holds exactly one translation, identical in text and placement to the single-press result.
2. **Given** a translation run still collecting the page's text, **When** the reader presses the
   control again, **Then** no second run starts, no additional translation request is issued, and the
   first run completes normally.
3. **Given** a translation run waiting for the provider, **When** the reader presses the control
   again, **Then** the run is unaffected: the same requests, the same result, no additional
   translation rendered.
4. **Given** a translation run still rendering results, **When** the reader presses the control
   again, **Then** the remaining passages are translated exactly once each and nothing is rendered
   twice.
5. **Given** the page already shows a completed translation but the control has not yet caught up
   with that state, **When** the reader presses the control, **Then** no second run starts and the
   displayed translation stays exactly as it was.
6. **Given** any number of repeat presses, **Then** no rendered translation is a translation of a
   translation the product itself rendered, and every rendered translation is a translation of source
   page text.
7. **Given** any number of repeat presses, **Then** at no moment during the run does one passage show
   two translations — including transiently, before a later repaint hides the extra.

---

### User Story 2 - One turn-off still returns the page exactly as it was (Priority: P1)

Having pressed **Translate** several times, the reader decides they have seen enough and turns
translation off. The page must come back exactly as it was found: no stray translated text left
behind, no leftover translation blocks, no marks on the page's own elements, and the reader's place in
the article unchanged. A repeat press must not create anything that turning translation off cannot
undo.

**Why this priority**: Trust in the product rests on its restore promise — "turning translation off
replays a journal, so the page returns to its original state". If a repeat press can leave output that
no longer belongs to the current run, the promise breaks precisely for the readers who used the
control most. It is inseparable from Story 1: allowing a second run without accounting for it is what
creates unrestorable output.

**Independent Test**: Press the translate control five times on a fixed page, let the single run
finish, turn translation off, and compare the page with a capture taken before translating — content,
attributes, styling and scroll position must match. Repeat the trial turning translation off while the
run is still in progress.

**Acceptance Scenarios**:

1. **Given** a page translated after five presses, **When** the reader turns translation off,
   **Then** the page is identical to the capture taken before translation: no translated text, no
   translation block, no translation attribute or styling, and the scroll position unchanged.
2. **Given** a run still in progress after five presses, **When** the reader turns translation off,
   **Then** the run stops and everything it had rendered so far is removed, leaving the same exact
   restoration.
3. **Given** a page restored after repeated presses, **When** the reader presses the control once,
   **Then** exactly one clean run starts and no fragment, mark or block from the earlier run reappears.
4. **Given** five presses during a run that then fails part-way, **When** the reader turns translation
   off, **Then** the page is restored exactly and the failure report is not duplicated.

---

### User Story 3 - A repeat press costs the reader nothing extra (Priority: P2)

Translations are paid for by the reader's own provider. Pressing the control again must not send the
same page to the provider a second time, must not inflate the usage figures the reader is shown, and
must not consume the session or per-site allowance twice for the same passages.

**Why this priority**: It follows from the same root cause as Story 1 and is separately observable.
The reader's quota, their usage report and their allowance are all part of the product's privacy and
cost story; silently charging for work already done is a defect even after the visual duplication is
gone.

**Independent Test**: Translate the same fixed page once and five times in two separate trials and
compare the requests observed at the provider boundary, the reported counts, the usage figures, and
the remaining allowance.

**Acceptance Scenarios**:

1. **Given** five presses within one second, **When** the run completes, **Then** the number of
   translation requests equals that of a single press, and no request can be attributed to an
   absorbed press.
2. **Given** five presses, **When** the run completes, **Then** the reported translated, failed,
   skipped and reused counts equal the single-press figures, and the usage and allowance figures
   reflect one run.
3. **Given** a run that fails, **When** the reader presses the control five more times, **Then** the
   failure is reported once and the absorbed presses neither clear nor duplicate it.
4. **Given** a run that stops at a volume cap, **When** the reader presses the control again,
   **Then** no new run starts, no passage over the cap is translated, and the cap notice is not
   duplicated.

---

### Edge Cases

- **Press before the run has begun**: two presses dispatched before the page has collected any text
  MUST still result in one run, not two competing starts.
- **Press in every phase**: collecting text, waiting for the provider, rendering results, stopped at a
  cap, failed — a press MUST be harmless in each phase, not only in the steady state.
- **Press immediately after completion**: there is a window in which the run is finished but the
  control still offers translation; a press in that window MUST NOT start a run over an already
  translated page.
- **Many presses**: ten presses MUST behave the same as two; there is no press count at which the
  guarantee lapses.
- **Press with no provider configured**: the reader gets the existing single "no provider" report,
  exactly once, no matter how often they press.
- **Press during a run that is translating a selection**: the page MUST never hold output from two
  runs. While a run is in progress every activation is absorbed, including one that asks for a
  selection: nothing is replaced, nothing is requested, and the run in progress completes unchanged. A
  replacement happens only once the previous run has already ended (see "Page-wide press after a
  selection-only run").
- **Press after an explicit stop**: stopping is a real end of a run. A press afterwards MUST start
  exactly one new run, and that run MUST NOT inherit fragments of the stopped one.
- **Page-wide press after a selection-only run**: the page MUST end with exactly one translation per
  passage and no passage left untranslated, and it MUST stay exactly restorable. A whole page is a
  different target from a selection, so this is a replacement rather than a repeat: the selection's
  output is removed first and those passages are translated again as part of the whole-page run.
  Keeping them instead would leave the output of two runs on one page at the same time, which the
  one-translation-per-passage rule forbids.
- **Late content arriving between presses**: content injected after the first pass MUST be translated
  exactly once, and repeat presses MUST NOT translate it again or translate a translation of it.
- **Press while switching display mode, display style or typography**: the last chosen presentation is
  the one shown, with one translation per passage and no request made on account of the press.
- **Two pages in two tabs, both pressed repeatedly**: each page obeys the one-translation rule
  independently, one page's presses MUST NOT absorb, delay or duplicate the other's, and each tab is
  charged only for the passages it translates — an absorbed press costs nothing, and no passage is
  charged twice within one tab.
- **Right-to-left target language or a 200 percent zoomed page**: the absorbed press changes nothing
  about order, layout, overflow or the scroll position.
- **A page whose text is in the target language already**: passages stay skipped as before; repeat
  presses MUST NOT turn a skipped passage into a translated one.

## Requirements *(mandatory)*

### Functional Requirements

**One translation per passage under repeated activation**

- **FR-001**: When translation is activated while a translation run for that page is in progress, the
  product MUST absorb the activation: no second run starts, no additional translation request is
  issued, no additional translation is rendered, and the run in progress completes unchanged.
- **FR-002**: When translation of the whole page is activated while that page already displays the
  result of a completed whole-page run, the product MUST NOT start another run and MUST NOT render
  another translation.
- **FR-003**: Absorption MUST be independent of timing and phase: it MUST NOT depend on which phase
  the run is in, on how quickly successive activations arrive, or on whether the interface has already
  caught up with the run. This clause refines FR-001 and FR-002 and adds no separate obligation.
- **FR-004**: At no moment may one source passage display more than one rendered translation,
  including transiently during a run.
- **FR-005**: A rendered translation MUST be a translation of the page's own text. The product MUST
  NOT translate a translation it rendered itself.
- **FR-006**: The number of activations MUST NOT change the work performed: activating N times
  (N >= 1) MUST issue exactly the requests of a single activation and produce exactly its result.

**One run per page, and clean replacement**

- **FR-007**: A page MUST have at most one translation run in progress at any moment.
- **FR-008**: When the product replaces a page's current translation — in progress or already
  displayed — with a different translation target (for example translating a newly selected passage),
  it MUST remove everything the previous run rendered as part of the replacement, so the page never
  holds output from two runs and remains exactly restorable.
- **FR-009**: Pages are independent. Activity — including repeated activation — in one page or tab
  MUST NOT absorb, delay, duplicate or otherwise alter activity in another.

**Restoration and starting over**

- **FR-010**: After any number of activations, turning translation off MUST return the page to the
  state captured before translation began: no translated text, no translation block, no translation
  attribute or styling, unchanged layout, and unchanged scroll position.
- **FR-011**: Turning translation off during a run MUST stop that run and remove everything it has
  rendered so far, with the same exact restoration.
- **FR-012**: A run started after a restoration MUST NOT inherit any block, attribute, identifier or
  styling from an earlier run.

**Honest reporting and no wasted allowance**

- **FR-013**: Absorbed activations MUST NOT issue translation requests, MUST NOT consume session or
  per-site volume allowance, and MUST NOT change reported counts or usage figures.
- **FR-014**: Failure, cap and skip reporting MUST be identical to what a single activation reports:
  one notice, correct counts, no duplication by repeat presses.
- **FR-015**: The reader MUST always be able to stop a run, and the state of the page (in progress
  versus translated) MUST be visible without pressing the control a second time.

**Preserved behaviour**

- **FR-016**: The first activation MUST behave exactly as it does today: same placement, display
  mode, display style, typography, language handling, batching, caps, cancellation, late-content
  handling and failure taxonomy.
- **FR-017**: Content that arrives during or after a run MUST be translated exactly once and MUST
  never receive a translation of a translation, regardless of how often the control was pressed.
- **FR-018**: Selection-only translation MUST obey the same one-translation-per-passage rule for the
  selected passages.
- **FR-019**: The change MUST NOT add a setting, preference, storage key or user-visible string, and
  MUST NOT change the labels or placement of the existing controls.
- **FR-020**: Accessibility MUST be unchanged: each passage's translation remains one passage carrying
  the target language, an absorbed activation moves neither keyboard focus nor scroll position, and
  every journey stays operable by keyboard alone.

### Key Entities

- **Activation**: the reader's request to translate — a press of the translate control, or a
  selection-only translation request. An activation is either *honoured* (starts or continues a run)
  or *absorbed* (leaves the page exactly as it was).
- **Translation Run**: one bounded attempt covering one page, from collecting the page's text to
  completion, failure, cancellation or cap. It owns every rendered translation on the page; at most
  one run is in progress per page.
- **Source Passage**: one leaf passage of readable page content — the unit a reader perceives as one
  paragraph — identified by its position and content.
- **Rendered Translation**: the visible translated block belonging to one source passage. Valid only
  when it belongs to the current run and translates source text.
- **Restore Record**: the record of everything a run added to the page, so that turning translation
  off can remove all of it exactly, including after any number of activations.
- **Absorbed Activation**: an activation received while a run is in progress or its result is still
  displayed. It leaves no request, no rendered output, no restored fragment and no allowance charge
  behind.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 20 trials of five activations within one second on the same fixed page, 100 percent
  of readable passages hold exactly one rendered translation, and its text is identical to the
  single-activation result.
- **SC-002**: In the same trials, the number of translation requests equals the single-activation
  number, with zero requests attributable to absorbed activations.
- **SC-003**: Sampling the page every 100 milliseconds for the whole duration of the run across 20
  trials yields zero observations of two translations for one passage — the duplication never appears,
  not even briefly.
- **SC-004**: Across those trials, zero rendered translations have as their source another rendered
  translation.
- **SC-005**: Turning translation off after five activations returns the page to the pre-translation
  capture in 100 percent of trials: identical content, no translation attributes or styling, and an
  unchanged scroll position.
- **SC-006**: Reported counts, usage figures and remaining allowance after five activations equal the
  single-activation figures in 100 percent of trials.
- **SC-007**: A page of 100 readable passages translates after repeated activations within 5 percent
  of the time a single activation takes, with no additional requests.
- **SC-008**: Ten repeat activations during a failing run and during a capped run each produce exactly
  one failure notice and exactly one cap notice, in 100 percent of trials.
- **SC-009**: Five repeat activations of the same selection produce exactly one translation per
  selected passage, and a following page-wide activation still produces exactly one per passage with
  an exact restoration.
- **SC-010**: Two tabs translated at the same time with repeated activations in each: both pages hold
  exactly one translation per passage, neither page is absorbed or delayed by the other, and each tab
  is charged for its own passages only — an absorbed activation is charged nothing, and no passage is
  charged twice within one tab.
- **SC-011**: The full existing test suite passes with no test skipped, weakened or excluded, and the
  regression test for this defect fails before the fix and passes after it.
- **SC-012**: A screen-reader user encounters exactly one translation per passage, hears the run
  status once, and an absorbed activation moves neither focus nor scroll position.

## Out of Scope

Excluded by decision; each item is a settled boundary, not a gap awaiting later work.

- **A deliberate "translate again" or refresh action**: the fix makes a repeat press harmless; it does
  not introduce a way to ask for a fresh translation of an already translated page.
- **Restart-on-repeat**: the chosen behaviour is to absorb a repeat press, not to cancel and redo the
  work (see Assumptions).
- **Segmentation, splitting, batching, prompt and provider behaviour**: unchanged. The number and
  content of requests per run stay exactly as they are today.
- **New interface elements or text**: no spinner, badge, disabled state, toast or new string is
  introduced; the existing state indication and stop action are the feedback.
- **Automatic translation on page load**: the site preference is outside this fix; only activations
  the reader makes are in scope.
- **Cross-tab or cross-run orchestration**: no queue, no scheduling, no resumption of a run after the
  page reloads.
- **Journal persistence across reloads**: a reloaded page starts clean, as today.
- **Translation quality, caching, and performance engineering beyond the stated no-regression bound.**
- **Non-web content**: PDF, video, subtitle, image and e-book translation remain out of scope.

## Assumptions

- **"译文重复展示" means two or more translation blocks for one source passage on the same page,
  including a block that is a translation of an earlier rendered translation.** It is observed when
  the translate control is activated more than once for the same page, in any phase of a run.
- **Reproduced on 2026-11-15 against the existing test harness**: starting a second translation run
  over a page that already showed two translations produced four translation blocks — one additional
  block per paragraph — and treated the already-rendered translations as further page text. The defect
  is in the product, not in how the reader uses it, and it is language- and page-independent.
- **Absorbing is the chosen behaviour, not restarting.** A repeat press asks for what is already
  happening or already done; restarting would spend the reader's provider quota for no new result and
  would visibly flicker the page. A restart option would be a separate, explicitly requested feature.
- **"Already translated" is a state of the page, not of the control.** A page that displays a
  completed translation is in its turn-off state; an activation that arrives in the window before the
  interface reflects that state is still a repeat press.
- **Stopping and turning translation off are real ends of a run.** An activation afterwards legitimately
  starts one new run; that is not a repeat press and is not absorbed.
- **The volume allowance, per-page caps and session caps keep their current meaning.** This feature
  only requires that absorbed activations consume none of them.
- **A reader who presses once notices no change at all**: same translation, same placement, same
  timing, same messages.
- **Behaviour is language-agnostic** and holds for every supported source and target language,
  including right-to-left targets, and at every supported zoom level.
- **The reference pages and fixtures from the earlier features are reused**, extended with a
  deterministic repeated-activation scenario in the existing test harness so the guarantee is
  verifiable offline.
- **No preference, storage key or interface string is added**, so no migration is required and the
  fix is invisible to readers who press the control exactly once.
