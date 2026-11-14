# Extension icon

The single source of truth is [design.svg](./design.svg). Every raster in this directory is
generated from it by `npm run make:icons`; never edit the PNGs by hand.

## The mark

A gold translation page peeking from behind an off-white reading page. On the front page, a dark
source line sits above a longer gold marker line: the product's "translation is placed on the page,
and you can see where" idea in one silhouette. At 16px the eye reads teal tile → light page → gold
stripe, with no thin strokes or letterforms to dissolve.

| Role | Colour |
|---|---|
| Tile | `#0A4542` (ink teal) |
| Page | `#F4F7F6` (off-white) |
| Source line | `#0A4542` |
| Translation / marker | `#E4B23C` (warm gold) |

The icon is flat vector with a single soft highlight; it is not derived from Immersive Translate's
logo or any third-party mark, and it uses no system fonts.

## Regenerating

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
```

Sizes produced: 16, 32, 48, 128 (declared in `src/manifest.json` for both `icons` and
`action.default_icon`). `tests/unit/icons.test.ts` checks that the declaration, the files and their
pixel dimensions agree.
