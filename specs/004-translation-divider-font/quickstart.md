# Quickstart: Divider Style Fix and Custom Translation Typography

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [divider-presentation.md](./contracts/divider-presentation.md), [typography-settings.md](./contracts/typography-settings.md)

This is the runnable validation guide. It proves the feature end to end; it does not repeat the
contracts and it contains no implementation code.

---

## Prerequisites

- Node.js 20 LTS or newer, pnpm/npm as recorded in the repository.
- Dependencies installed: `npm install`.
- For end-to-end runs, a Playwright Chromium build. In an environment where the default browser
  cache is not writable:

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium
```

Optional, for manual checking: the local dev provider (`npm run dev:provider`) serves the fixture
pages at `http://127.0.0.1:8787/` and prefixes translations with `【本地测试】`.

---

## One-command verification

```bash
npm run build && npm run typecheck && npm test
npm run test:e2e:local        # real Chromium, real extension, real storage, real HTTP stub
npm run verify:styles         # fifteen styles: distinctness, restore, contrast, layout, restyle time
```

Expected: all three commands exit 0. `verify:styles` prints its weakest pair; the Divider/Quote pair
must stay above the 0.5 % pixel-difference threshold (see research R9).

---

## Scenario 1 — Divider is a short dashed line above the translation

1. Build and load `dist/` as an unpacked extension (or open the dev provider page).
2. Translate a long article with the local provider.
3. Open the extension's options page → **Display**, select **Divider**, save.
4. Inspect the translated blocks.

**Expected**: each translation is introduced by a short dashed horizontal line of about fifteen
segments (around 88 px) sitting just above it; the line starts at the block's inline-start; nothing
spans the column, runs down an edge, or appears below the translation; the text is not italic and is
not indented.

**Fails if**: the line spans the whole column, runs vertically along an edge, or shrinks to one or two
dashes.

---

## Scenario 2 — Divider follows the mode and the text direction

1. With Divider selected, switch the display mode in the popup to "translation above" and then to
   "translation only"; do not re-translate.
2. Open `tests/fixtures/pages/docs-rtl.html` (or any Arabic/Hebrew target setup) and translate.

**Expected**: the short line stays directly above the translation in all three modes; on the RTL page
the text reads right-to-left and the line moves to the inline-start (the right edge). No provider
request is issued when only the mode or style changes.

---

## Scenario 3 — Custom font family and size, previewed before saving

1. Options → **Display**. Leave the style on Divider.
2. In **Translation font**, type `"Source Han Serif SC", "Noto Serif SC", serif` (or any installed
   face). In **Translation text size**, type `125`.
3. Before saving, watch the live sample.

**Expected**: the sample updates immediately to show the entered family at 125 %, with the Divider
line. Saving applies the same family and a 25 % larger size to every translated block on open pages
within a second, headings stay larger than body text, and no new translation request is made.

---

## Scenario 4 — Persistence and reset

1. Save family and size, then reload the page, restart the browser, and open a new tab with another
   article.

**Expected**: all three show the saved typography.

2. Return to Options → **Display** and press **Reset**.

**Expected**: the sample and every open page return to the page's own font at 100 % immediately,
without a reload or a new translation.

---

## Scenario 5 — Refused inputs keep the previous setting

1. With a valid family and size saved, try each of these in the font field, one at a time, and save:
   `Arial; color:red`, `url(https://x/y.woff2)`, `Arial }`, and a 201-character value.
2. Try size `0`, `999`, `101` and an empty field, and save.

**Expected**: every attempt shows a specific message, the fields keep (or re-show) the previously
saved values, open pages do not change, and storage still holds the previous values.

---

## Scenario 6 — Restore is exact

1. Translate a page with Divider and a custom typography active.
2. Turn translation off.

**Expected**: no translation blocks, no `dir` attributes, no leftover inline `font-family` /
`font-size` / `line-height` on page nodes, and the page's own text looks exactly as before
translation. For a machine check, the restore assertion in the DOM suite reports zero residue and an
unchanged DOM hash.

---

## Mapping to success criteria

| Criterion | Verified by |
|---|---|
| SC-001, SC-002, SC-003 (geometry, RTL, distinctness) | Scenario 1–2; `tests/e2e/display-styles.spec.ts`; `npm run verify:styles` |
| SC-004 (live typography update ≤ 1 s, 0 requests) | Scenario 3; `tests/e2e/typography.spec.ts` |
| SC-005 (defaults unchanged) | Scenario 4 reset; `tests/dom/renderer-typography.test.ts` |
| SC-006 (200 % scale, no overlap/overflow) | `tests/e2e/typography.spec.ts` layout assertions; `verify:styles` layout matrix |
| SC-007 (refusals) | Scenario 5; `tests/unit/validation.test.ts` |
| SC-008 (persistence) | Scenario 4; `tests/e2e/typography.spec.ts` |
| SC-009 (exact restore) | Scenario 6; DOM restore test; `verify:styles` restore pass |
| SC-010 (200 % zoom, keyboard) | Scenario 3 keyboard pass; e2e accessibility assertions |
| SC-011 (font fallback) | Scenario 3 with a Latin-only family and a Chinese target; DOM fallback assertion |

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Line spans the whole column | A container border was reintroduced; only the short `::before` line may draw Divider. |
| Line runs down one side | A leading-edge border was reintroduced; Divider is a horizontal line above the block. |
| Line looks like Quote | The dashed line became a solid vertical bar, or the translation became italic. |
| Typography applies to the source text | The declaration was written to the wrong node; only `[data-ipt="target"]` may receive it. |
| Size change flattens headings | The scale was applied as a percentage of the parent instead of against the captured source pixel size. |
| Sample and page disagree | The sample bypassed the shared resolver or did not receive the entered values. |
| Journal grows on repeated changes | `recordStyle` / `recordAttributeOnce` were bypassed. |
