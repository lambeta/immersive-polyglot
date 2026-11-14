import { describe, expect, it } from "vitest";
import { RequestLimiter, VolumeBudget } from "../../src/content/limiter.js";
import type { CapConfig } from "../../src/content/limiter.js";
import { ProviderError } from "../../src/background/provider-client.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every pending microtask and the limiter's slot bookkeeping run. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const caps = (config: Partial<CapConfig> = {}): CapConfig => ({
  sessionCapSegments: 0,
  sessionCapChars: 0,
  ...config,
});

describe("RequestLimiter concurrency", () => {
  it("never runs more than maxConcurrency tasks at once", async () => {
    const limiter = new RequestLimiter({ maxConcurrency: 2 });
    const gates = [deferred<string>(), deferred<string>(), deferred<string>(), deferred<string>()];
    const started: number[] = [];

    const results = gates.map((gate, index) =>
      limiter.run(async () => {
        started.push(index);
        return gate.promise;
      }),
    );

    expect(started).toEqual([0, 1]);
    expect(limiter.inFlight).toBe(2);

    gates[0]?.resolve("a");
    await settle();
    expect(started).toEqual([0, 1, 2]);

    gates[1]?.resolve("b");
    await settle();
    expect(started).toEqual([0, 1, 2, 3]);
    gates[2]?.resolve("c");
    gates[3]?.resolve("d");

    await expect(Promise.all(results)).resolves.toEqual(["a", "b", "c", "d"]);
    expect(limiter.inFlight).toBe(0);
  });

  it("records the observed peak, not the configured ceiling", async () => {
    const limiter = new RequestLimiter({ maxConcurrency: 4 });
    const gate = deferred<void>();
    const running = [
      limiter.run(async () => gate.promise),
      limiter.run(async () => gate.promise),
      limiter.run(async () => gate.promise),
    ];
    await settle();
    expect(limiter.inFlight).toBe(3);
    expect(limiter.peakInFlight).toBe(3);
    gate.resolve();
    await Promise.all(running);
    expect(limiter.peakInFlight).toBe(3);
    expect(limiter.inFlight).toBe(0);
  });

  it("frees a slot when a task rejects", async () => {
    const limiter = new RequestLimiter({ maxConcurrency: 1 });
    const second = deferred<string>();
    const first = limiter.run(async () => {
      throw new Error("provider exploded");
    });
    const queued = limiter.run(async () => second.promise);

    await expect(first).rejects.toThrow("provider exploded");
    await settle();
    expect(limiter.inFlight).toBe(1);
    second.resolve("later");
    await expect(queued).resolves.toBe("later");
    expect(limiter.inFlight).toBe(0);
  });

  it("treats a maxConcurrency below 1 as a single slot", async () => {
    const limiter = new RequestLimiter({ maxConcurrency: 0 });
    const gate = deferred<void>();
    const started: number[] = [];
    const running = [
      limiter.run(async () => {
        started.push(1);
        return gate.promise;
      }),
      limiter.run(async () => {
        started.push(2);
      }),
    ];
    await settle();
    expect(started).toEqual([1]);
    gate.resolve();
    await Promise.all(running);
    expect(started).toEqual([1, 2]);
    expect(limiter.peakInFlight).toBe(1);
  });
});

describe("RequestLimiter cancellation", () => {
  it("passes a live AbortSignal to every task", async () => {
    const limiter = new RequestLimiter({ maxConcurrency: 1 });
    let received: AbortSignal | undefined;
    await limiter.run(async (signal) => {
      received = signal;
    });
    expect(received).toBeInstanceOf(AbortSignal);
    expect(received?.aborted).toBe(false);
  });

  it("aborts every in-flight task and rejects queued work as cancelled", async () => {
    const limiter = new RequestLimiter({ maxConcurrency: 2 });
    const signals: AbortSignal[] = [];

    const inflight = [
      limiter.run(
        (signal) =>
          new Promise<never>((_, reject) => {
            signals.push(signal);
            signal.addEventListener("abort", () => reject(new Error("task saw the abort")), {
              once: true,
            });
          }),
      ),
      limiter.run(
        (signal) =>
          new Promise<never>((_, reject) => {
            signals.push(signal);
            signal.addEventListener("abort", () => reject(new Error("task saw the abort")), {
              once: true,
            });
          }),
      ),
    ];
    const queued = limiter.run(async () => "never runs");

    await settle();
    expect(signals).toHaveLength(2);

    limiter.cancelAll("user cancelled");

    expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
    await Promise.all(inflight.map((task) => task.catch((error: unknown) => error)));

    const queuedError = await queued.then(
      (value) => {
        throw new Error(`queued task unexpectedly resolved: ${value}`);
      },
      (error: unknown) => error,
    );
    expect(queuedError).toBeInstanceOf(ProviderError);
    expect((queuedError as ProviderError).errorClass).toBe("cancelled");
    expect((queuedError as ProviderError).retryable).toBe(false);
  });

  it("refuses new work after cancelAll and only resumes after reset", async () => {
    const limiter = new RequestLimiter({ maxConcurrency: 2 });
    limiter.cancelAll();

    const refused = await limiter.run(async () => "should not run").then(
      (value) => {
        throw new Error(`task unexpectedly resolved: ${value}`);
      },
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(ProviderError);
    expect((refused as ProviderError).errorClass).toBe("cancelled");

    limiter.reset();
    await expect(limiter.run(async () => "runs again")).resolves.toBe("runs again");
    expect(limiter.inFlight).toBe(0);
  });
});

describe("VolumeBudget caps", () => {
  it("treats a zero cap as no cap in that dimension", () => {
    const budget = new VolumeBudget(caps());
    for (let index = 0; index < 100; index += 1) {
      expect(budget.tryReserve(10, 10_000)).toBe(true);
    }
    expect(budget.consumedSegments).toBe(1000);
    expect(budget.consumedChars).toBe(1_000_000);
    expect(budget.reached).toBe(false);
    expect(budget.state).toEqual({ cap: 0, consumed: 1000, reached: false });
  });

  it("admits reservations up to the segment cap and refuses the crossing one", () => {
    const budget = new VolumeBudget(caps({ sessionCapSegments: 3 }));
    expect(budget.tryReserve(1, 10)).toBe(true);
    expect(budget.tryReserve(1, 10)).toBe(true);
    expect(budget.tryReserve(1, 10)).toBe(true);
    expect(budget.consumedSegments).toBe(3);
    expect(budget.reached).toBe(false);

    expect(budget.tryReserve(1, 10)).toBe(false);
    expect(budget.reached).toBe(true);
    expect(budget.consumedSegments).toBe(3);
    expect(budget.consumedChars).toBe(30);
    expect(budget.state).toEqual({ cap: 3, consumed: 3, reached: true });
  });

  it("refuses a batch that would jump past the cap instead of part-admitting it", () => {
    const budget = new VolumeBudget(caps({ sessionCapSegments: 10 }));
    expect(budget.tryReserve(8, 80)).toBe(true);
    expect(budget.tryReserve(5, 50)).toBe(false);
    expect(budget.consumedSegments).toBe(8);
    expect(budget.consumedChars).toBe(80);
  });

  it("stops on the character cap even when segments are available", () => {
    const budget = new VolumeBudget(caps({ sessionCapSegments: 100, sessionCapChars: 100 }));
    expect(budget.tryReserve(1, 60)).toBe(true);
    expect(budget.tryReserve(1, 41)).toBe(false);
    expect(budget.reached).toBe(true);
    expect(budget.consumedChars).toBe(60);
    expect(budget.state.cap).toBe(100);
  });

  it("reports the smallest non-zero cap as the binding cap", () => {
    const budget = new VolumeBudget(
      caps({ sessionCapSegments: 50, sessionCapChars: 900, siteCapSegments: 20 }),
    );
    expect(budget.state.cap).toBe(20);
    expect(budget.tryReserve(20, 20)).toBe(true);
    expect(budget.tryReserve(1, 1)).toBe(false);
    expect(budget.reached).toBe(true);
  });

  it("keeps reached once set and lets release restore budget for a cancelled batch", () => {
    const budget = new VolumeBudget(caps({ sessionCapSegments: 4 }));
    expect(budget.tryReserve(4, 40)).toBe(true);
    expect(budget.tryReserve(1, 10)).toBe(false);
    expect(budget.reached).toBe(true);

    budget.release(4, 40);
    expect(budget.consumedSegments).toBe(0);
    expect(budget.consumedChars).toBe(0);
    expect(budget.reached).toBe(true);
    expect(budget.tryReserve(2, 20)).toBe(true);
    expect(budget.consumedSegments).toBe(2);
  });

  it("never lets release push consumption below zero", () => {
    const budget = new VolumeBudget(caps({ sessionCapSegments: 5 }));
    budget.tryReserve(1, 5);
    budget.release(10, 100);
    expect(budget.consumedSegments).toBe(0);
    expect(budget.consumedChars).toBe(0);
    expect(budget.tryReserve(5, 5)).toBe(true);
  });
});
