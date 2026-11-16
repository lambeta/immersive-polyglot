import { describe, expect, it } from "vitest";
import { renderSpendRow } from "../../src/ui/popup/spend-row.js";
import type { SpendRecord } from "../../src/shared/types.js";

/** Feature 008: T12 — every refusal gets exactly one muted line, and never an amount. */

const tokens = { total: 5_500, prompt: 5_000, completion: 500, hit: 4_000, miss: 1_000 };

function unpriced(unavailable: SpendRecord["unavailable"]): SpendRecord {
  return { tokens, price: null, ...(unavailable ? { unavailable } : {}) };
}

function noteOf(record: SpendRecord): string {
  const doc = document.implementation.createHTMLDocument("panel");
  const nodes = renderSpendRow(doc, record, "en");
  expect(nodes).toHaveLength(1);
  return nodes[0]?.querySelector(".usage__note")?.textContent ?? "";
}

describe("the muted note", () => {
  it("names an unpriced provider", () => {
    expect(noteOf(unpriced("noPriceList"))).toBe("No published price for this provider.");
  });

  it("names an unpriced model by the name the reader configured", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    const record: SpendRecord = {
      tokens,
      price: null,
      unavailable: "modelNotPriced",
      model: "some-new-model",
    };
    const note = renderSpendRow(doc, record, "en")[0]?.querySelector(".usage__note")?.textContent;
    expect(note).toBe("No published price for some-new-model.");
  });

  it("names an incomplete usage report", () => {
    expect(noteOf(unpriced("usageIncomplete"))).toBe(
      "The provider did not report enough usage to price this run.",
    );
  });

  it("keeps the note on the row and still shows the tokens", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    const nodes = renderSpendRow(doc, unpriced("noPriceList"), "en");
    const text = nodes[0]?.textContent ?? "";
    expect(text).toContain("5,500 tokens spent");
    expect(nodes[0]?.querySelector(".usage__note")).not.toBeNull();
  });

  it("never shows an amount, a zero or a currency symbol when the price is refused", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    for (const reason of ["noPriceList", "modelNotPriced", "usageIncomplete"] as const) {
      const text = renderSpendRow(doc, unpriced(reason), "en")
        .map((node) => node.textContent)
        .join(" ");
      expect(text).not.toContain("¥");
      expect(text).not.toContain("$");
      expect(text).not.toContain("≈");
      expect(text).not.toMatch(/\b0\b/);
    }
  });

  it("adds no note when the run is priced", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    const priced: SpendRecord = {
      tokens,
      price: { amount: 0.00308, currency: "CNY", snapshot: "2026-11", provider: "DeepSeek" },
    };
    const nodes = renderSpendRow(doc, priced, "en");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.querySelector(".usage__note")).toBeNull();
  });
});
