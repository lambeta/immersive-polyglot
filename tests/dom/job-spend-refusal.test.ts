import { describe, expect, it } from "vitest";
import {
  TranslationJob,
  type BatchCaller,
  type BatchReply,
  type BatchRequestPayload,
} from "../../src/content/job.js";
import { VolumeBudget } from "../../src/content/limiter.js";
import type { Settings, UsageReport } from "../../src/shared/types.js";
import { buildPage, type TestPage } from "./helpers.js";
import { PREFIX, settings } from "./job-harness.js";
import { WORKED_USAGE } from "../support/spend-fixtures.js";

/**
 * Feature 008: T5, T6, SC-005 — what the record must leave out. Reused passages, passages the volume
 * cap skipped and a response that never reached the page add neither tokens nor price, and one
 * response that cannot be priced suppresses the whole run's price rather than part of it.
 */

const DEEPSEEK: Settings = {
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

/** Answers every batch with a translation and the usage it was given, one reply per call. */
class UsageCaller implements BatchCaller {
  readonly requests: string[][] = [];
  readonly #replies: UsageReport[];

  constructor(...replies: UsageReport[]) {
    this.#replies = replies.length > 0 ? replies : [WORKED_USAGE];
  }

  async translate(payload: BatchRequestPayload): Promise<BatchReply> {
    const index = Math.min(this.requests.length, this.#replies.length - 1);
    const usage = this.#replies[index];
    this.requests.push([...payload.segments]);
    return {
      results: payload.segments.map((segment, position) => ({
        index: position,
        text: PREFIX + segment,
      })),
      failedIndices: [],
      ...(usage ? { usage } : {}),
    };
  }
}

function jobFor(page: TestPage, caller: BatchCaller, budget?: VolumeBudget): TranslationJob {
  return new TranslationJob({
    document: page.document,
    root: page.body,
    settings: DEEPSEEK,
    providerId: "p1",
    displayMode: "bilingual",
    targetLang: "zh",
    sourceLang: "en",
    caller,
    ...(budget ? { budget } : {}),
    view: page.window,
  });
}

const FRESH = ["Alpha one.", "Bravo two.", "Charlie three.", "Delta four."];
/** Ten blocks over four texts: six of the ten the reader sees are reuse (60 %). */
const WITH_REUSE = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1];

describe("work the record must not pay for (SC-005, FR-018)", () => {
  it("charges only the fresh responses when 60 % of the page is reuse", async () => {
    const page = buildPage(
      `<article>${WITH_REUSE.map((index) => `<p>${FRESH[index] ?? ""}</p>`).join("")}</article>`,
    );
    const caller = new UsageCaller();
    const job = jobFor(page, caller);
    await job.run();

    // Ten translations on the page, four unique texts, so exactly the four were requested.
    expect(page.document.querySelectorAll('[data-ipt="target"]')).toHaveLength(10);
    expect(caller.requests).toHaveLength(1);
    expect(caller.requests[0]).toEqual(FRESH);

    const spend = job.status().usage?.spend;
    expect(spend?.tokens.total).toBe(5_500);
    expect(spend?.price).not.toBeNull();
  });

  it("counts nothing for the passages the volume cap skipped", async () => {
    const paragraphs = Array.from(
      { length: 8 },
      (_, index) => `<p>Paragraph ${index} about the harbour records and their toll books.</p>`,
    ).join("");
    const page = buildPage(`<article>${paragraphs}</article>`);
    const caller = new UsageCaller();
    const budget = new VolumeBudget({ sessionCapSegments: 3, sessionCapChars: 0 });
    const job = jobFor(page, caller, budget);
    await job.run();

    const status = job.status();
    expect(status.counts.skipped).toBeGreaterThan(0);
    const dispatched = caller.requests.flat().length;
    expect(dispatched).toBeLessThanOrEqual(3);
    // The record reports what was asked and answered; the skipped passages were never sent.
    expect(status.usage?.spend?.tokens.total).toBe(caller.requests.length * 5_500);
  });
});

describe("one unpriced response suppresses the whole run's price (FR-006, FR-010)", () => {
  it("keeps counting tokens and withdraws the amount for the full run", async () => {
    const page = buildPage(
      "<article><p>First paragraph of the article.</p><p>Second paragraph of the article.</p></article>",
    );
    // First response prices; the second reports a total with no input/output split.
    const caller = new UsageCaller(WORKED_USAGE, { totalTokens: 5_500 });
    const job = jobFor(page, caller);
    job.collect();
    const [first, second] = job.units;
    if (!first || !second) throw new Error("expected two units");

    await job.dispatchUnits([first]);
    expect(job.status().usage?.spend?.price).not.toBeNull();

    await job.dispatchUnits([second]);
    const spend = job.status().usage?.spend;
    expect(spend?.price).toBeNull();
    expect(spend?.unavailable).toBe("usageIncomplete");
    expect(spend?.tokens.total).toBe(11_000);
  });
});
