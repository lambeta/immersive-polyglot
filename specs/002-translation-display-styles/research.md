# Phase 0 Research: Translation Display Styles and Their Preview Icons

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-14

All unknowns raised by the Technical Context are resolved below. Each decision records what was
chosen, why, and what was rejected. Decisions R1-R5, R7 and R8 build on feature 001's decisions
([001 research](../001-llm-web-translator/research.md)); R6 is new to this feature.

---

## R1. Styling mechanism: a product-owned attribute plus manifest-declared CSS

**Decision**: A style is applied by setting `data-ipt-style="<id>"` on the translation container the
renderer already owns, with the visual treatment defined in extension CSS. Decoration never uses an
inline `style` attribute, never injects page-global CSS, and never requires a new permission. Inline
CSS properties are used **only** for the two values CSS cannot compute itself (the contrast-safe
foreground colour), and those writes go through the existing journal.

**Rationale**: Feature 001 already ships `styles/content.css` as a manifest-declared stylesheet,
which Chrome injects as an extension resource and therefore survives page CSP ([001 R2][r2],
[001 rendering contract][rc] section 4). The translation container already carries `data-ipt`,
`data-ipt-unit`, `lang` and `data-ipt-position`, all journalled at write time ([001 R8][r8]). Adding
one more journalled attribute reuses a mechanism that is already proven exact under restore, needs no
new permissions, and keeps the change surface small — which is what constitution principle IV asks
for.

**Alternatives considered**: (a) Inline `style` decoration — simplest to author, but strict page CSP
can reject style attributes, the journal would have to record many properties per block, and the
shared-rule guarantee with the UI preview is lost. (b) Injecting a `<style>` element into the page —
blocked by CSP on many sites and would be page-global CSS, violating 001's styling constraint.
(c) A second extension stylesheet per style — multiplies resources for no benefit. (d) A CSS-in-JS
runtime — a dependency and a runtime cost for fifteen static rules.

---

## R2. The fifteen presets are reproduced clean-room, with an explicit treatment table

**Decision**: Implement exactly the fifteen presets the reference product lists, with stable
identifiers and a documented treatment per preset (catalogue in
[contracts/display-style-catalog.md](./contracts/display-style-catalog.md)). No code, CSS or icon
file is copied from Immersive Translate; each treatment is described from observation and implemented
from that description. Names come from the product's own translation catalogue.

**Rationale**: Feature 001 established the same posture for rendering: Immersive Translate is closed
source and its archived predecessor is MPL-2.0, so behaviour is reproduced from a written description
([001 R2][r2]). The style list is the user-visible contract here (FR-001), and a written table is what
makes "same set, same meaning" reviewable and testable. Stable ids (not localised names) are what the
settings file stores, so translating the interface never breaks a saved choice.

**Alternatives considered**: Storing the localised name as the identifier — breaks on language change
and on rename; reproduced styles as free-form CSS snippets — untestable and unmatchable; copying the
reference product's stylesheet — not published, and licensing/attribution risk.

---

## R3. Persistence: schema v1 → v2 with an ordered migration

**Decision**: Bump `CURRENT_SCHEMA_VERSION` to 2. The migration step `add-display-style` writes
`ui.displayStyle = "none"` when absent, and normalises `sites[].displayStyle` (unknown or missing →
field absent, which resolves to the global default). A new `tests/fixtures/storage/v2.json` records
the migrated shape. `mergeDefaults` also accepts the new fields so a v1 profile read by a v2 build is
usable even before the migration write lands.

**Rationale**: Feature 001's storage contract requires a version written on every save, an ordered
migration chain, and refusal to write a profile produced by a newer build ([001 storage
contract][sc] section 3). Adding a persisted user choice under the same version number would let a
downgrade silently drop it, because the older build rewrites the whole `ui` object. The bump makes
the existing "newer schema" guard protect the reader's choice, which is exactly what that guard is
for. A no-op-on-fresh-profile migration is the smallest change that keeps the contract honest.

**Alternatives considered**: Keep v1 and rely on `mergeDefaults` — forward-compatible but
lossy on downgrade, and it leaves the storage contract's "every change to the persisted shape
bumps the version" rule broken. A separate storage key for style — a second source of truth for the
same "how translations look" concern, and "delete all data" would have to learn it.

---

## R4. Live restyle without re-translation

**Decision**: The renderer gains `setDisplayStyle(style)`, which updates `data-ipt-style` (and the
concealment attributes in R5) on every block it has rendered and records the changes in the journal;
the job delegates to it. A new `setDisplayStyle` command is added to the message protocol. Choosing a
style in options persists it and asks the service worker to relay `setDisplayStyle` to every tab;
the page control sends it to its own tab. Changing the style never touches segmentation, the request
path, or stored translations. While wiring this, the existing `setDisplayMode` command — already sent
by the page control but not handled in the content script — is routed through the same live-update
path.

**Rationale**: FR-002 and FR-003 require already-rendered blocks to change with zero provider
requests, and SC-002 sets a one-second budget for 100 blocks. An attribute rewrite is O(rendered
blocks) of cheap DOM writes with no layout-dependent reads, so it is comfortably inside the budget.
Reusing the worker's existing broadcast pattern (`providerChanged`) avoids a second fan-out
mechanism. Wiring `setDisplayMode` is not scope growth: the two settings share one live-update path,
and leaving half of it dead would make the picker's neighbour silently broken.

**Alternatives considered**: A full restore-and-re-render on style change — discards and re-inserts
every block, churns layout, and risks scroll jumps. Re-rendering from cached translated text — touches
the job's unit state for a presentation change and could re-trigger observer callbacks. Requiring a
reload — directly contradicts SC-002.

---

## R5. Concealment styles: reveal on hover and focus, focusable only when concealed

**Decision**: Three presets reduce visibility: `blur` (CSS filter), `transparency` (opacity) and
`weakened` (reduced-contrast foreground). While one of them is active, the container also gets
`data-ipt-conceal="true"` and `tabindex="0"`; CSS reveals the full text on `:hover` and `:focus`
with no transition (so the 150 ms budget is met trivially and reduced-motion is satisfied). Switching
to a non-concealment style removes both attributes; the journal already records attribute writes, so
restore unwinds them. The `lang` attribute, the text node and the reading order are untouched, so
screen readers, selection, copy and find keep working.

**Rationale**: FR-012 requires keyboard reveal, and a non-focusable `<div>` has no keyboard focus
state. Making the block focusable only while concealment is active keeps the page's tab order
unchanged for the default and decorative styles, which is the least intrusive way to satisfy the
requirement. `:hover` plus `:focus` (rather than `:focus-visible`) covers pointer, keyboard and
assistive-technology focus uniformly. No transition means no animation to suppress, and no reveal
timing race.

**Alternatives considered**: Always `tabindex="0"` — adds fifteen tab stops per screenful to every
page, a serious regression for keyboard users. Reveal on `:focus-within` of the source block — only
works when the source contains a focusable element and couples translation visibility to page markup.
A reveal control button per block — heavy, and a second thing to localise. Removing concealment under
`prefers-reduced-motion` — motion is not the problem.

---

## R6. Contrast-safe foreground for gray and weakened styles

**Decision**: The renderer computes the effective backdrop behind each translation (walking ancestors
until an opaque background is found, compositing translucent layers), then asks a shared utility for a
foreground colour that reaches 4.5:1 (normal text) or 3:1 (large text, ≥ 18.66 px or bold ≥ 14 px).
The utility keeps the translation's inherited hue for `weakened` and only moves it as far toward the
background as the threshold allows. `gray` uses a neutral tone pushed to a stronger 7:1 where the
backdrop permits it, so it reads as a deliberate dark gray rather than as a barely-passing fade (which
is what `weakened` is) — without that separation the two presets render identically on an achromatic
page, which SC-001 would catch. If the inherited colour itself
already fails (a page with its own low-contrast text), it falls back to whichever of black or white
has the higher contrast; that choice is mathematically guaranteed to reach at least 4.58:1, since the
two curves cross at that ratio. The chosen colour is written as a CSS custom property on the
container through CSSOM and journalled.

**Rationale**: FR-013 asks for a measured ratio against the background *actually* rendered, and pages
are frequently dark, tinted, or mid-luminance. A fixed token cannot satisfy it, and `opacity` cannot
either: 50 % black text on white measures ≈3.9:1, below the threshold. Computing it in one small,
pure, unit-testable function is cheaper than the alternative — declaring the requirement unverifiable
— and keeps the guarantee mechanical rather than aspirational. The black/white fallback is a proof,
not a heuristic, and is tested against pathological mid-gray backgrounds.

**Alternatives considered**: Fixed `#666` for gray — fails on dark pages (and is only 5.7:1 on
white). `opacity: 0.6` for weakened — works on white by luck, fails on tinted backgrounds, and cannot
be adjusted. `color: GrayText` — a system colour unrelated to the page's backdrop, and not supported
as a page colour on all platforms. Delegating to the page's own contrast — the product cannot assume
the page got it right. Refusing to ship gray/weakened — the spec requires all fifteen presets.

---

## R7. Preview icons: generated inline SVG, catalogue-driven

**Decision**: Each preset has a preview icon produced by a shared function that returns an inline
`<svg>` built from the preset's descriptor: sample text (or abstract text bars) plus the preset's
decorative mark — underline stroke pattern, border rectangle, divider rule, highlight/marker band,
quote bar, fade/blur/grayscale treatment. The SVG carries `role="img"`, a `<title>` from the
catalogue name, and `aria-labelledby` to its title; sample text is decorative. Icons use
`currentColor` and shapes as well as colour, are vector, and scale with the UI. No binary image
assets are introduced.

**Rationale**: SC-001 requires 105 pairs to be distinguishable, SC-011 requires legibility at 200 %
zoom, and FR-008 requires an accessible name. Generated SVG satisfies all three with no asset
pipeline, no localisation of binary files, and no drift from the catalogue: the icon's descriptor and
the stylesheet's treatment are both keyed by the same id, and a test asserts every id has an icon,
that icons are pairwise distinct, and that every icon is labelled. `currentColor` keeps icons legible
in light and dark UI themes.

**Alternatives considered**: A sprite sheet of hand-authored SVGs — duplicates the treatment table
and needs localisation per icon title. Raster PNGs — fail zoom, need per-theme variants. Emoji or text
glyphs — inconsistent across platforms, often carry unintended meaning, and fail "not colour alone".
Reusing the live CSS sample as the "icon" — the spec distinguishes icon from live sample, and a
shrunk live sample is indistinguishable for the subtle presets.

---

## R8. Verification: real-browser capture for distinctness, jsdom for restore

**Decision**: Two layers. (1) jsdom tests assert attribute application, removal, concealment
focusability, idempotent switching and journal unwinding, including a DOM-hash comparison against a
pre-render snapshot. (2) A new `npm run verify:styles` script launches the real unpacked extension in
Chromium, renders the same sample page under each of the fifteen styles, captures each rendering, and
reports: every pair differs above a calibrated pixel threshold (SC-001), the page's computed
foreground/backdrop ratios (SC-008), a restore comparison against the pre-translation snapshot for
every style (SC-004), and layout metrics (no horizontal scroll, no overlap) for the mode × direction
matrix (SC-005). Exit codes follow the existing verification script: 0 pass, 1 divergence, 2 the
build or fixture is missing.

**Rationale**: These criteria are visual and per-release; unit tests cannot measure pixels or
contrast against real layout, and a human eyeball review is not reproducible (constitution principle
I). The project already has the machinery: a real-browser verification script for rendering
(`verify:rendering`), a Playwright persistent-context launcher, and frozen fixture pages. Reusing that
shape keeps one verification idiom in the repository.

**Alternatives considered**: Rely on manual review — not decidable per release. Screenshot snapshots
inside Playwright's own `expect(page).toHaveScreenshot()` — good for regressions but not for
pairwise distinctness, and it bakes in one machine's rasterisation. Asserting computed CSS values
only — proves the rule exists, not that it renders distinguishably.

---

## Open items carried into `/speckit-tasks`

None blocking. Two execution-time obligations, both recorded as tasks:

1. Re-capture the feature 001 rendering corpus with a style in effect (SC-012), because the existing
   capture records placement only. The capture is manual (store-installed Immersive Translate).
2. Calibrate the pairwise pixel threshold in `verify:styles` against the two subtlest presets
   (weakened vs gray) and record the calibration in the script's help text, so the threshold is a
   documented decision rather than a magic number.

[r2]: ../001-llm-web-translator/research.md
[rc]: ../001-llm-web-translator/contracts/rendering-dom.md
[r8]: ../001-llm-web-translator/research.md
[sc]: ../001-llm-web-translator/contracts/storage-schema.md
