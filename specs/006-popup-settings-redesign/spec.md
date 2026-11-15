# Feature Specification: One System for the Page Control and the Settings Page

**Feature Branch**: `006-popup-settings-redesign` (no branch was created: this project registers no
`before_specify` hook, and the working tree stays on `master`)

**Created**: 2026-11-15

**Status**: Draft

**Input**: User description: "重新设计 immersive polyglot 的页面以及 settings 页面" — this invocation
carried no further arguments, so the description is the request that produced the change now in
this working tree: rebuild the extension's two surfaces, the page control and the settings page, as
one designed system rather than as two browser-default forms.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The panel answers "what is happening, where am I, what do I press" (Priority: P1)

A reader is on a foreign-language article and opens the extension's panel. They have not opened the
settings page in weeks and do not remember how any of it is configured. Today the panel is a stack
of native controls of equal weight: the status is a sentence in the same size as everything else, the
one action is a small default button, and the fifteen display styles are a scrolling radio list.
Nothing on it says "press this first".

What must happen instead: within one glance and without scrolling, the panel states which site it is
about, whether that page is translated or not, and offers exactly one primary action — translate, or
show the original again. Everything else on the panel is visibly secondary to that action.

**Why this priority**: This is the surface used on every translated page, by every reader, before
anything else in the product is seen. If it does not read at a glance, the product looks like a
developer tool and the reader concludes the product is complicated.

**Independent Test**: Open the panel on a fixed page with one provider configured, without opening
the settings page first: the site, the state and the primary action are all visible without
scrolling, the action is enabled and reads "Translate this page", and pressing it produces the
page's translation with the panel reporting completion.

**Acceptance Scenarios**:

1. **Given** an untranslated page and a configured provider, **When** the reader opens the panel,
   **Then** without scrolling they see the current site, a state line reading that the page is not
   translated, and one primary action reading "Translate this page".
2. **Given** a translated page, **When** the reader opens the panel, **Then** the state line reports
   that the page is translated together with how many passages were translated, and the primary
   action reads "Show original".
3. **Given** a run still collecting or translating the page, **When** the panel is open, **Then** the
   state line says so in words, and a cancel action is offered beside the primary action.
4. **Given** no enabled provider, **When** the reader opens the panel, **Then** the primary action is
   not pressable and the panel says why, naming the settings page as the fix.
5. **Given** the panel opened where there is no web page to act on (a browser page or another
   extension's page), **Then** the panel still opens, says so plainly, and keeps the way into the
   settings page reachable.
6. **Given** a run that hit a failure, a broken routing rule or a volume cap, **When** the panel is
   open, **Then** each condition appears as its own readable line, and none of them replaces the
   primary action.

---

### User Story 2 - A first-time reader adds a provider and sees it stored (Priority: P1)

A reader has installed the extension and has an API key for a provider they already pay for. Today
the settings page is a row of equal-weight browser-default tabs over a form of eight fields, with the
privacy disclosure, the form, the saved list and three more buttons stacked in one uniform column.
The reader cannot tell what is required, what is optional, and what just happened after pressing
save.

What must happen instead: the settings page presents itself as a map of named sections, opens on the
one that matters first, states what leaves the device before any credential can be typed, requires
one short group of fields, and reports the result of every save in place. A saved provider is listed
with what identifies it, what it points at, and whether it has ever been checked.

**Why this priority**: Without a provider the product does nothing, and this is the one screen where
a new reader can fail permanently. It is also the screen where the product makes its privacy promise.

**Independent Test**: In an empty profile, open the settings page, read the disclosure, acknowledge
it, enter a name, endpoint, model and credential, save, and then test the connection: the saved row
appears with the endpoint and model it will call, the remembered verification result is shown, and
the credential is never displayed in full again.

**Acceptance Scenarios**:

1. **Given** an empty profile, **When** the settings page opens, **Then** the providers section is
   the one shown, and the disclosure about what leaves the device is visible before the credential
   field is usable.
2. **Given** the disclosure is not acknowledged, **When** the reader tries to type a credential,
   **Then** the field refuses input, and acknowledging the disclosure enables it in the same view.
3. **Given** an incomplete or invalid set of fields, **When** the reader saves, **Then** each failing
   field carries its own reason directly under it, the first failing field takes the focus, and
   nothing is written.
4. **Given** a valid set of fields, **When** the reader saves, **Then** the saved provider appears in
   the list naming its endpoint and model, the form remains on that provider, and an in-place status
   line confirms the save.
5. **Given** a saved provider, **When** the reader tests the connection, **Then** the result is
   reported in place and recorded on the provider's row together with when it was checked.
6. **Given** a saved provider, **When** the reader deletes it, **Then** deletion is confirmed first,
   the credential goes with it, and any rule that pointed at it is reported.

---

### User Story 3 - The reader changes how translations read without leaving the page (Priority: P2)

The reader is halfway through an article and the translation is too faint, or sits on the wrong side
of the paragraph. Today the panel offers a display-mode dropdown and a fifteen-row radio list with no
indication of which one is active beyond a radio dot, and choosing a style is not obvious until the
page repaints.

What must happen instead: the panel states the current choice in words, offers the display positions
as one visible three-way switch, and offers all fifteen styles as a labelled grid of preview marks.
Choosing either one changes this site only, takes effect on the page without translating it again,
and survives closing the panel.

**Why this priority**: This is the daily adjustment of a reading tool, and it is the product's
differentiator in its own category. It is P2 rather than P1 because the product is still useful when
the default style is wrong.

**Independent Test**: With a page already translated, open the panel, choose a different style, and
observe the rendered translations change within one second with no additional provider request; close
and reopen the panel and find the same style still selected and named.

**Acceptance Scenarios**:

1. **Given** a translated page, **When** the reader chooses another style in the panel, **Then** the
   translations already on the page redraw in that style without a new translation request.
2. **Given** a style chosen in the panel, **When** the reader opens the settings page, **Then** the
   device-wide style is unchanged and the choice is attached to that site.
3. **Given** the panel, **Then** the chosen style's name is readable as text as well as shown by the
   highlighted option, so the choice does not depend on colour or on a glyph alone.
4. **Given** the three display positions, **When** the reader changes position, **Then** the page
   redraws with translations below, above or instead of the original, and the site remembers it.
5. **Given** the panel's provider choice, **When** the reader picks a specific provider, **Then** the
   next translation of that page uses it and no stored routing rule is modified.
6. **Given** the style grid, **When** the reader uses the arrow keys with focus in it, **Then** the
   selection moves between styles, the chosen name updates, and the page follows.

---

### User Story 4 - The same two surfaces work on a keyboard, in dark, at 200% and in longer words (Priority: P2)

A reader uses a keyboard, or a dark browser theme, or a 200% zoom, or a locale whose words run longer
than English. For them the product must not become a different, harder product.

What must happen instead: both surfaces are fully operable by keyboard with visible focus; every
colour pair used for text clears a readable contrast in both themes; at 200% zoom and with labels 30%
longer nothing is clipped, overlapped or pushed off the screen; and nothing depends on colour to carry
meaning.

**Why this priority**: The product teaches languages; an interface that assumes one language, one
theme and one input device contradicts its own premise, and the project constitution makes both
non-negotiable. It is P2 because it gates every other story rather than adding a journey of its own.

**Independent Test**: Walk both surfaces with the keyboard only, at 200% zoom, in the dark theme and
with every label extended by 30%: every control is reachable, its focus ring visible, no text is cut
off, and no panel scrolls sideways.

**Acceptance Scenarios**:

1. **Given** either surface, **When** the reader presses Tab repeatedly, **Then** focus moves through
   the controls in reading order, every control shows a visible ring, and the first Tab lands on an
   operable control.
2. **Given** the browser in a dark theme, **When** either surface opens, **Then** it renders dark, and
   every text colour meets a readable contrast against the ground behind it.
3. **Given** 200% zoom and labels 30% longer than English, **Then** no label is clipped, no two rows
   overlap, and no panel or field row scrolls sideways.
4. **Given** the reduced-motion preference, **Then** nothing animates, and nothing that animates is
   left invisible or empty.
5. **Given** any state expressed by colour in either surface (translated, failed, capped, selected),
   **Then** the same state is also readable in words.

---

### User Story 5 - The rest of the settings page is a map, with results shown where they happen (Priority: P3)

A reader returns to change routing, add a site preference, pin glossary terms, or check that a
credential is still masked. Today all of this is one long column of equal-weight fields, and the only
feedback is a line of text somewhere below the button that was pressed.

What must happen instead: each remaining section is its own named place with a sentence saying what it
governs; every section's write reports its result next to the control that caused it; every list shows
what is stored and offers its actions on its own row; and the display section shows the reader's own
typeface and size applied to a sample sentence before anything is saved.

**Why this priority**: These are the settings a working reader touches occasionally. They matter for
long-term trust but not for first value.

**Independent Test**: In each remaining section, make one change and observe an in-place result and a
list row that reflects it; in the display section, change the typeface and size and observe the sample
change before saving.

**Acceptance Scenarios**:

1. **Given** the settings page, **When** the reader switches sections, **Then** one section is shown
   at a time, each with its own heading and one sentence of purpose, and no reload occurs.
2. **Given** any section with a save action, **When** it is used, **Then** the result appears next to
   that action, and a failure appears as words rather than as a missing action.
3. **Given** the display section, **When** the reader changes the typeface or size, **Then** the
   sample updates immediately and the stored value does not change until the save action is used.
4. **Given** the routing, site, glossary and cap lists, **Then** each row names the thing it
   configures and carries its own delete action, and a rule pointing at a missing provider is marked
   as broken.
5. **Given** the privacy section, **When** the reader deletes all stored data, **Then** the action is
   confirmed first and the whole page falls back to defaults without a reload.
6. **Given** the diagnostics section, **Then** the stored keys are listed with credentials shown
   masked, and refreshing does not modify anything.

---

### Edge Cases

- **No provider at all, or every provider disabled**: the panel's primary action is not pressable and
  names the settings page as the fix; the settings page's provider list carries an empty state that
  says what to add.
- **Panel opened on a page it cannot act on**: a browser page, a store page or another extension's
  page. The panel opens, says there is no web page in this tab, and keeps the way into settings.
- **A routing rule pointing at a deleted provider**: the panel reports the substitution it made and
  the settings page marks that rule broken, while translation still proceeds.
- **The volume cap is reached**: the panel reports it and how many passages were held back; nothing
  is silently dropped.
- **Usage grows past the panel's height**: the panel may scroll for the session record, but the state,
  the primary action and the way into settings stay reachable.
- **The style grid at 200% zoom with styles 30% longer than English**: options wrap onto more rows and
  never clip, overlap, or overflow the section.
- **The system theme changes while a surface is open**: colours follow without a reload and without
  losing unsaved input.
- **All stored data deleted while the panel is open**: the panel falls back to the "no provider" state
  rather than offering an action that cannot work.
- **A credential already stored**: the field shows only a standing mask and keeps the stored secret
  when left untouched.
- **A page in a right-to-left language**: both surfaces keep their own left-to-right layout, and the
  translations on the page remain in the document's flow.

## Requirements *(mandatory)*

### Functional Requirements

**The page control**

- **FR-001**: The panel MUST show, without scrolling: the site it is about, the current translation
  state in words, and exactly one primary action.
- **FR-002**: The panel MUST toggle its single primary action between translating the page and
  returning the page to its original state; a second, differently styled call to action MUST NOT
  compete with it.
- **FR-003**: The panel MUST report progress and failures as words, keep each distinct condition
  (failure, broken rule, volume cap) on its own line, and never let a condition replace the primary
  action.
- **FR-004**: The panel MUST disable the primary action when no provider is enabled and MUST name the
  settings page as the remedy.
- **FR-005**: The panel MUST offer the three display positions as one visible three-way choice and
  MUST apply a change to the current site only, without re-translating the page.
- **FR-006**: The panel MUST offer all fifteen display styles in a grid in which each style is
  separately selectable with a preview mark and an accessible name, and MUST state the chosen style's
  name in words.
- **FR-007**: The panel MUST let the reader pick a provider for this page without modifying any stored
  routing rule.
- **FR-008**: The panel MUST keep the way into the settings page reachable in every state, including
  while the session record scrolls.
- **FR-009**: The panel MUST keep its untranslated layout within the browser's panel height limit
  (600 px) so that it opens without scrolling.
- **FR-010**: The panel MUST show the session record (passages translated, characters sent, passages
  reused, skipped and failed) only when there is something to report.

**The settings page**

- **FR-011**: The settings page MUST present itself as named sections shown one at a time, each with a
  heading and one sentence stating what the section governs, and MUST NOT require a reload to switch.
- **FR-012**: The settings page MUST open on the providers section, and MUST show what leaves the
  device before the credential field accepts input; acknowledgement MUST enable the field in the same
  view.
- **FR-013**: Every write on the settings page MUST report its result next to the control that caused
  it; validation failures MUST appear under the field that failed, with the focus moved to the first
  failing field, and nothing MUST be stored when validation fails.
- **FR-014**: Every stored collection (providers, rules, site preferences, glossary terms, per-site
  caps) MUST be shown as rows naming what it configures, with its own actions, and MUST carry a
  specific empty state.
- **FR-015**: The display section MUST show the reader's chosen style, typeface and size applied to a
  sample before saving, and MUST leave stored values unchanged until the save action is used.
- **FR-016**: Destructive actions (deleting a provider, deleting all stored data) MUST be confirmed
  before they run and MUST state their result afterwards.
- **FR-017**: The settings page MUST NOT present a control whose effect cannot be observed: every
  control on it changes something the reader can see, and any control that cannot yet take effect
  MUST be removed rather than shown inactive.

**One system for both surfaces**

- **FR-018**: Both surfaces MUST be drawn from one visual system: one accent colour, one button
  family (primary, secondary, danger), one card, one radius scale, one type scale and one focus ring.
- **FR-019**: Text MUST meet at least 4.5:1 contrast against its own ground in both the light and the
  dark theme, and colour MUST NOT be the only carrier of any state.
- **FR-020**: Both surfaces MUST follow the browser's light or dark theme without a manual switch and
  without losing unsaved input.
- **FR-021**: Animation MUST be limited to hover, press, selection and load; nothing MUST move as a
  consequence of scrolling; under a reduced-motion preference everything MUST rest and no content
  MUST be hidden.
- **FR-022**: All user-visible text MUST come from the translation catalog; no string may be written
  into the markup.
- **FR-023**: Both surfaces MUST remain usable at 200% zoom and with labels 30% longer than English:
  no clipped label, no overlapping row, no sideways scrolling.
- **FR-024**: Both surfaces MUST fit any viewport from 320 px upward without sideways scrolling, and
  the settings page MUST collapse to one column below 1024 px.
- **FR-025**: Both surfaces MUST be operable by keyboard alone: reading order matches visual order,
  the first Tab reaches an operable control, focus is always visible, grouped choices move with the
  arrow keys, and no element takes focus out of order.

**Honesty and privacy**

- **FR-026**: Every typeface used by either surface MUST ship inside the extension, and opening either
  surface MUST NOT issue a request to any third party.
- **FR-027**: The panel and the settings page MUST agree on stored state without a reload: a change
  made in one is reflected in the other while both are open.
- **FR-028**: A stored credential MUST never be shown in full again after it is saved.

### Key Entities *(include if feature involves data)*

- **Settings profile**: the reader's configuration as a whole — providers, routing rules, site
  preferences, glossary, display style and typography, style instruction, volume caps. Persisted; both
  surfaces read it and write it through the same store.
- **Provider**: a translation endpoint the reader added — name, endpoint, model, optional extra
  headers, timeout, concurrency, enabled flag, and the last verification result with its timestamp. Its
  credential is stored separately and is only ever readable as a mask.
- **Site preference**: what one site gets instead of the device-wide defaults — provider override,
  display position, display style, target language, automatic translation.
- **Routing rule**: a mapping from a site or a language pair to one provider, which may point at a
  provider that no longer exists.
- **Display style**: one of fifteen named treatments applied to a rendered translation, each with a
  preview mark, and the reader's device-wide choice plus per-site overrides.
- **Session record**: what the current translation run cost — passages translated, reused, skipped and
  failed, and characters sent. Reported, never stored as content.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader opening the panel on an untranslated page sees the site, the state and the
  primary action without scrolling, at the browser's 600 px panel height, in every state the panel can
  be in (idle, working, translated, failed).
- **SC-002**: The panel's untranslated layout measures under 600 px tall, and its translated layout
  with three session lines also measures under 600 px, so it opens without a scrollbar in both the
  first-use and the daily case.
- **SC-003**: All fifteen display styles are selectable in the panel and in the settings page; after a
  change, every translation already on the page has redrawn within one second, and the provider
  request count is unchanged.
- **SC-004**: At 200% zoom with labels 30% longer than English, both surfaces report zero clipped
  labels, zero overlapping rows and zero sideways overflow.
- **SC-005**: From 320 px to 1920 px wide, both surfaces report zero sideways overflow; below 1024 px
  the settings page shows one column.
- **SC-006**: Every text colour pair in both themes measures at least 4.5:1, and no state is
  communicated by colour alone (audited pair by pair).
- **SC-007**: A reader completes "translate the page, change the style, open settings, change the
  primary action" using only the keyboard, and every focused control shows a visible ring.
- **SC-008**: Zero user-visible strings bypass the catalog, and zero markup literals are found by the
  catalog audit.
- **SC-009**: Opening either surface issues zero third-party network requests.
- **SC-010**: The full automated suite (unit, DOM and end-to-end in a real browser with real
  extension storage) passes with no skips introduced by this change.
- **SC-011**: Zero controls on either surface have no observable effect: every control is listed with
  the visible change it causes.
- **SC-012**: A new reader can get from a freshly installed extension to a translated page without
  visiting any section of the settings page other than the one it opens on.

## Assumptions

- The two surfaces are the extension's own panel and its own settings page; there is no marketing site
  in this feature.
- Target browsers are Chromium-family desktop browsers, where the panel's height limit is 600 px and
  the settings page opens in a tab.
- The dark theme follows the operating system or browser preference; a manual theme switch is not
  part of this feature.
- The visual identity (type stack, palette, spacing and radius) is recorded in the plan, not here; the
  specification fixes only what a reader can observe.
- The fifteen display styles and their meanings are unchanged by this feature; only how they are
  presented changes.
- Stored settings, the storage schema and its migrations are unchanged by this feature; a control that
  would need a new stored field is out of scope.
- The one language shipped in the catalog stays English; the catalog mechanism and the 30% expansion
  tolerance are what this feature must satisfy.
- Readers are on a desktop-sized window most of the time; the 320 px floor exists so that zoom and
  narrow windows degrade honestly rather than to serve phones, which this extension does not support.
- **Measured on 2026-11-15 against the build in this working tree**, and recorded so a later build can
  be held to the same numbers: the panel measures 484 px untranslated and 599 px with a three-line
  session record; all eight settings sections report zero sideways overflow from 320 px to 1024 px;
  the lowest text colour pair measures 4.8:1 in the light theme and 6.77:1 in the dark theme; 358 unit
  and DOM tests and 52 end-to-end tests pass, with no skips.
- **The control removed by FR-017 is the translation temperature field.** It was stored and displayed
  but had no effect on any request, because the request shape is fixed by a published contract;
  changing that contract is out of scope here, so the field is gone from the interface and the stored
  value is left untouched.

## Out of Scope

- Any change to the translation pipeline: segmentation, batching, prompting, provider protocol, retry
  or error classification.
- Any change to what is stored: new settings fields, schema versions, migrations, or a change to how
  credentials are kept.
- The content script's rendering rules and the definition of the fifteen display styles.
- A manual theme switch, an onboarding tour, a changelog view, telemetry or any analytics.
- Localization of the product into further languages; only the catalog mechanism is required here.
- A marketing or documentation website for the product.
- Touch or mobile-browser layouts: the extension targets desktop Chromium.

## Dependencies

- The settings store and its message channel (already shipped) — both surfaces read and write through
  it.
- The provider verification path (already shipped) — the settings page reports its result and records
  it on the provider row.
- The display-style catalog and the generated preview marks (already shipped) — the panel and the
  settings page present them; this feature does not change them.
- The content script's live restyle command (already shipped) — the panel's style and position changes
  rely on it to redraw a page that is already translated.
- The translation catalog (already shipped) — every string this feature adds enters it.
