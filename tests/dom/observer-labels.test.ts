import { describe, expect, it } from "vitest";
import { PageObserver } from "../../src/content/observer.js";
import { buildPage } from "./helpers.js";

function wait(ms = 40): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("the observer treats a drawing's interior as its own", () => {
  it("ignores the fit's style write and any other mutation inside a drawing", async () => {
    const page = buildPage('<svg id="d"><text id="t">Return metric scores</text></svg>');
    const seen: Element[] = [];
    const observer = new PageObserver({
      root: page.body,
      view: page.window,
      debounceMs: 10,
      onNewContent: (elements) => seen.push(...elements),
    });
    observer.start();

    const text = page.document.querySelector("#t") as Element;
    text.setAttribute("style", "font-size: 12px");
    text.setAttribute("class", "changed");
    await wait();
    expect(seen).toHaveLength(0);

    observer.stop();
  });

  it("reports a new drawing root, not its text, so a new drawing is harvested", async () => {
    const page = buildPage("<p>Prose</p>");
    const seen: Element[] = [];
    const observer = new PageObserver({
      root: page.body,
      view: page.window,
      debounceMs: 10,
      onNewContent: (elements) => seen.push(...elements),
    });
    observer.start();

    const svg = page.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const text = page.document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "Return metric scores";
    svg.appendChild(text);
    page.body.appendChild(svg);
    await wait();

    expect(seen).toContain(svg);
    expect(seen).not.toContain(text);

    observer.stop();
  });
});
