# Contract: Translation Typography Preference

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md) | **Date**: 2026-11-14

This contract is normative for FR-009 through FR-023 and FR-025. It fixes the stored shape, the
accepted input grammar, the exact rendering rules, the message payloads and the settings-page
behaviour so the renderer, the options page and the tests cannot drift from each other.

---

## 1. Stored shape

Two optional fields inside the existing `ui` object of the version-2 profile:

| Field | Type | Default when absent | Notes |
|---|---|---|---|
| `translationFontFamily` | string | `""` | Trimmed family list. `""` means "inherit the page's font". |
| `translationFontScale` | number | `100` | Integer percentage, 50–200, multiple of 5. |

- No new top-level storage key; `STORAGE_KEYS` is unchanged.
- No schema bump and no migration: absent fields resolve to the defaults, and this build writes no
  value that an older build would misread.
- The fields never contain page text.

---

## 2. Resolution

`resolveTypography(settings): TranslationTypography` is the single resolution point, used by:

- the content script when a job starts (via `JobOptions.typography`),
- the renderer for live restyling,
- the options page for the live sample,
- unit tests.

Rules:

1. If `ui.translationFontFamily` is a string that passes `validateFontFamily`, it is the resolved
   family (trimmed). Otherwise it resolves to `""`.
2. If `ui.translationFontScale` is a finite number, it is rounded to the nearest multiple of 5 and
   clamped to 50–200. Otherwise it resolves to `100`.
3. The result is always a complete value; there is no "unknown" state at render time (mirroring
   feature 002's unknown-style rule).

---

## 3. Validation grammar (normative)

### 3.1 `validateFontFamily(value): ValidationIssue | null`

1. Trim the value. Empty ⇒ valid, means "inherit".
2. Length > 200 ⇒ `displayFontInvalid`.
3. Any control character, or any of `; { } < > ! @ \` ⇒ `displayFontInvalid`.
4. The lower-cased value containing `url(` ⇒ `displayFontInvalid`.
5. Split on commas. For each entry after trimming:
   - empty entries are tolerated (including a trailing comma);
   - an entry starting with `"` or `'` must end with the same quote, contain no unescaped backslash
     and no quote or forbidden character inside;
   - otherwise it must match `^[\p{L}_-][\p{L}\p{N} _.-]*$`.
   If any non-empty entry fails, or no entry remains, ⇒ `displayFontInvalid`.
6. Otherwise valid.

The validator never rewrites the value; it either accepts it as typed (after trim) or refuses it.

### 3.2 `validateFontScale(value): ValidationIssue | null`

Finite number ⇒ `displayFontSizeInvalid` if not; integer multiple of 5 within 50–200 ⇒ otherwise
valid.

### 3.3 `validateTypography({fontFamily, fontScale})`

Returns the union of both issues. The UI saves **only** when the array is empty.

---

## 4. Rendering contract

### 4.1 When nothing is customised (`family === ""` and `scale === 100`)

The translation keeps exactly the typography feature 001 inherits from its source. No `font-family`,
`font-size` or `line-height` override is written by this feature, and the page looks as it did before
this feature existed (FR-012, SC-005).

### 4.2 Font family

When the family is set, the container receives a family list equal to the reader's stack followed by
the source's computed family, unless the stack's last entry already names that family:

```text
font-family: <reader stack>[, <source computed family>]
```

- The source family is appended as the final fallback, always, because the browser exposes no glyph
  coverage API; this is how missing glyphs stay readable (FR-014).
- The declaration applies to the translation container only (FR-013, FR-025).
- The value is written through the same journal entry that records the container's style attribute,
  so it is removed on restore.

### 4.3 Font size and line height

When `scale !== 100` and the source's computed size was captured as a finite pixel value:

```text
font-size:   <sourceSizePx × scale / 100>px
line-height: <sourceLineHeightPx × scale / 100>px      when the source line-height is a px length
line-height: normal                                   when the source line-height is "normal"
line-height: (left inherited)                         when the source line-height is not usable
```

- Scaling is per block against that block's own source size, so an `h2` translation stays larger than
  a `p` translation at every scale (FR-011).
- When `scale === 100`, any previously written `font-size`/`line-height` override is removed, and the
  inherited values are authoritative again.
- The renderer never changes the source element's declarations.

### 4.4 Ordering inside the renderer

Typography is applied **after** inheritance and **before** the foreground decision, because the
foreground contrast rule classifies large text from the container's computed font size. A typography
change therefore re-applies the foreground colour as well as the type.

### 4.5 Live update

`setTypography(typography)` updates every rendered block in place: no node creation or removal, no
re-segmentation, no request to the provider. The 1-second budget in SC-004 applies to a page with at
least 120 blocks.

---

## 5. Message protocol

### 5.1 UI → service worker

```ts
{ type: "typographyChanged", typography: { fontFamily: string, fontScale: number } }
```

### 5.2 Service worker → every tab

```ts
{ type: "setTypography", typography: { fontFamily: string, fontScale: number } }
```

- Both are commands parsed by `parseCommand`.
- A payload whose `typography` is missing, not an object, carries a non-string `fontFamily` or a
  non-finite `fontScale` is invalid: the sender receives `{ ok: false }` and no relay happens.
- The content script clears its cached settings and forwards the value to the running job; a tab with
  no content script simply ignores the runtime message, exactly as `styleChanged` already does.
- The next translation on any tab resolves the value from storage, so a tab that missed the relay
  self-heals.

---

## 6. Options page contract (Display panel)

| Element | Behaviour |
|---|---|
| Font-family text input | Labelled "Translation font". Prefilled with the stored value. Placeholder shows an example stack. Hint text explains that an empty value keeps the page's font. |
| Font-size number input | Labelled "Translation text size". `min=50 max=200 step=5`. Displays the stored percentage. |
| Live sample | Updates on every input event, before saving, with the currently selected display style, the entered family and the entered size. Leaving without saving changes nothing stored and nothing on open pages. |
| Save button | Validates both fields; on success writes both plus the selected style, notifies every tab, and shows the saved feedback. On failure writes nothing, shows the specific error under the field and in the polite status region. |
| Reset button | Restores `""` and `100`, saves, and notifies, in one action. |

Accessibility and localisation:

- every label and every message comes from `src/_locales/en/messages.json`;
- inputs are reachable and operable by keyboard, in source order, with visible focus;
- the error text is associated with its input and lives in a region that assistive technology
  announces;
- at 200 % zoom the panel wraps and nothing is clipped;
- the sample is decorative prose with an accessible context from the fieldset legend, not the only
  carrier of meaning.

---

## 7. Restore and idempotence

- Toggling translation off removes the container (with its `dir` attribute) and replays the recorded
  `style` attribute, so the page is byte-identical to its pre-translation state (FR-024, SC-009).
- Repeated `setTypography` calls do not grow the journal: the container's style attribute and its
  `dir` attribute are journalled once each.
- Re-applying the same typography is a no-op: no writes, no layout change, no foreground recompute
  beyond the idempotent path.

---

## 8. Required tests

| Obligation | Test |
|---|---|
| Grammar accepts the documented examples and refuses the documented counter-examples | `tests/unit/validation.test.ts` |
| Defaults, tolerance and persistence without a version bump | `tests/unit/settings.test.ts` |
| Family fallback, per-block scale, line-height scaling, 100 % no-op, RTL `dir` | `tests/dom/renderer-typography.test.ts` |
| Live restyle, 0 extra provider requests, persistence, invalid input, reset, sample | `tests/e2e/typography.spec.ts` |
| Strings exist and are used | `tests/unit/i18n-audit.test.ts` |
