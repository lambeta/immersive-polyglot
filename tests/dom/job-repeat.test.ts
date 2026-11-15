import { describe, expect, it } from "vitest";
import { TranslationJob, type BatchCaller } from "../../src/content/job.js";
import { buildPage, type TestPage } from "./helpers.js";
import { DeferredCaller, FakeCaller, PREFIX, abstractPage, settings } from "./job-harness.js";

/**
 * The DOM half of SC-004: a second run over an already translated page. The page agent prevents the
 * second run outright (T013), and this file proves the layer beneath it — the segmenter never reads
 * product output, and a journal replay leaves exactly one translation per passage.
 */

const TWO_PARAGRAPHS =
  "<article><p>First paragraph of the article.</p><p>Second paragraph of the article.</p></article>";

function jobFor(page: TestPage, caller: BatchCaller): TranslationJob {
  return new TranslationJob({
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
}

function targets(page: TestPage): Element[] {
  return Array.from(page.document.querySelectorAll('[data-ipt="target"]'));
}

describe("a second run over an already translated page", () => {
  it("never segments a rendered translation as source text", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const first = jobFor(page, new FakeCaller());
    await first.run();
    expect(targets(page)).toHaveLength(2);

    const second = jobFor(page, new FakeCaller());
    await second.run();

    // The regression: before the ownership guard, these units contained the first run's output.
    expect(second.units.map((unit) => unit.sourceText)).toEqual([
      "First paragraph of the article.",
      "Second paragraph of the article.",
    ]);
    expect(second.units.some((unit) => unit.sourceText.includes(PREFIX))).toBe(false);
    expect(second.counts.translated).toBe(2);
  });

  it("leaves exactly one translation per passage when the previous output is replayed first", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const first = jobFor(page, new FakeCaller());
    await first.run();
    first.restore();

    const second = jobFor(page, new FakeCaller());
    await second.run();

    expect(targets(page)).toHaveLength(2);
    expect(page.document.querySelectorAll("p")).toHaveLength(2);
    for (const paragraph of Array.from(page.document.querySelectorAll("p"))) {
      expect(paragraph.getAttribute("data-ipt")).toBe("source");
    }
    expect(targets(page).map((node) => node.textContent)).toEqual([
      PREFIX + "First paragraph of the article.",
      PREFIX + "Second paragraph of the article.",
    ]);
  });

  it("never shows two translations for one passage while a batch lands", async () => {
    const page = buildPage(abstractPage());
    const caller = new DeferredCaller();
    const job = jobFor(page, caller);
    const running = job.run();
    caller.release();
    await running;

    const sources = Array.from(page.document.querySelectorAll('[data-ipt="source"]'));
    expect(sources.length).toBe(3);
    for (const source of sources) {
      const inside = source.querySelectorAll('[data-ipt="target"]').length;
      let adjacent = 0;
      let node = source.nextElementSibling;
      while (node && node.getAttribute("data-ipt") === "target") {
        adjacent += 1;
        node = node.nextElementSibling;
      }
      expect(inside + adjacent).toBe(1);
    }

    const abstractBlock = page.document.querySelector("p.abstract");
    expect(abstractBlock).not.toBeNull();
    const composed = Array.from(
      abstractBlock?.parentElement?.querySelectorAll('[data-ipt="target"]') ?? [],
    )[0]?.textContent ?? "";
    expect(composed.startsWith(PREFIX)).toBe(true);
    expect(composed.includes(PREFIX + PREFIX)).toBe(false);
  });
});