import { describe, expect, it } from "vitest";
import { TranslationJob } from "../../src/content/job.js";
import type { BatchCaller, BatchReply, BatchRequestPayload } from "../../src/content/job.js";
import { labelText } from "../../src/content/graphics.js";
import { domHash } from "../../src/content/restorer.js";
import { DeferredCaller, FailingCaller, FakeCaller, PREFIX, settings, startJob } from "./job-harness.js";
import { buildPage } from "./helpers.js";

const html = `<p>Intro paragraph text.</p><div><svg id="d">
  <style>#d{font-family:inherit;font-size:16px;}</style>
  <text id="label">Return metric scores</text>
</svg></div><p>Outro paragraph text.</p>`;

const allSegments = (caller: FakeCaller | DeferredCaller): string[] =>
  caller.requests.flatMap((request) => request.segments);

describe("the job owns a label like any other passage", () => {
  it("requests the phrase, writes it in place and counts it", async () => {
    const { page, job, caller } = startJob(html);
    await job.run();

    expect(allSegments(caller)).toContain("Return metric scores");
    expect(allSegments(caller).join(" ")).not.toContain("font-family");
    const label = page.document.querySelector("#label") as Element;
    expect(label.textContent).toBe(`${PREFIX}Return metric scores`);
    expect(page.document.querySelectorAll("svg [data-ipt]")).toHaveLength(0);
    expect(page.document.querySelectorAll('[data-ipt="target"]')).toHaveLength(2);
    expect(job.result().counts.translated).toBe(3);
  });

  it("restores the label's exact text and the page hash", async () => {
    const { page, job } = startJob(html);
    const baseline = domHash(page.body);
    await job.run();
    job.restore();

    expect((page.document.querySelector("#label") as Element).textContent).toBe("Return metric scores");
    expect(domHash(page.body)).toBe(baseline);
    expect(page.document.querySelectorAll("[data-ipt]")).toHaveLength(0);
  });

  it("puts no pending mark inside the drawing", async () => {
    const caller = new DeferredCaller();
    const { page, job } = startJob(html, { caller });
    const running = job.run();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(page.document.querySelectorAll("svg [data-ipt]")).toHaveLength(0);
    expect(page.document.querySelectorAll("svg [aria-hidden]")).toHaveLength(0);
    caller.release();
    await running;
    expect(page.document.querySelectorAll("svg [data-ipt]")).toHaveLength(0);
  });

  it("writes every occurrence of a repeated phrase from one translation", async () => {
    const page = buildPage(
      '<svg><text id="a">Return metric scores</text><text id="b">Return metric scores</text></svg>',
    );
    const caller = new FakeCaller();
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

    await job.run();

    expect(caller.requests.flatMap((request) => request.segments)).toEqual(["Return metric scores"]);
    expect(page.document.querySelector("#a")?.textContent).toBe(`${PREFIX}Return metric scores`);
    expect(page.document.querySelector("#b")?.textContent).toBe(`${PREFIX}Return metric scores`);
    expect(job.result().counts.translated).toBe(1);
  });

  it("leaves the label visible in translation-only mode", async () => {
    const { page, job } = startJob(html, { displayMode: "bilingual" });
    await job.run();
    job.setDisplayMode("only");

    const label = page.document.querySelector("#label") as Element;
    expect(label.hasAttribute("hidden")).toBe(false);
    expect(label.textContent).toBe(`${PREFIX}Return metric scores`);
    expect(page.document.querySelectorAll("svg [data-ipt]")).toHaveLength(0);
  });

  it("climbs from a label root to the drawing when collecting", () => {
    const { page, job } = startJob(html);
    const label = page.document.querySelector("#label") as Element;
    expect(job.collect(label)).toBe(1);
    expect(job.units[0]?.sourceText).toBe("Return metric scores");
    // A second collect on the same root must add nothing: the seen set remembers it.
    expect(job.collect(label)).toBe(0);
  });

  it("keeps the source text when the provider fails the label", async () => {
    const page = buildPage('<svg><text id="label">Return metric scores</text></svg>');
    const caller = new FailingCaller([0]);
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

    await job.run();

    expect((page.document.querySelector("#label") as Element).textContent).toBe("Return metric scores");
    expect(job.units[0]?.state).toBe("failed");
    expect(job.result().counts.failed).toBe(1);
    expect(page.document.querySelectorAll("svg [data-ipt]")).toHaveLength(0);
  });

  it("keeps the source text when the translation cannot fit the floor", async () => {
    const page = buildPage('<svg><text id="label" style="font-size: 16px">Return metric scores</text></svg>');
    const longCaller: BatchCaller = {
      async translate(payload: BatchRequestPayload): Promise<BatchReply> {
        return {
          results: payload.segments.map((_text, index) => ({ index, text: "译".repeat(40) })),
          failedIndices: [],
        };
      },
    };
    const measureLabel = (root: Element) => {
      const text = labelText(root);
      const size = Number.parseFloat((root as unknown as { style: CSSStyleDeclaration }).style.fontSize) || 16;
      return { width: text.length * size * 0.55, height: size * 1.2 };
    };
    const job = new TranslationJob({
      document: page.document,
      root: page.body,
      settings,
      providerId: "p1",
      displayMode: "bilingual",
      targetLang: "zh",
      sourceLang: "en",
      caller: longCaller,
      view: page.window,
      measureLabel,
    });

    await job.run();

    const label = page.document.querySelector("#label") as Element;
    expect(label.textContent).toBe("Return metric scores");
    expect((label as unknown as { style: CSSStyleDeclaration }).style.fontSize).toBe("16px");
    expect(job.units[0]?.state).toBe("translated");
    expect(job.result().counts.translated).toBe(1);
  });
});
