import { describe, expect, it } from "vitest";
import { Renderer } from "../../src/content/renderer.js";
import { Journal } from "../../src/content/restorer.js";
import { buildPage } from "./helpers.js";

const unit = { id: "0-abc", targetLang: "zh" };

function setup(html: string, mode: "bilingual" | "above" | "only" = "bilingual") {
  const page = buildPage(html);
  const journal = new Journal();
  const renderer = new Renderer(journal, {
    displayMode: mode,
    targetLang: "zh",
    view: page.window,
  });
  return { ...page, journal, renderer };
}

describe("bilingual placement", () => {
  it("inserts the translation as the next sibling block of its source", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p><p id='p2'>Next</p></article>");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    expect(source.nextElementSibling).toBe(target);
    expect(target.tagName).toBe("DIV");
    expect(target.textContent).toBe("你好");
    expect(target.getAttribute("data-ipt")).toBe("target");
  });

  it("does not move, wrap or re-parent the source block", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p></article>");
    const source = body.querySelector("#p1") as HTMLElement;
    const parent = source.parentNode;
    const previousParent = source.parentElement;

    renderer.renderUnit(unit, "你好", source);

    expect(source.parentNode).toBe(parent);
    expect(source.parentElement).toBe(previousParent);
    expect(source.textContent).toBe("Hello");
    expect(source.children).toHaveLength(0);
  });

  it("carries the target language on the translation, not on the source", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p></article>");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    expect(target.getAttribute("lang")).toBe("zh");
    expect(source.getAttribute("lang")).toBeNull();
  });

  it("keeps a paragraph translation adjacent when two paragraphs are translated", () => {
    const { body, renderer } = setup("<article><p id='p1'>One</p><p id='p2'>Two</p></article>");
    const first = body.querySelector("#p1") as HTMLElement;
    const second = body.querySelector("#p2") as HTMLElement;
    renderer.renderUnit({ id: "a" }, "一", first);
    renderer.renderUnit({ id: "b" }, "二", second);

    const nodes = Array.from(body.querySelector("article")?.children ?? []);
    expect(nodes.map((node) => node.id || node.getAttribute("data-ipt"))).toEqual([
      "p1",
      "target",
      "p2",
      "target",
    ]);
  });

  it("places the translation inside a list item rather than breaking the list", () => {
    const { body, renderer } = setup("<ul><li id='li1'>Item one</li><li>Item two</li></ul>");
    const source = body.querySelector("#li1") as HTMLElement;
    const target = renderer.renderUnit(unit, "第一项", source);

    expect(target.parentElement).toBe(source);
    expect(body.querySelectorAll("ul > li")).toHaveLength(2);
    expect(target.closest("ul")).not.toBeNull();
  });

  it("never renders markup from the translation into the page", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p></article>");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "<b>bold</b> text", source);

    expect(target.querySelector("b")).toBeNull();
    expect(target.textContent).toBe("<b>bold</b> text");
  });

  it("refuses an empty translation instead of showing a placeholder (FR-020)", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p></article>");
    const source = body.querySelector("#p1") as HTMLElement;
    expect(() => renderer.renderUnit(unit, "   ", source)).toThrowError(/empty translation/i);
    expect(body.querySelector("[data-ipt='target']")).toBeNull();
  });

  it("replaces a previous translation instead of stacking a second one", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p></article>");
    const source = body.querySelector("#p1") as HTMLElement;
    renderer.renderUnit(unit, "first", source);
    renderer.renderUnit(unit, "second", source);

    expect(body.querySelectorAll("[data-ipt='target']")).toHaveLength(1);
    expect(body.querySelector("[data-ipt='target']")?.textContent).toBe("second");
  });
});

describe("display modes", () => {
  it("bilingual: translation after the source", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p></article>", "bilingual");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);
    expect(source.previousElementSibling).toBeNull();
    expect(source.nextElementSibling).toBe(target);
    expect(source.hasAttribute("hidden")).toBe(false);
  });

  it("above: translation before the source, source still visible", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p></article>", "above");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    expect(source.previousElementSibling).toBe(target);
    expect(target.getAttribute("data-ipt-position")).toBe("before");
    expect(source.hasAttribute("hidden")).toBe(false);
  });

  it("only: source hidden, translation visible", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p></article>", "only");
    const source = body.querySelector("#p1") as HTMLElement;
    renderer.renderUnit(unit, "你好", source);

    expect(source.hasAttribute("hidden")).toBe(true);
    expect(source.style.display).toBe("none");
  });

  it("switching mode moves the translation and restores the source", () => {
    const { body, renderer } = setup("<article><p id='p1'>Hello</p></article>", "bilingual");
    const source = body.querySelector("#p1") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    renderer.setDisplayMode("above");
    expect(source.previousElementSibling).toBe(target);

    renderer.setDisplayMode("only");
    expect(source.hasAttribute("hidden")).toBe(true);

    renderer.setDisplayMode("bilingual");
    expect(source.hasAttribute("hidden")).toBe(false);
    expect(source.nextElementSibling).toBe(target);
  });
});
