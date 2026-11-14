# Contract: Styled Rendering

**Feature**: [spec.md](../spec.md) | **Date**: 2026-11-14

This is the contract behind FR-002, FR-003, FR-011..FR-018 and SC-002/SC-004/SC-007/SC-009/SC-012. It
extends feature 001's [rendering contract](../../001-llm-web-translator/contracts/rendering-dom.md)
and inherits its placement, association and restoration obligations unchanged.

---

## 1. Mark-up

A styled translation is the block feature 001 already renders, with additional product-owned
attributes. No new element, wrapper, or re-parenting is introduced.

| Attribute | When present | Meaning |
|---|---|---|
| `data-ipt="target"` | always | Existing marker: this block is a translation |
| `data-ipt-style="<id>"` | always, including `none` | The resolved style; the stylesheet selects on it |
| `data-ipt-conceal="true"` | only for blur, transparency, weakened | Signals the reveal contract |
| `tabindex="0"` | only while `data-ipt-conceal="true"` | Makes keyboard reveal possible |
| `lang="<target>"` | always | Existing; unchanged by styling |
| `style="--ipt-style-fg: <colour>"` | only for weakened and gray | The computed contrast-safe foreground |

Rules:

- Every attribute/property write goes through the journal at write time, so toggle-off removes it
  exactly (feature 001 R8).
- Setting `data-ipt-style` MUST NOT create, move, clone or detach a node.
- Changing style MUST NOT alter the translation text, the source block, or the display mode.
- Selection-only and single-block translations receive exactly the same attributes as a full-page
  translation (FR-017).
- Blocks the page removed are skipped; the renderer writes nothing into a detached node.

---

## 2. Stylesheet and scoping

- All visual rules live in `src/styles/display-styles.css`. It is declared beside `styles/content.css`
  in the manifest's `content_scripts.css` list and copied into `dist/styles/` by the build; the UI
  pages import the same file, so the picker's live sample and the injected rendering are literally
  the same rules.
- Every selector is keyed on `[data-ipt-style="<id>"]` and may additionally use the block's existing
  `[data-ipt="target"]` marker. No selector targets a page-authored element, an unmarked element, or
  a tag/element name alone (FR-011).
- No `!important`. The marker attribute selector is specific enough; if a page proves it is not, the
  rule is scoped tighter rather than escalated.
- Decoration is CSS-only. The only dynamic values are the contrast foreground and the concealment
  attributes described above.
- Styles are neutral with respect to display mode: the bilingual/above/only rules in feature 001 keep
  control of placement, and style rules must not set `position`, `float`, `display` of the block, or
  margins that would displace it (FR-006, SC-005).

---

## 3. Reveal (concealment styles)

**Applies to**: `blur`, `transparency`, `weakened`.

| Obligation | Rule |
|---|---|
| Initial state | The translation is rendered subdued: blurred, semi-transparent, or lower-contrast |
| Pointer reveal | On `:hover`, the text becomes fully legible |
| Keyboard reveal | On `:focus`, the text becomes fully legible; the block is focusable only while concealed |
| Timing | No transition is used, so the change is instantaneous and well inside the 150 ms budget |
| Focus indication | A visible focus outline is shown on ``:focus-visible` so a keyboard user can tell where they are |
| Content availability | The text node, `lang` attribute and reading order are untouched: screen readers, selection, copy and browser find all see the full text |
| Reduced motion | No animation is introduced; if a future change adds one, it MUST be wrapped in `@media (prefers-reduced-motion: no-preference)` |
| Revealed state | For `weakened`, revealing restores the translation's original inherited colour, not merely a colour that passes the contrast floor |
| Leaving the style | Switching to a non-concealment style removes the concealment attribute, the tabindex and the reveal rules |

Reveal MUST be reachable without a pointer: a page whose translations can only be read with a mouse
fails SC-007.

---

## 4. Contrast

- Decorative styles inherit the source block's colour (feature 001 already inherits typography).
- `weakened` and `gray` use a foreground computed from the **effective backdrop**: walk ancestors of
  the translation until an opaque background is found, compositing translucent backgrounds on the
  way; then choose the foreground as described in research R6.
- Threshold: ≥ 4.5:1 for normal-size text, ≥ 3:1 for large text (≥ 18.66 px, or bold ≥ 14 px), on
  both light and dark backgrounds (FR-013, SC-008).
- The computation is deterministic and pure; the same backdrop always yields the same colour, and
  the result is written as a CSS custom property so it can be journalled and restored.
- If the inherited colour already fails and no tint passes, the fallback chooses black or white,
  whichever contrasts more; that choice is guaranteed to reach at least 4.58:1.
- Measurement is done in the browser from computed styles, not from stylesheet tokens.

---

## 5. Forced colours, high contrast and reduced motion

- Under `@media (forced-colors: active)`: disable filters, opacity changes and background marks; force
  the translation to system-contrast text; identify the translation with a **typographic cue**
  (underline) so the distinction is not carried by colour alone; concealment styles reveal by
  default (nothing may hide text when the reader has asked for maximum contrast) (FR-018).
- Under `@media (prefers-reduced-motion: reduce)`: no transitions, no animations. Reveal is instant.
- Neither media condition may remove the translation from the reading order or the accessibility
  tree.

---

## 6. RTL and layout tolerance

- Leading/trailing decoration uses logical properties (`border-inline-start`, `padding-inline`,
  `margin-block`), so the quote bar and divider mirror correctly for right-to-left targets.
- The translation must tolerate 30 % text expansion: borders and padding MUST NOT clip text, force
  horizontal page scroll, or break list markers, table cells, or definition lists (FR-014, SC-012).
- Switching style MUST NOT change the block's height/width enough to cause overlap with neighbours
  beyond the tolerance used by the existing layout check.

---

## 7. Restoration and idempotence

- Toggling translation off with any style active MUST remove every injected node, every added
  attribute (`data-ipt-style`, `data-ipt-conceal`, `tabindex`) and every added property, leaving the
  page identical to its pre-translation state (FR-015, SC-004).
- Switching styles repeatedly MUST converge on the last selection, MUST NOT accumulate journal
  entries per block beyond the first write of each attribute, and MUST NOT change node count
  (FR-016, SC-009).
- Re-applying the current style MUST be a no-op (no writes, no layout).
