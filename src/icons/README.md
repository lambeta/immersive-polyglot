# Extension icon

The single source of truth is [design.svg](./design.svg). Every raster in this directory is
generated from it by `npm run make:icons`; never edit the PNGs by hand.

## The mark

A badger portrait on a crimson tile: larger blunt ears, narrow dark face-stripes set out toward the
ears, two small eyes in the cream beside the muzzle, and a honey blaze down the centre that carries
the product's "marker" accent inside the animal. The blaze stops behind the muzzle, so it reads as
fur rather than a beak.

Why a badger: it is the bookish, stubborn reader who works a foreign page until it yields. The
chosen animal also avoids the crowded mascot shelf (Duolingo's owl, Papago's parrot, Firefox's fox).

| Role | Colour |
|---|---|
| Tile | `#A6202F` (crimson) |
| Head / cream mass | `#FFF4EE` (warm white) |
| Face stripes / eyes / nose | `#3A0C14` (deep wine) |
| Blaze | `#FFC24D` (honey gold) |

Flat vector, no letterforms, no system fonts. At 16px the silhouette is tile → pale head → gold
stripe; the ears and the two dark side-stripes keep the shape from turning into a generic blob. The
eyes are deliberately small and sit just above the 16px legibility floor: they add expression at
32px and above without breaking the small size.

## Regenerating

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
```

Sizes produced: 16, 32, 48, 128 (declared in `src/manifest.json` for both `icons` and
`action.default_icon`). `tests/unit/icons.test.ts` checks that the declaration, the files and their
pixel dimensions agree.
