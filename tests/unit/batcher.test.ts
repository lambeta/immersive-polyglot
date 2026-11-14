import { describe, expect, it } from "vitest";
import { estimateTokens, planBatches } from "../../src/content/batcher.js";
import type { BatchPlan } from "../../src/content/batcher.js";
import type { TranslationUnit, UnitState } from "../../src/shared/types.js";

/** Runs in the node environment: the batcher is pure bookkeeping over unit records. */

function unit(id: string, sourceText: string, state: UnitState = "queued"): TranslationUnit {
  return { id, sourceText, sourceLang: "en", targetLang: "zh", state, attempts: 0, partIndex: 0 };
}

function filler(chars: number): string {
  return "a".repeat(chars);
}

function planOf(plan: BatchPlan, id: string): { batch: number; position: number } {
  const entry = plan.byUnitId[id];
  if (!entry) throw new Error(`unit ${id} is not in the plan`);
  return entry;
}

describe("estimateTokens", () => {
  it("charges a quarter character each plus a fixed per-unit overhead", () => {
    expect(estimateTokens("")).toBe(4);
    expect(estimateTokens("abc")).toBe(5);
    expect(estimateTokens("abcd")).toBe(5);
    expect(estimateTokens("a".repeat(1500))).toBe(379);
  });
});

describe("planBatches", () => {
  it("packs under the default 1,500 token budget", () => {
    const units = Array.from({ length: 20 }, (_, index) => unit(`u${index}`, filler(300)));

    const plan = planBatches(units);

    expect(plan.batches).toHaveLength(2);
    expect(plan.batches.map((batch) => batch.units.length)).toEqual([18, 2]);
    for (const batch of plan.batches) expect(batch.estimatedTokens).toBeLessThanOrEqual(1500);
    expect(plan.batches[0]!.units).toHaveLength(18);
    expect(plan.batches[1]!.units).toHaveLength(2);
    expect(plan.batches.flatMap((batch) => batch.units).map((entry) => entry.id)).toEqual(
      units.map((entry) => entry.id),
    );
  });

  it("reports the estimated cost of each batch as the sum of its units", () => {
    const units = [unit("a", filler(100)), unit("b", filler(200)), unit("c", filler(50))];

    const plan = planBatches(units, { tokenBudget: 100 });

    for (const batch of plan.batches) {
      const expected = batch.units.reduce((total, entry) => total + estimateTokens(entry.sourceText), 0);
      expect(batch.estimatedTokens).toBe(expected);
    }
  });

  it("fills a batch exactly to the budget and splits one token over it", () => {
    const units = [unit("a", filler(16)), unit("b", filler(16))];

    const exact = planBatches(units, { tokenBudget: 16 });
    expect(exact.batches).toHaveLength(1);

    const tight = planBatches(units, { tokenBudget: 15 });
    expect(tight.batches).toHaveLength(2);
  });

  it("gives a unit larger than the budget a batch of its own", () => {
    const units = [unit("small-a", filler(4)), unit("huge", filler(100)), unit("small-b", filler(4))];

    const plan = planBatches(units, { tokenBudget: 10 });

    expect(plan.batches.map((batch) => batch.units.map((entry) => entry.id))).toEqual([
      ["small-a"],
      ["huge"],
      ["small-b"],
    ]);
    expect(plan.batches[1]!.units).toHaveLength(1);
    expect(plan.batches[1]!.estimatedTokens).toBeGreaterThan(10);
  });

  it("batches only queued units", () => {
    const units = [
      unit("queued-a", filler(40)),
      unit("skipped-a", filler(40), "skipped"),
      unit("translated-a", filler(40), "translated"),
      unit("failed-a", filler(40), "failed"),
      unit("queued-b", filler(40)),
    ];

    const plan = planBatches(units, { tokenBudget: 1000 });

    expect(plan.batches.flatMap((batch) => batch.units).map((entry) => entry.id)).toEqual([
      "queued-a",
      "queued-b",
    ]);
    expect(plan.byUnitId["skipped-a"]).toBeUndefined();
    expect(plan.byUnitId["translated-a"]).toBeUndefined();
    expect(plan.byUnitId["failed-a"]).toBeUndefined();
  });

  it("maps every batched unit to its batch and position", () => {
    const units = Array.from({ length: 5 }, (_, index) => unit(`u${index}`, filler(80)));

    const plan = planBatches(units, { tokenBudget: 60 });

    let seen = 0;
    for (const entry of units) {
      const location = planOf(plan, entry.id);
      const batch = plan.batches[location.batch]!;
      expect(batch.units[location.position]!.id).toBe(entry.id);
      expect(location.position).toBeGreaterThanOrEqual(0);
      expect(location.position).toBeLessThan(batch.units.length);
      seen += 1;
    }
    expect(seen).toBe(units.length);
    expect(Object.keys(plan.byUnitId)).toHaveLength(units.length);
  });

  it("keeps every unit whole and in document order", () => {
    const units = [unit("one", filler(120)), unit("two", filler(30)), unit("three", filler(90))];

    const plan = planBatches(units);

    expect(plan.batches.flatMap((batch) => batch.units)).toEqual(units);
    expect(plan.batches.flatMap((batch) => batch.units)).toHaveLength(units.length);
  });

  it("numbers batches from zero without gaps", () => {
    const units = Array.from({ length: 6 }, (_, index) => unit(`u${index}`, filler(200)));

    const plan = planBatches(units, { tokenBudget: 100 });

    expect(plan.batches.map((batch) => batch.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("is deterministic for the same input", () => {
    const units = Array.from({ length: 9 }, (_, index) => unit(`u${index}`, filler(70)));

    expect(planBatches(units)).toEqual(planBatches(units));
  });

  it("plans nothing when there is nothing to translate", () => {
    expect(planBatches([])).toEqual({ batches: [], byUnitId: {} });
    expect(planBatches([unit("only", "text", "skipped")])).toEqual({ batches: [], byUnitId: {} });
  });

  it("leaves the input untouched", () => {
    const units = [unit("a", filler(30)), unit("b", filler(30))];
    const snapshot = JSON.stringify(units);

    planBatches(units);

    expect(JSON.stringify(units)).toBe(snapshot);
    expect(units.map((entry) => entry.state)).toEqual(["queued", "queued"]);
  });
});
