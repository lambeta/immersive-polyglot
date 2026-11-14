# Phase 0 Research: Divider Style Fix and Custom Translation Typography

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-14

Each decision below resolves one unknown from the plan's Technical Context. Alternatives are
recorded because the constitution requires the rejected option to be visible, not inferred.

---

## R1 — Drawing the divider rule

**Decision**: The Divider treatment becomes one logical-edge declaration on the translation block:
a 1 px dashed rule on the inline-start edge plus a small inline-start padding. The block-start rule
and its padding are removed.

**Rationale**:
- A border is drawn by the layout engine at the element's border box, so its **height is the block's
  height** for every block, including multi-line paragraphs and single-line headings, with no
  measurement, no JavaScript, and no extra DOM node to journal.
- `inline-start` is logical: it becomes the left edge in LTR and the right edge in RTL with no
  duplicated rule.
- A border keeps working under `forced-colors` (the existing rule already maps the divider's
  border colour to `CanvasText`), under zoom, and in print-like layouts.
- It costs one declaration to add and one to remove, and the exact-restore journal already knows how
  to undo inline declarations on the container.

**Alternatives considered**:
- **A `::before` pseudo-element with `position: absolute`**: needs `position: relative` on the
  container, a height of 100%, and a lifetime tied to a generated box. If the page sets
  `box-sizing`, `overflow` or a transform on an ancestor, the rule can detach from the block. More
  moving parts for the same picture.
- **A dashed background gradient**: true dash rhythm depends on background-size rounding, and the
  gradient repeats vertically only by accident. Fragile at fractional zoom levels.
- **A sibling element**: another node to insert, journal and remove, and it needs to be sized to the
  translation — the exact measurement the border avoids.
- **SVG**: correct but heavy: a new node, namespace handling, and no forced-colors benefit.

**Consequence recorded in the contract**: the rule's thickness is a hairline (1 CSS px), its dash
pattern is the platform's dashed border (so it is not customised per browser), and the text is not
italic or indented beyond the padding gap.

---

## R2 — Establishing the translation's direction for RTL targets

**Decision**: Add `src/shared/direction.ts` with `isRtlLanguage(lang)` over the right-to-left
language codes, and have the renderer write `dir="rtl"` on a translated block when its target
language is RTL. For non-RTL targets no `dir` is written, so the block keeps inheriting the page's
direction. `setTargetLang` updates the attribute for existing blocks.

**Rationale**:
- The feature contract requires the rule on the **right** edge for an RTL target language (SC-002),
  including when the source page is LTR. CSS logical properties resolve against the element's
  *computed* direction; without this, an Arabic translation of an English article would put the rule
  on the left.
- An explicit language-derived direction is deterministic. It is also the correct base direction for
  the translation text itself (punctuation, list markers, alignment), which improves Quote as well.
- The attribute is journaled once per block, so exact restore removes it.

**Alternatives considered**:
- **Rely on the page direction only**: fails SC-002 whenever the target is RTL and the page is LTR.
- **`dir="auto"` (first strong character)**: cheap but non-deterministic. A translation that starts
  with a product name, a number, or a Latin abbreviation resolves to LTR and puts the rule on the
  wrong side. The spec asks for a language property, so the product should use the language.
- **Mirror the CSS rule with `:dir(rtl)` only**: cannot help when the block never becomes RTL.

**Scope note**: this is a supporting correction, not a redesign. It is covered by a DOM test
(`dir` present and restored) and by the existing mode × direction layout matrix.

---

## R3 — Font-size scaling semantics

**Decision**: The size scale is **relative to each source block's own computed size**, not to a
global base and not a percentage in CSS. At render time the renderer reads the source's computed
font size (px) and line-height once, stores them on its rendered record, and writes:

```text
translation font-size      = round(sourceFontSizePx × scale / 100)
translation line-height    = sourceLineHeightPx × scale / 100   (only when it parsed as px)
```

At scale 100 and no custom family, no overriding declaration is written: the inherited typography
from feature 001 is left exactly as it is.

**Rationale**:
- A percentage or `em` size would resolve against the translation container's parent (usually a
  page block), not against the source element. A translation of an `h1` and a translation of a `p`
  share the same parent, so both would resolve to the same computed size and the heading hierarchy
  would collapse. Scaling the captured source pixel value preserves hierarchy at every scale.
- Writing pixels (not percentages) also makes the result independent of later page style changes
  while translation is on, which matches the "translation is its own block" model.
- Line-height must scale too, or a 200 % size would overlap its own lines; scaling only a concrete
  pixel value keeps the source's ratio, while `normal` is left as `normal` so the browser applies
  its own proportional rule.

**Alternatives considered**:
- **`font-size: 125%`**: collapses the heading/body hierarchy (see above).
- **`zoom` / `transform: scale()`**: changes layout geometry, can cause horizontal overflow, and
  interacts with the page's own transforms.
- **A single absolute size for all translations**: simplest to reason about but flattens the page's
  typographic structure and contradicts "translations behave like the source block".
- **Re-reading the source's computed style on every restyle**: would break when the source is hidden
  in "translation only" mode and adds work per change; storing the base values once is cheaper and
  stable.

**Tie to requirements**: FR-010, FR-011, FR-012, FR-015; SC-005, SC-006.

---

## R4 — Accepted font-family values and fallback

**Decision**: Accept a comma-separated family list. Each entry is either a quoted string or an
unquoted family name; the whole value is trimmed, limited to 200 characters, and refused if it
contains any of `; { } < > ! \\` , a control character, `@` or `url(`. An empty value means
"inherit the page's font". At render time the resolved stack is emitted with the source's computed
family appended as the final fallback.

**Rationale**:
- The value reaches an inline declaration on an extension-owned element. An allow-list grammar is the
  only defensible way to keep a pasted stylesheet snippet from escaping the declaration; a
  block-list alone invites bypasses.
- Appending the source family guarantees that glyphs the chosen face lacks (for example a Latin-only
  face with a Chinese translation) render exactly as the page would have rendered them, satisfying
  FR-014 without a font-coverage API (which browsers do not expose).
- Quoted names keep family names with spaces (for example `"Source Han Serif SC"`) usable, which the
  spec's acceptance scenario names.

**Alternatives considered**:
- **A fixed list of fonts**: impossible to enumerate installed fonts from an extension, and a list
  cannot name the reader's corporate or proofing face.
- **Accept any CSS value**: one semicolon appends an arbitrary declaration; rejected on safety and
  on the "previous value stays in effect" requirement.
- **Ask the browser which family actually rendered**: no platform API exposes resolved font
  coverage; the fallback chain is the supported mechanism.

**Tie to requirements**: FR-009, FR-014, FR-017; SC-007, SC-011.

---

## R5 — Persistence without a schema bump

**Decision**: Add two optional fields to the existing `ui` object: `translationFontFamily?: string`
and `translationFontScale?: number`. `defaultSettings` writes `""` and `100`; `mergeDefaults`
accepts only a valid string / a finite in-range scale (rounding to the nearest 5 %), otherwise the
default. `schemaVersion` stays 2 and no migration is added.

**Rationale**:
- The fields are additive and optional. A profile written by this build is still a valid version-2
  profile for older code paths (they simply ignore the fields), and a version-2 profile without them
  resolves to the defaults on read. That is exactly what "existing profiles see no change" (FR-012)
  needs.
- Bumping the version forces `SettingsStore.load()` to rewrite every profile on first open (the
  store persists when the version changes) and makes the newer-build guard reject more profiles. The
  feature does not earn either cost.
- Reusing `ui` avoids a new top-level storage key, which would touch `STORAGE_KEYS`, the storage
  contract and the delete-all list.

**Alternatives considered**:
- **A migration to version 3**: the 002 precedent did this for `displayStyle` because that field
  changed semantics of an existing key. Here nothing existing changes; a migration would be
  ceremony with a rewrite cost.
- **A new top-level `typography` key**: cleaner naming, but a new persisted entity with its own
  limits, delete-all coverage and contract; rejected by principle IV.
- **Store per site**: explicitly out of scope in the spec.

**Tie to requirements**: FR-020, FR-021; SC-008.

---

## R6 — Reaching already-rendered blocks

**Decision**: Add two command types. The options page sends `typographyChanged` with the validated
`{ fontFamily, fontScale }` object; the service worker (which already relays `styleChanged`) relays
it to every tab as `setTypography`; the content agent clears its cached settings and calls
`job.setTypography(...)`, which forwards to `Renderer.setTypography`. New jobs receive the
resolved typography through `JobOptions.typography`.

**Rationale**:
- It mirrors the existing, tested `styleChanged` → `setDisplayStyle` path exactly, so there is one
  pattern for "presentation change, no request" in the product.
- The renderer updates records in place (no node creation, no re-segmentation, no provider call),
  which is what the 1-second budget and the "0 new translation requests" criterion require.
- Carrying the payload means a tab that missed the storage event still receives the exact value.

**Alternatives considered**:
- **A `chrome.storage.onChanged` listener in the content script**: adds a listener on every page,
  makes the content script depend on cross-context storage events, and leaves the UI without a
  delivery acknowledgement. The explicit relay already exists; reuse it.
- **Reusing `setDisplayStyle` with a composite payload**: mixes two independent preferences into one
  message, making partial application and validation muddy.
- **Restyling on the next translation only**: violates FR-019/SC-004.

**Tie to requirements**: FR-019; SC-004.

---

## R7 — Preview icon for the new Divider

**Decision**: Reuse the existing `bar` mark and let it honour the descriptor's `pattern`: marker
`{ mark: "bar", pattern: "dashed" }` draws a thin dashed vertical line on the leading edge of the
icon; Quote keeps `{ mark: "bar" }` and draws the thick solid bar. The icon's text bars keep the
same leading offset as Quote, so the difference is thickness + dash pattern, not position.

**Rationale**:
- The generator stays a pure function of the catalogue descriptor (FR-007's "icon cannot drift from
  the treatment it names").
- `bar` is already the "vertical rule on the leading edge" mark; the divider now uses exactly that
  geometry, differing only in pattern and weight — which is also the distinction on the page.
- At 16 px a 1.2 px dashed stroke against a 2.6 px filled bar remains legible and pairwise distinct.

**Alternatives considered**:
- **A new `edge` mark**: enum churn for a shape the `bar` mark already expresses; also needs a
  second bar-offset rule in the icon builder.
- **Keeping the horizontal-rule icon**: would advertise the appearance we are removing (violates
  FR-007 and the spec's preview requirement).
- **A tiny screenshot-style raster**: forbidden by the icon contract (vector, currentColor).

**Tie to requirements**: FR-007; SC-003.

---

## R8 — Contrast, forced colours, motion and accessibility

**Decision**:
- The rule uses `currentColor`, so it can never be weaker than the translation's text colour; the
  existing contrast harness (which measures text against the real backdrop) therefore also covers
  the rule against the 3:1 non-text floor.
- The existing `forced-colors` block keeps mapping the divider's border colour to `CanvasText`;
  the dashed style survives because forced colors does not override `border-style`.
- No transition or animation is introduced (reduced motion stays a no-op).
- The two new controls are native labelled inputs; the error slot is an `aria-live="polite"` status
  region; the size input exposes `min`, `max` and `step` so assistive technology can announce the
  range; Reset is a labelled button.
- 200 % zoom keeps a 1 CSS px rule legible and the controls unclipped because the panel is a normal
  document flow with wrapping rows.

**Alternatives considered**: a thicker rule (fails the "hairline" requirement and looks like Quote);
an opacity-based colour (fails contrast when the page background is close to the text colour);
a custom tooltip-only error (inaccessible).

**Tie to requirements**: FR-003, FR-023; SC-001, SC-007, SC-010.

---

## R9 — Verification strategy and the distinctness calibration risk

**Decision**:
- **Unit (node)**: validation grammar accepted/refused cases; settings defaults, tolerance and
  persistence with no version bump; `isRtlLanguage`; the divider catalogue descriptor.
- **DOM (jsdom)**: renderer typography — family override with appended fallback, per-block pixel
  scale, heading stays above body, line-height scaling, 100 % no-op, `dir` for RTL and its removal
  on restore; divider — text styling untouched, only the container is styled, switching is
  journal-stable. jsdom does not compute the stylesheet, so DOM tests assert the inline declarations
  the renderer writes, not painted geometry.
- **E2E (real Chromium)**: computed-style geometry for the divider (inline-start border present,
  block-start border absent, rule height/coverage); typography save → live restyle within 1 s with
  0 provider requests; persistence across reload/new tab; invalid font and size refusals; reset;
  live sample reflecting saved values; RTL target puts the rule on the right.
- **Style verification**: re-run `npm run verify:styles`. It prints the weakest of the 105 pairs.
  Becoming vertical moves Divider closer to Quote, which is the one pair at risk of approaching the
  0.5 % pixel threshold. Mitigation is to widen the *designed* difference (dash rhythm, hairline
  weight, leading gap), never to lower the threshold or exclude the pair.

**Rationale**: the constitution's test-first rule and "real data, real behaviour" rule together mean
the painted result is proven in a real browser while the logic is proven deterministically in node.

**Alternatives considered**: a unit test that parses the CSS text for forbidden properties (brittle,
and does not prove the painted outcome); relying on screenshots alone (no deterministic failure
message); jsdom-only geometry assertions (jsdom does not lay out or paint).

**Tie to requirements**: all; SC-001–SC-011.
