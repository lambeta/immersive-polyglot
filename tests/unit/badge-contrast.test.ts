import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BADGE_MARK } from "../../src/background/status-badge.js";
import { contrastRatio, parseColor } from "../../src/shared/contrast.js";

/**
 * FR-010–FR-013: the mark must not disappear into the icon, and its geometry is the product's to
 * choose. Both are read from the shipped vector masters, so a hand-typed palette or a moved badge
 * cannot pass this test (plan R5, R13).
 *
 * Final design (owner reviews 2026-11-16): one flat pink disc — border and inner circle the same
 * colour — floating on the padded tile's lower-right corner and twice the old diameter.
 */

const ROOT = join(import.meta.dirname, "../..");
const PLAIN = readFileSync(join(ROOT, "src/icons/design.svg"), "utf8");
const CHECKED = readFileSync(join(ROOT, "src/icons/design-checked.svg"), "utf8");

function fillsOf(svg: string, tag: "rect" | "path"): string[] {
  const pattern = new RegExp('<' + tag + '[^>]*fill="(#[0-9A-Fa-f]{6})"', "g");
  return [...svg.matchAll(pattern)].map((match) => match[1] ?? "").filter(Boolean);
}

interface Circle {
  cx: number;
  cy: number;
  r: number;
  fill: string;
}

const circles: Circle[] = [...CHECKED.matchAll(/<circle\s([^>]+)\/>/g)].map((match) => {
  const attrs: Record<string, string> = {};
  for (const attribute of (match[1] ?? "").matchAll(/(\w+)="([^"]*)"/g)) {
    attrs[attribute[1] ?? ""] = attribute[2] ?? "";
  }
  return { cx: Number(attrs["cx"]), cy: Number(attrs["cy"]), r: Number(attrs["r"]), fill: attrs["fill"] ?? "" };
});

const GROUND = fillsOf(PLAIN, "rect")[0] ?? "";
const LETTERING = fillsOf(PLAIN, "path")[0] ?? "";

function ratio(a: string, b: string): number {
  const first = parseColor(a);
  const second = parseColor(b);
  if (!first || !second) throw new Error("unreadable colour: " + a + " / " + b);
  return Number(contrastRatio(first, second).toFixed(2));
}

describe("the check's colours (FR-010, FR-011, FR-012, SC-003)", () => {
  it("reads the ratified icon palette out of the shipped master", () => {
    expect(GROUND).toBe("#13501B");
    expect(LETTERING).toBe("#F9F2E0");
  });

  it("gives the pink disc at least 3:1 against the icon's ground", () => {
    expect(ratio(BADGE_MARK.fill, GROUND)).toBeGreaterThanOrEqual(3);
    // Measured 4.43:1.
    expect(ratio(BADGE_MARK.fill, GROUND)).toBeCloseTo(4.43, 1);
  });

  it("records the white tick at 2.16:1: the owner chose it knowingly (FR-011)", () => {
    // Below the 4.5:1 rule the rest of the product keeps. The owner asked for white three times, so
    // the requirement records the trade-off instead of pretending the threshold is met.
    expect(BADGE_MARK.tick.toLowerCase()).toBe("#ffffff");
    expect(ratio(BADGE_MARK.tick, BADGE_MARK.fill)).toBeCloseTo(2.16, 1);
  });

  it("separates the disc from the icon's cream lettering by hue, not by luminance", () => {
    // Pink against the cream 文 is 1.94:1 — recorded, not claimed as a threshold.
    expect(ratio(BADGE_MARK.fill, LETTERING)).toBeCloseTo(1.94, 1);
  });

  it("uses exactly those two colours in the shipped checked master", () => {
    expect(CHECKED).toContain(`fill="${BADGE_MARK.fill}"`);
    expect(CHECKED).toContain(`stroke="${BADGE_MARK.tick}"`);
    // One flat corner: no second shape, no second colour.
    expect(circles).toHaveLength(0);
  });
});

describe("the check's geometry (FR-013, SC-013)", () => {
  it("fills the lower-right quadrant of a full-size tile, flush with its edges", () => {
    // One flat colour answers the owner's "border and inner circle the same colour"; the shape is
    // the quadrant from (8, 8) to the canvas corner, with a rounded inner corner.
    expect(BADGE_MARK.widthRatio).toBeCloseTo(8 / 16, 5);
    expect(BADGE_MARK.tileRatio).toBe(1);
    expect(CHECKED).toContain('d="M11 8 H16 V16 H8 V11 Q8 8 11 8 Z"');
    expect(CHECKED).toContain('V16 H8');
  });

  it("draws the artwork at the plain icon's size, with the same clipped tile", () => {
    expect(CHECKED).toContain('<g clip-path="url(#tile)">');
    expect(CHECKED).toContain('<rect width="16" height="16" rx="3.5"');
    expect(CHECKED).not.toContain("transform=");
  });

  it("draws the tick as two strokes rather than a font glyph (FR-009, FR-014)", () => {
    const tick = new RegExp(`<path fill="none" stroke="${BADGE_MARK.tick}"[^>]*d="([^"]+)"`).exec(CHECKED);
    expect(tick, "the master carries a stroked tick").not.toBeNull();
    const commands = (tick?.[1] ?? "").match(/[ML]/g) ?? [];
    expect(commands).toEqual(["M", "L", "L"]);
    expect(CHECKED).toContain('stroke-width="1.6"');
  });
});