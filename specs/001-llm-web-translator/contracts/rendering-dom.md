# Contract: Rendering Behaviour to Reproduce

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-13

This is the contract behind FR-015..FR-020 and SC-011. It exists because Immersive Translate is closed
source ([research R2](../research.md)): the behaviour is reproduced clean-room, so the *behaviour* is
pinned by observation rather than by source.

---

## 1. What "reproduce the behaviour" means

An observing reviewer, given only the rendered page, must not be able to tell that a different
implementation produced it. Concretely:

| Aspect | Obligation |
|---|---|
| Placement | Each translated segment is a sibling block immediately adjacent to its source block, in the same reading flow: not floated, not overlaid, not in a popup |
| Association | A translated segment is visually and structurally identifiable as belonging to exactly one source block (FR-008) |
| Display modes | Bilingual (translation after source), translation-only, and translation-before-source, all with the same placement semantics (FR-017) |
| Typography | The translation inherits the source block's font metrics, alignment, and line height closely enough that mixed lines do not jitter on scroll |
| Semantics | Translated markup uses block-level semantic elements carrying the target language, so screen readers switch voice and the browser's find feature locates translated text (FR-018) |
| Non-invasiveness | The source block is not moved, wrapped in a new parent, re-styled in place, or removed from the reading order |
| Restore | Toggling off replays the write journal in reverse, leaving zero injected nodes, zero surviving attribute changes, and an unchanged scroll position (FR-019, R8) |
| Live content | Late-arriving blocks are translated in place with no re-translation or duplication (edge case) |
| Long translations | A translation longer than its source must not overlap neighbours, clip, or introduce horizontal page scroll (SC-004) |

## 2. What is deliberately not reproduced

Recorded so that divergence is a decision rather than drift:

- Immersive Translate's own visual chrome (panel, hover bubble, settings UI) — this product has its own
  popup and options surface.
- Its other content types (PDF, video, image, e-book, input box) — Out of Scope.
- Its site-specific rules and provider presets — user configuration, not behaviour.
- Any behaviour that depends on its internal state.

## 3. Making SC-011 decidable: the capture corpus

Because the criterion must be falsifiable (constitution principle I), the baseline is frozen in the
repository.

**Capture** — performed once, by hand, with Immersive Translate installed:

```text
tests/fixtures/captures/<page-id>/<mode>.json
{
  "page": "article-a",
  "mode": "bilingual",
  "capturedWith": "Immersive Translate <version>, Chrome <version>, viewport 1280x800",
  "capturedAt": "YYYY-MM-DD",
  "segments": [
    {
      "sourceSelector": "#main p:nth-of-type(3)",
      "sourceText": "...",
      "translatedText": "...",
      "relation": "siblingAfter",
      "containerTag": "div",
      "inheritsTypography": true,
      "langAttribute": "zh-CN"
    }
  ],
  "restoreBaseline": { "domHash": "...", "scrollY": 0 }
}
```

**Comparison** — run per release over the 20 frozen pages:

1. For each captured segment, assert the product produced a translation with the same `relation`, an
   equivalent container element, the correct language attribute, and the same source association.
2. Assert no page-level layout violation: no horizontal scrollbar, and no bounding-box overlap beyond a
   1 px tolerance between adjacent translated segments.
3. Toggle off and assert the DOM hash and scroll position match `restoreBaseline`.
4. Report a diff table of any divergence; each divergence is either fixed or escalated as a spec change.

The corpus is versioned and frozen. Re-capturing requires a recorded reason, because it silently
redefines "correct".

## 4. Styling constraints

- Styles ship as manifest-declared extension CSS, which is not subject to the page's CSP.
- Dynamic adjustments (indentation, font inheritance) use CSSOM property assignment, never
  `setAttribute('style', ...)`, which strict-CSP pages can reject.
- No page-global CSS is injected; every rule is scoped to the product's own marker attributes.
- No `!important` unless a captured case proves it necessary, and then only scoped to the marker.
