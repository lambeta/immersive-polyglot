import { describe, expect, it } from "vitest";
import { mapBatchResults, planPage, unitIdOf } from "../../../src/plugin/host/page-batch.js";
import type { AnswerProse } from "../../../src/plugin/host/answers.js";

const prose = (messageId: string, texts: string[]): AnswerProse => {
  const segments = texts.map((text, blockIndex) => ({ blockIndex, kind: "text" as const, text }));
  return { messageId, blocks: segments, segments, sourceHash: "sha256:" + messageId };
};

const limits = { maxAnswersPerPage: 3, maxCharsPerBatch: 6000 };

describe("planPage", () => {
  it("packs a page's answers into batches that preserve order and one unit per block", () => {
    const plan = planPage([prose("m-1", ["a", "b"]), prose("m-2", ["c"])], new Set(), limits);
    const units = plan.batches.flatMap((batch) => batch.segments);
    expect(units.map((unit) => unit.unitId)).toEqual([unitIdOf("m-1", 0), unitIdOf("m-1", 1), unitIdOf("m-2", 0)]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips an answer that already holds a translation", () => {
    const plan = planPage([prose("m-1", ["a"]), prose("m-2", ["b"])], new Set(["m-1"]), limits);
    expect(plan.skipped).toEqual([{ messageId: "m-1", reason: "alreadyTranslated" }]);
    expect(plan.batches.flatMap((batch) => batch.segments).map((unit) => unit.messageId)).toEqual(["m-2"]);
  });

  it("reports answers beyond the page cap instead of dropping them silently", () => {
    const plan = planPage([prose("m-1", ["a"]), prose("m-2", ["b"]), prose("m-3", ["c"]), prose("m-4", ["d"])], new Set(), limits);
    expect(plan.skipped).toEqual([{ messageId: "m-4", reason: "capReached" }]);
  });

  it("splits a page that exceeds the character budget into several requests", () => {
    const long = "x".repeat(1200);
    const plan = planPage([prose("m-1", [long]), prose("m-2", [long]), prose("m-3", [long])], new Set(), { maxAnswersPerPage: 12, maxCharsPerBatch: 1300 });
    expect(plan.batches.length).toBeGreaterThan(1);
    expect(plan.batches.flatMap((batch) => batch.segments)).toHaveLength(3);
  });

  it("maps a returned array back to units, and fails when the count does not match", () => {
    const plan = planPage([prose("m-1", ["a", "b"])], new Set(), limits);
    const batch = plan.batches[0];
    expect(batch).toBeDefined();
    if (batch === undefined) return;
    const ok = mapBatchResults(batch, [{ index: 0, text: "甲" }, { index: 1, text: "乙" }]);
    expect(ok.ok && ok.byUnitId.get(unitIdOf("m-1", 1))).toBe("乙");
    expect(mapBatchResults(batch, [{ index: 0, text: "甲" }]).ok).toBe(false);
  });
});
