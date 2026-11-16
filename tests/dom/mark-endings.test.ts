import { describe, expect, it } from "vitest";
import { TranslationJob } from "../../src/content/job.js";
import { VolumeBudget } from "../../src/content/limiter.js";
import { domHash } from "../../src/content/restorer.js";
import { buildPage } from "./helpers.js";
import { AbortableCaller, DeferredCaller, FailingCaller, PREFIX, settings } from "./job-harness.js";
import type { BatchCaller } from "../../src/content/job.js";
import type { Settings } from "../../src/shared/types.js";

/**
 * Feature 007 US3: every mark ends — in a translation, or in nothing at all — and turning
 * translation off still returns the page exactly.
 */

function jobFor(
  html: string,
  caller: BatchCaller,
  options: { settings?: Settings; budget?: VolumeBudget } = {},
) {
  const page = buildPage(`<article>${html}</article>`);
  const job = new TranslationJob({
    document: page.document,
    root: page.body,
    settings: options.settings ?? settings,
    providerId: "p1",
    displayMode: "bilingual",
    targetLang: "zh",
    sourceLang: "en",
    caller,
    view: page.window,
    ...(options.budget ? { budget: options.budget } : {}),
  });
  return { page, job };
}

describe("a mark always ends", () => {
  it("disappears when its passage fails, while the rest of the run carries on", async () => {
    const caller = new FailingCaller([0]);
    const { page, job } = jobFor("<p>Alpha passage.</p><p>Bravo passage.</p>", caller);

    await job.run();

    expect(page.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
    // One failed passage does not stop the others, and nothing pretends to be its translation.
    expect(page.document.querySelectorAll('[data-ipt="target"]')).toHaveLength(1);
    expect(job.counts.failed).toBe(1);
    expect(job.counts.translated).toBe(1);
  });

  it("disappears when a volume cap refuses the passage, and the cap is reported once", async () => {
    const capped: Settings = {
      ...settings,
      limits: { ...settings.limits, sessionCapSegments: 1, sessionCapChars: 0 },
    };
    const budget = new VolumeBudget({ sessionCapSegments: 1, sessionCapChars: 0 });
    const { page, job } = jobFor(
      "<p>Alpha passage.</p><p>Bravo passage.</p><p>Charlie passage.</p>",
      new AbortableCaller(),
      { settings: capped, budget },
    );

    const running = job.run();
    await Promise.resolve();
    await Promise.resolve();
    running.catch(() => undefined);

    // Cancel rather than wait: the refused passages already have their answer.
    job.cancel();
    await running.catch(() => undefined);

    expect(page.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
    expect(job.result().capReached).toBe(true);
  });

  it("disappears on cancellation while the translations already rendered stay", async () => {
    const caller = new AbortableCaller();
    const { page, job } = jobFor("<p>Alpha passage.</p>", caller);

    const running = job.run();
    await Promise.resolve();
    expect(page.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(1);

    job.cancel();
    await running;

    expect(page.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
    job.restore();
    expect(page.document.querySelectorAll("[data-ipt]")).toHaveLength(0);
  });

  it("leaves the page exactly as it was when translation is turned off mid-mark", async () => {
    const caller = new AbortableCaller();
    const { page, job } = jobFor("<p>Alpha passage.</p><p>Bravo passage.</p>", caller);
    const before = domHash(page.body);

    const running = job.run();
    await Promise.resolve();
    expect(page.document.querySelectorAll('[data-ipt="pending"]').length).toBeGreaterThan(0);

    const result = job.restore();
    await running;

    expect(result.residue).toBe(0);
    expect(page.document.querySelectorAll("[data-ipt]")).toHaveLength(0);
    expect(domHash(page.body)).toBe(before);
  });

  it("never shows two marks, and never a mark with a translation, at any moment", async () => {
    const caller = new DeferredCaller();
    const { page, job } = jobFor("<p>Alpha passage.</p><p>Bravo passage.</p>", caller);

    const running = job.run();
    await Promise.resolve();

    const marks = Array.from(page.document.querySelectorAll('[data-ipt="pending"]'));
    const sources = new Set<Element>();
    for (const mark of marks) {
      const source = mark.previousElementSibling as Element;
      expect(sources.has(source)).toBe(false);
      sources.add(source);
    }

    caller.release();
    await running;

    // A translation with a leftover mark would show up as a pending node beside a target.
    expect(page.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
    expect(page.document.querySelectorAll('[data-ipt="target"]')).toHaveLength(2);
  });

  it("does not carry a mark from an earlier run into a later one", async () => {
    const first = jobFor("<p>Alpha passage.</p>", new AbortableCaller());
    const running = first.job.run();
    await Promise.resolve();
    first.job.cancel();
    await running;
    first.job.restore();

    const second = jobFor("<p>Alpha passage.</p>", new FailingCaller([]));
    expect(second.page.document.querySelectorAll("[data-ipt]")).toHaveLength(0);

    await second.job.run();
    expect(second.page.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
    expect(PREFIX).toBe("【译】");
  });
});
