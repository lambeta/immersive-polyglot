# Phase 0 Research: One System for the Page Control and the Settings Page

Each decision below is recorded with the alternative that was rejected and why. Nothing in this
feature is marked NEEDS CLARIFICATION.

---

## R1 — Where the visual system lives

**Decision**: One extension-owned stylesheet, `src/ui/shared/ui.css`, imported by both page
stylesheets (`popup.css`, `options.css`). It owns the design tokens, the type scale, the spacing
scale, the radius family, the button family, the card, the field set, the list, the style-picker grid,
the focus ring, the theme overrides and the motion layer. Page stylesheets may only lay out their own
surface and may not redefine a token or a component.

**Rationale**: The two surfaces had already drifted — the panel used `Canvas` / `ButtonFace` platform
colours at 14 px with 0.45 rem radii, the settings page used the same platform colours at 15 px with
different radii and different tab shapes. A design system that lives in two files is two systems by
definition, and the second one always wins by accident. One stylesheet makes the drift a structural
impossibility: both pages render the same token values because there is one place they can be set. It
also means a later fix to one contrast pair fixes both surfaces at once.

**Alternatives considered**:
- *Keep two page stylesheets and copy the shared parts*: rejected — the copy is the drift.
- *A CSS framework or component library*: rejected by the constitution (no UI framework, platform APIs
  only), and it would add a dependency for a surface this small.
- *Inline `<style>` per page*: rejected — the same duplication, plus it defeats the build's CSS
  pipeline and the existing CSP posture.
- *A CSS-in-TS tokens object emitted at runtime*: rejected — it moves a static concern into script,
  adds a reflow after first paint, and makes the styles unreadable in a diff.

---

## R2 — The faces, and how they are served

**Decision**: Two families ship inside the extension as `woff2`: **Host Grotesk** (variable weight
400–700, latin and latin-ext subsets) for words, and **JetBrains Mono** (variable weight 400–500, latin)
for machine-written values — endpoints, model ids, versions, machine keys. Declared with `@font-face`
in `ui.css`, unicode-range subsets, `font-display: swap`, and a system fallback stack that is never
allowed to be the visible result. Files live in `src/ui/shared/fonts/` with both SIL OFL 1.1 texts;
Vite emits the `woff2` files and `scripts/build.mjs` copies the licence texts to `dist/fonts/`.

**Rationale**: The product's core promise is that page text and settings reach nothing except the
endpoint the reader configured. A stylesheet from a font CDN would issue a third-party request on every
panel open — quietly falsifying the promise the privacy disclosure spells out. The alternative to a
remote face is either a bundled face or the platform's own UI font; this work exists to leave the
system look behind, so the faces are bundled. Both are open-licence faces with a variable weight axis,
which keeps the payload to three files (~63 KB total) instead of five to seven static cuts, and the mono
face earns its place by making endpoints and model ids scan as values rather than as prose. OFL 1.1
requires the licence text to travel with the font software, hence the copied `.txt` files.

**Alternatives considered**:
- *Google Fonts or any CDN*: rejected — a third-party request on every open, against the product's
  stated privacy model, and MV3 page CSP would make a remote stylesheet fragile anyway.
- *Platform UI font stack only (`system-ui`)*: rejected — it is the system look this work leaves behind,
  and it makes the two surfaces indistinguishable from a default form.
- *A single family for both words and values*: rejected — endpoints and model identifiers need a
  fixed-width face to be scanned as data; a proportional face makes `/v1/chat/completions` read as
  prose and defeats column alignment in the diagnostics list.
- *Static weight cuts instead of variable*: rejected — three variable files are lighter than six static
  ones, and the display weight (500), the body (400) and a 500 label weight all come from one file.
- *An icon font or icon package*: rejected — the style marks are already inline SVG generated from the
  display-style catalogue; a font is a second, worse mechanism.

---

## R3 — Light and dark without a manual switch

**Decision**: One token block defines the light theme; a single `@media (prefers-color-scheme: dark)`
block overrides the tokens. Both surfaces set `color-scheme: light dark` so native widgets (select
menus, scrollbars, number steppers) follow. No JavaScript, no second stylesheet, no stored preference.

**Rationale**: The panel and the settings tab inherit the browser and OS theme, which is what a reader
expects from an extension page and what the previous platform-colour CSS already gave them — removing it
would be a regression. A manual switch would need a new stored field, which this feature's scope forbids,
and would add a third state to test.

**Alternatives considered**:
- *Light only*: rejected — it regresses dark-theme readers.
- *A manual switch with a stored preference*: rejected — a new stored field is explicitly out of scope
  (spec, Out of Scope) and nothing requires it.
- *A JavaScript theme swap*: rejected — it runs after first paint (flash), needs state, and duplicates
  what a media query does for free.

---

## R4 — Fitting the panel into 600 px

**Decision**: A 384 px single column with a 14 px gap, ordered: header (mark, title, site, settings
control) → state line → one primary action → display switch → provider → style tiles (5 × 3) →
chosen-style line → session record (only when non-empty). The settings control sits in the header, not
at the foot. Measured on the built extension: **484 px** untranslated and **599 px** with a three-line
session record; a five-line record scrolls, which is acceptable and explicitly allowed by the spec.

**Rationale**: Chromium caps an extension panel at 600 px tall. The order follows the reader's questions
in order of immediacy: what is this page's state, what do I press, how does it read, who translates it.
Putting the way into settings in the header rather than the foot means it cannot be scrolled away in the
one state that scrolls.

**Alternatives considered**:
- *Two columns in the panel*: rejected — 384 px cannot hold two usable columns without shrinking the
  style tiles below a comfortable target.
- *Tabs inside the panel*: rejected — it hides the primary action behind a tab and adds navigation state
  to a surface whose job is one decision.
- *A collapsible style grid*: rejected — the fifteen styles are the product's differentiator, not an
  advanced option; a disclosure would hide the reason the product exists.
- *Compressing the session record to one line*: rejected — the counts are the only place the reader
  learns what a translation cost; one line per fact, at 13 px.
- *Letting the panel scroll in every state*: rejected — an action that needs a scroll on first use is
  the defect this feature fixes.

---

## R5 — An icon grid that is still a radio group

**Decision**: `StylePicker` keeps a real `fieldset` with a `legend` and one native
`input[type=radio]` per style, all sharing one `name` so arrow keys move the selection natively. Each
radio is absolutely positioned over its tile at `opacity: 0`; the tile draws the preview mark and, on the
settings page, the style's name. In the panel the name is clipped with `clip-path: inset(50%)`, so the
tile is icon-only while the radio keeps the name as its accessible name; the tile also carries the name
as a `title`. Options live in a `.style-picker__grid` wrapper inside the fieldset, because a `legend` is
not a reliable grid item across engines.

**Rationale**: A radio group is exactly the right semantics for "choose one of fifteen", and it is the
one control whose keyboard behaviour, screen-reader announcement and checked state need no
reimplementation. Hiding the input visually rather than structurally keeps all of it. The wrapper
matters because the settings page wants two or three columns while the panel wants five: one CSS change,
no component fork.

**Alternatives considered**:
- *Divs with `role="radio"` and a keyboard handler*: rejected — reimplements arrow keys, roving tabindex,
  focus management and announcement, all easy to get subtly wrong.
- *A `<select>` with fifteen options*: rejected — it hides the preview marks, which are the only thing
  that makes fifteen treatments distinguishable.
- *Buttons with `aria-pressed`*: rejected — the semantics say "toggle", not "one of a set", and two could
  be pressed at once.
- *`display: none` on the input, clicks handled by the label*: rejected — the input leaves the tab order
  and Playwright's `check()` cannot reach it, silently weakening an existing test.

---

## R6 — A settings rail without new navigation state

**Decision**: The existing eight `<button aria-controls="panel-…" aria-expanded>` controls stay exactly as
they are; the nav is styled as a sticky rail (one column above 1024 px, wrapping rows below) and the
content column renders one visible section. `wireTabs()` keeps toggling `hidden` and `aria-expanded`, and
scrolls the content column to its top when a section changes. The class name `.tabs` is kept so existing
tests and wiring keep binding.

**Rationale**: A settings page with eight long sections has two honest shapes: an accordion or a map with
a rail. The rail keeps every section name visible (the reader can see that routing, sites and glossary
exist) and shows one section at a time, which is what the spec asks. Keeping the markup contract means no
new state, no history entries, no reload, and no change to existing Playwright locators.

**Alternatives considered**:
- *Hash routes (`#providers`)*: rejected — it adds a URL and state contract the spec does not ask for, and
  a deep link into a section that cannot work yet is a false affordance.
- *An accordion of all eight sections*: rejected — eight expanded sections is the long column this work
  replaces.
- *A separate page per section*: rejected — three more HTML entries in the manifest for eight small forms
  is more surface than the feature earns.
- *Renaming `.tabs`*: rejected — it churns existing test selectors for a cosmetic name.

---

## R7 — Motion that cannot be mistaken for a scroll effect

**Decision**: CSS transitions only, on hover, press, selection and theme-independent property changes:
buttons lift 1 px and settle 1 px on press; linked options move 1 px; the selected tile swaps ground and
edge in 130 ms; the panel fades and rises 5 px once on open (240 ms); the working-state dot pulses at
1.6 s while a run is in progress. One global `prefers-reduced-motion` block sets every animation and
transition to rest and keeps content at its final state.

**Rationale**: Motion is what makes a small surface feel alive, but motion bound to scroll on a settings
page would be decoration invented to look modern. The one entrance animation is bound to load, where the
eye expects it. Resting under reduced motion is not optional: an entrance that leaves content hidden is a
defect, so the keyframe's end state is the display state.

**Alternatives considered**:
- *A motion library (Framer Motion, GSAP)*: rejected — a runtime dependency for four transitions.
- *Scroll-triggered reveals on the settings sections*: rejected — actively unhelpful in a settings form.
- *No motion at all*: rejected — hover and press feedback is how a control proves it is a control.
- *JavaScript entrance timing*: rejected — it would run after first paint and fight the CSS.

---

## R8 — A control that has no effect

**Decision**: Remove the translation **temperature** field from the Style section. The stored field
`style.temperature` stays in the schema at its current value; nothing is migrated and nothing is
rewritten.

**Evidence**: `src/background/provider-client.ts` builds every request body with a literal
`temperature: 0`; the value is read from storage and written back by the settings page but never travels.
`specs/001-llm-web-translator/contracts/provider-adapter.md` §2 fixes that value, and
`tests/unit/provider-client.test.ts` asserts it twice, so making the field work is a contract change
rather than a UI change.

**Rationale**: FR-017 forbids a control whose effect cannot be observed. A disabled control with a "not
yet supported" note is the same lie with an apology attached; the honest options are to make it work (a
contract change, out of scope) or to stop showing it. Removing it also removes the only place where the
interface claimed a control the transport ignored.

**Alternatives considered**:
- *Wire the setting through to the request*: rejected here — it changes a published contract, the unit
  tests that pin it, and the deterministic behaviour the product deliberately chose; that needs its own
  feature and its own spec.
- *Show it disabled with an explanation*: rejected — an inert control invites the reader to try it.
- *Delete the stored field too*: rejected — a schema change and a migration for no user value; leaving
  the value untouched is the least commitment.

---

## R9 — Accessible names for an icon and for clipped labels

**Decision**: The panel's settings control is an icon-only `<button>` carrying both `aria-label` and
`title` from the catalogue key `popupOpenSettings` (via `data-i18n-aria-label` and `data-i18n-title`,
both resolved by the existing `localize()`). The panel's style names are clipped with
`clip-path: inset(50%)`, which removes them from the layout without removing them from the accessible
name; each tile also gets a `title`. `localize()` was extended to fill a `textarea` placeholder as well as
an input's, because the Style section's instruction field needs an example and a placeholder is not a
label (the visible label is present).

**Rationale**: An icon-only control without a name is the most common accessibility defect in extension
panels. Clipping rather than hiding keeps the radio group's names intact — the behaviour the a11y suite
already checks for every input on the settings page.

**Alternatives considered**:
- *`aria-label` on a wrapping element*: rejected — some assistive technology ignores a name on a generic
  container; the name belongs on the control.
- *`display: none` for the panel's style names*: rejected — it removes the radio's accessible name.
- *Leaving the settings control as a full-width foot row*: rejected — it scrolls out of view in the one
  state that scrolls (FR-008).

---

## R10 — Measuring the success criteria

**Decision**: The budgets no existing suite asserts — panel height, theme contrast, sideways overflow
across widths, zero third-party requests, and the absence of the temperature field — are measured inside
the existing Playwright run as `tests/e2e/panel-budget.spec.ts`: a real unpacked extension, real Chromium,
real `chrome.storage.local`, real page loads, with geometry and colour read from the live DOM. Each figure
is written into the spec's assumptions so a later build is held to the same numbers.

**Rationale**: Screenshot diffing would need a baseline per surface per theme per width and would fail on
every font-rendering difference; reading computed values from the live page tests the property the
criterion names (a ratio, a height, an overflow) rather than a picture of it. Keeping it inside the
existing suite means `npm run test:e2e` fails when a budget regresses, instead of a side script nobody
runs.

**Alternatives considered**:
- *Visual regression snapshots*: rejected — brittle across platforms, and they assert pixels rather than
  the criteria.
- *Manual review only*: rejected — "looked fine" is not decidable by an outside observer.
- *A standalone measurement script (what the work in the tree used)*: rejected as the final form — useful
  for design review, but it does not gate a merge; it becomes a spec file.
- *Asserting in jsdom*: rejected — jsdom has no layout engine, so heights and overflow cannot be measured
  there.

---

## Derived measurement reference

The figures below were measured on 2026-11-15 against the build in this working tree, and are what
[quickstart.md](./quickstart.md) reproduces:

| Quantity | Light theme | Dark theme |
|---|---|---|
| Panel height, untranslated | 484 px | — |
| Panel height, three session lines | 597 px | — |
| Panel height, five session lines | scrolls past 600 px (outside the budget; the header stays first) | — |
| Lowest text contrast pair | 4.8 : 1 | 6.77 : 1 |
| Ledé text | 5.22 : 1 | 7.58 : 1 |
| Hint text | 5.51 : 1 | 6.77 : 1 |
| Primary button label | 5.49 : 1 | 8.42 : 1 |
| Body text on card | 12.93 : 1 | 15.26 : 1 |

Sideways overflow at 320 / 390 / 768 / 1024 / 1440 px across all eight settings sections: zero.
Both bundled families report loaded from the extension origin, on both surfaces.
