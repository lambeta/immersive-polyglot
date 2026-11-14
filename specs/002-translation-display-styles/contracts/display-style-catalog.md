# Contract: Display Style Catalogue and Preview Icons

**Feature**: [spec.md](../spec.md) | **Date**: 2026-11-14

This is the contract behind FR-001, FR-006, FR-007, FR-008, FR-009, FR-010 and SC-001/SC-006/
SC-011. The catalogue is code-defined in `src/shared/display-styles.ts`; the treatments are described
here so the stylesheet and the icon generator implement the same document.

---

## 1. The fifteen styles (order is part of the contract)

| # | `id` | `nameKey` | Treatment (behavioural description) | Concealment |
|---|---|---|---|---|
| 1 | `none` | `displayStyleNone` | No decoration. The translation is a plain block, exactly as feature 001 renders it. | no |
| 2 | `underline-dashed` | `displayStyleUnderlineDashed` | Dashed underline under the translation's text, offset below the baseline. | no |
| 3 | `underline-solid` | `displayStyleUnderlineSolid` | Solid underline under the translation's text. | no |
| 4 | `border-dashed` | `displayStyleBorderDashed` | Dashed border around the translation block, with inline padding. | no |
| 5 | `border-solid` | `displayStyleBorderSolid` | Solid border around the translation block, with inline padding. | no |
| 6 | `blur` | `displayStyleBlur` | The translation text is blurred until revealed. | **yes** |
| 7 | `transparency` | `displayStyleTransparency` | The translation is rendered semi-transparent until revealed. | **yes** |
| 8 | `underline-dotted` | `displayStyleUnderlineDotted` | Dotted underline under the translation's text. | no |
| 9 | `divider` | `displayStyleDivider` | **Superseded by feature 004:** a short dashed horizontal line of about fifteen segments just above the translation (was: a horizontal rule above the translation). | no |
| 10 | `highlight` | `displayStyleHighlight` | A filled background behind the translation's text, larger than the glyphs. | no |
| 11 | `marker` | `displayStyleMarker` | A marker-pen band across the lower part of the text, as if struck through by a highlighter. | no |
| 12 | `marker-2` | `displayStyleMarker2` | A second marker treatment: a taller band with a different hue and a slanted edge. | no |
| 13 | `quote` | `displayStyleQuote` | A vertical bar on the leading edge of the block, with indented, italic text. | no |
| 14 | `weakened` | `displayStyleWeakened` | The translation's foreground is blended toward the backdrop, keeping its hue, to the lowest contrast that still clears 4.5:1. | **yes** |
| 15 | `gray` | `displayStyleGray` | The translation's foreground becomes a neutral gray (pushed toward 7:1 where the backdrop allows, never below 4.5:1), and its content is desaturated. | no |

**Why these are pairwise distinct** (SC-001): the fifteen differ in at least one of — decoration kind
(none/underline/border/rule/band/bar), decoration pattern (dashed/solid/dotted), decoration geometry
(above/below/around/leading-edge), fill shape (full background vs lower band vs taller slanted band),
foreground treatment (inherit vs hue-blend vs neutral), or visibility (filter/opacity). No two entries
differ only in colour.

**Name source**: every `nameKey` MUST exist in `src/_locales/en/messages.json`; the i18n audit test
enforces it. The English source names are the reference names translated: None, Dashed underline,
Solid underline, Dashed border, Solid border, Blur (study mode), Transparency, Dotted underline,
Divider, Highlight, Marker pen, Marker pen 2, Quote, Weakened, Gray.

---

## 2. Resolution and fallback

```text
resolvedStyle(settings, host) =
  sitePreference(host).displayStyle   if present AND catalogued
  settings.ui.displayStyle            if present AND catalogued
  "none"
```

- An unknown identifier — in global settings, in a site override, or arriving in a message — MUST
  resolve to `none`. It MUST NOT be treated as an error, MUST NOT block translation, and MUST NOT
  alter other settings (FR-020).
- The resolved style is independent of the display mode and of the translation prompt style
  (feature 001's `StyleSettings`). Changing one MUST NOT change another (FR-006).
- An explicit site override beats the global default; removing it returns the site to the global
  default on the next render (FR-019).

---

## 3. Preview icons

Each style owns one generated icon. The generator is a pure function of the catalogue entry.

| Obligation | Rule |
|---|---|
| Form | Inline `<svg>`, `viewBox` based (vector), no embedded raster, no external request |
| Size | Renders legibly at 16 px and at 200 % UI zoom without clipping or distortion (SC-011) |
| Content | Two abstract "text line" bars with the style's decoration applied; the live sample below the picker carries the localised text |
| Semantics | `role="img"` with an accessible name equal to the style's localised name; an `aria-hidden` decorative layer for the bars (FR-008) |
| Colour | Uses `currentColor` plus shape/pattern; the icon MUST remain interpretable with colour removed (FR-010) |
| Distinction | Every icon is pairwise distinct in its own right, not only through the label (SC-001) |

**Required icon shapes** (so two implementers reach the same result):

| Style | Icon mark |
|---|---|
| none | two bars, no mark |
| underline-dashed / solid / dotted | a dashed / solid / dotted line under the lower bar |
| border-dashed / solid | a dashed / solid rectangle enclosing both bars |
| divider | **Superseded by feature 004:** a short dashed horizontal line above the bars (was: a horizontal rule above the bars) |
| highlight | a filled rounded rectangle behind the bars |
| marker | a translucent lower band across both bars |
| marker-2 | a taller translucent band with a slanted leading edge, different hue |
| quote | a thick vertical bar on the leading side, bars indented |
| blur | bars drawn under a blur filter |
| transparency | bars at low opacity |
| weakened | bars with a leading-to-trailing fade |
| gray | bars filled with a 45° hatch pattern |

---

## 4. Picker obligations (shared by options and popup)

- A native radio group: one radio per style, each labelled by its icon **and** its name.
- Keyboard: arrow keys move the selection, Tab enters and leaves the group, Enter/Space select —
  all provided by the native radio semantics, so no custom key handling is required (SC-006).
- Screen reader: the group has a name (fieldset legend), each radio announces its style name, and the
  selected state is conveyed by the native checked state (FR-008).
- The picker also shows a live sample of the currently selected style **before** it is saved (FR-009).
- The options page and the page control show the same fifteen entries in the same order; a change in
  either is reflected in the other without a reload (FR-005).
- No style is identifiable by icon alone: the name is always adjacent text (FR-008).
