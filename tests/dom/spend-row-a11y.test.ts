import { describe, expect, it } from "vitest";
import { renderSpendRow } from "../../src/ui/popup/spend-row.js";
import type { SpendRecord } from "../../src/shared/types.js";

/** Feature 008: T13 — silent updates, complete labels, basis reachable from the row. */

const priced: SpendRecord = {
  tokens: { total: 5_500, prompt: 5_000, completion: 500, hit: 4_000, miss: 1_000 },
  price: { amount: 0.00308, currency: "CNY", snapshot: "2026-11", provider: "DeepSeek" },
};

describe("accessibility of the spend row", () => {
  it("carries no live region, so a rising figure never interrupts", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    const nodes = renderSpendRow(doc, priced, "en");
    const record = doc.createElement("ul");
    for (const node of nodes) record.append(node);
    expect(record.querySelector("[aria-live]")).toBeNull();
    expect(record.querySelector("[role='status']")).toBeNull();
    expect(record.querySelector("[role='alert']")).toBeNull();
  });

  it("reads as one phrase holding both figures and their basis", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    const row = renderSpendRow(doc, priced, "en")[0];
    const text = row?.textContent ?? "";
    expect(text).toContain("5,500 tokens spent");
    expect(text).toContain("≈ ¥0.0031");
    expect(text).toContain("DeepSeek list · 2026-11");
    // One list item: a screen reader hears a single fact, not three unlabelled numbers.
    expect(row?.tagName).toBe("LI");
  });

  it("keeps the update silent over twenty changes", () => {
    const doc = document.implementation.createHTMLDocument("panel");
    const record = doc.createElement("ul");
    for (let step = 1; step <= 20; step += 1) {
      const snapshot = doc.createElement("div");
      for (const node of renderSpendRow(
        doc,
        {
          ...priced,
          tokens: { ...priced.tokens, total: step * 5_500 },
        },
        "en",
      )) {
        snapshot.append(node);
      }
      expect(snapshot.querySelector("[aria-live]")).toBeNull();
    }
    expect(record.children.length).toBe(0);
  });
});
