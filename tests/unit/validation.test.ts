import { describe, expect, it } from "vitest";
import {
  validateFontFamily,
  validateFontScale,
  validateTypography,
} from "../../src/shared/validation.js";

const refusedFont = [
  "Arial; color: red",
  "url(https://example.test/face.woff2)",
  "Arial }",
  '"unterminated',
  "x".repeat(201),
];

describe("translation font-family validation (FR-017)", () => {
  it("accepts the documented family examples", () => {
    for (const value of [
      "",
      "   ",
      "Georgia, serif",
      '"Source Han Serif SC", "Noto Serif SC", serif',
      "system-ui",
      "思源宋体",
      "ui-monospace, SFMono-Regular, monospace",
      "Georgia, serif,",
    ]) {
      expect(validateFontFamily(value), value).toBeNull();
    }
  });

  it("refuses values that could escape the setting or download a font", () => {
    for (const value of refusedFont) {
      expect(validateFontFamily(value), value).toEqual({
        field: "fontFamily",
        messageKey: "displayFontInvalid",
      });
    }
  });

  it("refuses control characters and an empty quoted name", () => {
    expect(validateFontFamily("Georgia\u0000, serif")).not.toBeNull();
    expect(validateFontFamily('""')).not.toBeNull();
    expect(validateFontFamily("'Arial'")).toBeNull();
  });
});

describe("translation font-size validation (FR-018)", () => {
  it("accepts every step from 50 to 200", () => {
    for (let value = 50; value <= 200; value += 5) {
      expect(validateFontScale(value), String(value)).toBeNull();
    }
  });

  it("refuses non-numbers, out-of-range values and off-step values", () => {
    for (const value of [49, 201, 101, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateFontScale(value), String(value)).toEqual({
        field: "fontScale",
        messageKey: "displayFontSizeInvalid",
      });
    }
  });
});

describe("validateTypography (FR-017, FR-018)", () => {
  it("returns no issue for a valid pair and both issues for an invalid pair", () => {
    expect(validateTypography({ fontFamily: "Georgia, serif", fontScale: 125 })).toEqual([]);
    expect(
      validateTypography({ fontFamily: "Arial; x", fontScale: 999 }).map((issue) => issue.field),
    ).toEqual(["fontFamily", "fontScale"]);
  });
});
