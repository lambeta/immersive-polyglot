import { describe, expect, it } from "vitest";
import { Renderer } from "../../src/content/renderer.js";
import { Journal, domHash, restorePage } from "../../src/content/restorer.js";
import { buildPage, nodesIn, snapshotJournal } from "./helpers.js";

const pageHtml = `<article>
  <h1 id="title">Harbour news</h1>
  <p id="p1">The harbour authority voted to approve the breakwater.</p>
  <p id="p2" class="byline">By Maren Holt</p>
  <ul><li id="li1">640 metres</li></ul>
</article>`;

describe("journal replay", () => {
  it("removes every injected node and restores every attribute", () => {
    const page = buildPage(pageHtml);
    const baseline = domHash(page.body);
    const journal = new Journal();
    const renderer = new Renderer(journal, { displayMode: "bilingual", targetLang: "zh", view: page.window });

    for (const id of ["title", "p1", "p2", "li1"]) {
      const source = page.body.querySelector(`#${id}`) as HTMLElement;
      renderer.renderUnit({ id, targetLang: "zh" }, "译文", source);
    }

    const snapshot = snapshotJournal(journal);
    expect(snapshot.inserts).toBe(4);
    expect(snapshot.size).toBeGreaterThan(snapshot.inserts);
    expect(page.body.querySelectorAll("[data-ipt]")).toHaveLength(8);

    const result = restorePage(journal, { document: page.document, scrollY: 0 });

    expect(result.replayed).toBe(snapshot.size);
    expect(result.residue).toBe(0);
    expect(journal.size).toBe(0);
    expect(page.body.querySelectorAll("[data-ipt]")).toHaveLength(0);
    expect(domHash(page.body)).toBe(baseline);
  });

  it("restores a translation-only page, where the source was hidden", () => {
    const page = buildPage(pageHtml);
    const baseline = domHash(page.body);
    const journal = new Journal();
    const renderer = new Renderer(journal, { displayMode: "only", targetLang: "zh", view: page.window });

    const heading = page.body.querySelector("#title") as HTMLElement;
    renderer.renderUnit({ id: "title" }, "港口新闻", heading);
    expect(heading.hasAttribute("hidden")).toBe(true);

    restorePage(journal, { document: page.document });

    expect(heading.hasAttribute("hidden")).toBe(false);
    expect(heading.style.display).toBe("");
    expect(domHash(page.body)).toBe(baseline);
  });

  it("puts the reader back where they were after a layout-shifting restore", () => {
    const page = buildPage(pageHtml);
    let scrolledTo = -1;
    page.window.scrollTo = ((_x: number, y: number) => {
      scrolledTo = y;
    }) as unknown as typeof page.window.scrollTo;

    const journal = new Journal();
    const renderer = new Renderer(journal, { displayMode: "bilingual", targetLang: "zh", view: page.window });
    renderer.renderUnit({ id: "p1" }, "译文", page.body.querySelector("#p1") as HTMLElement);

    // While translated, the reader had scrolled to 480; removing the translations shrinks the
    // document, so the reported position must be restored explicitly.
    Object.defineProperty(page.window, "scrollY", { value: 0, configurable: true });
    restorePage(journal, { document: page.document, scrollY: 480 });

    expect(scrolledTo).toBe(480);
  });

  it("survives 20 translate/restore cycles without growth in the DOM or the journal", () => {
    const page = buildPage(pageHtml);
    const baselineHash = domHash(page.body);
    const baselineNodes = nodesIn(page.body);

    for (let cycle = 0; cycle < 20; cycle += 1) {
      const journal = new Journal();
      const renderer = new Renderer(journal, {
        displayMode: cycle % 2 === 0 ? "bilingual" : "only",
        targetLang: "zh",
        view: page.window,
      });
      for (const id of ["title", "p1", "p2", "li1"]) {
        renderer.renderUnit({ id }, `译文 ${cycle}`, page.body.querySelector(`#${id}`) as HTMLElement);
      }
      const result = restorePage(journal, { document: page.document });
      expect(result.residue).toBe(0);
      expect(journal.size).toBe(0);
      expect(nodesIn(page.body)).toBe(baselineNodes);
    }

    expect(domHash(page.body)).toBe(baselineHash);
  });

  it("removes a leftover marker it did not journal, rather than leaving a translation behind", () => {
    const page = buildPage(pageHtml);
    const stray = page.document.createElement("div");
    stray.setAttribute("data-ipt", "target");
    stray.textContent = "orphan";
    page.body.appendChild(stray);

    const result = restorePage(new Journal(), { document: page.document });
    expect(result.residue).toBe(1);
    expect(page.body.querySelector("[data-ipt]")).toBeNull();
  });

  it("produces a different hash when the page actually changed", () => {
    const page = buildPage(pageHtml);
    const baseline = domHash(page.body);
    (page.body.querySelector("#p1") as HTMLElement).textContent = "changed";
    expect(domHash(page.body)).not.toBe(baseline);
  });
});
