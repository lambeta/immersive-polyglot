import { describe, expect, it } from "vitest";
import {
  BLACK,
  WHITE,
  composite,
  contrastRatio,
  isLargeText,
  mix,
  parseColor,
  relativeLuminance,
  safeForeground,
  toCss,
  type Rgba,
} from "../../src/shared/contrast.js";

const rgb = (r: number, g: number, b: number): Rgba => ({ r, g, b, a: 1 });

describe("colour parsing", () => {
  it("parses hex, rgb, rgba and srgb forms", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#00000080")?.a).toBeCloseTo(128 / 255, 3);
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("rgba(10, 20, 30, 0.25)")).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(parseColor("rgb(255 128 0 / 50%)")).toEqual({ r: 255, g: 128, b: 0, a: 0.5 });
    expect(parseColor("color(srgb 1 0 0 / 0.5)")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseColor("")).toBeNull();
    expect(parseColor("not-a-colour")).toBeNull();
    expect(parseColor(null)).toBeNull();
  });

  it("emits an opaque css colour", () => {
    expect(toCss({ r: 12.4, g: 200.6, b: 0, a: 0.5 })).toBe("rgb(12, 201, 0)");
  });
});

describe("luminance and ratio (SC-008)", () => {
  it("matches the known anchor values", () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5);
    expect(relativeLuminance(rgb(0x77, 0x77, 0x77))).toBeCloseTo(0.1845, 3);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(rgb(0x76, 0x76, 0x76), WHITE)).toBeGreaterThan(4.5);
    expect(contrastRatio(rgb(0x80, 0x80, 0x80), WHITE)).toBeLessThan(4.5);
  });

  it("composites alpha over an opaque background", () => {
    const half = composite({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE);
    expect(half.r).toBeCloseTo(127.5, 1);
    expect(half.g).toBeCloseTo(127.5, 1);
    expect(half.b).toBeCloseTo(127.5, 1);
    expect(half.a).toBe(1);
  });

  it("mixes toward a target colour", () => {
    const mixed = mix(BLACK, WHITE, 0.5);
    expect(mixed.r).toBeCloseTo(127.5, 1);
  });

  it("classifies large text per WCAG", () => {
    expect(isLargeText(19, 400)).toBe(true);
    expect(isLargeText(18, 400)).toBe(false);
    expect(isLargeText(15, 700)).toBe(true);
    expect(isLargeText(13, 700)).toBe(false);
  });
});

describe("safe foreground", () => {
  const backdrops: { name: string; colour: Rgba }[] = [
    { name: "white", colour: WHITE },
    { name: "black", colour: BLACK },
    { name: "mid gray #777", colour: rgb(0x77, 0x77, 0x77) },
    { name: "mid gray #808080", colour: rgb(0x80, 0x80, 0x80) },
    { name: "dark navy", colour: rgb(0x21, 0x40, 0x6b) },
    { name: "pale tint", colour: rgb(0xf2, 0xf6, 0xff) },
  ];

  it("always reaches the normal-text threshold for both policies", () => {
    for (const backdrop of backdrops) {
      for (const policy of ["neutral", "hue-blend"] as const) {
        for (const inherited of [BLACK, WHITE, rgb(0x33, 0x66, 0x99)]) {
          const result = safeForeground(backdrop.colour, policy, inherited);
          expect(
            contrastRatio(result, backdrop.colour),
            `${policy} on ${backdrop.name} from ${toCss(inherited)}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("always reaches the large-text threshold", () => {
    for (const backdrop of backdrops) {
      const result = safeForeground(backdrop.colour, "neutral", WHITE, { largeText: true });
      expect(contrastRatio(result, backdrop.colour), backdrop.name).toBeGreaterThanOrEqual(3);
    }
  });

  it("returns a neutral gray for the gray policy", () => {
    const result = safeForeground(WHITE, "neutral", rgb(0x00, 0x66, 0xcc));
    expect(result.r).toBe(result.g);
    expect(result.g).toBe(result.b);
  });

  it("keeps the inherited hue for weakened when it already passes", () => {
    const inherited = rgb(0x00, 0x00, 0x00);
    const result = safeForeground(WHITE, "hue-blend", inherited);
    expect(result.r).toBe(result.g);
    expect(result.g).toBe(result.b);
    // Faded away from pure black, but still legible.
    expect(result.r).toBeGreaterThan(0);
    expect(contrastRatio(result, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to the pole when the inherited colour already fails", () => {
    const failing = rgb(0x99, 0x99, 0x99);
    const result = safeForeground(WHITE, "hue-blend", failing);
    expect(contrastRatio(result, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });

  it("is deterministic", () => {
    const first = safeForeground(rgb(0x21, 0x40, 0x6b), "neutral", WHITE);
    const second = safeForeground(rgb(0x21, 0x40, 0x6b), "neutral", WHITE);
    expect(first).toEqual(second);
  });
});
