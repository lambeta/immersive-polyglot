# Phase 1 Data Model: The Page's Translation Presence and the Key That Toggles It

**Feature**: `009-status-badge-shortcut-hint` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

This feature adds no durable data: no storage key, no migration, no schema version. The entities below
are either derived from state the product already carries or are constants that describe a rendered
mark. They are recorded because the behaviour has to be decided once and tested once, not because
anything is persisted.

---

## 1. Tab translation presence

**What it is**: whether translation is on for the page in a given tab. It is the one fact the badge
renders.

| Field | Type | Source | Notes |
|---|---|---|---|
| `tabId` | number | `sender.tab.id` on the page's `jobUpdated` message | the tab the page lives in; nothing is derived without it |
| `state` | `"idle" \| "segmenting" \| "translating" \| "completed" \| "cancelled" \| "failed"` | `JobStatusPayload.state` | the page agent's own state, unchanged |
| `translated` | number | `JobStatusPayload.counts.translated` | passages the run has put on the page |
| `on` | boolean | derived, see §2 | what the badge shows |

**Derivation** (pure, total over the payload):

```text
on = state !== "idle" && (translated > 0 || state === "segmenting" || state === "translating")
```

**Why the non-obvious clauses exist**:

- `state === "segmenting"` / `"translating"` with `translated === 0` is the moment the owner asked to
  see confirmed: the run has engaged and the first translation has not arrived yet (FR-001, FR-003).
- `completed` with `translated === 0` is a page with no translatable passage: nothing is on the page, so
  no claim is made (FR-002).
- `failed` / `cancelled` with `translated > 0` keeps the check: the run left translations on the page
  (FR-006). The failure itself is a word in the panel, not a different icon.
- `idle` is what `restore()` broadcasts, with zeroed counts; it turns the check off in the same tick as
  the page is restored (FR-008).

**Lifecycle and ownership**

| Event | Who produces the fact | What the background does |
|---|---|---|
| the reader presses translate / the accelerator fires | the page agent emits `segmenting` | paints the check for `sender.tab.id` |
| each batch starts or lands | the page agent emits `translating` / counts | re-derives; writes only if the value changed |
| the run completes | the page agent emits `completed` | keeps the check when `translated > 0`, clears otherwise |
| the reader restores (button or key) | the page agent emits `idle` | clears the check |
| the tab navigates | the browser | clears its own badge (R3); no product code runs |
| the tab closes | the browser | the badge goes with the tab |
| the service worker restarts | — | the browser keeps the painted badge; the next broadcast re-applies the derived value |

**Refused / boundary inputs** (the background must not invent a state):

- a `jobUpdated` message with no `sender.tab` (panel, options page, a test page): ignored;
- a message for a tab that no longer exists: the write is rejected by the browser and swallowed;
- a page the product cannot translate: no content script, so no message and no badge;
- a zero-passage page: `completed` with `translated === 0`, so no badge (the transient
  `segmenting` broadcast is the same tick as `completed`, and the two writes settle in order).

---

## 2. The check mark

**What it is**: a checked variant of the icon, composed from a second vector master
(`src/icons/design-checked.svg`) and shipped as four rasters. The browser's text badge is not used: its
size and plate belong to the browser, and the owner's first review showed it could not be kept inside
the icon's corner.

| Field | Value | Proven by |
|---|---|---|
| `fill` | `#F692B7` — the border and the inner circle are this one colour | FR-010; raster pixels in `tests/e2e/badge-icon.spec.ts`; ratio in a unit test |
| `tick` | `#FFFFFF` | FR-011; present on the rendered rasters in a unit test and in `badge-icon.spec.ts` |
| fill vs icon ground | 4.43 : 1 | FR-010 threshold 3 : 1 |
| tick vs fill | 2.16 : 1 | FR-011: recorded, not a threshold — the owner's choice |
| fill vs cream lettering `#F9F2E0` | 1.94 : 1 | FR-012: a hue shift, no luminance claim |
| `widthRatio` | 8 / 16 (0.5) | FR-013: the corner mark, half the canvas |
| `tileRatio` | 1 — the tile keeps the plain icon's size | FR-013: the icon never shrinks |
| geometry | the pink shape fills the quadrant from (8, 8) to the canvas corner, flush with the right and bottom edges, inner corner rounded | FR-013 |

**Invariants**

1. The mark is a tick of two strokes, not a dot, count, letter or word; it carries no locale string.
2. The mark is one flat colour: nothing draws a second ring in another colour.
3. The mark fills the lower-right quadrant, flush with the tile's right and bottom edges; the tile keeps
   the plain icon's size, so the icon never shrinks and the mark never overhangs the canvas.
4. The icon's A⇄文 mark stays visible above and to the left of the corner.
5. The mark is visual only: it is never the sole carrier of the state, because the panel's status line
   and failure lines keep saying it in words.
5. The plain rasters keep their artwork and sizes; the checked set is an addition, generated from the
   same master.

---

## 3. The command binding

**What it is**: the keyboard combination the browser has actually bound to the translate/restore command.

| Field | Type | Source | Notes |
|---|---|---|---|
| `name` | string | `chrome.commands.getAll()` | only `toggle-translation` is read; Chrome's `_execute_action` is ignored |
| `shortcut` | string | the same entry | Chrome's own notation: `⌥A` on macOS, `Alt+A` on Windows/Linux; empty when nothing is bound |
| `label` | string or absent | derived: `shortcut.trim()`, or absent when empty | what the panel renders |

**States**

| Browser state | `shortcut` | Panel |
|---|---|---|
| shipped default | `⌥A` / `Alt+A` | key label shows that string |
| rebound by the reader | the new combination | next panel open shows the new string |
| cleared by the reader, or refused at install | `""` | no key label; no placeholder, no stale key |
| the command is missing from the list | — | no key label (defensive; it cannot happen while the manifest declares it) |
| the API call fails | — | no key label; the button still translates |

**Ownership**: the browser stores the binding and owns rebinding. The product only reads it, once per
panel open, and never writes it. Nothing about it is persisted by the product.

---

## 4. The panel's primary control

**What it is**: the single filled action in the panel, which this feature extends with a key label.

| Field | Type | Source | Notes |
|---|---|---|---|
| action label | catalogue string | `popupTranslate` or `popupRestore` | unchanged words; rendered in `#translate-label` |
| key label | platform string or absent | §3 | rendered in `#translate-key`, a `<kbd>` inside the button |
| enabled | boolean | an enabled provider exists, or a run is active | unchanged from feature 006 |
| accessible name | action label + key label | name from contents | FR-023; no `aria-keyshortcuts` re-spelling (R8) |

**Invariants**

1. The button remains one control with one focus stop; the key label is not focusable and not a target.
2. The action label is never replaced by the key label, and the key label is hidden — not blanked —
   when there is no binding, so no empty chip remains in the layout.
3. The control's height (44 px) and the panel's 384 px width do not change; the chip fits inside the
   button's existing padding at 200 % zoom and with labels 30 % longer.

---

## 5. Nothing is stored

- No new `chrome.storage` area, key or schema version.
- No per-tab state beyond the background's in-memory last-written value (a write-suppression cache, R11).
- No history of which pages were translated, and no record of the shortcut.
- The badge is browser chrome state; the binding is the browser's; the page's presence dies with the
  document.

A future feature that needs "this page was translated" across reloads would have to add storage
deliberately; this one does not, and the empty model above is the proof.

---

## 6. Requirement traceability

| Requirement | Where it lives in this model |
|---|---|
| FR-001 – FR-003 (on while running, timing) | §1 derivation and lifecycle |
| FR-002 (absent cases) | §1 refused/boundary inputs |
| FR-004 (per tab) | §1 `tabId`; the browser scopes the badge per tab |
| FR-005 (no panel needed) | §1: the fact arrives by message, not by opening the panel |
| FR-006 (partial failure keeps it) | §1 `failed/cancelled + translated > 0` |
| FR-007 (adds to words) | §2 invariant 4 |
| FR-008 (shortcut restores) | §1 lifecycle; the same `idle` broadcast |
| FR-009 – FR-016 (look) | §2 table and invariants |
| FR-017 – FR-027 (shortcut and hint) | §3 states, §4 fields and invariants |
