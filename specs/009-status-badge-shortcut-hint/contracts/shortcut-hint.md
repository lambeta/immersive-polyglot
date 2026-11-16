# Contract: The Shortcut Hint on the Panel's Primary Action

**Status**: Phase 1 design contract for `src/ui/popup/popup.html`, `popup.ts`, `popup.css` and the
manifest's `suggested_key`.
**Depends on**: feature 006's page-control contract (the panel's one primary action) and the commands
declared in the manifest.
**Amends**: `specs/006-popup-settings-redesign/contracts/page-control-surface.md` — §3's "accessible name
= its visible label" becomes "action label + the bound key label".
**Spec**: [spec.md](../spec.md) FR-017 – FR-027, SC-007 – SC-011, SC-014.

---

## 1. Markup

```html
<button id="translate" class="btn btn--primary btn--wide" type="button">
  <span id="translate-label">Translate this page</span>
  <kbd id="translate-key" class="btn__key" hidden></kbd>
</button>
```

- `#translate-label` is the only carrier of the action words; `#translate` is no longer written with
  `textContent` as a whole.
- `#translate-key` is a real `<kbd>`, empty and `hidden` in the markup. It is never focusable, never a
  target, and never a sibling of the button.
- One control, one focus stop, one accessible name (the label plus the key when bound).
- No new catalogue key: the key label is the browser's platform string, not translated prose
  (FR-009's sibling rule; constitution V is satisfied because no new user-visible *word* is introduced).

---

## 2. Derivation

```ts
// src/ui/popup/shortcut-hint.ts — pure, no chrome.* inside
export function shortcutFor(
  commands: readonly { name: string; shortcut?: string }[],
  name?: string, // default "toggle-translation"
): string | null;
```

Rules, in order:

1. find the entry whose `name` equals `toggle-translation` — never by index, never by description;
2. if absent, return `null`;
3. trim `shortcut`; if empty, return `null`;
4. otherwise return the string **verbatim**: no re-spelling, no glyph translation, no casing change
   (FR-020, FR-027).

The boot sequence calls `chrome.commands.getAll()` once, applies the result, and treats a rejected call
as "no binding". Nothing is cached across panel opens: the panel is short-lived and the browser is the
authority.

---

## 3. States

| Browser state | `shortcut` | `#translate-key` | Button accessible name |
|---|---|---|---|
| shipped default (manifest `Alt+A`) | `⌥A` on macOS, `Alt+A` elsewhere | visible, that string | "Translate this page ⌥A" |
| rebound to `Ctrl+Shift+Y` | `Ctrl+Shift+Y` | visible, that string | "Translate this page Ctrl+Shift+Y" |
| binding cleared / refused at install | `""` | `hidden`, empty | "Translate this page" |
| command missing from the list | — | `hidden`, empty | "Translate this page" |
| `getAll` rejects | — | `hidden`, empty | "Translate this page" |

The key label is shown in both button states ("Translate this page" and "Show original"): the same key
performs both (FR-019). It is shown whether or not the button is disabled: a disabled button means "no
provider", which is a different fact from "no shortcut".

---

## 4. Accessibility

- The accessible name is the button's contents: action label + key label (FR-023). No `aria-label` is
  written over it, and no `aria-keyshortcuts` is added — the browser's notation (`⌥A`) is not the ARIA
  grammar, and re-spelling it would violate FR-027 (R8).
- The `<kbd>` is not hidden from the accessibility tree, because hiding it would silence the key for the
  readers FR-023 is about.
- Tab order is unchanged: the settings control remains the first stop, the primary action the second.
- The key label inherits the button's `currentColor`, so its contrast is the button's existing
  white-on-accent pairing (already covered by the theme suite). Its border and tint are decorative.

---

## 5. Layout and type

- The chip is 11 px JetBrains Mono (machine-written text, per the design system), 1 px hairline border,
  a 5 px radius, and sits in the button's existing `gap`.
- The button keeps its 44 px height; the chip is vertically centred and never increases it.
- At 384 px panel width, with the longest label the catalogue can produce, the action label neither wraps
  nor clips and the chip stays legible (FR-024, SC-011).
- At 200 % zoom the chip scales with the button; no horizontal scroll (feature 006's contract).
- The chip is presentational: no shadow, no animation, no hover state of its own.

---

## 6. Interaction

- Pressing the bound combination does exactly what activating the button does in the same state
  (FR-025). The command listener is unchanged; it sends `toggleTranslation` to the active tab.
- On a page the product cannot translate, the key changes nothing and produces no check.
- The hint is not written anywhere else: the tooltip keeps its wording, the options page gains nothing
  (FR-026).

---

## 7. Invariants a reviewer checks

1. The chip names the same combination the browser's own shortcut page shows.
2. Rebind, reopen the panel: the chip changes; clear it: the chip is gone, not blank.
3. Reading the button with a screen reader names both the action and the key.
4. The button's words are still read first, and the chip never becomes the control's only label.
5. The panel still fits 384 px, and the button still measures 44 px tall.
