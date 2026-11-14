import { describe, expect, it } from "vitest";
import { Renderer } from "../../src/content/renderer.js";
import { Journal, restorePage } from "../../src/content/restorer.js";
import type { TranslationTypography } from "../../src/shared/types.js";
import { buildPage, hashOf } from "./helpers.js";

const unit = { id: "0-abc", targetLang: "zh" };

const ARTICLE = `<article>
  <h2 id="h" style="font-family: Georgia, serif; font-size: 32px; line-height: 40px">Original heading</h2>
  <p id="p" style="font-family: Georgia, serif; font-size: 16px; line-height: 24px">Original paragraph</p>
  <p id="n" style="font-family: Georgia, serif; font-size: 16px">normal line height</p>
</article>`;

function setup(typography?: TranslationTypography) {
  const page = buildPage(ARTICLE);
  const journal = new Journal();
  const renderer = new Renderer(journal, {
    displayMode: "bilingual",
    targetLang: "zh",
    view: page.window,
    ...(typography ? { typography } : {}),
  });
  return { ...page, journal, renderer };
}

describe("translation typography (FR-009 to FR-015)", () => {
  it("applies the chosen family with the source family appended as the fallback (FR-014)", () => {
    const { body, renderer } = setup({ fontFamily: '"Source Han Serif SC", serif', fontScale: 100 });
    const source = body.querySelector("#p") as HTMLElement;
    const target = renderer.renderUnit(unit, "你好", source);

    expect(target.style.fontFamily).toContain("Source Han Serif SC");
    expect(target.style.fontFamily.toLowerCase()).toContain("georgia");
  });

  it("scales each block against its own source size (FR-010, FR-011)", () => {
    const { body, renderer } = setup({ fontFamily: "", fontScale: 125 });
    const heading = renderer.renderUnit({ id: "h" }, "标题", body.querySelector("#h") as HTMLElement);
    const paragraph = renderer.renderUnit({ id: "p" }, "正文", body.querySelector("#p") as HTMLElement);

    expect(heading.style.fontSize).toBe("40px");
    expect(paragraph.style.fontSize).toBe("20px");
  });

  it("scales a pixel line-height and leaves normal alone (FR-015)", () => {
    const { body, renderer } = setup({ fontFamily: "", fontScale: 150 });
    const heading = renderer.renderUnit({ id: "h" }, "标题", body.querySelector("#h") as HTMLElement);
    const normal = renderer.renderUnit({ id: "n" }, "正文", body.querySelector("#n") as HTMLElement);

    expect(heading.style.fontSize).toBe("48px");
    expect(heading.style.lineHeight).toBe("60px");
    expect(normal.style.lineHeight).toBe("normal");
  });

  it("writes no override at the default settings (FR-012)", () => {
    const { body, renderer } = setup();
    const target = renderer.renderUnit(unit, "你好", body.querySelector("#p") as HTMLElement);

    expect(target.style.fontSize).toBe("");
    expect(target.style.lineHeight).toBe("");
    expect(target.style.fontFamily).toBe("");
  });

  it("removes every override when typography returns to the defaults (FR-012, FR-021)", () => {
    const { body, renderer } = setup({ fontFamily: "Georgia", fontScale: 200 });
    const target = renderer.renderUnit(unit, "你好", body.querySelector("#p") as HTMLElement);
    expect(target.style.fontSize).toBe("32px");

    renderer.setTypography({ fontFamily: "", fontScale: 100 });
    expect(target.style.fontSize).toBe("");
    expect(target.style.lineHeight).toBe("");
    expect(target.style.fontFamily).toBe("");
  });

  it("restyles an existing block in place, without touching the source (FR-013, FR-019)", () => {
    const { body, renderer, journal } = setup({ fontFamily: "Georgia", fontScale: 100 });
    const source = body.querySelector("#p") as HTMLElement;
    const sourceStyle = source.getAttribute("style");
    const target = renderer.renderUnit(unit, "你好", source);
    const size = journal.size;

    renderer.setTypography({ fontFamily: '"Noto Serif"', fontScale: 150 });

    expect(renderer.renderedElement(source)).toBe(target);
    expect(target.style.fontSize).toBe("24px");
    expect(target.style.fontFamily).toContain("Noto Serif");
    expect(source.getAttribute("style")).toBe(sourceStyle);
    expect(journal.size).toBe(size);
  });

  it("leaves no residue when the page is restored (FR-024)", () => {
    const { body, renderer, journal, document } = setup({ fontFamily: "Georgia", fontScale: 150 });
    const before = hashOf(body);
    renderer.renderUnit(unit, "你好", body.querySelector("#p") as HTMLElement);
    renderer.setTypography({ fontFamily: "", fontScale: 100 });
    restorePage(journal, { document });
    expect(hashOf(body)).toBe(before);
  });
});
