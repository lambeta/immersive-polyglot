import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { blockFromPoint, selectedBlocks } from "../../src/content/selection.js";
import { Renderer } from "../../src/content/renderer.js";
import { Journal } from "../../src/content/restorer.js";

/**
 * T077 / FR-013: a selection-only translation touches nothing outside the selection, and a single
 * block is rendered in place through the same renderer the full-page job uses.
 */

function page(html: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: "https://docs.example.test/guide",
    pretendToBeVisual: true,
  });
  return { window: dom.window as unknown as Window & typeof globalThis, document: dom.window.document };
}

function selectContents(window: Window, element: Element): void {
  const document = window.document;
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe("selection scope", () => {
  it("returns only the block the selection covers", () => {
    const { window, document } = page(
      "<article><p id='a'>First passage</p><p id='b'>Second passage</p><p id='c'>Third passage</p></article>",
    );
    const target = document.querySelector("#b") as Element;
    selectContents(window, target);

    expect(selectedBlocks(document)).toEqual([target]);
  });

  it("returns every block the selection spans, in document order", () => {
    const { window, document } = page(
      "<article><p id='a'>First</p><p id='b'>Second</p><p id='c'>Third</p></article>",
    );
    const article = document.querySelector("article") as Element;
    const range = document.createRange();
    range.setStart(document.querySelector("#a")?.firstChild ?? article, 0);
    range.setEnd(document.querySelector("#c")?.firstChild ?? article, 3);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const blocks = selectedBlocks(document).map((block) => block.id);
    expect(blocks).toEqual(["a", "b", "c"]);
  });

  it("refuses an empty selection instead of translating the whole page", () => {
    const { window, document } = page("<article><p>Only passage</p></article>");
    window.getSelection()?.removeAllRanges();
    expect(selectedBlocks(document)).toEqual([]);
  });

  it("a single translated block is rendered in place and nothing else changes", () => {
    const { window, document } = page(
      "<article><p id='a'>First passage</p><p id='b'>Second passage</p></article>",
    );
    const source = document.querySelector("#b") as Element;
    const journal = new Journal();
    const renderer = new Renderer(journal, {
      displayMode: "bilingual",
      targetLang: "zh",
      view: window,
    });

    renderer.renderUnit({ id: "b", targetLang: "zh" }, "第二段", source);

    expect(document.querySelectorAll('[data-ipt="target"]')).toHaveLength(1);
    expect(source.nextElementSibling?.textContent).toBe("第二段");
    const untouched = document.querySelector("#a") as Element;
    expect(untouched.hasAttribute("data-ipt")).toBe(false);
    expect(untouched.nextElementSibling?.id).toBe("b");
  });

  it("ignores a translation block when resolving a block under the pointer", () => {
    const { window, document } = page("<article><p id='a'>First</p></article>");
    const source = document.querySelector("#a") as Element;
    const renderer = new Renderer(new Journal(), { displayMode: "bilingual", targetLang: "zh", view: window });
    const target = renderer.renderUnit({ id: "a" }, "第一", source);

    // jsdom has no layout, so elementFromPoint is stubbed to return our own translation block.
    document.elementFromPoint = () => target;
    expect(blockFromPoint(document, 10, 10)).toBeNull();
  });
});
