# Quickstart Validation Guide

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-13

How to prove this feature works end to end. This is a validation guide, not an implementation guide:
it says what to run and what a pass looks like. Details live in
[data-model.md](./data-model.md) and [contracts/](./contracts/).

---

## 1. Prerequisites

- Node.js 20 LTS and npm (build and test tooling only; nothing ships as Node code)
- A Chromium-family browser, version 120 or newer
- A provider you own: endpoint, credential, model id (for manual validation; automated tests use the
  local stub)
- Once, by hand: Immersive Translate installed in a scratch browser profile, to capture the rendering
  reference corpus (section 5)

## 2. Setup

```bash
npm install
npm run build          # emits dist/ as an unpacked MV3 extension
npm test               # unit + dom suites
npm run test:e2e       # Playwright: real Chromium, unpacked extension, fixture pages, stub provider
```

Load it: open `chrome://extensions`, enable Developer mode, choose "Load unpacked", select `dist/`.

**Pass condition for setup**: a fresh profile with only this extension shows the popup with a first-run
prompt and no console errors in the service worker.

## 3. Scenario: first translation (US1, SC-001, SC-003)

1. Open the options page, add a provider (endpoint, credential, model), press "Test connection".
2. Open a foreign-language fixture page from `tests/fixtures/pages/`.
3. Trigger translation from the popup, then again from the keyboard shortcut.

**Pass**:
- Provider verification reports success and the provider becomes selectable.
- Bilingual content appears under each source paragraph, above the fold within 5 s (SC-003).
- Triggering from the popup and from the shortcut both work (FR-006).
- Toggling off returns the page to its exact original state (FR-019); toggling on again reproduces the
  same result.

## 4. Scenario: privacy (US2, FR-021..FR-025, SC-005, SC-006)

1. Translate a page containing the marker string `ZZPRIVACYZZ`.
2. Open DevTools, Network tab, filter by that string.
3. Inspect extension storage from the options page's diagnostics view.

**Pass**:
- The marker appears in requests only to the configured endpoint host (SC-005).
- The credential appears nowhere in plaintext: not in storage view, not in any request to a third party,
  not in page context (SC-006).
- "Delete all data" empties storage and the diagnostics view reflects it immediately (FR-024).

## 5. Scenario: rendering fidelity (FR-015..FR-020, SC-004, SC-011)

Capture, once:

1. In the scratch profile with Immersive Translate installed, open each of the 20 pages in
   `tests/fixtures/pages/`, translate, and record the structure described in
   [contracts/rendering-dom.md](./contracts/rendering-dom.md) section 3 into
   `tests/fixtures/captures/<page-id>/<mode>.json`.
2. Commit the corpus. It is frozen; changing it needs a recorded reason.

Compare, per release:

```bash
npm run verify:rendering
```

**Pass**: no divergence rows for placement, association, container element, or language attribute; no
horizontal scrollbar; no overlap beyond 1 px; toggle-off restores the captured DOM hash and scroll
position (SC-008 with 20 cycles).

## 6. Scenario: routing (US3)

1. Configure two providers; set one as default, one as a site rule, and one as a language-pair rule.
2. Open a page matching the site rule, then one matching only the language pair, then one matching
   neither.
3. Delete the provider referenced by the site rule and reopen that page.

**Pass**: the provider actually used matches the resolution order in
[data-model.md](./data-model.md) (override, language pair, site, default); the broken rule is reported
and evaluation falls through to the default rather than failing.

## 7. Scenario: failure modes (US4, FR-026..FR-029, SC-007, SC-010)

```bash
npm run test:e2e -- --grep failure
```

The stub provider can be told to fail on demand. Exercise: rejected credential, rate limit with
`Retry-After`, timeout, malformed body, empty strings, oversized page, restricted page
(`chrome://settings`), and cancellation mid-job.

**Pass**: each produces a distinct, actionable message naming the cause and the fix; no partial or
placeholder translation is rendered (FR-020); the page is left in its pre-translation state on failure;
cancellation completes within 2 s.

## 8. Scenario: personalization (US5, FR-030..FR-032)

1. Add a glossary entry and a style instruction; select a paragraph and use translate-selection.
2. Translate a page containing a code block and the glossary term.

**Pass**: the glossary rendering appears; the code block is untouched and still copyable; the style
instruction applies to every request in the session; the selection-only translation touches nothing else.

## 9. Scenario: accessibility and localization (principle V, FR-018)

1. Navigate the popup and options page with the keyboard only.
2. Translate a page, then use the browser's find feature for a translated phrase.
3. Run a screen-reader pass over a translated page.

**Pass**: every control is reachable and visibly focused; no user-visible string is hardcoded (all come
from `_locales`); translated text is found by the browser, is announced with the target language, and
appears in the reading order.

## 10. Release checklist

- [ ] `npm test` and `npm run test:e2e` green, no skips introduced
- [ ] `npm run verify:rendering` has no divergence (SC-011)
- [ ] One **real** provider verified end to end, not only the stub (principle III)
- [ ] Privacy scenario repeated with a fresh profile (SC-005, SC-006)
- [ ] 20 translate/restore cycles without DOM growth (SC-008)
- [ ] Every FR in [spec.md](./spec.md) has at least one passing test that names it
