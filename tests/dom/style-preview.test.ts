import { describe, expect, it } from "vitest";
import { DISPLAY_STYLES } from "../../src/shared/display-styles.js";
import { previewIcon, previewIconForAll } from "../../src/ui/shared/style-preview.js";
import { t } from "../../src/ui/shared/i18n.js";

describe("style preview icons (FR-007, FR-008, FR-010)", () => {
  it("gives every catalogued style exactly one icon", () => {
    const icons = previewIconForAll(document);
    expect(icons.size).toBe(15);
    for (const style of DISPLAY_STYLES) expect(icons.has(style.id), style.id).toBe(true);
  });

  it("labels each icon with the style name and exposes it as an image", () => {
    for (const style of DISPLAY_STYLES) {
      const icon = previewIcon(style.id, document);
      expect(icon.tagName.toLowerCase()).toBe("svg");
      expect(icon.getAttribute("role")).toBe("img");
      expect(icon.getAttribute("focusable")).toBe("false");
      const titleId = icon.getAttribute("aria-labelledby") ?? "";
      expect(titleId.length).toBeGreaterThan(0);
      const title = icon.querySelector("title");
      expect(title?.id).toBe(titleId);
      expect(title?.textContent).toBe(t(style.nameKey));
      expect(icon.getAttribute("viewBox")).toBe("0 0 24 16");
    }
  });

  it("draws a visible sample for every style", () => {
    for (const style of DISPLAY_STYLES) {
      const icon = previewIcon(style.id, document);
      expect(icon.querySelectorAll("rect, line, path").length, style.id).toBeGreaterThan(0);
    }
  });

  it("keeps the fifteen icon descriptors pairwise distinct (SC-001)", () => {
    const descriptors = DISPLAY_STYLES.map((style) => JSON.stringify(style.icon));
    expect(new Set(descriptors).size).toBe(15);
  });

  it("uses unique ids so two pickers on one page do not collide", () => {
    const first = previewIcon("highlight", document);
    const second = previewIcon("highlight", document);
    expect(first.getAttribute("aria-labelledby")).not.toBe(second.getAttribute("aria-labelledby"));
  });

  it("keeps the mark colour-independent (currentColor plus a shape)", () => {
    const icon = previewIcon("marker", document);
    expect(icon.querySelectorAll("[fill='currentColor'], [stroke='currentColor']").length).toBeGreaterThan(0);
    // The band is a shape of its own, not only a colour change.
    expect(icon.querySelectorAll("rect").length).toBeGreaterThan(2);
  });
});
describe("divider preview icon (feature 004)", () => {
  it("draws a thin dashed vertical stroke, not a horizontal rule", () => {
    const icon = previewIcon("divider", document);
    const lines = Array.from(icon.querySelectorAll("line"));
    const dashed = lines.find((line) => line.getAttribute("stroke-dasharray"));
    expect(dashed).toBeTruthy();
    expect(dashed?.getAttribute("stroke-dasharray")).toBe("3 2");

    const x1 = Number(dashed?.getAttribute("x1"));
    const x2 = Number(dashed?.getAttribute("x2"));
    const y1 = Number(dashed?.getAttribute("y1"));
    const y2 = Number(dashed?.getAttribute("y2"));
    expect(Math.abs(y2 - y1)).toBeGreaterThan(Math.abs(x2 - x1));

    for (const line of lines) {
      const dx = Math.abs(Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")));
      const dy = Math.abs(Number(line.getAttribute("y2")) - Number(line.getAttribute("y1")));
      expect(dx, "no horizontal line in the divider icon").toBeLessThan(dy);
    }
  });

  it("is thinner than the quote bar it must be distinguished from", () => {
    const divider = previewIcon("divider", document);
    const quote = previewIcon("quote", document);
    const dividerStroke = Number(
      divider.querySelector("line[stroke-dasharray]")?.getAttribute("stroke-width") ?? "0",
    );
    const quoteBarWidth = Number(quote.querySelector("rect[fill='currentColor']")?.getAttribute("width") ?? "0");
    expect(dividerStroke).toBeGreaterThan(0);
    expect(dividerStroke).toBeLessThanOrEqual(quoteBarWidth / 2);
  });
});
