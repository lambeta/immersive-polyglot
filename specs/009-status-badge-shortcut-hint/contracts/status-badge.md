# Contract: The Toolbar Check

**Status**: Phase 1 design contract for the background's icon surface, revised after the owner's four
reviews of 2026-11-16: the browser's text badge could not be kept inside the icon, so the mark became a
composed icon; it is now one flat pink corner with a white tick, filling the icon's lower-right
quadrant without changing the icon's size.
**Depends on**: feature 001's messaging contract (the `jobUpdated` status), feature 007's run lifecycle,
and the checked rasters generated from `src/icons/design-checked.svg`.
**Spec**: [spec.md](../spec.md) FR-001 – FR-016, SC-001 – SC-006, SC-012 – SC-013.

---

## 1. The fact it renders

The background learns a tab's translation presence from the status the page already broadcasts:

```ts
// src/shared/messages.ts — unchanged
{ type: "jobUpdated"; status: JobStatusPayload }
```

The background must:

1. accept the message only when `sender.tab?.id` is a number (a content script sent it);
2. derive the boolean with the pure predicate in [data-model.md](../data-model.md) §1;
3. respond `{ ok: true }` immediately — the page does not wait for an icon swap;
4. never ask the page, the panel or storage for the state; the message is the whole input.

The message type, its parser and its payload are **not** changed by this feature. No new field, no new
type, no port traffic.

---

## 2. What is painted

The product composes the checked icon; the browser's text badge is not used (its size and plate belong
to the browser, which the first review showed cannot keep it small or inside the icon's corner).

| Part | Value | Source of truth |
|---|---|---|
| checked rasters | `icons/icon-{16,32,48,128}-check.png` | generated from `src/icons/design-checked.svg` by `npm run make:icons` |
| plain rasters | `icons/icon-{16,32,48,128}.png` | generated from `src/icons/design.svg` |
| fill | `#F692B7` (border and inner circle, one colour) | `BADGE_MARK.fill` in `src/background/status-badge.ts` |
| tick | `#FFFFFF` | `BADGE_MARK.tick` |
| geometry | the pink shape fills the quadrant from (8, 8) to the canvas corner, flush with the icon's right and bottom edges; the tile keeps the plain icon's 16/16 | `BADGE_MARK.widthRatio`, `tileRatio` |

The icon is written per tab, not globally: every call carries `tabId`. The global swap is used only to
clear on install or update.

Contrast is proven twice: `tests/unit/badge-contrast.test.ts` reads these colours and coordinates out
of the two masters and applies `contrastRatio`; `tests/e2e/badge-icon.spec.ts` measures the rendered
16 px and 32 px rasters in a real browser.

- patch vs icon ground ≥ 3 : 1 (measured 4.43 : 1);
- tick vs patch: white on the pink, 2.16 : 1 — recorded as the owner's accepted trade-off, not a
  threshold;
- patch vs the cream lettering it overlaps: a hue shift at 1.94 : 1, with no luminance claim.

---

## 3. State table

`on` is the predicate of [data-model.md](../data-model.md) §1.

| Status arriving | `on` | Calls |
|---|---|---|
| `idle` (restore, no run) | false | `setIcon({ tabId, path: plain })` if the tab was checked |
| `segmenting`, translated 0 | true | `setIcon({ tabId, path: checked })` |
| `translating`, any count | true | — (already checked; no write if unchanged) |
| `completed`, translated > 0 | true | — |
| `completed`, translated 0 | false | plain, if the tab was checked |
| `failed` / `cancelled`, translated 0 | false | plain, if the tab was checked |
| `failed` / `cancelled`, translated > 0 | true | — |
| tab navigates (`status: "loading"`) | false | plain for that tab, unless already known plain |
| tab closes | — | the browser drops the per-tab icon with the tab |
| extension installs or updates | false | one global `setIcon({ path: plain })` |

Every write is idempotent; the background keeps the last written value per tab and skips a write when
the value is unchanged. That cache is a write suppressor only — never a source of truth, never
persisted. A tab the worker has no memory of is still cleared on navigation, because a restarted worker
cannot know what it painted before.

Icon paths must be absolute: Chrome resolves `setIcon` paths from the service worker and rejects a bare
relative path with "Failed to fetch" (probed, R13), so the painter resolves `icons/…` through
`chrome.runtime.getURL` and passes all four sizes at once.

---

## 4. Failure handling

- A write that rejects (the tab closed between the message and the call) is swallowed and logged at
  `info` with the tab id; it must not break the message handler or respond with an error to the page.
- A message without a tab id is accepted and ignored (no write, `ok: true`), because the same broadcast
  shape reaches the panel and tests.
- A missing `chrome.action` (an old browser, a test double) leaves translation fully working: no icon
  and no thrown error. The mark is an addition, never a dependency of a run.
- The service worker restarting is not an error: the browser holds the tab's icon, the cache is empty,
  and the next status re-derives it.

---

## 5. Accessibility

- The mark is visual chrome and is not focusable, not announced and not reachable by keyboard. It is
  never the only statement of the state: the panel keeps its `role="status"` line and its failure,
  cancellation and cap lines (FR-007).
- The icon's tooltip stays `actionTitle` ("Immersive Polyglot — translate this page"); this feature
  does not change it (FR-026), so a reader who cannot see the mark still meets the same control.
- The check is a tick, not a colour change: colour is an aid, not the message (FR-009).

---

## 6. Non-goals

- No badge text, count or plate: the browser's badge surface is not used.
- No mark for progress, failure, cap or provider-missing (FR-002, Out of Scope).
- No mark on restricted pages, the extension's own pages, or documents with no content script.
- No click handling on the mark: pressing the icon opens the panel, as it always has.
- No persistence of the per-tab value across browser restarts: nothing is translated after a restart.

---

## 7. Invariants a reviewer checks

1. Two tabs, one translated: switching shows exactly one checked icon, and it is the translated tab's.
2. Restoring puts the plain icon back in the same second, from the panel and from the key.
3. A provider-less attempt (failure before any translation) leaves no check.
4. A translated page navigated to another URL shows no check.
5. The mark sits inside the icon, slightly past the quadrant, and the icon's A stays visible.
6. The check is not the only place the state is said: the panel still says it in words.
