import { expect, test } from "@playwright/test";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { BADGE_MARK } from "../../src/background/status-badge.js";

/**
 * The shipped checked raster, measured pixel by pixel (feature 009 FR-009–FR-014, SC-002, SC-003,
 * SC-013).
 *
 * The final design fills the lower-right quadrant of a full-size tile: the icon does not shrink and
 * the mark does not overhang the canvas. The evidence is the rendered raster a real browser decodes —
 * where the pink is, that the tick is white, and that the plain icon carries no pink.
 */

interface Raster {
  width: number;
  height: number;
  data: number[];
}

let extension: LaunchedExtension;

test.beforeEach(async () => {
  extension = await launchWithExtension();
});

test.afterEach(async () => {
  await extension.close();
});

async function readPair(size: number): Promise<{ plain: Raster; checked: Raster }> {
  const page = await extension.openOptions();
  try {
    return (await page.evaluate(async (edge) => {
      const read = async (name: string): Promise<Raster> => {
        const response = await fetch(`/icons/${name}`);
        if (!response.ok) throw new Error(`missing ${name}`);
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2d context");
        context.drawImage(bitmap, 0, 0);
        const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
        return { width: bitmap.width, height: bitmap.height, data: Array.from(image.data) };
      };
      return { plain: await read(`icon-${edge}.png`), checked: await read(`icon-${edge}-check.png`) };
    }, size)) as { plain: Raster; checked: Raster };
  } finally {
    await page.close();
  }
}

interface Pixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

function pixels(raster: Raster): Pixel[] {
  const out: Pixel[] = [];
  const size = raster.width;
  for (let index = 0; index < raster.data.length; index += 4) {
    const pixel = index / 4;
    out.push({
      x: pixel % size,
      y: Math.floor(pixel / size),
      r: raster.data[index] ?? 0,
      g: raster.data[index + 1] ?? 0,
      b: raster.data[index + 2] ?? 0,
      a: raster.data[index + 3] ?? 0,
    });
  }
  return out;
}

const isPink = (p: Pixel): boolean => p.r >= 200 && p.g >= 100 && p.g <= 210 && p.b >= 140 && p.b <= 230;

function alphaAt(raster: Raster, x: number, y: number): number {
  const size = raster.width;
  return raster.data[(y * size + x) * 4 + 3] ?? 0;
}

for (const size of [16, 32] as const) {
  test(`the ${size} px checked raster fills the icon's lower-right corner`, async () => {
    const { plain, checked } = await readPair(size);
    expect(plain.width).toBe(size);
    expect(checked.width).toBe(size);

    const all = pixels(checked);
    const pink = all.filter(isPink);
    expect(pink.length, "the badge carries its pink fill").toBeGreaterThanOrEqual(Math.max(4, Math.floor(size / 8)));

    // The mark's own extent: the lower-right quadrant, filled to the edges.
    const xs = pink.map((p) => p.x);
    const ys = pink.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs) + 1;
    const height = Math.max(...ys) - Math.min(...ys) + 1;
    expect(width).toBeGreaterThanOrEqual(Math.floor(size * 0.4));
    expect(width).toBeLessThanOrEqual(Math.ceil(size * 0.55));
    expect(height).toBeGreaterThanOrEqual(Math.floor(size * 0.4));
    expect(height).toBeLessThanOrEqual(Math.ceil(size * 0.55));
    // It fills the corner: flush with the right and bottom edges, never past the canvas.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(Math.floor(size * 0.4));
    expect(Math.max(...xs)).toBe(size - 1);
    expect(Math.max(...ys)).toBe(size - 1);

    // The check is white on the pink: a soft pair at 1x, and the owner's explicit choice.
    const white = all.filter((p) => p.a === 255 && p.r >= 235 && p.g >= 235 && p.b >= 235);
    expect(white.length, "the disc carries a white check").toBeGreaterThan(0);

    // The tile keeps the plain icon's silhouette: the mark fills the corner, it does not overhang.
    expect(alphaAt(checked, size - 1, 0)).toBe(alphaAt(plain, size - 1, 0));

    // It reaches the canvas corner, and never crosses the canvas.
    const mark = all.filter((p) => isPink(p)).map((p) => ({ x: p.x, y: p.y }));
    const maxX = Math.max(...mark.map((p) => p.x));
    expect(maxX).toBeLessThanOrEqual(size - 1);

    if (size === 32) {
      const exact = pink.filter(
        (p) =>
          p.r === Number.parseInt(BADGE_MARK.fill.slice(1, 3), 16) &&
          p.g === Number.parseInt(BADGE_MARK.fill.slice(3, 5), 16) &&
          p.b === Number.parseInt(BADGE_MARK.fill.slice(5, 7), 16),
      );
      expect(exact.length, "the 32 px raster carries the exact fill colour").toBeGreaterThan(10);
    }

    // The plain icon carries no pink at all, so the mark cannot be there by accident.
    expect(pixels(plain).filter(isPink)).toEqual([]);
  });
}