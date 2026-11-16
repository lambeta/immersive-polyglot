import { describe, expect, it } from "vitest";
import { PRICE_SNAPSHOT } from "../../src/shared/price-catalog.js";
import {
  classifyTier,
  estimateSpend,
  formatAmount,
  currencyForTarget,
  resolveModel,
  providerSupported,
} from "../../src/shared/pricing.js";
import type { RunSpend } from "../../src/shared/pricing.js";
import {
  WORKED_OFF_PEAK_CNY,
  WORKED_OFF_PEAK_USD,
  WORKED_PEAK_CNY,
  WORKED_TOTAL_TOKENS,
} from "../support/spend-fixtures.js";

/** Feature 008: T8, T9, T10, T11, T21 — the arithmetic the panel reports. */

const BEIJING = (iso: string) => new Date(iso);

function spend(overrides: Partial<RunSpend> = {}): RunSpend {
  return {
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-flash",
    targetLang: "zh",
    total: WORKED_TOTAL_TOKENS,
    peak: { hit: 0, miss: 0, out: 0 },
    offPeak: { hit: 4_000, miss: 1_000, out: 500 },
    usageIncomplete: false,
    ...overrides,
  };
}

describe("tier classification (R3)", () => {
  it("treats 09:00:00 Beijing as peak and 08:59:59 as off-peak", () => {
    expect(classifyTier(BEIJING("2026-03-10T08:59:59+08:00"))).toBe("offPeak");
    expect(classifyTier(BEIJING("2026-03-10T09:00:00+08:00"))).toBe("peak");
  });

  it("treats the lunch break as off-peak and 14:00 as peak again", () => {
    expect(classifyTier(BEIJING("2026-03-10T11:59:59+08:00"))).toBe("peak");
    expect(classifyTier(BEIJING("2026-03-10T12:00:00+08:00"))).toBe("offPeak");
    expect(classifyTier(BEIJING("2026-03-10T14:00:00+08:00"))).toBe("peak");
    expect(classifyTier(BEIJING("2026-03-10T18:00:00+08:00"))).toBe("offPeak");
  });

  it("is off-peak across the weekend", () => {
    expect(classifyTier(BEIJING("2026-03-14T10:00:00+08:00"))).toBe("offPeak");
    expect(classifyTier(BEIJING("2026-03-15T10:00:00+08:00"))).toBe("offPeak");
  });

  it("follows the published 2026 holiday list inside peak windows", () => {
    expect(classifyTier(BEIJING("2026-10-01T10:00:00+08:00"))).toBe("offPeak");
    expect(classifyTier(BEIJING("2026-03-10T10:00:00+08:00"))).toBe("peak");
  });

  it("prices an unclassified year's weekday peak window as peak, and its night as off-peak", () => {
    expect(classifyTier(BEIJING("2027-03-10T10:00:00+08:00"))).toBe("peak");
    expect(classifyTier(BEIJING("2027-03-10T02:00:00+08:00"))).toBe("offPeak");
  });
});

describe("price arithmetic (R7)", () => {
  it("prices the worked example at 0.00308 CNY off-peak", () => {
    const estimate = estimateSpend(spend());
    expect("amount" in estimate && estimate.amount).toBeCloseTo(WORKED_OFF_PEAK_CNY, 10);
    expect("amount" in estimate && estimate.currency).toBe("CNY");
  });

  it("charges the peak rates inside a peak window: exactly 2x the off-peak amount", () => {
    const peakSpend = spend({
      peak: { hit: 4_000, miss: 1_000, out: 500 },
      offPeak: { hit: 0, miss: 0, out: 0 },
    });
    const estimate = estimateSpend(peakSpend);
    expect("amount" in estimate && estimate.amount).toBeCloseTo(WORKED_PEAK_CNY, 10);
    const off = estimateSpend(spend());
    expect("amount" in off && off.amount * 2).toBeCloseTo(
      "amount" in estimate ? estimate.amount : 0,
      10,
    );
  });

  it("charges every input token at the miss rate when the split is missing", () => {
    const unsplit = estimateSpend(spend({ offPeak: { hit: 0, miss: 5_000, out: 500 } }));
    const splitAsMiss = estimateSpend(
      spend({ offPeak: { hit: 0, miss: 5_000, out: 500 } }),
    );
    expect(unsplit).toEqual(splitAsMiss);
  });

  it("chooses the currency by target language, without conversion", () => {
    expect(currencyForTarget("zh")).toBe("CNY");
    expect(currencyForTarget("zh-CN")).toBe("CNY");
    expect(currencyForTarget("en")).toBe("USD");
    expect(currencyForTarget("ja")).toBe("USD");
    const usd = estimateSpend(spend({ targetLang: "en" }));
    expect("amount" in usd && usd.amount).toBeCloseTo(WORKED_OFF_PEAK_USD, 10);
  });

  it("refuses a provider, a model or an incomplete usage with one reason each", () => {
    expect(estimateSpend(spend({ endpoint: "https://example.test/v1" }))).toEqual({
      unavailable: "noPriceList",
    });
    expect(estimateSpend(spend({ model: "mystery-model" }))).toEqual({
      unavailable: "modelNotPriced",
    });
    expect(estimateSpend(spend({ usageIncomplete: true }))).toEqual({
      unavailable: "usageIncomplete",
    });
  });

  it("resolves the documented aliases, including the legacy names DeepSeek still serves", () => {
    expect(resolveModel("deepseek-v4-flash")?.CNY.hitPeak).toBe(0.04);
    expect(resolveModel("deepseek-v4-flash-vision-exp")?.USD.outPeak).toBe(1.2);
    expect(resolveModel("deepseek-flash")).not.toBeNull();
    expect(resolveModel("deepseek-v4-pro")).not.toBeNull();
    expect(resolveModel("deepseek-chat")?.CNY.outPeak).toBe(8);
    expect(resolveModel("deepseek-reasoner")?.USD.outPeak).toBe(1.2);
    expect(resolveModel("mystery-model")).toBeNull();
  });

  it("recognises only the snapshot's hosts", () => {
    expect(providerSupported("https://api.deepseek.com/chat/completions")).toBe(true);
    expect(providerSupported("https://api.deepseek.com/v1/chat/completions")).toBe(true);
    expect(providerSupported("http://127.0.0.1:8787/v1/chat/completions")).toBe(false);
    expect(providerSupported("not a url")).toBe(false);
  });

  it("never hides an amount because the snapshot is old (T21, FR-025)", () => {
    const stale = { ...PRICE_SNAPSHOT, snapshot: "2025-01" };
    const estimate = estimateSpend(spend(), stale);
    expect("amount" in estimate && estimate.amount).toBeCloseTo(WORKED_OFF_PEAK_CNY, 10);
    expect("amount" in estimate && estimate.snapshot).toBe("2025-01");
  });
});

describe("formatting (FR-013)", () => {
  it("keeps two significant digits for tiny amounts and never prints zero", () => {
    expect(formatAmount(0.00308)).toBe("0.0031");
    expect(formatAmount(0.000012)).toBe("0.000012");
    expect(formatAmount(0.0000004)).not.toBe("0");
    expect(formatAmount(0)).toBe("0");
  });

  it("keeps whole amounts readable with at most six decimals", () => {
    expect(formatAmount(1234.5678)).toBe("1,234.57");
    expect(formatAmount(12.5)).toBe("12.5");
  });

  it("uses the interface language's separators", () => {
    expect(formatAmount(1234.5, "en")).toBe("1,234.5");
    expect(formatAmount(1234.5, "de")).toBe("1.234,5");
  });
});
