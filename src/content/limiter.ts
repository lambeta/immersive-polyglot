import { ProviderError } from "../background/provider-client.js";
import type { CapState } from "../shared/types.js";

/**
 * FR-027 / FR-029 / FR-012: the two bounds the content script puts on outbound work - how many
 * requests may be in flight (and how they are cancelled) and how much volume a run may spend
 * before it stops dispatching. Pure bookkeeping, so it runs in node and in the page.
 */

export interface CapConfig {
  sessionCapSegments: number;
  sessionCapChars: number;
  siteCapSegments?: number;
}

export type { CapState };

/**
 * Volume accounting behind `TranslationJob.capState`. A zero cap means "no cap" for that
 * dimension; the smallest non-zero cap is the one the reader actually meets first, so it is what
 * the state reports.
 */
export class VolumeBudget {
  readonly #config: CapConfig;
  #consumedSegments = 0;
  #consumedChars = 0;
  #reached = false;

  constructor(config: CapConfig) {
    this.#config = config;
  }

  get consumedSegments(): number {
    return this.#consumedSegments;
  }

  get consumedChars(): number {
    return this.#consumedChars;
  }

  get reached(): boolean {
    return this.#reached;
  }

  get state(): CapState {
    return { cap: this.#bindingCap(), consumed: this.#consumedSegments, reached: this.#reached };
  }

  /** false when the reservation would exceed a cap; sets reached. */
  tryReserve(segments: number, chars: number): boolean {
    const overSegments = this.#exceeds(this.#config.sessionCapSegments, this.#consumedSegments, segments);
    const overChars = this.#exceeds(this.#config.sessionCapChars, this.#consumedChars, chars);
    const siteCap = this.#config.siteCapSegments ?? 0;
    const overSite = this.#exceeds(siteCap, this.#consumedSegments, segments);

    if (overSegments || overChars || overSite) {
      this.#reached = true;
      return false;
    }

    this.#consumedSegments += segments;
    this.#consumedChars += chars;
    return true;
  }

  /** Returns budget after a cancellation or a failed dispatch. */
  release(segments: number, chars: number): void {
    // `reached` is a record of a refusal, not a running total; giving budget back does not
    // rewrite the fact that the run had to stop. Dispatch resumes because the counters allow it,
    // not because the flag was cleared.
    this.#consumedSegments = Math.max(0, this.#consumedSegments - segments);
    this.#consumedChars = Math.max(0, this.#consumedChars - chars);
  }

  #bindingCap(): number {
    const caps = [
      this.#config.sessionCapSegments,
      this.#config.sessionCapChars,
      this.#config.siteCapSegments ?? 0,
    ].filter((cap) => cap > 0);
    return caps.length === 0 ? 0 : Math.min(...caps);
  }

  #exceeds(cap: number, consumed: number, requested: number): boolean {
    if (cap <= 0) return false;
    return consumed + requested > cap;
  }
}

interface QueueEntry {
  start(): void;
  reject(error: unknown): void;
}

export interface RequestLimiterOptions {
  maxConcurrency: number;
}

/**
 * The concurrency ceiling of FR-027 plus the abort path of FR-012: every task gets a signal, and
 * cancelAll reaches everything at once so a cancellation completes within its 2 s budget instead
 * of draining a queue task by task.
 */
export class RequestLimiter {
  readonly #maxConcurrency: number;
  readonly #queue: QueueEntry[] = [];
  readonly #controllers = new Set<AbortController>();
  #inFlight = 0;
  #peakInFlight = 0;
  #cancelledReason: string | null = null;

  constructor(options: RequestLimiterOptions) {
    this.#maxConcurrency = Math.max(1, Math.floor(options.maxConcurrency));
  }

  get inFlight(): number {
    return this.#inFlight;
  }

  get peakInFlight(): number {
    return this.#peakInFlight;
  }

  run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.#cancelledReason !== null) {
      return Promise.reject(new ProviderError("cancelled", this.#cancelledReason));
    }

    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry = {
        start: () => this.#start(task, resolve, reject),
        reject,
      };
      this.#queue.push(entry);
      this.#pump();
    });
  }

  /** Aborts in-flight work and rejects everything still queued; run() refuses new work until reset. */
  cancelAll(reason = "Translation cancelled"): void {
    this.#cancelledReason = reason;
    const queued = this.#queue.splice(0);
    for (const entry of queued) {
      entry.reject(new ProviderError("cancelled", reason, { retryable: false }));
    }
    for (const controller of this.#controllers) controller.abort(reason);
  }

  /** Re-arms the limiter for a new job; the counters and the peak stay as the run's record. */
  reset(): void {
    this.#cancelledReason = null;
  }

  #start<T>(
    task: (signal: AbortSignal) => Promise<T>,
    resolve: (value: T) => void,
    reject: (error: unknown) => void,
  ): void {
    const controller = new AbortController();
    this.#controllers.add(controller);
    this.#inFlight += 1;
    this.#peakInFlight = Math.max(this.#peakInFlight, this.#inFlight);

    void (async () => {
      try {
        resolve(await task(controller.signal));
      } catch (error) {
        reject(error);
      } finally {
        this.#controllers.delete(controller);
        this.#inFlight -= 1;
        this.#pump();
      }
    })();
  }

  #pump(): void {
    if (this.#cancelledReason !== null) return;
    while (this.#inFlight < this.#maxConcurrency) {
      const entry = this.#queue.shift();
      if (entry === undefined) return;
      entry.start();
    }
  }
}
