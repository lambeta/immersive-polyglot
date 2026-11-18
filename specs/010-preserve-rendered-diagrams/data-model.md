# Phase 1 Data Model: Graphic Labels, Their Translations, and the Journal

**Feature**: `010-preserve-rendered-diagrams` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

This feature stores nothing. Every entity below lives in the content script for the lifetime of one
page run, or is a rule about a DOM fact. There is no new `chrome.storage` key, no schema version and
no migration. The model is recorded because the extraction, rendering and restore decisions must be
made once and tested once — not because anything is persisted.

---

## 1. Rendered Graphic

**What it is**: a region of the page whose visible content is a machine-drawn picture. It is never a
translation passage, but it may contain eligible phrase labels.

| Field | Type | Source | Notes |
|---|---|---|---|
| `root` | `Element` | DOM | the top-level `<svg>`, `<canvas>`, `<iframe>`, `<object>`, `<embed>`, `<video>`, `<audio>` or `<math>` |
| `kind` | `"vector" \| "opaque" \| "math"` | tag name | only `vector` (SVG) exposes labels; `opaque` and `math` are preserved as drawn |
| `labelRoots` | `Element[]` | §2 | rendered `<text>` elements (and HTML label roots inside a `<foreignObject>`) |
| `role` / `name` | string or absent | DOM | preserved; never rewritten |
| `scroll` / `size` | the drawing's own | DOM | preserved; never changed by the product |

**Identity**: the root element. A drawing replaced by the page is a new root and is new content; a
drawing whose attributes mutate in place is the same graphic.

**Lifecycle**:

| Event | What happens |
|---|---|
| initial segmentation | a vector root is harvested for labels; an opaque/math root is skipped silently |
| the reader reaches a label | the label is queued like any passage |
| the page adds a new graphic root | the observer reports the root; labels are harvested |
| the page mutates attributes inside a graphic | ignored by the observer |
| the page replaces the graphic root | the new root is new content; its labels are harvested |
| restore | nothing to restore for the graphic itself; its labels are restored by §6 |

**Boundary rules**:

- A graphic that exposes no editable text (opaque/math) contributes no unit and no skipped count.
- A block whose only child is a drawing contributes no unit and no skipped count.
- A block that mixes prose and a drawing keeps its prose passage; the drawing is separate.

---

## 2. Graphic Label

**What it is**: one visible phrase the drawing renders — the unit this feature translates.

| Field | Type | Source | Notes |
|---|---|---|---|
| `root` | `Element` | DOM | one `<text>` element, or the HTML label root inside a `<foreignObject>` |
| `runs` | `CharacterData[]` | DOM | the text nodes inside `root`, in document order; includes `<tspan>` descendants |
| `sourceText` | string | §3 | runs joined with whitespace and normalised |
| `eligible` | boolean | §3 phrase rule | single token, number, symbol or metadata text is not eligible |
| `sourceLang` | string | existing detector | per phrase; inherits the page's answer when `und` |
| `unitId` | `UnitId` | segmenter | the same stable-id scheme as every passage |
| `occurrences` | `Element[]` | segmenter duplicates | every label root that shows the same phrase |
| `state` | `queued \| translating \| translated \| failed \| skipped \| cancelled` | job | the existing unit state; no new state is added |

**Invariants**:

1. A label never contributes its `<style>`, `<script>`, `<title>`, `<desc>`, `<defs>` or metadata
   text; those are not labels (FR-002).
2. A single token is not a label and is never sent (FR-003).
3. A phrase wrapped across `<tspan>` runs is one label, not one label per run (FR-004).
4. A label root is added to the run's seen set the first time it is considered, whether or not it is
   eligible, so a later collect cannot read it again (R7).
5. A label root is never given a `data-ipt` marker (FR-014).

---

## 3. Label text and eligibility

**Text joining**: the runs are joined with a space at a line boundary (an SVG `<tspan>` with its own
`x`/`dy`, or an HTML block boundary) and directly otherwise, then whitespace is collapsed and
trimmed. This prevents a two-line label from becoming `Generate outputsfor test cases` while keeping
inline styled runs of one word intact.

**Phrase rule** (FR-003):

```text
eligible(text) =
  text contains letters
  AND (
    text has two or more whitespace-separated words, or
    text contains one of , ; : ( ) [ ] ? !
  )
```

| Example | Words | Clause punctuation | Eligible |
|---|---|---|---|
| Return metric scores | 3 | no | yes |
| Update prompt, model, or logic | 5 | comma | yes |
| [Iterate until pass] | 3 | brackets | yes |
| Agent | 1 | no | no |
| loop | 1 | no | no |
| 3-5 | 1 (numeric) | no | no |
| 评估数据集 | 1 (no spaces) | no | no — the recorded space-less-source consequence |
| Warning! | 1 | exclamation | yes |

**Why not a keyword list**: a keyword list knows one library's grammar; a label named "End" or "Alt"
would be misread. The phrase rule is mechanical and owner-recorded (clarify option C).

---

## 4. Phrase Translation

**What it is**: the one write that replaces a label's text with its translation. It is an outcome of
a render, not a stored entity.

| Field | Type | Notes |
|---|---|---|
| `originalRuns` | `string[]` | every run's previous value, for immediate revert and for the journal |
| `text` | string | the provider's non-empty translation, trimmed |
| `targetLang` | string | the run's target |
| `fontScale` | number | 1 when the translation fits at the drawn size; otherwise the applied size divided by the drawn size (at least 0.75 for labels of 16 px or more; smaller labels are bounded by the 10 px floor) |
| `applied` | boolean | false when the translation could not fit at the floor; the original runs are restored |
| `originalWidth`, `originalHeight` | number or absent | measured in the same coordinate space as the translated box |
| `translatedWidth`, `translatedHeight` | number or absent | recent measurement after the last write |

**Fit rule** (FR-010):

```text
originalBox = measure() before any write
originalSize = computed font-size of the label root (px)
floor        = max(originalSize * 0.75, 10)
measure      = getBBox() for SVG text, a rectangle/scroll box for HTML; injected under jsdom
write translation into the first non-empty run, clear the other runs
fits(box)    = box.width <= originalBox.width + 0.5
               AND (SVG text: true; HTML label: box.height <= originalBox.height + 0.5)
if fits(measure()): applied, no shrink
else for size = originalSize - 1 down to floor:
  set font-size = size; if fits(measure()), applied
if no size fits: restore original runs and the original inline style; applied = false
```

**Invariants**:

1. No clipping, no overlap, no enlargement of the drawing.
2. Only this label's type size may change; the drawing's shapes, lines, anchors and positions do not.
3. A failed fit leaves the original label exactly as drawn, with no residual `font-size`.
4. A translation is applied to the label's own runs; no sibling block is created.

---

## 5. Translation Unit and Passage Index (existing, extended by reference)

The shared `TranslationUnit` keeps its current fields. This feature does **not** add a persisted or
message-level field:

- `domRef` is the label root for a label unit and the source block for a prose unit.
- `partIndex` is 0 for a label: a phrase is never split.
- `sourceText` is the phrase.
- `translatedText` is the provider's translation.
- `state` is the existing state machine (§7).

Whether a passage is inline is answered from the DOM (`domRef.closest("svg")`) at render time, not
stored. This keeps the shared type, the message schema and persisted state unchanged.

The `PassageIndex` already maps an element to its parts and repeated occurrences; a label root is an
element, so the same index serves the job's render and the demand window's measure.

---

## 6. Page Extraction Result and the seen set

| Field | Type | Notes |
|---|---|---|
| `units` | `TranslationUnit[]` | prose and eligible labels, in document order |
| `duplicates` | `SegmentDuplicate[]` | repeated phrases, with the label root as `element` |
| `skipped` | number | real refusals only (same-language, cap, etc.); never a drawing, a style sheet or a single token |
| `sourceLang` | string | existing page-language answer |
| `seenLabels` | `WeakSet<Element>` | run-scoped: label roots already considered, so a later collect cannot re-read them |

**Why a run-scoped set rather than a marker**: a label cannot carry `data-ipt` (FR-014), and a
translated label's text no longer matches its old id; the set is the only marker that is invisible to
the page and dies with the run.

**Collect boundary**: if `collect(root)` is given an element inside a graphic, it resolves to the
graphic root first. The observer never reports a node inside a graphic; it reports only a new or
replaced graphic root.

---

## 7. Unit state machine

```text
queued ──dispatch──> translating ──reply──> translated
   │                      │                    │
   │                      └──error──> failed   └──fit fails──> translated (source text left visible)
   ├──same language──> skipped
   ├──cap reached────> skipped
   └──cancel─────────> cancelled
```

- **Fit failure is not a state.** The provider returned a translation, so the unit is `translated`;
  the occurrence simply kept its source text. This is the owner's fit choice (FR-010, SC-016), not a
  provider failure and not a skipped drawing. No new `SkipReason` is introduced.
- **A repeated phrase** has one unit and one state; every occurrence renders from the same
  `translatedText`. Each occurrence may fit differently; its own fit is a render result, not a unit
  state.
- **Failure** keeps the original label visible and is reported through the existing failure channels
  (FR-018); it never renders blank or partial text.
- **Cancel** stops queued labels; rendered labels stay until restore.

---

## 8. Counting and usage

| Number | Includes labels? | Notes |
|---|---|---|
| `counts.total` | yes | one per eligible phrase, plus prose units |
| `counts.translated` | yes | a phrase with a translation counts once, even if one occurrence could not fit |
| `counts.failed` | yes | a phrase whose request failed |
| `counts.skipped` | yes, for real refusals | same-language phrase, cap reached; never a drawing, style sheet or single token |
| `counts.reused` | yes | repeated phrase occurrences |
| `charsSent` | yes | the phrase's characters, once per distinct phrase |
| `SessionUsageRecord.segmentsTranslated` | yes | mirrors `counts.translated` |

No drawing-internal character (style sheet, script, title, description, identifier) is counted.

---

## 9. Display mode and presentation

`DisplayMode` keeps its existing meaning for prose. Labels are outside that machinery:

- bilingual, translation-above and translation-only all leave the drawing and its translated labels
  visible;
- translation-only hides prose source blocks, never a drawing;
- display style and typography settings change prose containers only; they never restyle a label;
- a label's only presentation change is its own fit shrink.

---

## 10. Journal entries (new text kind)

| Kind | Fields | Replay |
|---|---|---|
| `insert` | node, parent, next | remove the node if still in place (existing) |
| `attribute` | element, name, previous | restore the previous value (existing) |
| `style` | element (now `Element`), previous style attribute | restore the whole attribute (existing) |
| `text` | `CharacterData` node, previous value | restore the node's value |

**Invariants**:

1. A text node is journalled once per run; rewriting a label does not grow the journal.
2. A style attribute is journalled once per element (existing rule); the fit's font-size and direction
   writes share that entry.
3. Replay is in reverse, so clearing a run and then writing another restores in the right order.
4. Restore leaves no `data-ipt`, `style`, `font-size` or text residue; the DOM hash equals the
   pre-translation capture (FR-013, SC-004).
5. The residue audit for `[data-ipt]` is unchanged; it is not a substitute for the text journal.

---

## 11. Nothing is stored

- No new `chrome.storage` key, area or schema version.
- No per-page label cache outside the run's DOM references and WeakSet.
- No history of translated drawings, no label text persisted.
- The run ends, restore replays, and the references die with the document.

A future feature that needs "this drawing was translated" across reloads would have to add storage
deliberately; this one does not.

---

## 12. Requirement traceability

| Requirement | Where it lives in this model |
|---|---|
| FR-001 (labels are passages; drawing is not) | §1 root/kind, §2 label root, §7 state |
| FR-002 (only rendered text; no metadata) | §2 runs, §3 joining, §1 labelRoots |
| FR-003 (phrase rule) | §3 rule and table |
| FR-004 (grouping, reuse) | §2 occurrences, §5 PassageIndex, §7 repeated phrase |
| FR-005 (same language) | §7 skipped, §8 counts |
| FR-006 (prose around drawing) | §1 boundaries, §5 prose units |
| FR-007 (opaque/math preserved) | §1 kind, §7 no unit |
| FR-008 (late/replaced drawings) | §1 lifecycle, §6 collect boundary |
| FR-009 (in place, geometry unchanged) | §4 invariants |
| FR-010 (fit floor/fallback) | §4 fit rule |
| FR-011 (all display modes) | §9 |
| FR-012 (no pending mark inside) | §7, plan R6 |
| FR-013 (restore) | §10 |
| FR-014 (no markers/touching) | §2 invariant 5, §10 invariant 4 |
| FR-015 (mode/style/typography/language) | §9, §7 |
| FR-016 (no internals in requests) | §3, §8 |
| FR-017 (usage/skip counts) | §8 |
| FR-018 (failure keeps original) | §7 |
| FR-019 (selection/single block) | §6 collect boundary, plan R9 |
| FR-020 (only labels / only opaque) | §1, §7 |
| FR-021 (accessibility) | §1 role/name, §4 write |
| FR-022 (run not aborted) | §5, §7 |
| FR-023 (performance/no serialization) | §3, §4, §10 |
