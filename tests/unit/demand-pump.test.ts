import { describe, expect, it } from "vitest";
import { DemandPump, type PumpBatch } from "../../src/content/demand-pump.js";

/** Feature 007 US2: order and concurrency of outbound batches (contracts/dispatch-queue.md). */

function controlled() {
  const started: string[][] = [];
  const pending: Array<() => void> = [];
  const dispatch = (batch: PumpBatch<string>): Promise<void> => {
    started.push(batch.units.slice());
    return new Promise<void>((resolve) => pending.push(() => resolve()));
  };
  return {
    started,
    dispatch,
    release(count = 1) {
      for (let index = 0; index < count; index += 1) pending.shift()?.();
    },
    pendingCount: () => pending.length,
  };
}

const entry = (units: string[], group: "visible" | "lookahead", rank: number) => ({
  units,
  group,
  rank,
});

describe("the dispatch queue", () => {
  it("starts visible batches before lookahead ones, whatever order they arrived in", () => {
    const control = controlled();
    const pump = new DemandPump<string>({ ceiling: 4, dispatch: control.dispatch });

    pump.enqueue([entry(["ahead"], "lookahead", 2), entry(["visible"], "visible", 1)]);
    pump.pump();

    expect(control.started[0]).toEqual(["visible"]);
  });

  it("never starts more than the ceiling allows and starts the next as one retires", async () => {
    const control = controlled();
    const pump = new DemandPump<string>({ ceiling: 2, dispatch: control.dispatch });

    pump.enqueue([
      entry(["a"], "visible", 0),
      entry(["b"], "visible", 1),
      entry(["c"], "visible", 2),
    ]);
    pump.pump();

    expect(control.started).toHaveLength(2);
    expect(pump.startedCount).toBe(2);

    control.release(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(control.started).toHaveLength(3);
  });

  it("re-sorts work that has not started yet behind what the reader now sees", () => {
    const control = controlled();
    const pump = new DemandPump<string>({ ceiling: 1, dispatch: control.dispatch });

    pump.enqueue([entry(["left-behind"], "visible", 5), entry(["next"], "visible", 9)]);
    pump.pump();
    expect(control.started[0]).toEqual(["left-behind"]);

    // The reader scrolled: the queued batch is now in the lookahead, and a fresh one is visible.
    pump.enqueue([entry(["now-visible"], "visible", 1)]);
    pump.resort((batch) => (batch.units.includes("next") ? { group: "lookahead", rank: 9 } : { group: "visible", rank: 5 }));

    control.release(1);
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        expect(control.started[1]).toEqual(["now-visible"]);
      });
  });

  it("never cancels a batch it has already started when the reader moves away", async () => {
    const control = controlled();
    const pump = new DemandPump<string>({ ceiling: 1, dispatch: control.dispatch });

    pump.enqueue([entry(["sent"], "visible", 1)]);
    pump.pump();
    expect(control.started[0]).toEqual(["sent"]);

    pump.resort(() => ({ group: "lookahead", rank: 99 }));
    pump.cancel();

    expect(pump.startedCount).toBe(1);
    expect(pump.queuedCount).toBe(0);
    control.release(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(pump.startedCount).toBe(0);
  });

  it("drops everything unsent on cancellation", () => {
    const control = controlled();
    const pump = new DemandPump<string>({ ceiling: 1, dispatch: control.dispatch });

    pump.enqueue([entry(["sent"], "visible", 0), entry(["queued"], "visible", 1)]);
    pump.pump();
    expect(pump.queuedCount).toBe(1);

    pump.cancel();
    expect(pump.queuedCount).toBe(0);
  });

  it("reports idle only when nothing is queued and nothing is in flight", async () => {
    const control = controlled();
    const pump = new DemandPump<string>({ ceiling: 2, dispatch: control.dispatch });
    pump.enqueue([entry(["a"], "visible", 0)]);
    pump.pump();

    let idle = false;
    const idlePromise = pump.whenIdle().then(() => {
      idle = true;
    });
    await Promise.resolve();
    expect(idle).toBe(false);

    control.release(1);
    await idlePromise;
    expect(idle).toBe(true);
  });
});
