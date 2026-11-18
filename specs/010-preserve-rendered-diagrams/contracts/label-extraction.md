# Contract: Graphic Extraction and Label Eligibility

**Feature**: `010-preserve-rendered-diagrams` | **Status**: ratified by this plan | **Version**: 1

This contract states what the segmenter may read from a rendered drawing, what it must never read,
and how a label becomes a translation unit. It extends the ownership rule of
[feature 005's page-markup contract](../../005-fix-duplicate-translations/contracts/page-markup-ownership.md)
§2–§3: product output is never source text, and now a drawing's non-text internals are never source
text either.

---

## 1. Graphic roots

| Root | Kind | Labels | Behaviour |
|---|---|---|---|
| `<svg>` | vector | yes, from rendered `<text>` and HTML labels inside `<foreignObject>` | harvest labels; never read as prose |
| `<math>` | math | no | preserved; no unit, no request |
| `<canvas>` | opaque | no | preserved; no unit, no request |
| `<iframe>`, `<object>`, `<embed>` | opaque | no | preserved; no unit, no request |
| `<video>`, `<audio>` | opaque | no | preserved; no unit, no request |

A root is recognised by its element, not by a site, class or library name. A graphic nested inside
another graphic is handled by the outer root.

## 2. Label roots and runs

- **SVG label root**: one rendered `<text>` element.
- **SVG runs**: the text nodes inside that element, including descendants of `<tspan>`.
- **HTML label root** (inside `<foreignObject>`): the object's element child; runs are its text
  nodes.
- **Sibling text elements are separate labels.** Grouping is inside one label root, never across two
  `<text>` elements; the DOM gives no reliable signal that two siblings are one phrase.
- **Excluded subtrees**: `<style>`, `<script>`, `<title>`, `<desc>`, `<defs>`, `<metadata>`,
  `<symbol>`, `<clipPath>`, `<mask>`, `<pattern>`, `<marker>`, gradients and filters. No text from
  these may become a label, a passage, a skip count or a request.
- **Hidden labels**: a label root that is hidden by attribute, inline style, `aria-hidden`, or an
  opted-out ancestor is not a label. It is skipped silently: no unit, no skip count.

**Text joining**: runs are joined with a space at a line boundary (a `<tspan>` with its own
`x`/`dy`, or an HTML block boundary) and directly otherwise; whitespace is collapsed and trimmed.
This keeps a wrapped label one phrase and an inline styled word intact.

## 3. Eligibility: the phrase rule

A label is eligible when all are true:

1. it contains at least one letter;
2. it has **two or more whitespace-separated words**, **or** it contains clause punctuation
   (`,` `;` `:` `(` `)` `[` `]` `?` `!`).

A single token — a lone name, diagram keyword, identifier, number, symbol, or one-letter variable — is
ineligible. It is not sent and stays exactly as drawn. A source language that writes without spaces
makes a space-less label one token; this is the recorded consequence in the spec's Assumptions.

The rule is mechanical: no keyword list, no class list, no site list.

## 4. Interaction with prose extraction

1. `subtreeText` and `hasBlockDescendant` stop at a graphic root and at every silent subtree
   (`script`, `style`, `noscript`, `template`, `svg`, `canvas`, `iframe`, `video`, `audio`, form
   controls).
2. A block whose only child is a drawing produces **no unit and no skipped-passage count**. The
   drawing-only wrapper is silent, not "a passage skipped".
3. A block that mixes prose and a drawing is translated from its prose only; the drawing's labels are
   harvested separately. The product must not append a drawing's text to the prose passage.
4. A drawing inside a refused region (nav, `translate="no"`, hidden, editable) is left untouched:
   the refusal wins before any label is harvested.
5. The order of units remains document order: the prose around a drawing is queued where it appears;
   the drawing's labels are queued when the root is reached.

## 5. Seen labels, late content and the observer

1. The job owns a run-scoped `WeakSet<Element>` and passes it to `segmentPage`.
2. The segmenter adds a label root to the set the first time it is considered — eligible or not — and
   must not produce a second unit, duplicate or skip for a root already in the set.
3. `TranslationJob.collect(root)` must resolve a root that is inside a graphic to that graphic's root
   before segmenting. A label root is never segmented as a standalone block.
4. The page observer must ignore attribute mutations and child additions **inside** a graphic. A
   newly added or replaced graphic **root** is reported normally. This prevents the renderer's fit
   style write from triggering a collect loop.
5. A replaced graphic is a new root; its labels are not in the set and are eligible again. A
   re-rendered drawing that reuses the same roots and changes only their text is a recorded
   limitation: the product does not watch `characterData` inside a drawing.

## 6. Selection and single-block targeting

1. A selection whose start and end are inside the same graphic resolves to that graphic's root; its
   eligible labels are collected, and nothing else from inside the drawing is sent.
2. A single-block target that lands inside a graphic resolves to the graphic's root, not to an
   enclosing `div`/`p`.
3. A selection in prose is unchanged: the existing block logic applies.

## 7. Conformance

| Check | Where |
|---|---|
| A phrase in `<svg><text>` becomes one queued unit; a single token, a number and a style rule do not | `tests/unit/segmenter-labels.test.ts`, `tests/unit/graphics.test.ts` |
| A wrapper around only a drawing produces zero units and zero skipped passages | `tests/unit/segmenter-labels.test.ts`; `tests/e2e/status-badge.spec.ts` zero-passage case |
| Prose before/after/inline with a drawing still translates; the drawing's text is never appended | `tests/unit/segmenter-labels.test.ts` |
| A wrapped `<tspan>` phrase is one label; a repeated phrase yields one unit + occurrences | `tests/unit/graphics.test.ts`, `tests/unit/segmenter-labels.test.ts` |
| A late collect with the seen set adds nothing; a replaced root is eligible | `tests/dom/job-labels.test.ts`, `tests/dom/observer-labels.test.ts` |
| A selection inside a drawing resolves to the graphic root | `tests/dom/selection-graphic.test.ts` |
| A live captured diagram yields exactly the 6 phrases and none of the style sheet | `tests/e2e/diagram-labels.spec.ts` |
