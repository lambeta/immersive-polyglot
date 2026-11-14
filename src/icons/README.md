# Extension icon

The single source of truth is [design.svg](./design.svg). Every raster in this directory is
generated from it by `npm run make:icons`; never edit the PNGs by hand.

## The mark

A badger portrait: a cream head on an espresso tile, twin vertical dark face-stripes, and a honey
blaze down the centre that is the product's "marker" accent built into the animal rather than added
as a separate object. Under the chin, a single honey ledge is the page the badger is reading — the
translation cue, kept as one continuous bar so it never reads as paws.

Why a badger: it is the bookish, stubborn reader who works a foreign page until it yields. The
chosen animal also avoids the crowded mascot shelf (Duolingo's owl, Papago's parrot, Firefox's fox).

| Role | Colour |
|---|---|
| Tile | `#3E2418` (espresso) |
| Head / cream mass | `#FBF2E4` (warm cream) |
| Face stripes / nose | `#2A160F` (deep espresso) |
| Blaze / page ledge | `#E8A63C` (honey) |

Flat vector, no letterforms, no system fonts. At 16px the silhouette is tile → pale head → honey
stripe; the stripes survive as two dark bites and the chin ledge as a thin gold line.

## Regenerating

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
```

Sizes produced: 16, 32, 48, 128 (declared in `src/manifest.json` for both `icons` and
`action.default_icon`). `tests/unit/icons.test.ts` checks that the declaration, the files and their
pixel dimensions agree.
