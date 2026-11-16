import type { DemandGroup } from "./demand.js";

/**
 * Order and concurrency of outbound batches (feature 007, contracts/dispatch-queue.md).
 *
 * The queue exists because two rules pull in opposite directions: what the reader is looking at
 * must go first (FR-013), and a batch that has already been sent must never be cancelled (R5) —
 * its cost is already the reader's. So the queue re-sorts what it has not started and leaves what
 * it has alone. `RequestLimiter` stays the hard ceiling; this class simply never hands it more than
 * it can start (R6).
 */

export type BatchPhase = "queued" | "started" | "settled";

export interface PumpBatch<T> {
  units: T[];
  group: DemandGroup;
  /** Document-order rank of the best passage this batch serves; breaks ties inside a group. */
  rank: number;
  phase: BatchPhase;
}

export interface PumpEntry<T> {
  units: T[];
  group: DemandGroup;
  rank: number;
}

export interface DemandPumpOptions<T> {
  ceiling: number;
  dispatch(batch: PumpBatch<T>): Promise<void>;
}

export class DemandPump<T> {
  readonly #ceiling: number;
  readonly #dispatch: (batch: PumpBatch<T>) => Promise<void>;
  readonly #batches: PumpBatch<T>[] = [];
  readonly #idleWaiters: Array<() => void> = [];
  #started = 0;
  #cancelled = false;

  constructor(options: DemandPumpOptions<T>) {
    this.#ceiling = Math.max(1, Math.floor(options.ceiling));
    this.#dispatch = options.dispatch;
  }

  get queuedCount(): number {
    return this.#batches.filter((batch) => batch.phase === "queued").length;
  }

  get startedCount(): number {
    return this.#started;
  }

  /** Snapshot for tests and diagnostics: what is waiting, in the order it will be started. */
  get batches(): readonly PumpBatch<T>[] {
    return this.#batches.map((batch) => ({ ...batch, units: batch.units.slice() }));
  }

  enqueue(entries: readonly PumpEntry<T>[]): void {
    if (this.#cancelled) return;
    for (const entry of entries) {
      this.#batches.push({ ...entry, phase: "queued" });
    }
    this.#sortQueued();
  }

  /**
   * Re-ranks work that has not started. A started batch is never touched, because its cost has
   * already left and a second request for the same passage would be a second charge (FR-020).
   */
  resort(update: (batch: PumpBatch<T>) => Pick<PumpBatch<T>, "group" | "rank">): void {
    for (const batch of this.#batches) {
      if (batch.phase !== "queued") continue;
      const next = update(batch);
      batch.group = next.group;
      batch.rank = next.rank;
    }
    this.#sortQueued();
    this.pump();
  }

  /** Starts as much as the ceiling allows, in queue order. */
  pump(): void {
    if (this.#cancelled) return;
    while (this.#started < this.#ceiling) {
      const next = this.#batches.find((batch) => batch.phase === "queued");
      if (!next) break;
      this.#start(next);
    }
  }

  /** Drops everything unsent. In-flight batches are the job's to abort, not the queue's. */
  cancel(): void {
    this.#cancelled = true;
    for (let index = this.#batches.length - 1; index >= 0; index -= 1) {
      if (this.#batches[index]?.phase === "queued") this.#batches.splice(index, 1);
    }
    this.#settleIdle();
  }

  /** Resolves when this queue has nothing queued and nothing in flight. */
  whenIdle(): Promise<void> {
    if (this.#started === 0 && this.queuedCount === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.#idleWaiters.push(resolve));
  }

  #start(batch: PumpBatch<T>): void {
    batch.phase = "started";
    this.#started += 1;
    void this.#dispatch(batch)
      .catch(() => undefined)
      .finally(() => {
        batch.phase = "settled";
        this.#started -= 1;
        const index = this.#batches.indexOf(batch);
        if (index >= 0) this.#batches.splice(index, 1);
        this.#settleIdle();
        this.pump();
      });
  }

  #settleIdle(): void {
    if (this.#started !== 0 || this.queuedCount !== 0) return;
    for (const resolve of this.#idleWaiters.splice(0)) resolve();
  }

  #sortQueued(): void {
    const weight = (group: DemandGroup): number => (group === "visible" ? 0 : 1);
    this.#batches.sort((left, right) => {
      if (left.phase !== right.phase) return left.phase === "queued" ? -1 : 1;
      if (weight(left.group) !== weight(right.group)) return weight(left.group) - weight(right.group);
      return left.rank - right.rank;
    });
  }
}
