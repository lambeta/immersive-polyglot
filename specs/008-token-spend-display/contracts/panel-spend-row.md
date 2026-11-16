# Contract: The Panel's Spend Row

Feature 008, FR-001, FR-004, FR-009, FR-020a, FR-021, FR-022, FR-026, FR-027.

## 1. Position and shape

Inside the panel's existing session record (`section.usage > ul#usage`), one `li` per fact. The new row
sits after the characters-sent row and before the reuse row:

```text
1.  {n} segments translated
2.  {n} characters sent           ← unchanged, keeps its place and value
3.  {tokens} spent · ≈ {amount}   ← NEW, both figures on one row, basis on the same row
    ({provider} list · {snapshot})
4.  {n} segments reused
5.  {n} passages skipped
6.  {n} passages failed
```

The row is `li.usage__spend`; the basis is `span.usage__basis` inside it, rendered in muted type and
allowed to wrap to a second visual line. When no price exists, `span.usage__note` carries the reason
in the same row. The whole row is one list item, not two.

## 2. States

| State | Row | Note |
|---|---|---|
| no translations / no usage | absent | absent |
| tokens reported, priced | `{tokens} spent · ≈ {amount}` + basis | absent |
| tokens reported, unpriced | `{tokens} spent` plus an inline muted note naming the reason | — |
| measured zeros | `0 spent · ≈ ¥0` … | absent |
| run cancelled, translations still on the page | the figures reached so far, unchanged | absent |
| page removed every translation, job still alive | absent | absent |

The muted note is `span.usage__note` **inside** the spend row, 11 px, muted colour, no icon, no
exclamation, no colour-only meaning. It sits after the token figure and wraps when it must, so the
record still grows by exactly one row. It appears **only** when a token figure exists and no price
does.

## 3. Catalogue keys (all new, all in `src/_locales/en/messages.json`)

| Key | Message (source locale) | Values |
|---|---|---|
| `popupSpendTokens` | `{count} tokens spent` | locale-formatted integer |
| `popupSpendPriceCny` | `≈ ¥{amount}` | formatted amount |
| `popupSpendPriceUsd` | `≈ ${amount}` | formatted amount |
| `popupSpendBasis` | `{provider} list · {snapshot}` | provider label, snapshot `YYYY-MM` |
| `popupSpendNoPriceList` | `No published price for this provider.` | — |
| `popupSpendModelNotPriced` | `No published price for {model}.` | the configured model name |
| `popupSpendUsageIncomplete` | `The provider did not report enough usage to price this run.` | — |

No literal text in markup; the i18n audit test is the enforcement.

## 4. Accessibility

- The record is **not** a live region; nothing here announces itself as it changes (FR-020a). The
  panel's status line keeps its existing `aria-live="polite"`.
- The row reads as one phrase: the token figure, then the price, then the basis. No figure is conveyed
  by colour, alignment or a legend elsewhere.
- The token count and the price are ordinary text, so a screen reader reads the current values whenever
  the reader moves to the row (SC-015).
- The currency symbol has a catalogue-defined position; under RTL the row's `dir` inherits from the
  document and the basis may wrap.

## 5. Layout

- The row wraps; it never truncates a figure or a unit.
- With the row and the muted note present, the panel still measures under 600 px tall at 384 px wide,
  with no vertical scrollbar and no sideways overflow, at 200 % zoom and with labels 30 % longer than
  English (FR-022, SC-010).
- The characters-sent row's value and position are byte-identical to today (FR-027, SC-013).

## 6. What the row must never do

| Never | Because |
|---|---|
| Show an amount without the basis beside it | FR-009, SC-015 |
| Show `≈ ¥0` for a non-zero estimate | FR-013 |
| Show a price when any counted response is unpriced | FR-010 |
| Show `0 tokens` when no usage was reported | FR-004 |
| Show an estimate derived from characters or request bytes | FR-003 |
| Show two rows for one figure | FR-027 |
| Announce itself on every update | FR-020a |
| Call the amount a bill, invoice or charge | FR-009 |
| Keep showing a figure after every translation it counted has left the page | FR-023 |
| Clear the record on cancel | R11 — only turning translation off clears |
