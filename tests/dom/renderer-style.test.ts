import { describe, expect, it } from "vitest";
import { Renderer } from "../../src/content/renderer.js";
import { Journal, domHash } from "../../src/content/restorer.js";
import { DISPLAY_STYLES } from "../../src/shared/display-styles.js";
import type { DisplayStyleId } from "../../src/shared/types.js";
import { buildPage, nodesIn } from "./helpers.js";

const unit = { id: "u-1", targetLang: "zh" };

function setup(
  html: string,
  mode: "bilingual" | "above" | "only" = "bilingual",
  style: DisplayStyleId = "none",
) {
  const page = buildPage(html);
  const journal = new Journal();
  const renderer = new Renderer(journal, {
    displayMode: mode,
    targetLang: "zh",
    displayStyle: style,
    view: page.window,
  });
  return { ...page, journal, renderer };
}

const ARTICLE = "<article><p id='p1'>Hello</p><p id='p2'>World</p></article>";

describe("style attribute application (FR-002, FR-003)", () => {
  it("marks every rendered block, including the default none", () => {
    const { body, renderer } = setup(ARTICLE);
    const first = body.querySelector("#p1") as HTMLElement;
    const second = body.querySelector("#p2") as HTMLElement;
    const a = renderer.renderUnit({ id: "a" }, "你好", first);
    const b = renderer.renderUnit({ id: "b" }, "世界", second);

    expect(a.getAttribute("data-ipt-style")).toBe("none");
    expect(b.getAttribute("data-ipt-style")).toBe("none");
  });

  it("applies the resolved style supplied at construction", () => {
    const { body, renderer } = setup(ARTICLE, "bilingual", "highlight");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);
    expect(target.getAttribute("data-ipt-style")).toBe("highlight");
  });

  it("switches in place without re-inserting or moving nodes", () => {
    const { body, renderer } = setup(ARTICLE);
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);
    const countBefore = nodesIn(body);

    renderer.setDisplayStyle("quote");

    expect(renderer.renderedElement(source)).toBe(target);
    expect(target.isConnected).toBe(true);
    expect(target.getAttribute("data-ipt-style")).toBe("quote");
    expect(nodesIn(body)).toBe(countBefore);
  });

  it("treats re-applying the current style as a no-op (FR-016)", () => {
    const { body, journal, renderer } = setup(ARTICLE, "bilingual", "marker");
    const source = body.querySelector("#p1") as HTMLElement;
    renderer.renderUnit(unit, "你好", source);
    const before = journal.size;
    renderer.setDisplayStyle("marker");
    expect(journal.size).toBe(before);
  });

  it("does not grow the journal when switching twenty times (SC-009)", () => {
    const { body, journal, renderer } = setup(ARTICLE);
    const source = body.querySelector("#p1") as HTMLElement;
    renderer.renderUnit(unit, "你好", source);
    renderer.setDisplayStyle("highlight");
    const afterFirstSwitch = journal.size;

    for (let index = 0; index < 20; index += 1) {
      renderer.setDisplayStyle(index % 2 === 0 ? "quote" : "marker");
    }

    expect(journal.size).toBe(afterFirstSwitch);
    expect(renderer.displayStyle).toBe("marker");
  });

  it("resolves an unknown style to none instead of failing (FR-020)", () => {
    const { body, renderer } = setup(ARTICLE, "bilingual", "highlight");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);
    renderer.setDisplayStyle("not-a-style");
    expect(target.getAttribute("data-ipt-style")).toBe("none");
  });

  it("keeps the translation text and language untouched by styling", () => {
    const { body, renderer } = setup(ARTICLE);
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);
    renderer.setDisplayStyle("divider");
    expect(target.textContent).toBe("你好");
    expect(target.getAttribute("lang")).toBe("zh");
    expect(source.textContent).toBe("Hello");
  });
});

describe("style and display modes (FR-006)", () => {
  it("keeps the style on the block in every mode", () => {
    for (const mode of ["bilingual", "above", "only"] as const) {
      const { body, renderer } = setup(ARTICLE, mode, "border-solid");
      const source = body.querySelector("#p1") as HTMLElement;
      const target = renderer.renderUnit(unit, "你好", source);
      expect(target.getAttribute("data-ipt-style")).toBe("border-solid");
    }
  });

  it("above still places the translation before the source with a style applied", () => {
    const { body, renderer } = setup(ARTICLE, "above", "highlight");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);
    expect(source.previousElementSibling).toBe(target);
    expect(source.hasAttribute("hidden")).toBe(false);
  });

  it("only still hides the source with a style applied", () => {
    const { body, renderer } = setup(ARTICLE, "only", "quote");
    const source = body.querySelector("#p1") as HTMLElement;
    renderer.renderUnit(unit, "你好", source);
    expect(source.hasAttribute("hidden")).toBe(true);
  });
});

describe("concealment styles (FR-012, FR-018)", () => {
  it("makes a blurred translation focusable and marks it concealed", () => {
    const { body, renderer } = setup(ARTICLE, "bilingual", "blur");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    expect(target.getAttribute("data-ipt-conceal")).toBe("true");
    expect(target.getAttribute("tabindex")).toBe("0");
  });

  it("does not make a decorative translation focusable", () => {
    const { body, renderer } = setup(ARTICLE, "bilingual", "highlight");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    expect(target.hasAttribute("data-ipt-conceal")).toBe(false);
    expect(target.hasAttribute("tabindex")).toBe(false);
  });

  it("adds and removes the attributes when switching between styles", () => {
    const { body, renderer } = setup(ARTICLE, "bilingual", "blur");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    renderer.setDisplayStyle("quote");
    expect(target.hasAttribute("data-ipt-conceal")).toBe(false);
    expect(target.hasAttribute("tabindex")).toBe(false);

    renderer.setDisplayStyle("transparency");
    expect(target.getAttribute("data-ipt-conceal")).toBe("true");
    expect(target.getAttribute("tabindex")).toBe("0");
  });

  it("keeps the text, language and reading order untouched", () => {
    const { body, renderer } = setup(ARTICLE, "bilingual", "weakened");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    expect(target.textContent).toBe("你好");
    expect(target.getAttribute("lang")).toBe("zh");
    expect(target.getAttribute("role")).toBeNull();
    expect(source.textContent).toBe("Hello");
  });

  it("restores the page after a concealment style and removes focusability", () => {
    const { body, journal, renderer } = setup(ARTICLE);
    const before = domHash(body);
    const source = body.querySelector("#p1") as HTMLElement;
    renderer.renderUnit(unit, "你好", source);
    renderer.setDisplayStyle("blur");
    renderer.setDisplayStyle("none");

    journal.replay();
    expect(domHash(body)).toBe(before);
    expect(body.querySelector("[data-ipt-conceal]")).toBeNull();
    expect(body.querySelector("[tabindex]")).toBeNull();
  });

  it("leaves the reveal colour to the stylesheet and keeps the base colour in a property", () => {
    const { body, renderer } = setup(ARTICLE, "bilingual", "weakened");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    // No inline colour: a hover/focus rule must be able to reveal the base colour.
    expect(target.style.getPropertyValue("color")).toBe("");
    expect(target.style.getPropertyValue("--ipt-style-base")).toMatch(/rgb\(/);
    expect(target.style.getPropertyValue("--ipt-style-fg")).toMatch(/rgb\(/);
  });

  it("computes a contrast-safe foreground for weakened and gray, and clears it otherwise", () => {
    const { body, renderer } = setup(ARTICLE, "bilingual", "weakened");
    const source = body.querySelector("#p1") as HTMLElement;
    const first = renderer.renderUnit({ id: "a" }, "你好", source);
    const weakened = first.style.getPropertyValue("--ipt-style-fg");
    expect(weakened).toMatch(/^rgb\(/);

    renderer.setDisplayStyle("gray");
    const gray = first.style.getPropertyValue("--ipt-style-fg");
    expect(gray).toMatch(/^rgb\(/);

    renderer.setDisplayStyle("marker");
    expect(first.style.getPropertyValue("--ipt-style-fg")).toBe("");
  });
});

describe("restoration with styles (FR-015, SC-004)", () => {
  it("restores the exact pre-render hash after styling and switching", () => {
    const { body, journal, renderer } = setup(ARTICLE);
    const before = domHash(body);
    const source = body.querySelector("#p1") as HTMLElement;
    renderer.renderUnit(unit, "你好", source);
    renderer.setDisplayStyle("marker");
    renderer.setDisplayStyle("border-dashed");
    renderer.setDisplayStyle("none");
    renderer.setDisplayStyle("gray");

    journal.replay();

    expect(domHash(body)).toBe(before);
    expect(body.querySelector("[data-ipt]")).toBeNull();
    expect(body.querySelector("[data-ipt-style]")).toBeNull();
  });

  it("every catalogued style can be applied and fully removed", () => {
    for (const style of DISPLAY_STYLES) {
      const { body, journal, renderer } = setup(ARTICLE);
      const before = domHash(body);
      const source = body.querySelector("#p1") as HTMLElement;
      const target = renderer.renderUnit(unit, "你好", source);
      renderer.setDisplayStyle(style.id);
      expect(target.getAttribute("data-ipt-style")).toBe(style.id);

      journal.replay();
      expect(domHash(body), style.id).toBe(before);
    }
  });

  it("applies to a single selection-style render as well (FR-017)", () => {
    const { body, renderer } = setup("<p id='p1'>Only this</p>");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit({ id: "sel", targetLang: "zh" }, "只这一句", source);
    expect(target.getAttribute("data-ipt-style")).toBe("none");
    expect(body.querySelectorAll("[data-ipt='target']")).toHaveLength(1);
  });
});
describe("divider decoration (feature 004)", () => {
  it("marks the container without restyling the translation text", () => {
    const { body, renderer } = setup(ARTICLE, "bilingual", "divider");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    expect(target.getAttribute("data-ipt-style")).toBe("divider");
    expect(target.textContent).toBe("你好");
    expect(target.getAttribute("lang")).toBe("zh");
    // Divider owns the rule through the stylesheet; it must not turn the text italic or
    // add a text decoration of its own (that is Quote's and the underlines' job).
    expect(target.style.fontStyle).toBe("");
    expect(target.style.textDecoration).toBe("");
    expect(target.style.getPropertyValue("border-inline-start")).toBe("");
    expect(target.style.getPropertyValue("border-block-start")).toBe("");
    expect(source.textContent).toBe("Hello");
    expect(source.getAttribute("data-ipt")).toBe("source");
  });

  it("switches into and out of divider without growing the journal (FR-008)", () => {
    const { body, renderer, journal } = setup(ARTICLE, "bilingual", "divider");
    const source = body.querySelector("#p1") as HTMLElement;
    renderer.renderUnit(unit, "你好", source);
    const size = journal.size;
    renderer.setDisplayStyle("marker");
    renderer.setDisplayStyle("divider");
    expect(journal.size).toBe(size);
  });
});
