# Quickstart: Verifying One Translation Per Passage

Runnable validation only. What to build is in [plan.md](./plan.md) and the contracts; what to implement,
task by task, is `tasks.md`. Every scenario below states its prerequisite, its command and the outcome
that decides pass or fail.

---

## 0. Prerequisites

```bash
npm install
# Playwright's Chromium, if the default browser cache is not writable:
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium
```

Nothing else is required: no provider account, no network, no environment file. The e2e suite starts its
own HTTP stub provider and serves the fixture pages itself.

---

## 1. The deterministic proof (seconds, offline)

```bash
npm run typecheck
npm test
```

Expected:

- `tests/unit/run-slot.test.ts` passes — the decision table, the claim race (two claims in one
  synchronous step), settle-on-every-exit and same-target identity.
- `tests/unit/segmenter.test.ts` passes, including the new cases: a page already holding a
  `[data-ipt="target"]` container yields **no unit** for it, the skip count is **unchanged**, and a page
  without markers segments exactly as before.
- `tests/dom/job-repeat.test.ts` passes, and its first case is the regression that starts red: a
  second run over an already-translated page must yield **no** unit whose source text includes a rendered
  translation. Its second case proves the composition the page agent relies on: replay-then-run leaves
  exactly **two** `[data-ipt="target"]` blocks, one per paragraph, with both source paragraphs intact.
- `tests/dom/restorer.test.ts` (extended) passes, including the case that starts red today: a job
  restored while a batch is in flight must render nothing after the late reply; a replaced run's restore
  leaves an exact `domHash` with zero residue and the page's own blocks still present.

Faster loop while developing one behaviour:

```bash
npx vitest run tests/unit/run-slot.test.ts
npx vitest run tests/dom/job-repeat.test.ts
```

## 2. The wire proof in real Chromium (minutes)

```bash
npm run test:e2e -- tests/e2e/repeat-translate.spec.ts
# or, with the workspace-local browser cache:
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright test tests/e2e/repeat-translate.spec.ts
```

The spec drives the real unpacked extension in real Chromium, sends the same messages the popup sends,
and reads the stub provider's `requests` array. Expected per case:

| Case | Setup | Pass condition |
|---|---|---|
| 1. Five activations, one page | five `translatePage` messages fired without waiting | exactly one `[data-ipt="target"]` per paragraph; `stub.requests.length` equals the single-activation count; no two translations for one passage at any poll |
| 1b. The reader's own action | popup open, its translate control pressed twice in one animation frame | one translation per passage; one run's requests (this is the reported action, not only the wire) |
| 2. Same target again after completion | five, wait, then five more | still one per paragraph; still one run's requests; counts and usage unchanged from case 1 |
| 3. Turn-off after repeats | case 1, then turn translation off | zero `[data-ipt]` nodes, page structurally equal to the pre-translation capture, scroll position unchanged |
| 3b. Turn-off mid-run | slow provider, activate, turn off while in flight | zero residue after the late reply would have arrived; no translation ever appears afterwards |
| 4. Different target replaces | translate whole page, then translate a selection | the page never holds two sets; one translation per passage; turn-off restores exactly |
| 4b. Selection then whole page | translate a selection, then activate the whole page | the selection's output is removed first; one translation per passage, none left untranslated; turn-off restores exactly |
| 5. Failing provider | stub mode `serverError`, ten activations | exactly one failure reported; request count is the single-run count |
| 5b. Capped run | `sessionCapSegments` smaller than the page, ten activations | one cap notice, no passage over the cap translated, no second run |
| 5c. No provider | provider disabled, ten activations | exactly one provider report; zero requests |
| 6. Two tabs and a11y | both tabs activated repeatedly | each page one translation per passage, neither absorbed or delayed; keyboard journey and focus unchanged |
| 6a. Selection during a page run | `translateSelection` while the page run is in flight | absorbed: no second set, no extra request, page still restorable |
| 6b. Direction and zoom | RTL target (`ar`) on `docs-rtl.html`, and the same page at 200% zoom, five activations | one translation per passage, no horizontal scroll, no overlap |
| 7. Timing on a long page | `tests/fixtures/pages/article-long.html` (123 paragraphs), one activation vs five | the five-activation duration is within 5% of the single one; identical request counts |

## 3. The reader's proof, by hand

```bash
npm run build
npm run dev:provider      # prints http://127.0.0.1:8787 and serves /pages/*.html
```

Load `dist/` at `chrome://extensions` → *Developer mode* → *Load unpacked*, set the endpoint to
`http://127.0.0.1:8787/v1/chat/completions`, model `dev-model`, any credential, then:

1. Open `http://127.0.0.1:8787/pages/news-article-a.html` and press **Translate** five times as fast as
   you can. **Pass**: each paragraph ends with exactly one translation; the status line settles on the
   translated state once; the popup shows translation counts equal to a single press.
2. Press **Restore**. **Pass**: the page looks exactly as it did before step 1 — no leftover translation,
   no stray line, no shifted layout, and you are still at the same scroll position.
3. Press **Translate** once more. **Pass**: the same result as one press; nothing from step 1 reappears.
4. Repeat step 1 on `/pages/forum-thread.html` (list items and nested containers). **Pass**: no list item
   shows its translation twice, and no translation reads like a translation of a translation.
5. Stop the dev provider, then press **Translate** ten times. **Pass**: one failure message, not ten; no
   translation appears.
6. Press **Translate**, then **Restore** immediately, before the run finishes. **Pass**: the page returns
   to its original state and nothing appears afterwards.

The dev provider prefixes its output with `【本地测试】`, so a duplicate is unambiguous, and it logs each
request: the console must show one round of requests for step 1 and none for the repeat presses.

## 4. Success-criterion map

| Criterion | Where it is decided |
|---|---|
| SC-001 one translation per passage over 20 trials | §2 cases 1, 1b and 2, plus `job-repeat.test.ts` for the DOM half |
| SC-002 request count equals one activation | §2 cases 1 and 1b (stub `requests`); case 5c proves zero requests when there is nothing to send |
| SC-003 no transient duplication | §2 case 1 (100 ms poll on the per-passage count for the whole non-idle duration) |
| SC-004 no translation of a translation | `segmenter.test.ts`, `job-repeat.test.ts`, §2 case 1 (container-tag fixtures), manual step 4 |
| SC-005 exact restore after repeats | `restorer.test.ts` (`domHash`), §2 cases 3, 3b and 4b |
| SC-006 counts and usage unchanged | §2 case 2 (`jobStatus`), both measurements taken from a clean session |
| SC-007 100-passage page within 5% | §2 case 7 (`article-long.html`) |
| SC-008 one failure notice, one cap notice, one provider report | §2 cases 5, 5b and 5c |
| SC-009 selection repeats and selection-then-page | `run-slot.test.ts`; §2 cases 4, 4b and 6a |
| SC-010 two tabs independent | §2 case 6 |
| SC-011 full suite green, regression fails before the fix | `npm test`, `npm run test:e2e`, and the recorded red state of `job-repeat.test.ts` |
| SC-012 accessibility and one announcement per run | existing `tests/e2e/a11y.spec.ts`, §2 case 6 (keyboard and focus) and the manual screen-reader step in §3 |

## 5. If something fails

- **A second translation appears**: check that the claim happens before the handler's first `await` and
  that `claim()` is not called with `sameTarget: false` for a whole-page repeat. The decision table in
  [contracts/activation-lifecycle.md](./contracts/activation-lifecycle.md) §3 is normative.
- **The provider sees more requests than one run**: an absorbed activation is doing work — verify the
  absorb branch returns before settings/provider resolution.
- **Residue after turn-off**: a journal was replayed without the run being cancelled first, or a second
  journal wrote to the page. See [research.md](./research.md) R5 and R6.
- **A list item's own text stops being translated on a later pass**: the segmentation prune is missing
  or misplaced — it must run at the top of the walk, before any text is read.
- **Skip counts changed on a page without markers**: the prune is counting; it must be silent
  ([contracts/page-markup-ownership.md](./contracts/page-markup-ownership.md) §3).
