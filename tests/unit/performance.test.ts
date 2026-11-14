import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { segmentPage } from "../../src/content/segmenter.js";

/**
 * T089 / plan performance goal: segmentation of a 5,000-node page stays under 150 ms. Measured on
 * the pure function, with page construction excluded from the timing.
 */

function buildLargePage(): Element {
  const paragraphs = Array.from(
    { length: 833 },
    (_, index) =>
      `<div><h2>Section ${index}</h2><p>Paragraph ${index} describes the harbour and its traffic.</p><ul><li>Item ${index} one</li><li>Item ${index} two</li></ul></div>`,
  ).join("");
  const dom = new JSDOM(`<!doctype html><html><body><article>${paragraphs}</article></body></html>`);
  return dom.window.document.body;
}

describe("segmentation performance", () => {
  it("segments a 5,000-node page in under 150 ms", () => {
    const body = buildLargePage();
    const nodeCount = body.querySelectorAll("*").length;
    expect(nodeCount).toBeGreaterThan(4_000);

    // One warm-up pass so module-level laziness is not counted as page cost.
    segmentPage(body, { targetLang: "zh" });

    const startedAt = performance.now();
    const result = segmentPage(body, { targetLang: "zh" });
    const elapsed = performance.now() - startedAt;

    expect(result.units.length).toBeGreaterThan(1_000);
    expect(elapsed).toBeLessThan(150);
  });
});
