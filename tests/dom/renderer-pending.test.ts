import { describe, expect, it } from "vitest";
import { Renderer } from "../../src/content/renderer.js";
import { Journal, domHash, restorePage } from "../../src/content/restorer.js";
import type { DisplayStyleId } from "../../src/shared/types.js";
import { buildPage } from "./helpers.js";

/** Feature 007 US1: the mark is the translation's slot, occupied before the translation exists. */

function withRenderer(
  html: string,
  options: { mode?: "bilingual" | "above" | "only"; style?: DisplayStyleId } = {},
): { page: ReturnType<typeof buildPage>; journal: Journal; renderer: Renderer } {
  const page = buildPage(html);
  const journal = new Journal();
  const renderer = new Renderer(journal, {
    displayMode: options.mode ?? "bilingual",
    displayStyle: options.style ?? "none",
    targetLang: "zh",
    view: page.window,
  });
  return { page, journal, renderer };
}

describe("the pending mark exists where the translation will", () => {
  it("shows exactly one mark per passage and reuses it on a second request", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>");
    const source = page.document.querySelector("p") as Element;

    const first = renderer.showPending(source, "0-abc");
    const second = renderer.showPending(source, "0-abc");

    expect(first).toBe(second);
    expect(renderer.pendingCount).toBe(1);
    expect(page.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(1);
  });

  it("writes only the markers a mark may carry", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>", {
      style: "blur",
    });
    const source = page.document.querySelector("p") as Element;
    const mark = renderer.showPending(source, "7-hash");

    expect(mark.getAttribute("data-ipt")).toBe("pending");
    expect(mark.getAttribute("data-ipt-unit")).toBe("7-hash");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.textContent).toBe("");
    // The fifteen display styles are all keyed on data-ipt-style; a mark must never match them.
    expect(mark.hasAttribute("data-ipt-style")).toBe(false);
    expect(mark.hasAttribute("lang")).toBe(false);
    expect(mark.hasAttribute("tabindex")).toBe(false);
    expect(mark.hasAttribute("data-ipt-conceal")).toBe(false);
  });

  it("places the mark after the passage when translations are shown below", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>");
    const source = page.document.querySelector("p") as Element;
    const mark = renderer.showPending(source, "0-abc");

    expect(mark.previousElementSibling).toBe(source);
    expect(mark.hasAttribute("data-ipt-position")).toBe(false);
  });

  it("places the mark before the passage when translations are shown above", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>", {
      mode: "above",
    });
    const source = page.document.querySelector("p") as Element;
    const mark = renderer.showPending(source, "0-abc");

    expect(mark.nextElementSibling).toBe(source);
    expect(mark.getAttribute("data-ipt-position")).toBe("before");
  });

  it("keeps the source readable while the mark shows in translation-only mode", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>", {
      mode: "only",
    });
    const source = page.document.querySelector("p") as HTMLElement;
    renderer.showPending(source, "0-abc");

    expect(source.hasAttribute("hidden")).toBe(false);
    expect(source.style.getPropertyValue("display")).toBe("");
  });

  it("places the mark inside list items and table cells, where translations also go", () => {
    const { page, renderer } = withRenderer("<ul><li>Alpha passage.</li></ul>");
    const source = page.document.querySelector("li") as Element;
    const mark = renderer.showPending(source, "0-abc");

    expect(mark.parentElement).toBe(source);
  });

  it("never marks a passage that already shows its translation", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>");
    const source = page.document.querySelector("p") as Element;
    renderer.renderUnit({ id: "0-abc" }, "译文", source);

    renderer.showPending(source, "0-abc");

    expect(page.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
    expect(page.document.querySelectorAll('[data-ipt="target"]')).toHaveLength(1);
  });

  it("moves an existing mark when the display mode changes", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>");
    const source = page.document.querySelector("p") as Element;
    const mark = renderer.showPending(source, "0-abc");
    expect(mark.previousElementSibling).toBe(source);

    renderer.setDisplayMode("above");

    expect(mark.nextElementSibling).toBe(source);
    expect(mark.getAttribute("data-ipt-position")).toBe("before");
  });

  it("removes a mark on request and reports whether there was one", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>");
    const source = page.document.querySelector("p") as Element;
    renderer.showPending(source, "0-abc");

    expect(renderer.removePending(source)).toBe(true);
    expect(renderer.removePending(source)).toBe(false);
    expect(page.document.querySelectorAll("[data-ipt]")).toHaveLength(0);
    expect(renderer.pendingCount).toBe(0);
  });
});

describe("the mark becomes the translation in place", () => {
  it("reuses the same node, its position and its identity", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>");
    const source = page.document.querySelector("p") as Element;
    const mark = renderer.showPending(source, "0-abc");

    const container = renderer.renderUnit({ id: "0-abc" }, "  译文  ", source);

    expect(container).toBe(mark);
    expect(container.getAttribute("data-ipt")).toBe("target");
    expect(container.getAttribute("data-ipt-unit")).toBe("0-abc");
    expect(container.getAttribute("lang")).toBe("zh");
    expect(container.textContent).toBe("译文");
    expect(container.hasAttribute("aria-hidden")).toBe(false);
    expect(renderer.pendingCount).toBe(0);
    expect(page.document.querySelectorAll("[data-ipt]")).toHaveLength(2); // source + target
  });

  it("leaves no pending marker and no second container behind", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>");
    const source = page.document.querySelector("p") as Element;
    renderer.showPending(source, "0-abc");

    renderer.renderUnit({ id: "0-abc" }, "译文", source);

    expect(page.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
    expect(page.document.querySelectorAll('[data-ipt="target"]')).toHaveLength(1);
    expect(renderer.count()).toBe(1);
  });

  it("hides the source only when the translation arrives in translation-only mode", () => {
    const { page, renderer } = withRenderer("<article><p>Alpha passage.</p></article>", {
      mode: "only",
    });
    const source = page.document.querySelector("p") as HTMLElement;
    renderer.showPending(source, "0-abc");
    expect(source.hasAttribute("hidden")).toBe(false);

    renderer.renderUnit({ id: "0-abc" }, "译文", source);

    expect(source.getAttribute("hidden")).toBe("");
  });

  it("is removable by journal replay, exactly like a translation", () => {
    const { page, journal, renderer } = withRenderer(
      "<article><p>Alpha passage.</p><p>Bravo passage.</p></article>",
    );
    const [first, second] = Array.from(page.document.querySelectorAll("p"));
    const before = domHash(page.body);

    renderer.showPending(first as Element, "0-abc");
    renderer.renderUnit({ id: "0-abc" }, "译文", first as Element);
    renderer.showPending(second as Element, "1-def");

    const result = restorePage(journal, { document: page.document, scrollY: 0 });

    expect(result.residue).toBe(0);
    expect(page.document.querySelectorAll("[data-ipt]")).toHaveLength(0);
    expect(domHash(page.body)).toBe(before);
  });
});
