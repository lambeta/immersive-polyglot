# Feature Specification: A Page of Chat Answers Translates In Place, Through The Reader's Own Provider

**Feature Branch**: `011-dsh-plugin` (no branch was created: this project registers no
`before_specify` hook, so the working tree stays on `master`)

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "支持构建成deepseek harness plugin" — the plugin translates the chat's
output; one page of answers at a time, not one answer at a time.

## Why this feature exists

The product has one surface today: a Manifest V3 browser extension. A reader who also works with a
coding agent inside DeepSeek Harness (DSH) reads the agent's answers in whatever language the agent
happens to write, then either reads around them or copies them elsewhere to translate — where a
different model with a different vocabulary answers. Two readings of one conversation then disagree
about the terms the reader cares about.

The translation engine is already separate from the page that shows it: the instruction prompt,
glossary, provider request and response handling, batching, error classes and price catalogue live in
shared modules that the extension's background surface consumes. This feature builds that same engine
as a second surface — a DSH plugin that translates a page of the conversation the reader is looking
at, in place, beneath the answers it came from — so the reader reads the chat in their language,
through their own provider and with their own rules, while the browser extension keeps behaving
exactly as it does today.

## Clarifications

### Session 2026-11-19

The invocation named only "支持构建成deepseek harness plugin". The reader answered the scope questions
and then corrected the unit of work; both are recorded here.

- Q: What does the plugin provide inside DSH? → A: **the chat's output is translated** — the
  agent's answers, in the conversation where they were written. An agent-callable translation tool,
  and installing or configuring the browser extension from DSH, are not this feature.
- Q: Which provider configuration and credential does the plugin translate with? → A: **its own**,
  configured inside DSH. The extension's stored settings are neither read nor written.
- Q: How is the plugin installed and distributed? → A: **a local plugin directory** installed from
  the Plugins page. A registry publication or a market listing is not this feature.
- Q: Per answer, or a page at a time? → A: **a page of answers**, not one answer per translation.
  Turning translation on for a conversation translates what is on screen; scrolling continues with
  the next screenful, the way the extension translates the part of a page the reader is about to
  read, and text the reader never reaches is never sent.

### Decisions the correction left open (recorded as assumptions, confirmable before planning)

- The unit of a provider request is a page of answers, and the unit of display is still one answer:
  each answer keeps its own translation section, so correspondence is never lost. A page is not
  rendered as one undifferentiated translated column.
- Only the agent's answers are translated: the reader's own messages, the agent's reasoning blocks
  and tool payloads are not.
- Translations are bilingual: the original answer is never altered, covered or replaced.

### Correction found during planning (2026-11-19)

The installed DSH (0.2.x) gives a plugin a per-turn area beneath a completed turn's answer and a
per-answer action strip, but no per-message area inside an answer's body. The placement wording was
therefore amended: one translation section per answer, stacked beneath the turn's last answer — which
is the answer itself whenever a turn holds one. Nothing else in the feature changed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One gesture translates the page I am reading (Priority: P1)

The reader opens a conversation and turns translation on. The answers on screen — and at most one
screenful below — are translated as one page: the provider receives those answers' prose together,
and each answer gets its translation beneath it, in order, with code, links and file paths left
exactly as written. The original answers are still there. The page reports what it cost.

**Why this priority**: This is the feature, and the unit matters: a reader translates a screen, not
a message, so one request must cover the page rather than one request per answer.

**Independent Test**: In a DSH profile with the plugin installed and a provider configured against a
recording stub, open a conversation whose visible page holds five answers, one of them containing a
fenced code block and an inline path. Turn translation on: the stub records one request per batch,
carrying the five answers' prose in order and nothing else; each of the five answers shows its own
translation beneath itself; the code block and path are byte-identical. Then turn it on with no
provider configured: a named failure, no request, no translation.

**Acceptance Scenarios**:

1. **Given** a conversation page with five answers and a configured provider, **When** the reader
   turns translation on, **Then** the five answers are translated in one page batch and each shows
   its own translation section beneath the answer it belongs to, in the page's order.
2. **Given** a page whose total prose exceeds the documented batch cap, **When** it is translated,
   **Then** the batch is split into several bounded requests, the page says how many requests it
   made, and every answer on the page is still translated.
3. **Given** an answer containing a fenced code block, an inline path and a link, **When** the page
   is translated, **Then** the code, the path and the link are unchanged and untranslated, and the
   prose around them is translated.
4. **Given** the provider answers 401, **When** the page is translated, **Then** every answer on the
   page shows a named failure that names the credential and a retry action, and none shows
   translated text.
5. **Given** a page where one answer is already written in the target language, **When** the page is
   translated, **Then** that answer is reported as already in the target language, the others are
   translated, and no request carries the already-translated answer's text.
6. **Given** a completed page, **When** the reader reads the page footer, **Then** it names the
   requests made, the tokens the provider reported and the price computed from the shipped
   catalogue, or the price as unknown with the reason.

---

### User Story 2 - Reading on continues the translation, and costs only what I read (Priority: P1)

The reader scrolls. The next screenful of answers is translated as the reader reaches it, one page at
a time, and the text is never sent for pages the reader never reaches. Turning translation off stops
further sending immediately and leaves what was translated in place.

**Why this priority**: This is the product's standing promise — what you never reach is never sent,
and therefore never paid for — carried into a conversation. Without it the plugin would translate a
whole session on one click.

**Independent Test**: In a conversation of 20 answers, turn translation on, scroll two pages, and
stop. The recording stub counts three page requests (the first page, and the two the reader scrolled
to) and no request carrying text from the 14 answers never displayed. Turn translation off, scroll
further: no further request is made.

**Acceptance Scenarios**:

1. **Given** translation is on and the reader scrolls to a new page, **When** the page becomes
   visible, **Then** that page is translated and its answers show their translations.
2. **Given** translation is on and the reader stops after three pages, **When** the request log is
   read, **Then** only those three pages' answers were sent and no answer outside them was sent.
3. **Given** translation is on, **When** the reader turns it off, **Then** no further request is made,
   completed translations remain, and answers not yet translated are shown as untranslated rather
   than as failures.
4. **Given** the reader scrolls quickly past a page, **When** it leaves the screen before its
   translation is requested, **Then** no request is made for it.
5. **Given** translation is on and a new answer arrives from the agent, **When** it is still
   streaming, **Then** nothing is sent for it; when a later page is translated and it has settled, it
   is included and translated once.

---

### User Story 3 - Reading it again costs nothing (Priority: P1)

The reader scrolls back, switches sessions, restarts DSH, and returns. Every translated answer is
still translated, in the same place, and no request is repeated. When the agent regenerates an answer
or the conversation forks, the new answer is not shown with the old translation pasted onto it.

**Why this priority**: A translation that disappears on scroll, or bills again on every reopen, turns
a reading aid into a tax.

**Independent Test**: Translate three pages against a recording stub, scroll back to the first page,
switch sessions and return, restart DSH and reopen. All blocks are in place and the stub's request
count is unchanged. Regenerate one answer and confirm its block is gone or marked stale, never
attached to the new text.

**Acceptance Scenarios**:

1. **Given** three translated pages, **When** the reader scrolls back to the first, **Then** its
   blocks are still there and no request is made.
2. **Given** translated answers, **When** DSH is restarted and the session reopened, **Then** the
   blocks are present and no request is made.
3. **Given** a translated answer that the agent regenerates, **When** the new answer is shown,
   **Then** the previous translation is not displayed as the new answer's translation.
4. **Given** the same session open in two windows, **When** one window translates a page, **Then**
   exactly one request is made and both windows show the same blocks.
5. **Given** the plugin is disabled and later re-enabled, **When** the session is reopened, **Then**
   the stored translations appear again without a new request.

---

### User Story 4 - One provider setting, and the key stays where the reader put it (Priority: P1)

The reader configures endpoint, model, credential, target language and glossary once, inside DSH,
tests the provider and gets the provider's own verdict. The credential is stored where DSH stores
secrets, is shown masked, and appears in no log, session record or error the reader can see.

**Why this priority**: The product's central promise is that text and credentials leave the device
only through the endpoint the reader chose. A chat translator that leaks a key into a session log
breaks the promise the extension keeps.

**Independent Test**: Save a provider with a credential in a fresh profile, translate one page, then
inspect the settings surface, the plugin's logs, the DSH session record, the built directory and the
repository for the credential value. Restart DSH, confirm the provider and the masked credential
survive, and confirm translation still works.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** the reader saves endpoint, model and credential and presses
   Test, **Then** the provider's own verdict is shown — success with a short sample, or the status
   and message it returned — and the test's usage is reported as a test, not merged into a page's
   usage.
2. **Given** a saved credential, **When** the settings surface, the logs, the session record and the
   built directory are inspected, **Then** the credential is masked in the settings and in cleartext
   nowhere.
3. **Given** an endpoint that is plain HTTP to a non-loopback host, an empty model, or an empty
   credential, **When** the reader saves, **Then** the save is rejected naming the rule that failed
   and nothing partial is stored.
4. **Given** the reader deletes the credential, **When** a page is translated, **Then** it fails with
   a named cause and makes no request.
5. **Given** DSH restarted, **When** the settings are opened, **Then** provider, masked credential,
   target language and glossary are unchanged.

---

### User Story 5 - The row in Plugins reads like a product (Priority: P2)

The reader opens Plugins, finds one row named after the product with a sentence describing what it
does and its own icon, in English and in Chinese. Its detail view says what it sends, where to, what
it stores, that each page costs provider tokens, and what stops when it is disabled.

**Why this priority**: A plugin that installs but presents template copy is indistinguishable from
abandonware, and the constitution requires user-visible text to be localizable. The capability still
works before the display work lands.

**Independent Test**: Install the built directory in a profile set to English and in one set to
Chinese; read title, description and icon in both; disable the plugin and confirm no translation
control appears; restart and confirm the row and its settings survive.

**Acceptance Scenarios**:

1. **Given** the built directory is installed, **When** the reader opens Plugins, **Then** the row
   shows the product's title, a one-sentence description and its own icon.
2. **Given** the profile is set to Chinese, **When** the row, the control and the blocks are shown,
   **Then** their labels are Chinese, with no English template copy and no missing-text diagnostic.
3. **Given** the plugin is disabled, **When** a conversation is read, **Then** no translation control
   is offered and nothing the plugin registered remains.
4. **Given** the plugin is re-enabled, **When** a session is opened, **Then** the control is back and
   stored translations still show, without reinstalling.

### Edge Cases

- An answer that spans a page boundary and is only partly visible: translated once, and its
  translation is not split across two pages.
- An answer still streaming when its page is translated: skipped and marked not yet finished; a later
  page request includes it once it has settled, and it is translated exactly once.
- An interrupted turn: what settled may be translated and is labelled a partial answer.
- An answer that is only a code block, only a file path, or only a URL: nothing to translate; the page
  reports it as untranslatable rather than sending it.
- A page whose prose exceeds the batch cap: split into bounded requests, every answer still
  translated, and the split reported.
- A page with more answers than the documented per-page cap: the excess is reported as untranslated,
  never dropped silently.
- Many code fences and inline code spans: all survive verbatim; no fence merges with its neighbour.
- Right-to-left text, emoji, surrogate pairs: returned unchanged in shape.
- The provider answers with a body that is not JSON, an empty choice, or text in the wrong language:
  a named failure; nothing is shown as the translation.
- Provider rate-limits (429) or fails (5xx) within the bounded retry: retried, counted, then reported
  with the class the extension already uses.
- Provider unreachable or over its timeout: bounded failure that states the limit it hit.
- One answer in a batch fails to map to a returned segment: only that answer shows a failure; the
  others keep their translations, and a retry sends only the failed answer.
- The reader scrolls back and forth quickly: no answer is sent twice, and no page is requested twice
  while its request is still in flight.
- The plugin is disabled or removed while a page request is in flight: the request ends with a named
  failure; no control is left behind.
- The credential is deleted between two pages: the second fails without contacting the provider.
- The reader switches sessions while a page is pending: the result lands in the session that asked
  for it, never in the one now on screen.
- The target language is changed after translations exist: existing blocks keep the language they
  were made in and say which; new pages use the new target.
- DSH restarted mid-configuration: no half-saved provider, no credential written in the clear.

## Requirements *(mandatory)*

### Build target and installation

- **FR-001**: One documented command MUST produce an installable plugin directory from the same
  checkout as the extension. The existing extension build command MUST keep producing the extension
  exactly as it does today; building one artifact MUST NOT change the other's output, and neither
  build may require the other.
- **FR-002**: The produced directory MUST install from DSH's Plugins page by choosing that directory,
  with no hand-edited profile file and no step beyond the ones the README documents.
- **FR-003**: The installed plugin MUST appear as one row named after the product and MUST survive a
  DSH restart with its settings and its enabled state intact.
- **FR-004**: Disabling the plugin MUST remove its control and its blocks from new sessions and
  unregister everything it contributed; re-enabling MUST restore them without reinstalling.
- **FR-005**: The plugin MUST declare only the DSH services it uses and MUST stay inactive — not fail
  to install and not throw — in a profile that lacks them.
- **FR-006**: Installing the plugin MUST NOT require the browser extension, a running browser or
  browser profile data; installing the extension MUST NOT require the plugin.

### Translating a page of answers

- **FR-007**: The plugin MUST provide one control per conversation that turns translation on and off,
  and MUST show its current state. Turning it on MUST translate the current page: the answers whose
  text is visible plus at most one viewport height below it.
- **FR-008**: The answers of one page MUST be translated as one batch, and each answer MUST show its
  own translation section beneath the answer it belongs to, in the page's order, without altering,
  covering or replacing the answer. Where a turn holds several answers, their sections appear
  together beneath that turn's last answer, each labelled with the answer it translates and in that
  turn's order. A page MUST NOT be rendered as one undifferentiated translated column.
- **FR-009**: A batch MUST carry only the prose of the answers on that page — no reasoning blocks,
  no tool call payloads, no attachments, no other messages, no session history, no telemetry — to the
  configured endpoint and to no other host.
- **FR-010**: An answer that already has a translation MUST NOT be sent again when it reappears in a
  later page.
- **FR-011**: An answer still streaming MUST NOT be sent. It MUST be reported as not yet finished and
  translated once, when a later page request finds it settled.
- **FR-012**: While translation is on, reaching a new page MUST translate that page. Answers the
  reader never reaches MUST never be sent, and a page that leaves the screen before its request is
  made MUST NOT be requested.
- **FR-013**: Turning translation off MUST stop further requests immediately, MUST keep completed
  translations, and MUST show the not-yet-translated answers as untranslated rather than as failures.
- **FR-014**: A page larger than the documented batch cap MUST be split into several bounded
  requests, MUST report how many requests it made, and MUST still translate every answer on the page.
- **FR-015**: Exceeding a documented cap — answers per page, characters per batch, timeout, retries —
  MUST be reported with the cap named, never silently truncated or dropped.
- **FR-016**: A partial failure MUST be attributed to the answers it affects: the failed answers show
  a failure, the others keep their translations, and a retry MUST send only the failed answers.
- **FR-017**: A translation MUST be shown only after the provider returned it. A failure MUST appear
  as a named failure with a message and a recovery action, never as text presented as a translation,
  and never as an empty block where a translation was promised.
- **FR-018**: An answer already in the target language MUST be reported as such and MUST NOT be sent.
- **FR-019**: The translation MUST preserve the answer's structure: paragraph breaks, headings, list
  items, links and inline emphasis stay recognizable, and fenced code, inline code, file paths and
  URLs are shown unchanged and untranslated.

### Persistence and identity

- **FR-020**: Translations MUST survive scrolling, session switching, plugin disable/enable and a DSH
  restart, and MUST be shown again on reopen with no new provider request.
- **FR-021**: A translation MUST be bound to the answer it translates. When that answer is
  regenerated, edited or superseded by a fork, the old translation MUST NOT be displayed as the new
  answer's translation.
- **FR-022**: A page requested twice for the same unchanged answers — from two windows, two gestures,
  or a reopen — MUST result in one provider request per batch and one shared set of blocks.
- **FR-023**: A pending page MUST land in the session that requested it, never in whichever session
  happens to be on screen when it returns.

### What a page cost

- **FR-024**: Each page MUST report the requests it made, the token usage the provider reported and
  the price computed from the shipped catalogue, or the price as unknown with the reason.
- **FR-025**: The plugin MUST NOT attribute to an individual answer a price it cannot compute from
  that answer's own usage.

### Configuration and secrets

- **FR-026**: The reader MUST be able to configure provider endpoint, model, credential, target
  language, glossary and the call bounds inside DSH, without editing a file and without restarting
  DSH.
- **FR-027**: Every configurable field MUST have a documented default; no default may contain a
  credential or name a host the reader did not choose.
- **FR-028**: The credential MUST be stored through DSH's own secret mechanism and MUST NOT be
  written to the repository, the built directory, a settings export, the plugin's logs, the session
  record, or any error message the reader can see.
- **FR-029**: The settings surface MUST show a saved credential masked, MUST allow replacing or
  deleting it, and after deletion the next page MUST fail per FR-017 without contacting the provider.
- **FR-030**: Saving a provider MUST validate that the endpoint is HTTPS or a loopback address, that
  the model identifier is non-empty and that the credential is non-empty. A rejected save MUST name
  the rule that failed and MUST NOT persist the partial value.
- **FR-031**: The reader MUST be able to test a configured provider and receive the provider's own
  verdict. The test is a real request: its usage MUST be reported as a test and MUST NOT be merged
  into a page's usage.
- **FR-032**: Configuration and secrets MUST survive a DSH restart and MUST NOT be sent anywhere
  except the configured endpoint.

### Presentation and accessibility

- **FR-033**: The plugin row MUST carry a title, a one-sentence description and the product's own
  icon, in both English and Chinese, with no leftover template copy and no missing-metadata
  diagnostic.
- **FR-034**: The plugin's detail view MUST state what the plugin sends, to which host, what it
  stores, that each page costs provider tokens, and what stops when it is disabled.
- **FR-035**: The control and every block MUST be operable by keyboard alone with visible focus and
  an accessible name; they MUST tolerate at least 30 percent text expansion and MUST NOT use colour
  as the only carrier of meaning.
- **FR-036**: The control and the blocks MUST follow the host's light and dark theme and MUST NOT
  display one state while storing another.
- **FR-037**: All user-visible text MUST come from the plugin's locale resources with English and
  Chinese entries; no user-visible string may be hardcoded in source.

### Preservation of the existing product

- **FR-038**: The extension's build output and behaviour MUST remain unchanged: its unit, DOM and
  end-to-end suites MUST pass without any test being edited, skipped or deleted, and the extension
  bundle MUST contain no plugin code.
- **FR-039**: The extension MUST keep its zero runtime dependencies; any dependency the plugin needs
  MUST stay outside the extension bundle and be justified in the plan.
- **FR-040**: The instruction prompt, glossary selection, provider request and response handling,
  batching and unit mapping, error classes and price computation MUST come from the project's single
  shared definition; the plugin MUST NOT carry a copy of any of them, and a change there MUST reach
  both surfaces from one edit.

### Key Entities

- **Conversation page**: the answers whose text is visible plus at most one viewport height below,
  identified by the answers it contains; the unit of one translation gesture.
- **Chat answer**: one agent message the reader sees — its session, turn, message identity, text
  blocks, language, and settled or streaming status.
- **Page batch**: one translation of a page — the answers sent, the requests it took, and the mapping
  from returned segments back to answers.
- **Translation block**: what the plugin shows beneath one answer — target language, translated
  paragraphs and preserved code, provider and model, collapsible state.
- **Page report**: requests made, token usage and price, or unknown-with-reason, plus the answers
  skipped and why.
- **Provider profile**: the reader's endpoint, model identifier, credential reference, target
  language and call bounds.
- **Failure**: a named class, a message and a recovery action; never carries translated text.
- **Plugin directory**: the installable build artifact — manifest, patch row, locale resources, icon,
  detail document, host entry and client entry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Starting from a clean checkout with DSH installed and a provider credential in hand, a
  reader who follows only the README reads a translated page within 10 minutes of opening the
  checkout.
- **SC-002**: In a profile where no provider is configured, 100 percent of translation attempts show
  a named cause and a recovery action and make zero requests to any host.
- **SC-003**: For one page of five answers holding 600 characters of prose plus reasoning and two
  tool calls, the recorded traffic carries exactly the five answers' prose and the instruction —
  zero bytes of reasoning, zero bytes of tool payload — and zero requests reach a host other than the
  configured endpoint.
- **SC-004**: Over a 20-case set (streaming, interrupted, code-only, path-only, oversized page,
  already in target, 401, 403, 429 beyond retry, 5xx, timeout, non-JSON body, empty choice, unknown
  model, RTL, emoji, many fences, partial batch failure, session switch mid-flight, credential
  deleted mid-run), every case ends in a translation or a named failure with a recovery action, and
  zero cases show untranslated text labelled as a translation.
- **SC-005**: In a 20-answer conversation, turning translation on and scrolling two pages makes
  exactly three page requests; scrolling back makes none; restarting DSH and reopening makes none.
- **SC-006**: After a credential is saved, a scripted inspection of the settings surface, the plugin's
  logs, the session record, the built directory and the repository finds zero cleartext occurrences
  of the credential value.
- **SC-007**: Disabling the plugin removes its control from new conversations, while the extension's
  unit, DOM and end-to-end suites still pass with zero tests edited, skipped or deleted, zero plugin
  modules in the extension bundle and zero runtime dependencies in the extension.
- **SC-008**: The row, the control, the blocks and the settings render with every label complete and
  no clipping in English and Chinese, in light and dark themes, with text expanded by 30 percent.
- **SC-009**: A page of up to six answers and 3,000 characters shows all its blocks within 3 seconds
  of the provider's response arriving, and nothing is requested for an answer that is still
  streaming.
- **SC-010**: In 20 regenerations, zero regenerated answers display the translation of the answer they
  replaced.
- **SC-011**: When one answer of a page fails to map to a returned segment, exactly that answer shows
  a failure and the others keep their translations, in 10 of 10 trials.

## Out of Scope

- Translating the reader's own messages, the agent's reasoning blocks, tool call payloads, diffs,
  attachments or file contents.
- Translating a whole session on one gesture, or pre-translating pages the reader has not reached.
- A page rendered as one translated column, or replacing, paraphrasing or rewriting the original
  answers; the translation is an addition beneath each answer.
- Rendering translated web pages inside DSH: the fifteen display styles, the page control, the
  settings page, the toolbar badge and the write-journal restore stay in the browser extension,
  unchanged.
- An agent-callable translation tool, translating a URL, or translating selected text.
- Publication to a package registry, a market listing, an auto-update channel, or support for hosts
  other than DSH.
- Translating DSH's own interface; the plugin's labels are localized, the application's text is not.
- Reading or writing the browser extension's stored settings or browser profile data.
- Caching across readers or machines: translations belong to one profile.

## Assumptions

- The answered decisions hold: chat answers are the subject, a page is the unit of a translation
  gesture, the plugin owns its provider configuration inside DSH, and the distribution is a local
  plugin directory.
- The decisions recorded under Clarifications are defaults, not confirmed: answers only, bilingual
  blocks beneath each answer, and the page defined as the visible answers plus at most one viewport
  below.
- The target host is the DSH version installed on this machine (0.2.x). That version exposes, to a
  plugin, a per-conversation surface for a control, a per-answer area beneath the answer, and a way
  to read the answers a session holds; this was checked against the installed build, and the plan
  names the exact extension points.
- The reader already has a provider endpoint and credential. The plugin ships no credential and no
  provider list; a fresh install shows an empty form with DeepSeek's endpoint as a placeholder, as
  the extension does.
- The reader's DSH has network access to their endpoint; proxy configuration and corporate
  interception are not handled.
- Target language defaults to the extension's current default (Chinese) and is changeable per
  profile; the plugin never guesses a different target on its own.
- The conversation's own rendering, scrolling and folding are the host's; the plugin adds a control
  and blocks and does not reimplement the chat.
- One page batch at a time per conversation; a second gesture on the same page reuses the first.
- The DSH SDK packages the plugin needs become peer dependencies of the plugin, not of the extension.
  Adding them changes the ratified stack in the constitution, so a PATCH amendment to *Technology and
  Environment Constraints* is required before implementation, not during it.
- The plugin's host side may use ordinary Node.js facilities; the extension keeps platform-only
  runtime APIs.
- A page translation is billed by the reader's provider exactly like a page translation in the
  extension; the plugin adds no markup or fee of its own.
- DSH's own model configuration and the plugin's provider are independent: the reader can translate
  through a provider that is not the model answering in the session.
