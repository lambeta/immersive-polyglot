import { describe, expect, it } from "vitest";
import { RunSlot, sameTarget } from "../../src/content/run-slot.js";

/**
 * The decision table of data-model.md §1, exercised without DOM or timers. Case (b) is the race that
 * makes this feature necessary: two activations decided in the same synchronous step must never both
 * start a run (research R3).
 */

describe("RunSlot", () => {
  it("starts a run when the slot is empty", () => {
    const slot = new RunSlot();
    expect(slot.snapshot).toBeNull();
    expect(slot.claim({ sameTarget: false })).toBe("start");
    expect(slot.snapshot).toEqual({ phase: "starting" });
  });

  it("absorbs a second claim taken in the same synchronous step", () => {
    const slot = new RunSlot();
    expect(slot.claim({ sameTarget: false })).toBe("start");
    expect(slot.claim({ sameTarget: true })).toBe("absorb-running");
    expect(slot.claim({ sameTarget: false })).toBe("absorb-running");
    expect(slot.snapshot).toEqual({ phase: "starting" });
  });

  it("absorbs a repeat press while the run is in progress", () => {
    const slot = new RunSlot();
    slot.claim({ sameTarget: true });
    slot.markRunning();
    expect(slot.claim({ sameTarget: true })).toBe("absorb-running");
    expect(slot.snapshot).toEqual({ phase: "running" });
  });

  it("absorbs a repeat of the same target after completion", () => {
    const slot = new RunSlot();
    slot.claim({ sameTarget: true });
    slot.markRunning();
    slot.settle("completed");
    expect(slot.claim({ sameTarget: true })).toBe("absorb-repeat");
    expect(slot.snapshot).toEqual({ phase: "finished", outcome: "completed" });
  });

  it("replaces a finished run asked for a different target", () => {
    const slot = new RunSlot();
    slot.claim({ sameTarget: false });
    slot.markRunning();
    slot.settle("completed");
    expect(slot.claim({ sameTarget: false })).toBe("replace");
    expect(slot.snapshot).toEqual({ phase: "starting" });
  });

  it("absorbs a repeat after a failed run, so the failure is reported once", () => {
    const slot = new RunSlot();
    slot.claim({ sameTarget: true });
    slot.markRunning();
    slot.settle("failed");
    expect(slot.claim({ sameTarget: true })).toBe("absorb-repeat");
    expect(slot.snapshot).toEqual({ phase: "finished", outcome: "failed" });
  });

  it("replaces after an explicit stop, so exactly one new run starts", () => {
    const slot = new RunSlot();
    slot.claim({ sameTarget: true });
    slot.markRunning();
    slot.settle("cancelled");
    expect(slot.claim({ sameTarget: true })).toBe("replace");
    expect(slot.snapshot).toEqual({ phase: "starting" });
  });

  it("stays consistent when settle is called twice or before a claim", () => {
    const slot = new RunSlot();
    expect(() => slot.settle("failed")).not.toThrow();
    expect(slot.snapshot).toBeNull();

    slot.claim({ sameTarget: true });
    slot.settle("completed");
    expect(slot.snapshot).toEqual({ phase: "finished", outcome: "completed" });
    expect(() => slot.settle("failed")).not.toThrow();
    expect(slot.snapshot).toEqual({ phase: "finished", outcome: "completed" });
  });

  it("returns to empty after reset, so the next activation starts", () => {
    const slot = new RunSlot();
    slot.claim({ sameTarget: true });
    slot.markRunning();
    slot.settle("cancelled");
    slot.reset();
    expect(slot.snapshot).toBeNull();
    expect(slot.claim({ sameTarget: true })).toBe("start");
  });

  it("ignores markRunning when no claim is outstanding", () => {
    const slot = new RunSlot();
    slot.markRunning();
    expect(slot.snapshot).toBeNull();
  });
});
describe("sameTarget", () => {
  const paragraph = {} as Element;
  const other = {} as Element;

  it("treats two whole-page activations as the same target", () => {
    expect(sameTarget({ kind: "page" }, { kind: "page" })).toBe(true);
  });

  it("never treats a selection and a whole page as the same target", () => {
    expect(sameTarget({ kind: "selection", elements: [paragraph] }, { kind: "page" })).toBe(false);
    expect(sameTarget({ kind: "page" }, { kind: "selection", elements: [paragraph] })).toBe(false);
  });

  it("treats the same elements in the same order as the same selection", () => {
    expect(
      sameTarget(
        { kind: "selection", elements: [paragraph, other] },
        { kind: "selection", elements: [paragraph, other] },
      ),
    ).toBe(true);
  });

  it("separates selections that differ by one element, by order, or by length", () => {
    expect(
      sameTarget(
        { kind: "selection", elements: [paragraph, other] },
        { kind: "selection", elements: [paragraph] },
      ),
    ).toBe(false);
    expect(
      sameTarget(
        { kind: "selection", elements: [paragraph, other] },
        { kind: "selection", elements: [other, paragraph] },
      ),
    ).toBe(false);
    expect(
      sameTarget(
        { kind: "selection", elements: [paragraph] },
        { kind: "selection", elements: [other] },
      ),
    ).toBe(false);
  });

  it("never reports the same target when either side is absent or empty", () => {
    expect(sameTarget(null, { kind: "page" })).toBe(false);
    expect(sameTarget({ kind: "page" }, null)).toBe(false);
    expect(sameTarget({ kind: "selection", elements: [] }, { kind: "selection", elements: [] })).toBe(
      false,
    );
  });
});
