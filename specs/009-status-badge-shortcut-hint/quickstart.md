# Quickstart: Seeing the Check and the Key

**Feature**: `009-status-badge-shortcut-hint` | **Date**: 2026-11-16

Five scenarios: two automated, three that need a real toolbar, a real keyboard or a real screen reader.
Each names the requirement it settles and what a pass looks like. Design detail lives in
[contracts/status-badge.md](./contracts/status-badge.md) and
[contracts/shortcut-hint.md](./contracts/shortcut-hint.md); this file is how to see the result.

---

## Prerequisites

```bash
npm install
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium   # once
npm run build        # dist/, the unpacked extension
```

For anything involving the toolbar, load `dist/` through `chrome://extensions` → Developer mode → Load
unpacked, and **pin** the icon (puzzle-piece menu → pin), because an unpinned icon shows only in that
menu.

For a translation without an API key:

```bash
npm run dev:provider   # http://127.0.0.1:8787 — translations are prefixed 【本地测试】
```

Configure one provider pointing at `http://127.0.0.1:8787/v1/chat/completions`, model `dev-model`, and
any credential; open `http://127.0.0.1:8787/` for the fixture pages.

---

## 1. The automated gates (SC-003 – SC-007, SC-010 – SC-012)

```bash
npm run typecheck
npm test                       # unit + DOM
npm run test:e2e               # builds, then real Chromium against the stub
```

Expected, and each is a test rather than a claim:

| Suite | What it pins |
|---|---|
| `tests/unit/status-badge.test.ts` | the on/off predicate over every state and count combination; a write per transition; no write when nothing changed; a rejected write does not escape |
| `tests/unit/badge-contrast.test.ts` | plate ≥ 3 : 1 on the icon's ground, tick ≥ 4.5 : 1 on the plate, both read from the shipped constants and the icon's own `design.svg` |
| `tests/unit/shortcut-hint.test.ts` | default / rebound / unbound / missing / API-failure lists; verbatim strings |
| `tests/dom/shortcut-hint-render.test.ts` | the label span, the hidden chip, the accessible name, the single focus stop |
| `tests/e2e/status-badge.spec.ts` | the real `setIcon` calls per tab: untouched, during the run, translated, restored, failed with nothing rendered, second tab, navigation, zero-passage page, partial failure |
| `tests/e2e/badge-icon.spec.ts` | the shipped 16 px and 32 px checked rasters, decoded in Chromium: every changed pixel inside the lower-right corner, none on the border, the mark between half and three fifths of the icon's width and crossing both centre lines, the exact pink and dark ink present |
| `tests/e2e/shortcut-hint.spec.ts` | the rendered label equals the **live** `chrome.commands.getAll()` result; both button states; accessible name; 384 px and the 44 px control |
| Adjusted | `panel-control.spec.ts` and `smoke.spec.ts` read `#translate-label` instead of the button's whole text (R12) — no assertion weakened |

---

## 2. The check: measured pixels, and one glance (SC-001, SC-002, SC-003, SC-013)

The mark is composed by the product, so the pixels are evidence that can be read rather than a toolbar
that has to be photographed:

- **Measured automatically.** `tests/e2e/badge-icon.spec.ts` decodes the shipped 16 px and 32 px
  rasters in a real browser and asserts where the mark is and what colour it is. `tests/e2e/status-badge.spec.ts`
  asserts the real `setIcon` calls per tab. There is no screencapture step and no Pillow script any
  more; the numbers that used to be measured by hand are now a failing test if they move.
- **By eye, once.** Load `dist/`, pin the icon, translate a fixture page:
  1. within a second a flat pink patch with a white tick fills the icon's lower-right corner, and the
     icon itself stays the same size; the A is still visible at the upper left;
  2. restore the page: the plain icon returns within a second;
  3. open an untranslated second tab: its icon is plain;
  4. navigate the translated tab: the icon is plain again.
- **The colours, if you want them without running anything** (R13): one flat `#F692B7` disc (4.43:1 on
  the icon's ground) with a `#FFFFFF` tick. White on this pink is 2.16:1 — below the product's usual
  4.5:1 — and the owner chose it knowingly; the requirement records the trade-off.

## 3. The key, and the panel's label (SC-007 – SC-009, SC-014)

1. Open the panel on a fixture page. The primary action reads "Translate this page" and, beside it, the
   combination the browser reports — `⌥A` on macOS, `Alt+A` on Windows/Linux.
2. Compare it with `chrome://extensions/shortcuts`: the same combination is listed against "Translate or
   restore the current page".
3. Rebind it there (for example `Ctrl+Shift+Y`), reopen the panel: the label names the new combination,
   with no reinstall and no restart.
4. Clear the binding there, reopen the panel: no label at all — not an empty chip, not the old key.
5. Restore the default, close the panel, focus the page and press the combination: the page translates,
   and the check appears (SC-009, FR-025). Press it again: the page restores and the check goes.
6. On a page the product cannot translate (`chrome://extensions`, the Web Store), press it: nothing
   happens and no check appears.
7. Surface audit: the panel is the only place the key is shown. The icon's tooltip is unchanged, and the
   settings page has no key text (SC-014).

---

## 4. The refusals (SC-004)

Each is a page or a profile state, observed the same way:

| State | Expected |
|---|---|
| no provider configured, press translate | the panel reports the failure in words; **no** check appears |
| a provider that rejects the credential (`authRejected` mode of the stub) | same: failure words, no check |
| a page with no translatable passage | the run completes with nothing; no check |
| a translated page, browser navigated to another URL | no check (the browser cleared it) |
| the icon unpinned, opened from the extension menu | the same check is on the menu entry; the panel still states the condition in words |
| light and dark browser themes | the plate looks the same, because it sits on the icon and not on the toolbar |

---

## 5. Screen reader and keyboard (SC-010, SC-011)

1. With VoiceOver (⌘F5) on the panel, focus the primary action: the announcement names the action **and**
   the key, e.g. "Translate this page, ⌥A".
2. Tab order: settings first, primary action second — unchanged from feature 006.
3. Zoom the panel to 200 %: the action label does not wrap or clip, the chip stays legible, and there is
   no sideways scroll.
4. With the panel open, press the key (step 3.5 above): the state change is announced by the panel's
   existing `role="status"` line, not only by the check.

---

## Requirement coverage

| Requirement group | Scenario |
|---|---|
| FR-001 – FR-008 (state and lifecycle) | §1 `status-badge` suites, §2 steps 1–3, §4 |
| FR-009 – FR-016 (appearance) | §1 `badge-contrast`, §2 steps 4–6 |
| FR-017 – FR-027 (shortcut and hint) | §1 `shortcut-hint` suites, §3, §5 |
| SC-001, SC-002, SC-013 | §2 |
| SC-003, SC-007, SC-008, SC-010, SC-011 | §1 (arithmetic, live API, accessibility name, layout) and §3/§5 |
| SC-004, SC-005, SC-006, SC-012 | §1 e2e suites |
| SC-009, SC-014 | §3 |