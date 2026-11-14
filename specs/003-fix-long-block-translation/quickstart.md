# Quickstart: Proving the Long-Block Fix

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contract**: [contracts/block-rendering.md](./contracts/block-rendering.md)

This guide proves the feature end to end. It starts with the failing test that must exist before the
fix (constitution principle II), then the automated suites, then the real browser and the real page.

## Prerequisites

- Node.js 20 LTS or newer, and `npm install` completed at the repository root.
- The e2e suite needs a Playwright Chromium. Where the default browser cache is not writable:

  ```bash
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium
  ```

- No provider credential is needed: the stub provider and the dev provider are local and free.

## 1. Observe the defect first

Write the regression test in `tests/dom/block-rendering.test.ts` **before** touching source. It loads
a long abstract, runs the real job against a fake caller, and asserts one container with every
sentence in order. It uses no field or API introduced by this feature, so it runs against the
pre-fix source.

```bash
# With the source change not yet applied:
npx vitest run tests/dom/block-rendering.test.ts
# Expected: FAIL — the abstract's container holds one part, not four.
```

Record the failing output in the task notes, then apply the fix and re-run:

```bash
npx vitest run tests/dom/block-rendering.test.ts
# Expected: PASS — one container, four parts, source order.
```

## 2. Automated checks

```bash
npm run typecheck          # strict TypeScript, no errors
npm test                   # unit + DOM suites, no skips added
```

Targeted suites while working:

```bash
npx vitest run tests/unit/segmenter.test.ts tests/dom/renderer.test.ts tests/dom/block-rendering.test.ts tests/dom/restorer.test.ts
```

Expected: part positions are 0..n-1 for a split block; the renderer updates one container in place;
the block-composition suite proves order independence, duplicates, partial failure and restore.

## 3. Real browser, real storage, real HTTP

```bash
npm run test:e2e:local
```

The new `tests/e2e/long-block.spec.ts` loads two pages through the real extension:

1. `/pages/article-tests-as-data.html` — the captured front matter of the reported article.
2. `/pages/article-abstract.html` — the authored long abstract with surrounding blocks.

It asserts, in all three display modes: exactly one translation container for the abstract, every
sentence present exactly once in source order, the source hidden once in translation-only mode, and a
clean restore. It also asserts that each page's provider request count equals the count the same
fixture produced before the fix, recorded as a constant in the test.

Expected: all e2e specs pass, including the existing ones.

## 4. Check the captured page by hand

```bash
npm run build
npm run dev:provider        # http://127.0.0.1:8787
```

Load `dist/` via `chrome://extensions` → Developer mode → Load unpacked. In the options page add:

- endpoint `http://127.0.0.1:8787/v1/chat/completions`
- model `dev-model`
- credential: any non-empty string

Open `http://127.0.0.1:8787/pages/article-tests-as-data.html` and translate. Expected: one
translation block under the abstract containing every sentence, each prefixed once by
`【本地测试】`. Switch to translation-only: the complete abstract translation replaces the source.
Turn translation off: the page returns exactly to its captured state.

## 5. Check the live page once

With a real provider configured in the same unpacked build, open
`https://martinfowler.com/articles/tests-as-data.html`, translate, and check the abstract in
bilingual and translation-only modes. Record in the task notes: date, viewport, display mode, and
whether every sentence of the abstract was present. This is the one manual check on the real
deployment; the capture in section 3 remains the deterministic regression.

## 6. Performance and request count

```bash
npx vitest run tests/dom/block-rendering.test.ts -t "performance"
```

Expected: 100 four-part blocks render under 1 s in jsdom, and the number of batch requests is
unchanged from the pre-fix run (no request per part and none per re-render).

For the SC-009 before/after ratio, run the performance case once with the pre-fix source (stash the
four source files), record the time, then run it with the fix and record the ratio. The CI guard is
the absolute budget; the ratio is recorded evidence in the task notes.

## Expected outcomes

| Check | Expected | Criterion |
|---|---|---|
| Captured abstract | 1 container, 100% of sentences once, in order | SC-001 |
| Reference set of long blocks | zero dropped parts | SC-002 |
| Reversed / shuffled arrival | identical rendered text, 20 trials | SC-003 |
| Three display modes | source sentences 0 untranslated, 0 translated missing | SC-004 |
| Restore after complete / partial / cancelled | baseline fingerprint, scroll unchanged, 0 residue | SC-005 |
| Requests per page | equal to pre-fix, no part requested twice | SC-006 |
| Layout | no horizontal scroll, overlap, clipping or structure break at 100% and 200% | SC-007 |
| Assistive technology | block read as one passage in the target language; find locates every part | SC-008 |
| 100 four-part blocks | under 1 s jsdom; ratio recorded | SC-009 |
| Full suite | passes with no skips, regression test failed before the fix | SC-010 |

## Fixture rules

- `article-tests-as-data.html` is a **verbatim capture** of the reported page's front matter:
  title, subtitle, abstract, date, author, tags, contents, and the first two body paragraphs. Site
  chrome and third-party scripts are removed; the captured text is not edited. Its row in
  `tests/fixtures/README.md` records the URL, capture date and reason, as that file requires.
- `article-abstract.html` is **authored** and labelled as such: it exercises a long abstract in a
  news-like page without depending on a live site.
- Neither fixture ships in `dist/`; both are served over real HTTP by the stub provider.
