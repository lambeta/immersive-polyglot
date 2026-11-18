import { describe, expect, it } from "vitest";
import { blockFromPoint, selectedBlocks } from "../../src/content/selection.js";
import { buildPage } from "./helpers.js";

function selectText(document: Document, node: Node): void {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe("a selection inside a drawing targets the drawing", () => {
  it("returns the SVG root, not the wrapper or the article", () => {
    const page = buildPage(
      '<article><p id="p">Prose paragraph</p><svg id="d"><text id="t">Return metric scores</text></svg></article>',
    );
    selectText(page.document, page.document.querySelector("#t") as Element);
    expect(selectedBlocks(page.document)).toEqual([page.document.querySelector("#d")]);
  });

  it("keeps a prose selection unchanged", () => {
    const page = buildPage('<p id="p">Prose paragraph</p>');
    selectText(page.document, page.document.querySelector("#p") as Element);
    expect(selectedBlocks(page.document)).toEqual([page.document.querySelector("#p")]);
  });

  it("returns the drawing for a point inside it", () => {
    const page = buildPage('<svg id="d"><text id="t">Return metric scores</text></svg>');
    const text = page.document.querySelector("#t") as Element;
    Object.defineProperty(page.document, "elementFromPoint", {
      configurable: true,
      value: () => text,
    });
    expect(blockFromPoint(page.document, 10, 10)).toBe(page.document.querySelector("#d"));
  });
});
