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

## Regenerating

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
```

Sizes produced: 16, 32, 48, 128 (declared in `src/manifest.json` for both `icons` and
`action.default_icon`). `tests/unit/icons.test.ts` checks that the declaration, the files and their
pixel dimensions agree.
