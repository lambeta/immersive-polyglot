# Phase 1 Data Model: Divider Style Fix and Custom Translation Typography

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [divider-presentation.md](./contracts/divider-presentation.md), [typography-settings.md](./contracts/typography-settings.md)

---

## 1. Persisted shape

The feature adds no storage key. Two optional fields join the existing `ui` object, so a version-2
profile remains a version-2 profile.

```jsonc
{
  "schemaVersion": 2,
  "ui": {
    "targetLang": "zh",
    "sourceLang": "auto",
    "displayMode": "bilingual",
    "displayStyle": "none",

    // NEW — optional; absent means "inherit the page's font".
    // Trimmed, validated family list, e.g. "\"Source Han Serif SC\", serif".
    "translationFontFamily": "",
    // NEW — optional; absent means 100. Integer 50..200, multiple of 5.
    "translationFontScale": 100
  }
}
```

**Ownership**: the options page writes both fields; the content script and service worker read them.

**Page content**: never. `assertNoPageContent` continues to reject page-content keys; neither field
carries text from the page.

---

## 2. Resolved value

```ts
export interface TranslationTypography {
  /** Trimmed family list, or "" for "inherit the page's font". */
  fontFamily: string;
  /** Integer percentage, 50..200, multiple of 5. 100 means "do not override size". */
  fontScale: number;
}
```

Resolution (single function, used by the renderer, the options live sample and tests):

```text
resolveTypography(settings):
  family = settings.ui.translationFontFamily
  scale  = settings.ui.translationFontScale

  family = (typeof family === "string" && isAcceptedFontFamily(family)) ? family.trim() : ""
  scale  = (typeof scale === "number" && Number.isFinite(scale))
             ? clampToStepRange(roundToNearest5(scale), 50, 200)
             : 100
  return { fontFamily: family, fontScale: scale }
```

- Resolution is **tolerant**: a profile edited by hand, a migration, or a newer build must not break
  rendering. Invalid stored values fall back to the defaults above (FR-009, FR-012, FR-020).
- Resolution is **global**: no site or language dimension exists for typography (spec Out of Scope).

---

## 3. Validation

Validation lives in `src/shared/validation.ts` and returns `ValidationIssue` values whose
`messageKey` names a catalog entry; the UI never invents wording.

### 3.1 Font family — `validateFontFamily(value)`

| Rule | Detail | On failure |
|---|---|---|
| Empty | After trim, an empty string is valid and means "inherit". | — |
| Length | At most 200 characters after trim. | `displayFontInvalid` |
| Forbidden characters | Semicolon, braces, angle brackets, exclamation mark, at-sign, backslash, or any control character. | `displayFontInvalid` |
| Forbidden construct | Case-insensitive `url(` (a font download attempt). | `displayFontInvalid` |
| Grammar | Split on commas; every non-empty entry must be either a quoted string (`"…"` or `'…'`, with no quote, backslash or forbidden character inside) **or** an unquoted name matching `^[\p{L}_-][\p{L}\p{N} _.-]*$` (Unicode letters allowed, so 思源宋体 works). A trailing empty entry is tolerated. At least one entry must remain. | `displayFontInvalid` |

Accepted examples: `Georgia, serif`, `"Source Han Serif SC", "Noto Serif SC", serif`,
`system-ui`, `思源宋体`, `ui-monospace, SFMono-Regular, monospace`.

Refused examples: `Arial; color:red`, `url(https://x/y.woff2)`, `Arial }`, a lone `"`
(unterminated quote), a 201-character string.

### 3.2 Font size — `validateFontScale(value)`

| Rule | Detail | On failure |
|---|---|---|
| Type | Must be a finite number (the input's `.valueAsNumber`). | `displayFontSizeInvalid` |
| Range | 50 ≤ value ≤ 200 inclusive. | `displayFontSizeInvalid` |
| Step | Integer multiple of 5. | `displayFontSizeInvalid` |

The UI input is `type="number" min="50" max="200" step="5"`; the validator re-checks because a DOM
attribute is not a contract.

### 3.3 Whole-form behaviour

`validateTypography({ fontFamily, fontScale })` returns `ValidationIssue[]`. When it returns a
non-empty array the options page **does not save anything** (neither style nor typography), shows the
issue under the corresponding field, announces it through the existing polite status region, and
leaves stored settings and open pages untouched (FR-017, FR-018).

---

## 4. Renderer runtime model

### 4.1 Record fields (added to `RenderedRecord`)

| Field | Type | Meaning |
|---|---|---|
| `baseFontFamily` | `string` | The source's computed family captured once at render, used as the final fallback. |
| `baseFontSizePx` | `number \| null` | The source's computed font size in px, or null when the platform reports nothing usable. |
| `baseLineHeight` | `string` | The source's computed line-height as reported (`normal` is preserved verbatim). |
| `baseDirection` | `string` | The source's computed direction, retained for future style needs. |

`baseColor` keeps its existing meaning. All base values are captured once; restyling never re-reads
the source, which may be hidden in "translation only" mode.

### 4.2 Order of operations in `renderUnit`

1. Journal and set identity attributes (`data-ipt`, `data-ipt-unit`, `lang`, `data-ipt-style`).
2. `#inheritTypography(source, container)` — feature 001 behaviour, unchanged.
3. **`#applyTypography(record)`** — new: capture base values, write family/scale overrides.
4. **`#applyDirection(record)`** — new: write `dir="rtl"` when the target language is RTL.
5. Place, journal the insert, hide the source when the mode is "only".
6. `#applyPresentation(record)` — concealment, then foreground. Foreground must run **after**
   typography because its large-text contrast decision reads the container's computed font size.

`setTypography(typography)` repeats steps 3, 4 and the foreground half of step 6 for every record,
with no node creation, no placement change and no request. `setTargetLang(lang)` re-runs step 4.

### 4.3 Formulas

```text
inherit:
  the container receives the source's computed font-family, font-size, line-height, etc.

typography:
  if scale === 100 and family === "":
      remove any override a previous value may have written
      (font-size, line-height, font-family); keep the inherited declarations
  else:
      if family !== "":
          value = family + (lastEntryNamesSourceFamily ? "" : ", " + baseFontFamily)
          container.style.set("font-family", value)      // journalled once per container
      else:
          container.style.remove("font-family")

      if scale !== 100 and baseFontSizePx is finite:
          container.style.set("font-size", baseFontSizePx * scale / 100 + "px")
          if baseLineHeight parses as a px length > 0:
              container.style.set("line-height", parsePx(baseLineHeight) * scale / 100 + "px")
          else if baseLineHeight === "normal":
              container.style.set("line-height", "normal")
      else if scale === 100:
          container.style.remove("font-size")
          container.style.remove("line-height")
```

**Invariant**: the renderer only ever writes to the container it owns. The source element keeps its
own typography, and the journal's whole-`style` entry makes restore exact.

### 4.4 Direction

```text
isRtlLanguage(lang): true for ar, arc, ckb, dv, fa, he, khw, ks, ku, ps, sd, ug, ur, yi, nqo
dir attribute: "rtl" when the block's target language is RTL; otherwise REMOVED
              (the block inherits the page's direction)
```

The attribute is recorded with `recordAttributeOnce(container, "dir")`, so switching language does
not grow the journal.

---

## 5. Display catalogue entry (Divider)

| Aspect | Before (feature 002) | After (feature 004) |
|---|---|---|
| Treatment description | "A horizontal rule above the translation, separating it from the source block." | "A thin dashed rule down the translation's leading edge, running the block's full height." |
| Stylesheet | `border-block-start: 1px solid currentColor; padding-block-start: 0.4em` | `border-inline-start: 1px dashed currentColor; padding-inline-start: 0.55em` |
| Icon descriptor | `{ mark: "rule" }` | `{ mark: "bar", pattern: "dashed" }` |
| Icon mark | horizontal line above the text bars | thin dashed vertical line at the leading edge |
| Behaviour | one rule above each translation | one rule beside each translation, mirrored in RTL |

Everything else about the entry (id `divider`, order 8, `nameKey`, `treatment: "divider"`,
`concealment: false`, `foregroundPolicy: "inherit"`) is unchanged. The `"rule"` mark is removed from
the icon-mark union along with the descriptor, so no dead code stays behind (principle IV); the icon
test asserts no catalogue entry references it.

---

## 6. Messages

```ts
// UI -> service worker
{ type: "typographyChanged"; typography: { fontFamily: string; fontScale: number } }

// service worker -> every tab
{ type: "setTypography"; typography: { fontFamily: string; fontScale: number } }
```

Parsing rules (`parseCommand`):

- The `typography` value must be an object with the two known fields of the right types.
- `fontFamily` may be empty (that is the "inherit" value); `fontScale` must be a finite number.
- A malformed payload throws `MessageError("invalidPayload")`; the service worker logs and replies
  `{ ok: false }` instead of relaying it (the existing pattern).
- The parser returns a fresh object, so unknown extra fields inside `typography` are dropped by
  construction.

---

## 7. State transitions

| Trigger | Stored settings | Open pages | Provider requests |
|---|---|---|---|
| Save valid typography | fields written; feedback "saved" | `setTypography` relayed; all rendered blocks restyle | 0 |
| Save invalid typography | unchanged | unchanged | 0 |
| Reset | `""` and `100` written | relayed as a normal change | 0 |
| New page / reload | read on translation start; defaults when absent | translations render with the resolved value | 0 extra |
| Toggle translation off | unchanged | journal replay removes `dir`, family, size, line-height and the rule | 0 |
| Hand-edited/invalid stored value | unchanged on disk; resolved value falls back | renders with defaults | 0 |

---

## 8. Invariants and traceability

| # | Invariant | Requirement | Proven by |
|---|---|---|---|
| I1 | A translation in Divider style has no top/bottom rule; its decoration is a hairline dashed leading-edge rule spanning the block. | FR-001, FR-002 | e2e computed-style geometry; `verify:styles` |
| I2 | Divider styling never changes the translation's family, style, weight, alignment or colour. | FR-004, FR-006 | DOM test on inline declarations |
| I3 | The rule follows the target language's direction and mirrors for RTL. | FR-001, FR-005 | DOM test for `dir`; e2e RTL layout |
| I4 | Divider preview icon and live sample show a leading-edge dashed rule. | FR-007 | unit icon test; e2e sample assertion |
| I5 | Switching styles or typography never requests translation. | FR-008, FR-019 | e2e request counter |
| I6 | Empty family + scale 100 means "inherit exactly". | FR-009, FR-012 | DOM test (no override declarations); e2e computed equality |
| I7 | Scale is per block relative to the source size. | FR-010, FR-011 | DOM test with an `h2` and a `p` |
| I8 | Line spacing scales with size; no overlap. | FR-015, FR-016 | DOM test for the px formula; e2e layout check |
| I9 | Missing glyphs fall back to the page's family. | FR-014 | DOM test on the emitted family list |
| I10 | Invalid values are refused and the previous setting stays. | FR-017, FR-018 | unit validation; e2e refusal |
| I11 | Settings persist and are shared across tabs. | FR-020 | e2e reload/new tab |
| I12 | Restore removes every new attribute and declaration. | FR-024 | DOM restore test; e2e restore |
| I13 | Only translated blocks are affected; page text is never restyled. | FR-013, FR-025 | DOM and e2e assertions on source elements |
| I14 | Every user-visible string is in the catalogue. | FR-023 | `tests/unit/i18n-audit.test.ts` |
