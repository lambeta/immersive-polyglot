import { describe, expect, it } from "vitest";
import { renderSpendRow } from "../../src/ui/popup/spend-row.js";
import type { SpendRecord } from "../../src/shared/types.js";

/** Feature 008: T12, T16 — the row's content, order and basis. */

function priced(overrides: Partial<SpendRecord> = {}): SpendRecord {
  return {
    tokens: { total: 5_500, prompt: 5_000, completion: 500, hit: 4_000, miss: 1_000 },
    price: { amount: 0.00308, currency: "CNY", snapshot: "2026-11", provider: "DeepSeek" },
    ...overrides,
  };
}

describe("the spend row", () => {
  it("shows tokens and price on one row with the basis on it", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    const nodes = renderSpendRow(doc, priced(), "en");

    expect(nodes).toHaveLength(1);
    const row = nodes[0];
    expect(row?.className).toBe("usage__spend");
    const text = row?.textContent ?? "";
    expect(text).toContain("5,500 tokens spent");
    expect(text).toContain("≈ ¥0.0031");
    expect(text).toContain("DeepSeek · 2026-11");
    expect(row?.querySelector(".usage__basis")?.textContent).toBe("DeepSeek · 2026-11");
  });

  it("shows nothing at all when the run reported no usage", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    expect(renderSpendRow(doc, undefined, "en")).toEqual([]);
  });

  it("renders a measured zero as zero rather than hiding it", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    const zero: SpendRecord = {
      tokens: { total: 0, prompt: 0, completion: 0, hit: 0, miss: 0 },
      price: { amount: 0, currency: "CNY", snapshot: "2026-11", provider: "DeepSeek" },
    };
    const nodes = renderSpendRow(doc, zero, "en");
    const text = nodes[0]?.textContent ?? "";
    expect(text).toContain("0 tokens spent");
    expect(text).toContain("≈ ¥0");
  });

  it("uses the currency the run priced in, and the interface locale's separators", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    const usd = priced({
      price: { amount: 1234.5, currency: "USD", snapshot: "2026-11", provider: "DeepSeek" },
    });
    expect(renderSpendRow(doc, usd, "en")[0]?.textContent).toContain("≈ $1,234.5");
    const german = priced({
      price: { amount: 1234.5, currency: "CNY", snapshot: "2026-11", provider: "DeepSeek" },
    });
    expect(renderSpendRow(doc, german, "de")[0]?.textContent).toContain("≈ ¥1.234,5");
  });
});
