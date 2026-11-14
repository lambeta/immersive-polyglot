# Quickstart: Proving Translation Display Styles Work

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-14

This guide is how a reviewer proves the feature end to end. It is a run guide, not a design
document; the contracts hold the normative detail.

---

## 1. Prerequisites

- Node.js 20 LTS or newer, and `npm install` completed at the repository root.
- A Playwright Chromium build. Where the default cache is not writable:

  ```bash
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium
  ```

- No provider credential is needed: the e2e suite and the dry walkthrough use the local stub
  provider (`tests/support/stub-provider.ts`), which is the one permitted external double.

---

## 2. Fast checks (no browser)

```bash
npm run typecheck     # strict TypeScript, must be clean
npm test              # unit + jsdom suites
```

What the suites prove for this feature:

| Suite | Proves |
|---|---|
| `tests/unit/display-styles.test.ts` | fifteen styles, fixed order, stable ids, every name key resolves, unknown id → `none` |
| `tests/unit/contrast.test.ts` | luminance/compositing math; 4.5:1 guarantee for weakened/gray on white, black, tinted and mid-gray backdrops |
| `tests/dom/style-preview.test.ts` | every style has exactly one icon, icons are pairwise distinct, every icon is labelled |
| `tests/unit/migrations.test.ts` | v1 fixture → v2 adds the defaults, is idempotent, and writes once |
| `tests/dom/renderer-style.test.ts` | `data-ipt-style` applied/switched/removed; concealment adds and removes `tabindex`; restore hash equals the pre-render hash; 20 switches do not grow the journal |

Any failure is a blocking defect: the constitution forbids greening a test by loosening it.

---

## 3. Real-browser suites

```bash
npm run build
npm run test:e2e:local
```

The e2e suite loads the unpacked extension into a real Chromium profile, uses real
`chrome.storage.local` and real fixture pages, and proves:

- the options Display panel renders all fifteen radios with icons (SC-006);
- selecting a style restyles an already-translated page with zero new provider requests (SC-002),
  and the choice survives a reload (SC-003);
- a site override wins on the matching site and only there (SC-010);
- the page control shows and changes the same selection, and both surfaces agree (FR-005);
- keyboard-only operation reveals concealed translations (SC-007);
- computed contrast of gray/weakened translations on a light and a dark fixture page (SC-008);
- 30 % text expansion in the picker does not clip labels, at 200 % zoom (SC-011).

---

## 4. Style verification script

```bash
npm run verify:styles
```

Exit codes follow `verify:rendering`: `0` all checks pass, `1` at least one divergence, `2` the
build or a fixture is missing (run `npm run build` first).

The script reports, per style:

1. A captured rendering on the same sample page, and a pairwise distinctness matrix — all 105 pairs
   must differ above the calibrated threshold (SC-001).
2. A restore comparison: after toggling translation off, the page's structural hash and scroll
   position must equal the pre-translation snapshot (SC-004).
3. A contrast table: measured foreground/backdrop ratios for every style on a light and a dark page
   (SC-008).
4. Layout metrics for all three display modes in an LTR and an RTL target: no horizontal page
   scroll, no overlap, no clipping (SC-005, SC-012).

The threshold is 0.50 % of the 64×64 signature's pixels changing by more than 12/255. It is
calibrated against this repository's own renderings: the weakest pair (border-dashed vs
border-solid) measures 1.20 %, so identical renders (exactly 0 %) and the subtlest real pair are
safely apart. The script prints the weakest pair on every run so the calibration can be rechecked.

---

## 5. Manual walkthrough (five minutes)

1. `npm run build`, then load `dist/` via `chrome://extensions` → *Developer mode* → *Load unpacked*.
2. `npm run dev:provider`, then open `http://127.0.0.1:8787/` and translate a fixture page
   (endpoint `http://127.0.0.1:8787/v1/chat/completions`, model `dev-model`, any credential).
3. With translations on the page, open the options page → **Display**.
   - Fifteen styles are listed in the reference order, each with an icon and a name.
   - Clicking a style updates the live sample immediately; saving restyles the already-translated
     page within a second and issues no new provider request (watch the provider's console).
4. Reload the tab: the style is still applied. Restart the browser: still applied.
5. Choose **Blur (study mode)**, then move the pointer away and read the page with the keyboard only:
   Tab to a translation, confirm it becomes sharp, and confirm a screen reader still reads the full
   text.
6. Add a site rule with a different style; open a page on that site and one on another site and
   confirm each uses the expected style. Delete the rule and confirm the site returns to the global
   style without re-translating.
7. On a dark-background fixture page, choose **Gray** and **Weakened** and confirm the text is still
   readable.
8. Toggle translation off: the page returns to its original state with no residual borders,
   underlines or backgrounds.

---

## 6. Success-criteria map

| Criterion | Proven by |
|---|---|
| SC-001 all 105 pairs distinct | `npm run verify:styles` matrix |
| SC-002 restyle 100 blocks < 1 s, 0 requests | e2e + `verify:styles` request count |
| SC-003 persistence | e2e reload/restart; manual step 4 |
| SC-004 exact restore per style | `tests/dom` hash assertions + `verify:styles` |
| SC-005 90 mode × direction combos | `verify:styles` layout matrix |
| SC-006 keyboard/screen-reader selection | e2e a11y spec |
| SC-007 reveal within 150 ms, text available | jsdom reveal attributes + e2e keyboard check |
| SC-008 contrast | `tests/unit/contrast` + `verify:styles` measured table |
| SC-009 20 switches, no growth | `tests/dom/renderer-style` |
| SC-010 site override | e2e site-override scenario |
| SC-011 30 % expansion at 200 % zoom | e2e long-label check |
| SC-012 reference pages: no layout regression | `verify:styles` + existing rendering corpus |
| SC-013 delete-all resets to `none` | unit settings test + manual privacy-panel check |

---

## 7. Known limits recorded, not hidden

- **Rendered-style capture re-baseline**: `scripts/verify-rendering.mjs` now honours a capture's
  `displayStyle` and compares the rendered style attribute, and
  [tests/fixtures/captures/README.md](../../tests/fixtures/captures/README.md) records the field. The
  real corpus still needs its one-time manual capture (feature 001 T010); until then
  `verify:styles` is the style-level evidence and the corpus comparison stays placement-level.
- **Only the English catalogue ships.** SC-011's 30 % expansion is exercised by the long-label e2e
  check, not by a shipped translated catalogue.
- **Forced-colors rendering is emulated** (Playwright media emulation), not observed on every
  platform's high-contrast theme; the contract's typographic fallback is what the emulation checks.
- **Contrast is measured on the first translated block**, which on the article fixtures is the
  heading; the threshold is therefore the 3:1 large-text one there, while paragraph checks elsewhere
  use 4.5:1. Both are recorded in the output.