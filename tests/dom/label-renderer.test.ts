import { describe, expect, it } from "vitest";
import { labelText } from "../../src/content/graphics.js";
import { renderLabel, type LabelMeasure } from "../../src/content/label-renderer.js";
import { Journal, domHash, restorePage } from "../../src/content/restorer.js";
import { buildPage } from "./helpers.js";

/** A deterministic stand-in for getBBox: 0.55 em per character, 1.2 em tall. */
const measure: LabelMeasure = (root) => {
  const text = labelText(root);
  const size = Number.parseFloat((root as unknown as { style: CSSStyleDeclaration }).style.fontSize);
  const font = Number.isFinite(size) && size > 0 ? size : 16;
  return { width: Math.max(1, text.length * font * 0.55), height: font * 1.2 };
};

/** A fixed-width box that wraps every twelve characters. */
const wrapped: LabelMeasure = (root) => {
  const text = labelText(root);
  const size = Number.parseFloat((root as unknown as { style: CSSStyleDeclaration }).style.fontSize);
  const font = Number.isFinite(size) && size > 0 ? size : 16;
  return { width: 200, height: Math.ceil(text.length / 12) * font };
};

function svgTextPage(source = "Return metric scores") {
  const page = buildPage(
    `<svg><text id="label" style="font-size: 16px">${source}</text></svg>`,
  );
  const root = page.document.querySelector("#label") as SVGTextElement;
  return { page, root };
}

describe("in-place label rendering", () => {
  it("writes the translation into the run, journals text and restores the exact DOM", () => {
    const { page, root } = svgTextPage();
    const baseline = domHash(page.body);
    const journal = new Journal();

    const result = renderLabel(journal, root, "返回指标分数", {
      targetLang: "zh",
      measure,
      view: page.window,
    });

    expect(result.applied).toBe(true);
    expect(root.textContent).toBe("返回指标分数");
    expect(root.style.fontSize).toBe("16px");
    expect(page.body.querySelectorAll("[data-ipt]")).toHaveLength(0);
    expect(journal.entries().some((entry) => entry.kind === "text")).toBe(true);

    restorePage(journal, { document: page.document });
    expect(root.textContent).toBe("Return metric scores");
    expect(domHash(page.body)).toBe(baseline);
  });

  it("shrinks only the label when the translation is wider, down to the floor", () => {
    const { page, root } = svgTextPage();
    const journal = new Journal();
    const translation = "译".repeat(24);

    const result = renderLabel(journal, root, translation, {
      targetLang: "zh",
      measure,
      view: page.window,
    });

    expect(result.applied).toBe(true);
    expect(root.textContent).toBe(translation);
    const size = Number.parseFloat(root.style.fontSize);
    expect(size).toBeLessThan(16);
    expect(size).toBeGreaterThanOrEqual(12);
    expect(domHash(root)).not.toBe("");
  });

  it("keeps the source text and the original style when it cannot fit at the floor", () => {
    const { page, root } = svgTextPage();
    const baseline = domHash(page.body);
    const journal = new Journal();

    const result = renderLabel(journal, root, "译".repeat(40), {
      targetLang: "zh",
      measure,
      view: page.window,
    });

    expect(result.applied).toBe(false);
    expect(root.textContent).toBe("Return metric scores");
    expect(root.style.fontSize).toBe("16px");
    restorePage(journal, { document: page.document });
    expect(domHash(page.body)).toBe(baseline);
  });

  it("sets direction for an RTL target and restores it", () => {
    const { page, root } = svgTextPage();
    const baseline = domHash(page.body);
    const journal = new Journal();

    const result = renderLabel(journal, root, "مؤشرات", {
      targetLang: "ar",
      measure,
      view: page.window,
    });

    expect(result.applied).toBe(true);
    expect(root.style.direction).toBe("rtl");
    restorePage(journal, { document: page.document });
    expect(root.style.direction).toBe("");
    expect(domHash(page.body)).toBe(baseline);
  });

  it("falls back rather than growing a wrapped HTML label taller", () => {
    const page = buildPage('<div id="html" style="font-size: 16px">Short label</div>');
    const root = page.document.querySelector("#html") as HTMLElement;
    const journal = new Journal();

    const result = renderLabel(journal, root, "A very long translation that wraps many times", {
      targetLang: "zh",
      measure: wrapped,
      view: page.window,
    });

    expect(result.applied).toBe(false);
    expect(root.textContent).toBe("Short label");
    expect(root.style.fontSize).toBe("16px");
    restorePage(journal, { document: page.document });
  });

  it("refuses an empty translation", () => {
    const { page, root } = svgTextPage();
    const journal = new Journal();
    expect(renderLabel(journal, root, "   ", { targetLang: "zh", measure, view: page.window })).toEqual({
      applied: false,
    });
    expect(root.textContent).toBe("Return metric scores");
    expect(journal.entries()).toHaveLength(0);
  });
});
