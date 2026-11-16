import { describe, expect, it, vi } from "vitest";
import { TranslationJob, type BatchCaller, type BatchReply } from "../../src/content/job.js";
import type { RequestLimiter } from "../../src/content/limiter.js";
import type { Settings, UsageReport } from "../../src/shared/types.js";
import { buildPage, type TestPage } from "./helpers.js";
import { PREFIX, settings } from "./job-harness.js";
import { WORKED_USAGE } from "../support/spend-fixtures.js";

/** Feature 008: T5, T6 — attribution, tiers, cancel/restore and the reporting gate. */

const DEEPSEEK_USAGE: UsageReport = WORKED_USAGE;

const deepseekSettings: Settings = {
  ...settings,
  providers: [
    {
      id: "p1",
      name: "DeepSeek",
      endpoint: "https://api.deepseek.com/chat/completions",
      model: "deepseek-flash",
      extraHeaders: {},
      enabled: true,
      timeoutMs: 5_000,
      maxConcurrency: 2,
    },
  ],
};

class UsageCaller implements BatchCaller {
  readonly requests: string[][] = [];

  constructor(
    readonly usage: UsageReport | undefined,
    readonly failAll = false,
  ) {}

  async translate(payload: Parameters<BatchCaller["translate"]>[0]): Promise<BatchReply> {
    this.requests.push(payload.segments);
    if (this.failAll) {
      return {
        results: [],
        failedIndices: payload.segments.map((_, index) => index),
        errorClass: "malformedResponse",
      };
    }
    return {
      results: payload.segments.map((segment, index) => ({ index, text: PREFIX + segment })),
      failedIndices: [],
      ...(this.usage ? { usage: this.usage } : {}),
    };
  }
}

function jobFor(
  page: TestPage,
  caller: BatchCaller,
  overrides: Settings = deepseekSettings,
): TranslationJob {
  return new TranslationJob({
    document: page.document,
    root: page.body,
    settings: overrides,
    providerId: "p1",
    displayMode: "bilingual",
    targetLang: "zh",
    sourceLang: "en",
    caller,
    view: page.window,
  });
}

const TWO_PARAGRAPHS =
  "<article><p>First paragraph of the article.</p><p>Second paragraph of the article.</p></article>";

function offPeakOrPeakUnit(totalRequests: number): number[] {
  return [totalRequests * 0.00308, totalRequests * 0.00616];
}

describe("the run's spend record", () => {
  it("reports one response's usage once, and prices it from the shipped catalogue", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const caller = new UsageCaller(DEEPSEEK_USAGE);
    const job = jobFor(page, caller);
    await job.run();

    const spend = job.status().usage?.spend;
    expect(caller.requests.length).toBeGreaterThanOrEqual(1);
    expect(spend?.tokens.total).toBe(caller.requests.length * 5_500);
    expect(spend?.price?.currency).toBe("CNY");
    expect(spend?.price?.snapshot).toBe("2026-11");
    expect(spend?.price?.provider).toBe("DeepSeek");
    const amount = spend?.price?.amount ?? -1;
    const [offPeak, peak] = offPeakOrPeakUnit(caller.requests.length);
    expect(Math.abs(amount - (offPeak ?? 0)) < 1e-9 || Math.abs(amount - (peak ?? 0)) < 1e-9).toBe(
      true,
    );
  });

  it("shows nothing when the provider reported no usage", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const job = jobFor(page, new UsageCaller(undefined));
    await job.run();
    expect(job.status().usage?.spend).toBeUndefined();
  });

  it("keeps a total-only report's tokens and refuses to price it", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const job = jobFor(page, new UsageCaller({ totalTokens: 5_500 }));
    await job.run();
    const spend = job.status().usage?.spend;
    expect(spend?.tokens.total).toBe(5_500);
    expect(spend?.price).toBeNull();
    expect(spend?.unavailable).toBe("usageIncomplete");
  });

  it("counts tokens but shows no price when the provider is outside the catalogue", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const job = jobFor(page, new UsageCaller(DEEPSEEK_USAGE), settings);
    await job.run();
    const spend = job.status().usage?.spend;
    expect(spend?.tokens.total).toBeGreaterThan(0);
    expect(spend?.price).toBeNull();
    expect(spend?.unavailable).toBe("noPriceList");
  });

  it("counts nothing for a response that delivered no translation", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const job = jobFor(page, new UsageCaller(DEEPSEEK_USAGE, true));
    await job.run();
    expect(job.status().usage?.spend).toBeUndefined();
  });

  it("counts a reused passage once: no request, no extra tokens", async () => {
    const page = buildPage(
      "<article><p>The same sentence appears twice here.</p><p>The same sentence appears twice here.</p></article>",
    );
    const caller = new UsageCaller(DEEPSEEK_USAGE);
    const job = jobFor(page, caller);
    await job.run();
    expect(caller.requests.length).toBe(1);
    expect(job.status().usage?.spend?.tokens.total).toBe(5_500);
  });
});

/** First request delivers with usage; every later one stalls until the run is cancelled. */
class SplitCaller implements BatchCaller {
  #calls = 0;

  async translate(
    payload: Parameters<BatchCaller["translate"]>[0],
    signal: AbortSignal,
  ): Promise<BatchReply> {
    this.#calls += 1;
    if (this.#calls === 1) {
      return {
        results: payload.segments.map((segment, index) => ({ index, text: PREFIX + segment })),
        failedIndices: [],
        usage: DEEPSEEK_USAGE,
      };
    }
    return new Promise<BatchReply>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(Object.assign(new Error("cancelled"), { errorClass: "cancelled" })),
        { once: true },
      );
    });
  }
}

describe("cancel and restore (R11)", () => {
  it("keeps the figures when the reader cancels mid-run", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const job = jobFor(page, new SplitCaller());
    job.collect();
    const [first, second] = job.units;
    if (!first || !second) throw new Error("expected two units");

    await job.dispatchUnits([first]);
    expect(job.status().usage?.spend?.tokens.total).toBe(5_500);

    const pending = job.dispatchUnits([second]);
    job.cancel();
    await pending;

    expect(job.status().state).toBe("cancelled");
    expect(job.status().usage?.spend?.tokens.total).toBe(5_500);
  });

  it("clears the figures when translation is turned off", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const job = jobFor(page, new UsageCaller(DEEPSEEK_USAGE));
    await job.run();
    expect(job.status().usage?.spend).toBeDefined();
    job.restore();
    expect(job.status().usage?.spend).toBeUndefined();
  });
});

describe("the reporting gate (R12, FR-023)", () => {
  it("stops reporting a figure once every counted translation has left the page", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const job = jobFor(page, new UsageCaller(DEEPSEEK_USAGE));
    await job.run();
    expect(job.status().usage?.spend).toBeDefined();

    for (const node of Array.from(page.document.querySelectorAll("[data-ipt]"))) node.remove();
    expect(job.status().usage?.spend).toBeUndefined();
  });
});

describe("the split the provider did not send (FR-008)", () => {
  it("records every prompt token as a miss when no cache counters arrive", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const caller = new UsageCaller({
      promptTokens: 5_000,
      completionTokens: 500,
      totalTokens: 5_500,
    });
    const job = jobFor(page, caller);
    await job.run();

    const spend = job.status().usage?.spend;
    expect(spend?.tokens.hit).toBe(0);
    expect(spend?.tokens.miss).toBe(caller.requests.length * 5_000);
    // Priced as if nothing was cached: 5,000 missed input + 500 output, at the tier's rates.
    const [offPeak, peak] = [caller.requests.length * 0.007, caller.requests.length * 0.014];
    const amount = spend?.price?.amount ?? -1;
    expect(Math.abs(amount - offPeak) < 1e-9 || Math.abs(amount - peak) < 1e-9).toBe(true);
  });
});

describe("the tier belongs to the request, not the queue (FR-011)", () => {
  it("prices a batch queued across 09:00 by the instant it is actually sent", async () => {
    const page = buildPage(TWO_PARAGRAPHS);
    const queuedAt = Date.parse("2026-03-10T08:59:59+08:00");
    const sentAt = Date.parse("2026-03-10T09:00:01+08:00");
    let clock = queuedAt;
    const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      const caller = new UsageCaller(DEEPSEEK_USAGE);
      // A limiter that holds the batch until the peak window has opened, then sends it.
      const limiter = {
        run: async <T>(task: () => Promise<T>): Promise<T> => {
          clock = sentAt;
          return task();
        },
      } as unknown as RequestLimiter;
      const job = new TranslationJob({
        document: page.document,
        root: page.body,
        settings: deepseekSettings,
        providerId: "p1",
        displayMode: "bilingual",
        targetLang: "zh",
        sourceLang: "en",
        caller,
        limiter,
        view: page.window,
      });
      await job.run();

      // 09:00:01 is peak, at exactly 2x the amount the queue instant would have produced.
      const amount = job.status().usage?.spend?.price?.amount ?? -1;
      expect(amount).toBeCloseTo(caller.requests.length * 0.00616, 10);
    } finally {
      now.mockRestore();
    }
  });
});
