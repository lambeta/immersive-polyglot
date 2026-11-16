# Extension icon

The single source of truth is [design.svg](./design.svg). Every raster in this directory is
generated from it by `npm run make:icons`; never edit the PNGs by hand.

## The mark

A sits higher on the left and 文 sits lower on the right. A is a step smaller. Two small
arrows between them point opposite ways, so the pair reads as a conversion in either
direction. The toolbar icon has no room for the name, so the picture itself has to say
“this translates a page.”

| Role | Colour |
|---|---|
| Ground | `#13501B` |
| A, arrows, and 文 | `#F9F2E0` |

Flat vector, no face. Both letters are the type's own outline: A from Noto Sans, 文 from
Noto Sans SC (top dot, horizontal stroke, and the two falling strokes that cross).

## The checked variant (feature 009)

[design-checked.svg](./design-checked.svg) is the same master with the translation-on badge already
drawn. The tile keeps the plain icon's full 16 of 16 — the icon does not shrink when the check appears
— and the badge simply **fills the lower-right quadrant**: a flat pink shape from (8, 8) to the canvas
corner, flush with the right and bottom edges, with a rounded inner corner; the tile's clip makes its
outer corner follow the icon's own silhouette. An action image cannot hang a mark outside itself
without shrinking the icon, and the owner chose the icon's size.

| Part | Colour | Ratio |
|---|---|---|
| Disc — border and inner circle, one colour (against the icon's ground) | `#F692B7` | 4.43:1 against the ground, ≥ 3:1 |
| Tick (against the patch) | `#FFFFFF` | 2.16:1 — the owner's explicit choice; a soft pair at 1×, clear at 2× |

The tick is white because the owner asked for it three times. White on this pink is below the 4.5:1 the
rest of the product keeps; that is recorded here rather than papered over.

The mark is part of the icon rather than the browser's text badge because the browser sizes its badge
itself, which a first review showed could not be kept small or inside the icon's corner. The tick is
drawn as two strokes, so no font fallback can replace it with a box. `tests/unit/badge-contrast.test.ts`
reads these colours and coordinates from this file and `design.svg`; `tests/e2e/badge-icon.spec.ts`
measures the rendered 16 px and 32 px rasters.

## Regenerating

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
```

Both masters are rendered at 16, 32, 48 and 128 into `icon-N.png` and `icon-N-check.png`; the plain
set is declared in `src/manifest.json` for both `icons` and `action.default_icon`, and the product
swaps in the checked set per tab at runtime. `tests/unit/icons.test.ts` checks that every declaration,
file and pixel dimension agrees.
