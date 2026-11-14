import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageObserver } from "../../src/content/observer.js";
import { buildPage } from "./helpers.js";

describe("late content", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const page = buildPage("<article id='main'><p>Existing</p></article>");
    const batches: Element[][] = [];
    const observer = new PageObserver({
      root: page.body,
      view: page.window,
      debounceMs: 10,
      onNewContent: (elements) => batches.push(elements),
    });
    observer.start();
    return { ...page, observer, batches };
  }

  it("reports content that arrives after the first pass, once", async () => {
    const { document, body, observer, batches } = setup();
    const added = document.createElement("p");
    added.textContent = "Late paragraph";
    body.querySelector("#main")?.appendChild(added);

    await vi.advanceTimersByTimeAsync(20);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([added]);

    await vi.advanceTimersByTimeAsync(50);
    expect(batches).toHaveLength(1);
    observer.stop();
  });

  it("ignores mutations the product itself made, so it cannot loop", async () => {
    const { document, body, observer, batches } = setup();
    const ours = document.createElement("div");
    ours.setAttribute("data-ipt", "target");
    ours.textContent = "译文";
    body.querySelector("#main")?.appendChild(ours);

    await vi.advanceTimersByTimeAsync(50);
    expect(batches).toHaveLength(0);
    observer.stop();
  });

  it("ignores a node that was removed again before the debounce fired", async () => {
    const { document, body, observer, batches } = setup();
    const flicker = document.createElement("p");
    flicker.textContent = "Ad that disappears";
    body.appendChild(flicker);
    flicker.remove();

    await vi.advanceTimersByTimeAsync(50);
    expect(batches).toHaveLength(0);
    observer.stop();
  });

  it("coalesces a mutation storm into one callback", async () => {
    const { document, body, observer, batches } = setup();
    for (let index = 0; index < 12; index += 1) {
      const paragraph = document.createElement("p");
      paragraph.textContent = `Storm ${index}`;
      body.appendChild(paragraph);
    }

    await vi.advanceTimersByTimeAsync(50);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(12);
    observer.stop();
  });

  it("stops observing after stop()", async () => {
    const { document, body, observer, batches } = setup();
    observer.stop();
    const added = document.createElement("p");
    added.textContent = "After stop";
    body.appendChild(added);
    await vi.advanceTimersByTimeAsync(50);
    expect(batches).toHaveLength(0);
  });
});
