# Extension icon

The single source of truth is [design.svg](./design.svg). Every raster in this directory is
generated from it by `npm run make:icons`; never edit the PNGs by hand.

## The mark

A page split into the two languages the product puts on screen. The upper half is the source,
a Latin A. The lower half is the translation, 文. The toolbar icon has no room for the name, so
the picture itself has to say “this translates a page.”

| Role | Colour |
|---|---|
| Source ground | `#F6E6D4` (warm cream) |
| Translation ground | `#C2353E` (warm red) |
| A | `#3A1814` (warm ink) |
| 文 | `#F6E6D4` |

Flat vector, no face. Drawn on a 16px grid: the A keeps its peak, counter and crossbar, and 文
keeps the top stroke above the crossing strokes.

## Regenerating

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
```

Sizes produced: 16, 32, 48, 128 (declared in `src/manifest.json` for both `icons` and
`action.default_icon`). `tests/unit/icons.test.ts` checks that the declaration, the files and their
pixel dimensions agree.
