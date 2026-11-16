import { describe, expect, it } from "vitest";
import { TranslationJob } from "../../src/content/job.js";
import { PageObserver } from "../../src/content/observer.js";
import { PageRun } from "../../src/content/page-run.js";
import { buildPage, stackBlocks, viewportDouble, type ViewportDouble } from "./helpers.js";
import { DeferredCaller, FakeCaller, settings } from "./job-harness.js";
import type { BatchCaller } from "../../src/content/job.js";

/**
 * Feature 007 US2: a passage is requested only while the reader is about to read it.
 *
 * jsdom has no layout, so the geometry is injected; what is being proved here is the *decision*,
 * not the browser's rectangles. Real rectangles are proved in Chromium (tests/e2e).
 */

const paragraphs = (count: number): string =>
  Array.from({ length: count }, (_, index) => `<p>Passage ${index + 1} of the harbour archive.</p>`).join("");

interface Harness {
  page: ReturnType<typeof buildPage>;
  view: ViewportDouble;
  caller: FakeCaller;
  job: TranslationJob;
  run: PageRun;
  blocks: Element[];
}

function harness(
  html: string,
  height = 800,
  callerOverride?: BatchCaller,
  pageVisible?: () => boolean,
): Harness {
  const page = buildPage(`<article>${html}</article>`);
  const view = viewportDouble(height);
  const caller = (callerOverride ?? new FakeCaller()) as FakeCaller;
  const job = new TranslationJob({
    document: page.document,
    root: page.body,
    settings,
    providerId: "p1",
    displayMode: "bilingual",
    targetLang: "zh",
    sourceLang: "en",
    caller,
    view: page.window,
  });
  const blocks = Array.from(page.document.querySelectorAll("p"));
  stackBlocks(blocks, view);
  const run = new PageRun({
    job,
    document: page.document,
    view: page.window,
    ceiling: 2,
    measure: (element) => view.measure(element),
    viewport: () => view.visible,
    ...(pageVisible ? { pageVisible } : {}),
  });
  return { page, view, caller, job, run, blocks };
}

const requested = (caller: FakeCaller): string[] => caller.requests.flatMap((request) => request.segments);

describe("what is requested on a long page", () => {
  it("requests the passages inside the window and nothing below the lookahead", async () => {
    const { caller, run, job } = harness(paragraphs(20), 800);
    job.collect();

    await run.start();

    const segments = requested(caller);
    expect(segments.length).toBeGreaterThan(0);
    // Visible band 0-800, lookahead to 1600: the first 16 blocks (0-1600) qualify, the rest do not.
    expect(segments.some((text) => text.includes("Passage 17"))).toBe(false);
    expect(segments.some((text) => text.includes("Passage 20"))).toBe(false);
    expect(segments.some((text) => text.includes("Passage 1 "))).toBe(true);
  });

  it("requests the next stretch once the reader scrolls to it, each passage exactly once", async () => {
    const { caller, run, job, view } = harness(paragraphs(20), 800);
    job.collect();
    await run.start();
    const firstRound = requested(caller).length;

    view.scrollTo(1600);
    await run.round();
    view.scrollTo(3200);
    await run.round();

    const segments = requested(caller);
    expect(segments.length).toBeGreaterThan(firstRound);
    expect(segments.some((text) => text.includes("Passage 20"))).toBe(true);
    // No passage was sent twice: a second charge for the same paragraph is FR-020's prohibition.
    expect(new Set(segments).size).toBe(segments.length);
  });

  it("puts a mark on what it queued and none on what it skipped for being out of range", async () => {
    const caller = new DeferredCaller();
    const { page, run, job, blocks } = harness(paragraphs(20), 800, caller);
    job.collect();

    const running = run.start();
    await Promise.resolve();
    await Promise.resolve();

    const marked = Array.from(page.document.querySelectorAll('[data-ipt="pending"]'));
    expect(marked.length).toBeGreaterThan(0);
    const outOfRange = new Set(blocks.slice(16));
    for (const mark of marked) {
      const passage = mark.previousElementSibling ?? mark.parentElement;
      expect(outOfRange.has(passage as Element)).toBe(false);
    }

    run.stop();
    caller.release();
    await running;
  });

  it("carries several passages in one request, exactly as batching always has (FR-014)", async () => {
    const { caller, run, job } = harness(paragraphs(20), 800);
    job.collect();

    await run.start();

    const segments = requested(caller);
    expect(segments.length).toBeGreaterThan(1);
    // On-demand must not turn one screenful into one request per passage.
    expect(caller.requests.length).toBeLessThan(segments.length);
  });

  it("translates a page of one screenful in full, with no extra step (FR-017)", async () => {
    const { caller, run, job, blocks } = harness(paragraphs(5), 800);
    job.collect();

    await run.start();

    expect(requested(caller)).toHaveLength(blocks.length);
    expect(blocks.every((block) => block.nextElementSibling?.getAttribute("data-ipt") === "target")).toBe(true);
  });

  it("leaves a passage above the viewport alone until the reader scrolls back", async () => {
    const { caller, run, job, view } = harness(paragraphs(40), 800);
    job.collect();
    await run.start();

    view.scrollTo(3000);
    await run.round();
    const afterScroll = requested(caller).length;
    expect(afterScroll).toBeGreaterThan(0);
    // Passage 1 is now far above the reader and was already translated in the first round.
    expect(requested(caller).filter((text) => text.includes("Passage 1 "))).toHaveLength(1);
  });
});

describe("a page nobody is looking at", () => {
  it("requests nothing while the reader is elsewhere, and catches up when they return (FR-016)", async () => {
    let visible = false;
    const { caller, run, job } = harness(paragraphs(20), 800, undefined, () => visible);
    job.collect();

    await run.start();
    expect(caller.requests).toHaveLength(0);

    visible = true;
    await run.round();

    expect(caller.requests.length).toBeGreaterThan(0);
  });
});

describe("late content", () => {
  it("is collected on arrival and requested only when the window reaches it", async () => {
    const { page, view, caller, job, run } = harness("<p>Passage 1 of the harbour archive.</p>", 800);
    job.collect();
    await run.start();

    const observer = new PageObserver({
      root: page.body,
      debounceMs: 0,
      view: page.window,
      onNewContent: (elements) => {
        for (const element of elements) job.collect(element);
        void run.round();
      },
    });
    observer.start();

    // A comment thread expands far below the fold.
    const late = page.document.createElement("p");
    late.textContent = "Passage 2 arrives late, well below the fold.";
    page.body.appendChild(late);
    view.set(late, { top: 5000, bottom: 5060 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(requested(caller).some((text) => text.includes("Passage 2"))).toBe(false);

    // The reader scrolls to it.
    view.scrollTo(4800);
    await run.round();

    expect(requested(caller).some((text) => text.includes("Passage 2"))).toBe(true);
    observer.stop();
  });
});
