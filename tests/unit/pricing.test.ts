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

  it("charges cached input at the hit rate and only the uncached rest at the miss rate", () => {
    // The same 5,000 input tokens, priced two ways. The published list makes a hit 50x cheaper
    // than a miss, so a run that charged one rate for both could not match either figure.
    const allCached = estimateSpend(spend({ offPeak: { hit: 5_000, miss: 0, out: 0 } }));
    const allUncached = estimateSpend(spend({ offPeak: { hit: 0, miss: 5_000, out: 0 } }));
    expect("amount" in allCached && allCached.amount).toBeCloseTo((5_000 * 0.02) / 1_000_000, 12);
    expect("amount" in allUncached && allUncached.amount).toBeCloseTo(
      (5_000 * 1) / 1_000_000,
      12,
    );
    expect("amount" in allUncached && allUncached.amount).toBeCloseTo(
      ("amount" in allCached ? allCached.amount : 0) * 50,
      12,
    );
  });

  it("prices a report with no cache split as if every input token missed (FR-008)", () => {
    // What the job records for a report without cache counters: hit 0, miss = prompt. Charged at
    // the miss rate it is dearer than the fully cached twin, which is the direction FR-008 needs.
    const unsplit = estimateSpend(spend({ offPeak: { hit: 0, miss: 5_000, out: 500 } }));
    const cached = estimateSpend(spend());
    expect("amount" in unsplit && unsplit.amount).toBeCloseTo(0.007, 12);
    expect("amount" in unsplit && unsplit.amount).toBeGreaterThan(
      "amount" in cached ? cached.amount : 0,
    );
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

  it("passes six decimals only where six would read as zero (FR-013, amended 2026-11-16)", () => {
    // Six is the normal ceiling: one off-peak uncached token is exactly ¥0.000001.
    expect(formatAmount(0.000001)).toBe("0.000001");
    // Below it the decimals a non-zero estimate needs win over the ceiling, up to the eight that
    // the smallest charge one token can produce (an off-peak cache hit) requires.
    expect(formatAmount(0.0000004)).toBe("0.0000004");
    expect(formatAmount(0.00000002)).toBe("0.00000002");
    expect(formatAmount(0.00000002, "de")).toBe("0,00000002");
    for (const amount of [0.0000004, 0.00000002]) {
      expect(formatAmount(amount)).not.toBe("0");
      expect((formatAmount(amount).split(".")[1] ?? "").length).toBeLessThanOrEqual(8);
    }
  });

  it("uses the interface language's separators", () => {
    expect(formatAmount(1234.5, "en")).toBe("1,234.5");
    expect(formatAmount(1234.5, "de")).toBe("1.234,5");
  });
});
