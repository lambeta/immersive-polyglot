import { describe, expect, it } from "vitest";
import { isRtlLanguage } from "../../src/shared/direction.js";

describe("target-language direction", () => {
  it("classifies the right-to-left languages this product can target", () => {
    for (const lang of ["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ku", "ckb", "nqo"]) {
      expect(isRtlLanguage(lang), lang).toBe(true);
    }
  });

  it("leaves left-to-right and unknown languages alone", () => {
    for (const lang of ["en", "zh", "ja", "ko", "fr", "de", "es", "auto", "", "abc"]) {
      expect(isRtlLanguage(lang), lang).toBe(false);
    }
  });

  it("handles region subtags and case", () => {
    expect(isRtlLanguage("ar-EG")).toBe(true);
    expect(isRtlLanguage("HE-il")).toBe(true);
    expect(isRtlLanguage("zh-Hans-CN")).toBe(false);
  });
});
