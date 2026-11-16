# Quickstart: Seeing the Mark and Proving the Demand

A validation guide, not an implementation guide. Shapes live in [data-model.md](./data-model.md); the
rules each scenario exercises live in [contracts/](./contracts/).

---

## 1. Prerequisites

```bash
npm install
npm run build                     # dist/, loadable unpacked
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium
npm run dev:provider              # http://127.0.0.1:8787 — the stub provider and its fixture pages
```

Load `dist/` through `chrome://extensions` → *Developer mode* → *Load unpacked*, then point the
extension at `http://127.0.0.1:8787/v1/chat/completions`, model `dev-model`, any credential. Stub
translations are prefixed `【本地测试】` so they are never mistaken for real output.

The stub provider logs every request it receives; **that log is the evidence** for the demand claims,
not the page's appearance.

---

## 2. Scenario: the mark appears, then becomes the translation

1. Open a short fixture page, press **Translate this page** in the panel.
2. Expect: each passage on screen immediately shows a small rotating mark in the place its translation
   will occupy — below the paragraph in the default mode, above it when translations are set above.
3. As each translation arrives the mark is gone and the translation is in its place. No passage ever
   shows both, and no passage shows a mark twice.

Proves FR-001..FR-003. The automated form is T5/T6 in [plan.md](./plan.md#tests-this-feature-owes).

**Not provable this way**: that the node was reused rather than replaced. That is asserted in the DOM
test (same element identity before and after), because a screenshot cannot see it.

---

## 3. Scenario: only what you are about to read is sent

1. Open `/fixtures/article-endless` (200+ deterministic passages, one screenful visible).
2. Press translate; wait for the visible passages to fill.
3. Read the stub's request log: it MUST contain only passages inside the visible area plus one screenful
   below it. Nothing further down may appear — and no mark may appear there either.
4. Scroll down one screenful; expect a new round of requests for the passages that just entered the
   window, each requested exactly once, and marks for them.
5. Read the first five screenfuls and turn translation off. The characters sent MUST be at most 30 % of
   what the same page sends when translated whole (SC-004), and zero characters may belong to passages
   you never brought into view.

Proves FR-010..FR-013, SC-002, SC-004, SC-005. Automated: T1, T2, T12, T13.

**Reading the log**: one request carries several passages (batching is unchanged). What matters is the
set of passages across all requests, not the number of requests.

---

## 4. Scenario: turning translation off leaves nothing behind

1. Start translation on the long fixture and wait until several marks and translations are on screen.
2. Press **Show original** while marks are still showing.
3. Expect: the page is exactly as captured before translation — no translation, no mark, no added
   styling — and your scroll position is unchanged.

Proves FR-023, SC-007. Automated: T7 (DOM hash + scroll comparison). A screenshot is not sufficient
here either; the DOM hash is the verdict.

---

## 5. Scenario: the page does not run away from you

1. On the long fixture, scroll to a paragraph in the middle and stop.
2. Wait while the passages above it fill in, one after another.
3. Expect: the paragraph you are looking at stays where it is on screen (within a few pixels).

Proves FR-027, SC-008. Automated: T14, including a page that sets `overflow-anchor: none`, which is
where relying on the browser alone would fail.

---

## 6. Scenario: reduced motion, background tab, caps

| Step | Expect | Proves |
|---|---|---|
| Enable "reduce motion" in the operating system, then translate | Marks do not rotate; they remain visible | FR-029, SC-010 |
| Translate, switch to another tab, and stay away | No new passages are requested meanwhile; returning requests what you then see | FR-016 |
| Set a session cap of 5 passages and translate a long page | At most 5 passages are sent; the cap notice appears once; no mark survives on a refused passage | FR-019, FR-021, SC-006 |

---

## 7. Automated gates

```bash
npm run typecheck                 # strict TypeScript, no emit
npm test                          # unit + DOM suites
npm run test:e2e:local            # real Chromium + stub provider
npm run verify:rendering -- --include-example   # placement/restore machinery (corpus still absent)
```

Pass criteria for this feature:

- the full suite is green with **no test skipped or weakened**; tests whose expectations this feature
  changes are enumerated in [plan.md](./plan.md#tests-this-feature-owes) (T11, T12) and rewritten, not
  deleted;
- the new e2e tests assert the *request log*, not only the page's look;
- the i18n audit stays green with an unchanged locale catalog (no new string, FR-034);
- a 300-passage page scrolled for 30 seconds during translation shows no scroll response delayed by more
  than 50 ms (SC-012).

---

## 8. Common ways to fool yourself

| Tempting conclusion | Why it is wrong |
|---|---|
| "It works — a translation appeared." | A translation appearing does not prove a mark preceded it. Sample the page during the run; the DOM test does. |
| "Requests are few, so cost is low." | Count *passages*, not requests. One request carrying 40 passages is a whole-page send. |
| "No layout shift in the screenshot." | Shifts happen between frames. Measure the parked passage's rectangle, as T14 does. |
| "jsdom says the mark is placed correctly." | jsdom has no layout. Only Chromium can prove placement and SC-008. |
| "The restore looked right." | Compare the DOM hash with the pre-translation capture. |
