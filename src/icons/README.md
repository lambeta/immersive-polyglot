# Extension icon

The single source of truth is [design.svg](./design.svg). Every raster in this directory is
generated from it by `npm run make:icons`; never edit the PNGs by hand.

## The mark

A compact badger portrait on a warm-red tile. The face is inset from the tile edge, with moderate
ears and a short coral blaze that stops above the eyes. The dark cheeks are **short eye/cheek
patches**, not crown-to-jaw bands: they frame the eyes instead of dividing the face. Cream sparks
inside each patch are the eyes; a small deep-red nose closes the face.

Earlier revisions used long vertical face-stripes, a full-height gold column, oversized ears and a
four-chroma palette; those read as a raccoon and did not hang together. This version keeps one
analogous warm-red family and fixes the proportions.

| Role | Colour |
|---|---|
| Tile | `#C2353E` (warm mid-red) |
| Face | `#FFF0EB` (warm off-white, pink undertone) |
| Cheeks / nose | `#7A1822` (deep red, not black) |
| Blaze / ear inners | `#E89070` (coral) |

Flat vector, no letterforms, no system fonts. At 16px the silhouette is tile → pale face → two
separated cheek patches; the ear tips and the nose keep the shape reading as a face.

## Regenerating

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
```

Sizes produced: 16, 32, 48, 128 (declared in `src/manifest.json` for both `icons` and
`action.default_icon`). `tests/unit/icons.test.ts` checks that the declaration, the files and their
pixel dimensions agree.
