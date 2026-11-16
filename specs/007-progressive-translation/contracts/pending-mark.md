# Contract: The Pending Mark

**Feature**: 007-progressive-translation | **Status**: ratified by this plan | **Version**: 1

One sentence: **the mark is the translation's slot, occupied before the translation exists.** It is a
product-owned node, journalled like any other product write, and it must be impossible to mistake it
for page text or for a translation.

---

## 1. Marker

| Attribute | Value | Meaning |
|---|---|---|
| `data-ipt` | `"pending"` | this element is a passage's progress mark |

Added beside `"target"` and `"source"` in `src/content/markers.ts` as `PENDING_MARKER`. No module may
repeat the literal.

## 2. Ownership matrix

| Module | `data-ipt="pending"` |
|---|---|
| renderer | creates, moves, converts to a translation, removes; journalled |
| restorer | removes on replay and on residue audit; restores its attributes |
| segmenter | **MUST prune the subtree and read no text from it** (it holds no text, but a page may clone it) |
| observer | MUST ignore it as new content, like every other `[data-ipt]` node |
| stylesheets | `content.css` only; **`display-styles.css` MUST NOT match it** |
| popup / settings | never see it |

## 3. Placement

1. The mark occupies the position the passage's translation will take, using the same placement code:
   * translations below the original → **after** the passage;
   * translations above the original → **before** the passage (`data-ipt-position="before"`);
   * translations only → in the translation's position, with the source **still visible** until the
     translation arrives.
2. For `LI`, `TD`, `TH`, `DD`, `DT`, `CAPTION` and `SUMMARY` the mark is placed **inside** the
   passage; for every other block it is a sibling. This is the existing container rule and the mark
   follows it so the translation lands in the same place.
3. A display-mode change re-places marks that are on screen with the same rule translations use. It
   never creates, removes or re-requests anything.

## 4. What the mark may contain

- A box and its own rotation. **No text, no icon font, no image, no accessible name.**
- `aria-hidden="true"`, no `tabindex`, not selectable (the stylesheet sets `user-select: none` and
  `pointer-events: none`).
- Fixed size in absolute terms (14 px box, 2 px stroke): it MUST NOT inherit the page's font size, the
  reader's translation type scale (50–200 %), or the passage's line height.
- Its own foreground colour chosen to stay visible on light, dark, tinted and mid-gray pages — the same
  four backgrounds the fifteen styles are verified against.

## 5. What the mark MUST NOT do

1. It MUST NOT carry `data-ipt-style`, `data-ipt-conceal`, `tabindex` or `lang`. Every display style
   selector is keyed on `data-ipt-style`, so carrying it would blur, underline or conceal the mark.
2. It MUST NOT appear for a passage in state `skipped`, or for a passage outside the demand window.
3. It MUST NOT outlive its reason: it is removed when its passage is translated, fails, is refused by a
   cap, is cancelled, or when translation is turned off.
4. It MUST NOT be counted in the job's translated / failed / skipped / reused figures.
5. It MUST NOT animate when the system asks for reduced motion — it stays static **and visible**.
6. It MUST NOT print: `@media print` hides it.

## 6. Conversion to a translation

1. On arrival the **same node** becomes the translation: text in, `data-ipt` rewritten to `"target"`,
   `data-ipt-unit`, `lang` and `data-ipt-style` written, typography inherited, presentation applied.
2. The node is therefore journalled exactly once as an insertion; replay removes it once.
3. After conversion no attribute of the pending state remains, and no second node exists.
4. The conversion is atomic within one render task: a sampled page MUST never show the mark and the
   translation for one passage at the same time.

## 7. Restoration

1. Every mark is journalled before insertion (`recordInsert`), with its attributes
   (`recordAttribute`/`recordAttributeOnce`) and its styling (`recordStyle`).
2. Turning translation off MUST leave zero `[data-ipt]` nodes and a DOM hash equal to the
   pre-translation capture (SC-007), including when marks were on screen at that instant.
3. Cancel removes marks without replaying the journal; the translations already rendered stay and remain
   restorable.

Requirement mapping: FR-001..FR-009, FR-021..FR-024, FR-028..FR-030.
