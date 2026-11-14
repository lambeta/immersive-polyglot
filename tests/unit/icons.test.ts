import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The action/app icons are what a reader sees before installing anything, and a manifest that
 * points at a missing or wrongly sized file fails silently in chrome://extensions. This test makes
 * the declaration and the assets agree.
 */

const ROOT = join(import.meta.dirname, "../..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "src/manifest.json"), "utf8")) as {
  icons?: Record<string, string>;
  action?: { default_icon?: Record<string, string> };
};

const SIZES = [16, 32, 48, 128];

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("extension icons", () => {
  it("declares an icon for the toolbar and for the manifest at every standard size", () => {
    for (const size of SIZES) {
      expect(MANIFEST.icons?.[String(size)], "icons." + size).toBe("icons/icon-" + size + ".png");
      expect(
        MANIFEST.action?.default_icon?.[String(size)],
        "action.default_icon." + size,
      ).toBe("icons/icon-" + size + ".png");
    }
  });

  it("ships a PNG of exactly the declared size", () => {
    for (const size of SIZES) {
      const path = join(ROOT, "src/icons/icon-" + size + ".png");
      expect(existsSync(path), path).toBe(true);
      expect(pngSize(path)).toEqual({ width: size, height: size });
    }
  });
});
