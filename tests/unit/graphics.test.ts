import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  graphicRootOf,
  isGraphicLabel,
  isGraphicRoot,
  isLabelPhrase,
  isOpaqueGraphic,
  labelRootsInGraphic,
  labelText,
} from "../../src/content/graphics.js";

function docOf(html: string): Document {
  return new JSDOM(`<body>${html}</body>`).window.document as Document;
}

describe("the phrase rule", () => {
  it("accepts the reported phrases and refuses single tokens, numbers and style text", () => {
    for (const text of [
      "Curate ~100 goldens (inputs & expected outputs)",
      "Define 3-5 key metrics",
      "Update prompt, model, or logic",
      "Generate outputs for test cases",
      "Return metric scores",
      "[Iterate until pass]",
      "Warning!",
    ]) {
      expect(isLabelPhrase(text), text).toBe(true);
    }
    for (const text of [
      "Agent",
      "Evaluator",
      "Dataset",
      "Developer",
      "loop",
      "3-5",
      "1",
      "yes/no",
      "评估数据集",
      "E",
    ]) {
      expect(isLabelPhrase(text), text).toBe(false);
    }
  });

  it("uses a space at a wrapped line and none inside an inline styled word", () => {
    const doc = docOf(`
      <svg>
        <text id="wrapped"><tspan x="0" dy="0">Generate outputs</tspan><tspan x="0" dy="20">for test cases</tspan></text>
        <text id="inline"><tspan>A</tspan><tspan>gent</tspan></text>
      </svg>`);
    expect(labelText(doc.querySelector("#wrapped") as Element)).toBe("Generate outputs for test cases");
    expect(labelText(doc.querySelector("#inline") as Element)).toBe("Agent");
  });
});

describe("graphic roots and label roots", () => {
  it("classifies roots and descendants", () => {
    const doc = docOf(`
      <svg id="d"><text id="t">Return metric scores</text></svg>
      <canvas id="c"></canvas><math id="m"></math><iframe id="f"></iframe>`);
    const svg = doc.querySelector("#d") as Element;
    const text = doc.querySelector("#t") as Element;
    expect(isGraphicRoot(svg)).toBe(true);
    expect(isGraphicLabel(text)).toBe(true);
    expect(isGraphicLabel(svg)).toBe(false);
    expect(graphicRootOf(text)).toBe(svg);
    expect(isOpaqueGraphic(doc.querySelector("#c") as Element)).toBe(true);
    expect(isOpaqueGraphic(svg)).toBe(false);
  });

  it("returns only rendered labels: no style, title, desc, defs, hidden or opted-out text", () => {
    const doc = docOf(`
      <svg id="d">
        <style>#d{font-family:inherit;}</style>
        <title>Agent</title>
        <desc>Return metric scores</desc>
        <defs><text>Definition label</text></defs>
        <text id="visible">Return metric scores</text>
        <text id="hidden" hidden>Hidden phrase</text>
        <text id="optout" translate="no">Opted out phrase</text>
        <foreignObject><div id="html">HTML label text</div></foreignObject>
      </svg>`);
    const roots = labelRootsInGraphic(doc.querySelector("#d") as Element).map((root) => root.id);
    expect(roots).toEqual(["visible", "html"]);
  });
});
