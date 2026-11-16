import { describe, expect, it } from "vitest";
import { estimateSpend } from "../../src/shared/pricing.js";
import type { RunSpend } from "../../src/shared/pricing.js";

/**
 * Feature 008: T023 — one refusal reason, in one order, and never an amount without its basis.
 * The estimator is pure, so every combination of the three refusal conditions is decidable here.
 */

function run(overrides: Partial<RunSpend> = {}): RunSpend {
  return {
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-flash",
    targetLang: "zh",
    total: 5_500,
    peak: { hit: 0, miss: 0, out: 0 },
    offPeak: { hit: 4_000, miss: 1_000, out: 500 },
    usageIncomplete: false,
    ...overrides,
  };
}

describe("one reason, in this precedence", () => {
  it("names the provider first when the run is unpriced, unlisted and incomplete at once", () => {
    expect(
      estimateSpend(
        run({ endpoint: "https://example.test/v1", model: "mystery-model", usageIncomplete: true }),
      ),
    ).toEqual({ unavailable: "noPriceList" });
  });

  it("names the model second, ahead of an incomplete usage", () => {
    expect(estimateSpend(run({ model: "mystery-model", usageIncomplete: true }))).toEqual({
      unavailable: "modelNotPriced",
    });
  });

  it("names the incomplete usage last", () => {
    expect(estimateSpend(run({ usageIncomplete: true }))).toEqual({
      unavailable: "usageIncomplete",
    });
  });
});

describe("all or nothing", () => {
  it("refuses the run rather than pricing the part it can compute", () => {
    // The buckets hold a complete, priceable half of the run; the flag says another response could
    // not be split. A partial total would understate the bill, so no amount is produced.
    expect(
      estimateSpend(run({ usageIncomplete: true, offPeak: { hit: 0, miss: 5_000, out: 500 } })),
    ).toEqual({ unavailable: "usageIncomplete" });
  });
});

describe("an amount always carries its basis", () => {
  it("names the provider and the snapshot on every priced outcome", () => {
    const priced = estimateSpend(run());
    expect("amount" in priced).toBe(true);
    if (!("amount" in priced)) return;
    expect(priced.amount).toBeGreaterThan(0);
    expect(priced.provider).toBe("DeepSeek");
    expect(priced.snapshot).toBe("2026-11");
    expect(priced.currency).toBe("CNY");
  });
});
