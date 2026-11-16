# Quickstart: Seeing and Proving the Spend Figures

Feature 008. Three ways to see the numbers — automated, local without a key, and against the real
provider — plus the checks that make each success criterion decidable.

## Prerequisites

```bash
npm install
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium
```

Everything below runs offline except the last section, which spends a few tokens on purpose.

## 1. The arithmetic, without a browser

```bash
npm test -- pricing
```

Expected, from the catalogue's own numbers ([pricing contract §6](./contracts/pricing-and-tiers.md)):
`deepseek-flash`, CNY, off-peak, usage `hit 4000 / miss 1000 / out 500` → `0.00308` displayed as
`≈ ¥0.0031`; the same usage at peak → `0.00616` displayed as `≈ ¥0.0062`.

What else this suite pins:

| Check | Expected |
|---|---|
| 2026-03-10 08:59:59 Beijing | off-peak |
| 2026-03-10 09:00:00 Beijing | peak |
| 2026-03-10 11:59:59 / 12:00:00 | peak / off-peak |
| 2026-10-01 10:00 (listed holiday) | off-peak |
| 2026-03-10 10:00 (ordinary weekday) | peak |
| 2027-03-10 10:00 (no holiday data) | peak |
| 2027-03-10 02:00 (no holiday data) | off-peak |
| Target `zh` / `en` | CNY list / USD list |
| Usage without a cache split | every input token at the miss rate |
| Usage with only a total | unpriced, reason `usageIncomplete` |
| Six sub-cent amounts | two significant digits each, none `0` |
| Identical usage either side of 09:00 Beijing | exactly 2×, the published off-peak/peak relation (SC-006) |
| Injected snapshot `{ ...PRICE_SNAPSHOT, snapshot: "2025-01" }` | the amount is unchanged and the basis reads `2025-01` (FR-025) |

## 2. End to end, in real Chromium

```bash
npm run test:e2e -- spend
```

The stub provider answers with DeepSeek's response shape (`usage` with cache hit/miss counters) and
records what it was asked. The suite asserts that the panel's token total equals the sum of the
reported totals, that the price equals the hand-computed figure, that reopening the panel changes
nothing, and that turning translation off clears the row.

Two states to look for in the same run:

- **priced**: one row `5,500 tokens spent · ≈ ¥0.0031 DeepSeek · 2026-11`;
- **unpriced**: when the stub is switched to omit `usage`, no token row and no price row at all.

Live update (SC-008) is sampled by the suite rather than eyeballed: the panel page stays open while
the tab translates, `#usage` is polled every 100 ms, and for each of 20 translation nodes the offset
between its appearance and the row's first change must be ≤ 1 s, with no recorded value decreasing.

Cancel is a separate expectation from turn-off: cancelling a run mid-flight keeps the figures of the
translations already on the page, and only turning translation off clears the row ([R11](./research.md)).

## 3. By hand, without a key

```bash
npm run dev:provider
```

Point the extension at `http://127.0.0.1:8787/v1/chat/completions`, model `dev-model`, any credential,
and open `http://127.0.0.1:8787/`. The local provider now reports DeepSeek-shaped usage, so the panel
shows the token total. Because its host is not DeepSeek's, the price is not shown and the muted line
reads "No published price for this provider." — which is exactly the `noPriceList` state, and the
easiest way to see that the product refuses to invent a rate.

## 4. Against the real provider (one small real translation)

```bash
printf 'DEEPSEEK_API_KEY=sk-...' > .env.local
npm run verify:real-provider
```

The harness prints the translation, then the token figures and the price line with its basis. Compare
the token count with the platform's usage page after a minute; compare the amount with the catalogue's
arithmetic for the tier your request fell in. It never prints the key and never sends page text beyond
the one segment it translates.

## 5. The screen checks a reviewer actually walks

1. **Layout** — open the panel with a translated page: the row and its basis fit; the panel needs no
   vertical scroll; at 200 % zoom and with the long-label fixture (`npm run test:e2e -- long-labels`)
   nothing clips or overlaps; no sideways scrollbar at 384 px.
2. **No announcement storm** — turn a screen reader on, translate a long page, and confirm the record
   stays silent while the status line speaks; focusing the row reads the token count, the amount and
   the basis.
3. **Two tabs** — translate two tabs against different providers: each panel shows its own figures, and
   the unpriced tab shows tokens with the note while the priced one shows an amount.
4. **Restore** — press turn-off: the row disappears with the record; press translate again: it starts
   from zero, and no figure from the previous run survives.
5. **Stale snapshot** — run `npm test -- pricing`: the injected 2025 snapshot case shows the amount is
   unchanged and the basis reads the older date (FR-025). For the on-screen version, change
   `PRICE_SNAPSHOT.snapshot` to `2025-01` locally, rebuild, and confirm the same.
6. **Cancel versus turn-off** — cancel a run whose translations are already on the page: the row stays
   with the figures reached so far. Now turn translation off: the row goes with the record.
7. **No new destination** — `npm test -- egress`: one run adds exactly one egress entry per provider
   request, the outbound body still carries only `model`, `temperature` and `messages`, and the
   manifest has no new permission or host (FR-024).
8. **Right-to-left** — run the panel with a right-to-left interface locale: the row and its basis wrap
   without losing the currency symbol or reversing the digits (Constitution V).
9. **Comprehension** — open the panel on a translated page for five people who have never seen it and
   ask one question: "what did this page cost?". All five must answer in tokens and in money within
   ten seconds, without being told which line to look at (SC-012).

## 6. When something looks wrong

| Symptom | Most likely cause | Where to look |
|---|---|---|
| No token row at all | the provider reported no `usage` | [provider-usage.md §3](./contracts/provider-usage.md) |
| Tokens but no price | host not in the catalogue, model unknown, or a total-only usage | the muted note names which, **and names the model** when that is the reason |
| Price is exactly double the invoice | the request fell inside a peak window, or a holiday the snapshot does not know | [pricing contract §2](./contracts/pricing-and-tiers.md) |
| Price is a little lower than the invoice | the provider billed requests whose usage never arrived; the product does not guess them | spec Assumptions |
| `≈ ¥0.0000` | should be impossible; the formatter must increase precision | [pricing contract §5](./contracts/pricing-and-tiers.md) |
| The row shows in an untranslated panel | the record was not cleared on restore | [data-model §3](./data-model.md) |
| Figures vanish when the reader cancels | clearing was wired into `cancel()` instead of `restore()` | [R11](./research.md) |
| Figures vanish after the page re-rendered itself | expected: no counted translation is connected any more | [R12](./research.md) |
