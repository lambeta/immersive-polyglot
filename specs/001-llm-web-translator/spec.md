# Feature Specification: Immersive Web Translator with User-Supplied LLM Providers

**Feature Branch**: `001-llm-web-translator`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "构建一个和 https://immersivetranslate.com/ 一样的 chrome 浏览器插件，翻译功能使用用户自定义的 LLM Provider，页面渲染完全使用 immersive translate 的功能"

## Clarifications

### Session 2026-11-13

- **Q**: Does the product depend on Immersive Translate being installed, or does it reuse that
  rendering behaviour?
  **A**: Reuse the rendering behaviour inside this product's own display path. No second extension is
  required; recorded in FR-015, FR-016 and the rendering assumption.
- **Q**: Is a business scope (accounts, billing, credits, vendor backend) in scope?
  **A**: No business scope. Bring-your-own-key only; recorded in Out of Scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Translate a page with my own LLM provider (Priority: P1)

A reader installs the extension, opens a foreign-language article, adds their own LLM provider
(endpoint, credential, model), runs a connection check, and then translates the page. The article
is displayed bilingually, with each original paragraph followed by its translation in place, and
the page keeps working: links still work, layout does not break, and the reader can copy both
languages.

**Why this priority**: This is the entire product in one journey. Without an end-to-end path from
"my provider" to "bilingual page", nothing else has value. Everything else polishes this loop.

**Independent Test**: Install the extension in a fresh browser profile, configure one provider with
a valid credential, open a foreign-language article, trigger translation, and confirm the page shows
both original and translated text for the main content while remaining interactive.

**Acceptance Scenarios**:

1. **Given** a user with no configuration, **When** they open the extension and save a provider with
   a reachable endpoint, a valid credential, and a model identifier, **Then** the provider appears as
   the active translation service and the first-run setup no longer blocks translation.
2. **Given** an active provider, **When** the user triggers translation on a foreign-language article,
   **Then** translated text appears inline with the original for the document's readable content.
3. **Given** a page already translated, **When** the user toggles translation off, **Then** the page
   returns to its original state with no leftover translated nodes or altered layout.
4. **Given** a page partially translated, **When** the user navigates away or reloads, **Then** the
   partial result is discarded and no half-translated markup is served from cache.

---

### User Story 2 - Trust that my credential and my reading stay private (Priority: P1)

A privacy-conscious user needs to know, before entering an API key, that the key is stored on this
device only, that page content leaves the browser only to the provider they configured, and that
there is no vendor analytics pipeline reading their pages.

**Why this priority**: Translating a page means handing page text — possibly private documents — to a
third party. Users cannot adopt the product without a credible, checkable privacy posture, and a
privacy defect is not fixable by a later patch once trust is lost.

**Independent Test**: Configure a provider, translate a page containing a unique marker string, and
inspect all outbound requests and local storage: page text must appear only in requests to the
configured provider endpoint, and the credential must never appear in page context, logs, or exported
settings in plaintext.

**Acceptance Scenarios**:

1. **Given** a saved credential, **When** the user inspects extension storage and any diagnostics view,
   **Then** the credential is not displayed in plaintext and is not present in page-injected context.
2. **Given** a translated page, **When** the user inspects outbound network traffic, **Then** page
   content is sent only to the configured provider endpoint and to no other destination.
3. **Given** the extension is disabled or uninstalled, **When** the user re-enables it, **Then** no
   page content from the disabled period was retained remotely.
4. **Given** any failure, **When** an error is shown, **Then** the message never includes the
   credential, a full page passage, or internal identifiers the user cannot act on.

---

### User Story 3 - Route different sites and languages to different providers (Priority: P2)

A user has a fast cheap model for casual reading and a stronger model for work documents, plus a
provider that handles one language pair better than another. They assign defaults once and expect the
right provider to be chosen automatically per site or per language pair, with a per-page override
when the guess is wrong.

**Why this priority**: Without routing, users must re-pick a provider on every page, which makes the
product unusable as a daily reader despite the core loop working.

**Independent Test**: Register two providers, set a site rule for one domain and a language-pair rule
for one pair, then open pages matching each rule and confirm the provider actually used is the one
specified, with no manual selection.

**Acceptance Scenarios**:

1. **Given** two configured providers, **When** the user sets one as the default and the other for a
   specific site, **Then** pages on that site use the site-specific provider and other sites use the
   default.
2. **Given** a language-pair rule, **When** a page's source language matches the rule, **Then** the
   rule's provider is used over the global default.
3. **Given** automatic selection chose a provider, **When** the user overrides it for the current page,
   **Then** the override applies to this page without changing saved rules.
4. **Given** a site rule pointing at a provider that was later deleted, **When** that site is opened,
   **Then** the user is told the rule is broken and translation proceeds with the default provider
   rather than failing silently.

---

### User Story 4 - Survive a hostile web and a misbehaving provider (Priority: P2)

A reader hits the realities: a page that never finishes loading, an article longer than the model's
context, a provider that returns malformed text, a rate limit, a revoked key, and pages where
translation must not even be attempted. The product degrades predictably and tells the user what
happened and what to do.

**Why this priority**: Failure handling determines whether the product feels like a tool or a toy.
The core loop is only credible if it survives the conditions it will meet daily.

**Independent Test**: With a provider that can be made to fail on demand, exercise each failure mode
— invalid credential, rate limit, timeout, malformed response, oversized page, unsupported page
type — and confirm each produces a specific, actionable message and a clean page state.

**Acceptance Scenarios**:

1. **Given** a rejected credential, **When** translation runs, **Then** the user sees a
   credential-specific message with a route to update it, and no partial translation is left on the page.
2. **Given** a provider rate limit, **When** translation runs, **Then** the request is retried with
   backoff up to a bounded limit, and on exhaustion the user is told which content was skipped.
3. **Given** a page longer than the configured limit, **When** translation runs, **Then** content is
   processed in parts and the user can read results incrementally rather than waiting for the whole page.
4. **Given** a provider returns text containing markup or unrelated preamble, **When** the result is
   displayed, **Then** the rendered translation contains only the translated prose and cannot inject
   markup into the page.
5. **Given** a browser-restricted page (settings, extension gallery, internal pages), **When** the user
   triggers translation, **Then** the product explains that the page cannot be translated and does not
   modify it.
6. **Given** translation is in progress, **When** the user cancels or closes the tab, **Then** in-flight
   work stops within a few seconds and no abandoned result is applied to a reopened page.

---

### User Story 5 - Make the model behave like a translator (Priority: P3)

A user tailors output: tone and formality, keeping code blocks and product names untouched, a personal
glossary for names and jargon, and translation of just a selection or a hovered paragraph instead of
the whole page.

**Why this priority**: This is what separates a good translation from a machine-sounding one, but the
product is already useful without it.

**Independent Test**: Add a glossary entry and a tone instruction, translate a page containing that
term and a code block, and confirm the term is respected, the code block is untouched, and the tone
instruction visibly affects output; then translate a text selection only.

**Acceptance Scenarios**:

1. **Given** a glossary entry, **When** a page containing that term is translated, **Then** the term is
   rendered as specified rather than as the model prefers.
2. **Given** a page containing code blocks, inline code, and identifiers, **When** translated, **Then
   those segments remain unchanged and remain copyable as code.
3. **Given** the user selects a paragraph, **When** they invoke translate-selection, **Then** only the
   selection is translated and displayed in place.
4. **Given** a custom style instruction, **When** translation runs, **Then** the instruction is applied
   to every request in the session, not only the first.

---

### Edge Cases

- **Page renders content after load** (infinite scroll, single-page apps, collapsed comments): newly
  revealed content is translated on demand without re-translating the whole page or duplicating blocks.
- **The same sentence appears many times** on a page: it is translated once and the result reused, so
  the user is not billed repeatedly for identical text.
- **Page mutates during translation** (ads, live tickers, layout shifts): the product does not thrash,
  does not attach translations to removed nodes, and does not loop.
- **Provider returns a translation longer or shorter than the original**: layout must absorb it without
  overlap, clipping, or horizontal scroll on the whole page.
- **Source and target language are the same**, or the page is already in the target language: the product
  detects this and warns instead of spending the user's budget on a no-op translation.
- **Very large page** (thousands of paragraphs): the product stays responsive, shows progress, and lets
  the user read the top of the page before the bottom is done.
- **No network, or provider unreachable**: a distinguishable offline versus provider-down message.
- **Right-to-left source or target**: bilingual layout remains readable and correctly ordered.
- **A page prevents the product from altering it** (strict content security policy, sandboxed frame,
  extension-hostile site): the user is told why translations cannot be placed on this page, and the page
  is left untouched rather than half-modified.
- **Credential stored, then revoked at the provider**: detected on next use with a clear recovery path.

## Requirements *(mandatory)*

### Functional Requirements

**Provider configuration**

- **FR-001**: Users MUST be able to add, edit, disable, and delete translation providers, each defined
  by a display name, an endpoint address, a credential, and a model identifier.
- **FR-002**: The product MUST NOT depend on a fixed built-in list of providers; any provider the user
  can reach with their own credential MUST be usable.
- **FR-003**: Users MUST be able to verify a provider before relying on it, receiving a clear
  success or a specific failure reason (unreachable, credential rejected, model unavailable,
  malformed response).
- **FR-004**: Users MUST be able to configure per-request options the model needs, including model
  identifier overrides and provider-specific header values, without editing product code.
- **FR-005**: The product MUST let users set one default provider and override it per site or per
  language pair, and MUST let them override the choice for the current page only.

**Translation**

- **FR-006**: Users MUST be able to trigger translation of the current page from the page, the
  extension's own interface, and a keyboard shortcut.
- **FR-007**: The product MUST identify the readable content of a page and MUST NOT translate
  navigation chrome, form controls, editable fields, hidden text, or content already in the target
  language where that can be determined.
- **FR-008**: Translations MUST preserve the correspondence between each source segment and its
  translation, so a reader can always tell which translation belongs to which original.
- **FR-009**: The product MUST preserve page structure and formatting: headings stay headings, list
  items stay list items, links and emphasis inside translated text remain links and emphasis, and code
  blocks and inline code are not altered.
- **FR-010**: Content exceeding a single request's practical limit MUST be divided and processed in
  parts, with results displayed as they arrive rather than only at completion.
- **FR-011**: Identical source segments MUST be translated once per page and reused, and the user MUST
  be told when reuse saved work.
- **FR-012**: Users MUST be able to cancel an in-progress translation, and cancellation MUST stop
  further work promptly and leave the page in a consistent state.
- **FR-013**: Users MUST be able to translate a text selection or a single hovered block instead of the
  whole page.
- **FR-014**: The product MUST NOT translate text in sensitive input fields, password fields, or
  content the site marks as non-translatable.

**Display (Immersive Translate rendering behaviour)**

- **FR-015**: The product MUST reproduce Immersive Translate's bilingual rendering behaviour in its own
  display path: the same placement of each translation relative to its source segment, the same display
  modes, and the same page-mutation and restoration semantics. The product MUST NOT introduce display
  modes, translation placement, or styling conventions that diverge from that behaviour.
- **FR-016**: The product MUST render fully from a fresh browser profile in which only this product is
  installed. No second extension, companion add-on, or vendor-operated service MUST be required for
  translated content to appear on a page.
- **FR-017**: Translations MUST appear in the display modes Immersive Translate offers (for example
  bilingual alongside, translation above or below the original, and translation-only), with the user's
  chosen mode respected on every page and persisted across sessions.
- **FR-018**: Translated content MUST remain selectable, copyable, searchable by the browser's own find
  feature, and MUST NOT be hidden from assistive technology or removed from the reading order.
- **FR-019**: Turning translation off MUST restore the page to its original state, leaving no orphaned
  nodes, no residual styling changes, and no altered scroll position.
- **FR-020**: The product MUST NOT display translated content until a real translation for that segment
  exists; placeholder, lorem, or machine-fabricated filler text MUST NOT be shown as a translation.

**Privacy and security**

- **FR-021**: Provider credentials MUST be stored on the user's device, MUST NOT be transmitted to any
  destination other than the provider endpoint the user configured, and MUST NOT be exposed to page
  context or written to any log the user cannot inspect and clear.
- **FR-022**: Page content MUST be transmitted only to the provider endpoint selected for that page and
  MUST NOT be sent to any analytics, telemetry, or vendor-operated destination.
- **FR-023**: The product MUST disclose, before the first credential is entered, what leaves the
  device, to where, and how to remove it.
- **FR-024**: Users MUST be able to delete all locally stored configuration and history in one action,
  and that action MUST be verified to leave nothing behind.
- **FR-025**: Content from a page MUST NOT be retained after its tab closes, except configuration and
  glossary the user explicitly saves.

**Resilience and cost control**

- **FR-026**: Failed requests MUST be retried within a bounded policy, and exhausted retries MUST be
  reported with the affected content identified rather than silently skipped.
- **FR-027**: The product MUST prevent uncontrolled request bursts, keeping concurrent requests to a
  configured provider within a user-adjustable ceiling.
- **FR-028**: Users MUST be able to see how much content was translated in the current session —
  segments translated and characters sent — so cost is not invisible.
- **FR-029**: Users MUST be able to cap translation volume per site or per session, expressed in
  segments and characters, and the product MUST stop dispatching at the cap with an explanation rather
  than exceeding it. The product MUST NOT invent or promise a monetary cost figure: it holds no pricing
  information of its own. _Amended by feature 008 (2026-11-16):_ for a provider whose published prices
  ship with the product, it MAY show a **list-price estimate** — always labelled as an estimate, always
  with the provider and the date of the price snapshot beside it — and it MUST show nothing at all for
  any provider it has no published price for. Cost otherwise remains a judgement the user makes from
  the recorded volume (FR-028).

**Personalization**

- **FR-030**: Users MUST be able to define a glossary of terms and their required translations, applied
  to every request for that language pair.
- **FR-031**: Users MUST be able to supply translation instructions affecting tone, formality, and
  style, applied consistently across a session.
- **FR-032**: Users MUST be able to choose source and target languages explicitly, including an
  automatic source-language option, and the choice MUST persist per site where set.

### Key Entities

- **Translation Provider**: A user-owned service the product sends text to. Attributes: display name,
  endpoint, model identifier, extra request options, enabled state, last verification result.
- **Provider Credential**: The secret that authenticates a provider. Belongs to exactly one provider;
  stored device-locally; never displayed in plaintext after entry; deletable independently.
- **Routing Rule**: A statement that a given site or language pair uses a given provider. Attributes:
  match kind (site or language pair), match value, target provider, precedence relative to the default.
- **Translation Unit**: One translatable segment of a page together with its translation. Attributes:
  source text, translated text, source language, target language, state (queued, translating,
  translated, failed, skipped), and its position in the page.
- **Translation Job**: One translation run over one page. Attributes: page identity, provider used,
  units in scope, units completed, units failed, start and end time, cancellation state.
- **Site Preference**: Per-site settings the user has chosen. Attributes: site identifier, target
  language, display mode, provider override, enabled state.
- **Glossary Entry**: A term and its required translation for a language pair. Attributes: source term,
  target term, language pair, case sensitivity.
- **Session Usage Record**: What was translated in the current session, for cost transparency.
  Attributes: segments translated, approximate volume, per-provider breakdown, cap state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user reaches their first fully translated page in under 3 minutes from install,
  including adding a provider, with no documentation outside the product.
- **SC-002**: In each release's scripted walkthrough with five first-time participants holding a working
  provider credential, at least four complete setup on the first attempt using only the product's own UI,
  with no documentation and no abandonment at the credential or model step.
- **SC-003**: On a reference set of 20 representative article pages, the readable main content is
  displayed bilingually within 5 seconds of triggering translation for the first screen, and 95% of
  pages show complete content within 60 seconds.
- **SC-004**: Zero layout regressions are accepted on the reference page set: no horizontal page scroll,
  no overlapping or clipped text, no hidden original content, before shipping.
- **SC-005**: 100% of page content sent over the network reaches only the user-configured provider
  endpoint, verified per release by inspecting traffic for a page containing a unique marker string.
- **SC-006**: No credential appears in plaintext in any product surface, storage export, diagnostic view,
  or page context, verified per release.
- **SC-007**: Every failure mode in the edge-case list produces a message naming the cause and the
  recovery action, and leaves the page in its pre-translation state, verified per release.
- **SC-008**: Users can turn translation on and off on the same page 20 times in a row with no residual
  DOM growth or performance degradation.
- **SC-009**: Users who configure a glossary or style instruction see it reflected in 100% of sampled
  translations within the same session.
- **SC-010**: Post-launch only, not release-gated: first-week users reporting that nothing happened when
  they tried to translate stay below 5%, confirming that failure messaging is discoverable in real use.
  The release-gated counterpart is SC-007, which is asserted per release.
- **SC-011**: On the reference page set, each translated page matches the reference capture of Immersive
  Translate's rendering for the same page: the same number and placement of translated segments, the same
  display-mode outcome, and the same restored state after translation is turned off.

## Out of Scope

Excluded by decision; each item is a settled boundary, not a gap awaiting later work.

- **Accounts and vendor backend**: no signup, login, subscription, credits, quotas sold to users, or
  server-side proxy. No vendor-operated service ever receives page content.
- **Becoming a provider**: the product sells no translation and serves no model. It configures and calls
  providers the user already has access to.
- **Immersive Translate capabilities beyond web pages**: document and PDF translation, video subtitles,
  image text translation, and e-book translation are not part of this feature, nor is input-box
  translation beyond the selection and single-block scope in FR-013.
- **Browsers other than desktop Chrome-family**: mobile browsers, Firefox, and Safari.
- **Cross-device sync, team sharing, and managed policy**: configuration is device-local and unshared.
- **Offline or on-device model execution**: a reachable user-configured provider is required.
- **Extensibility surface**: pluggable renderers, a third-party provider plugin API, and a rules
  marketplace are not built.

## Assumptions

- **Rendering is reused as behaviour, not as a dependency.** The product reproduces Immersive
  Translate's bilingual rendering behaviour inside its own display path; Immersive Translate need not be
  installed, and no second extension is required (FR-015, FR-016). The behaviour to reproduce is pinned
  by a captured reference fixed at planning time: placement of each translation relative to its source
  segment, the supported display modes, and the page-mutation and restoration semantics (SC-011).
- **No business scope.** Accounts, billing, credits, subscription, and vendor-operated infrastructure are
  excluded by decision, not deferred (see Out of Scope). Cost and rate limits belong entirely to the
  user's arrangement with the provider they configure.
- **Single user, single device.** No server-side component and no cross-device sync; settings live on
  the user's device and survive browser restarts but not uninstall.
- **Desktop Chrome-family browsers** are the target; mobile browsers, Firefox, and Safari are out of
  scope for this feature.
- **The user knows how to obtain an API credential** from their chosen provider. The product helps them
  enter and verify it, and does not teach provider signup.
- **Providers are assumed to accept a widely used chat-style translation request.** Where a provider's
  format differs materially, the product exposes enough request configuration for the user to adapt it
  rather than requiring a product release.
- **Translation quality is bounded by the chosen model.** The product's responsibility is faithfulness
  of handling — correct segmentation, preserved formatting, honest errors — not the literary quality of
  the model output.
- **Reference page set** for SC-003, SC-004, and SC-011 consists of 20 public pages across news,
  documentation, forum, wiki, and blog forms, chosen at planning time and fixed for the release. A
  rendering reference capture of Immersive Translate over the same pages is fixed at the same time.
