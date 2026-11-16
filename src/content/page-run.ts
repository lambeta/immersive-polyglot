import { planBatches } from "./batcher.js";
import { demandWindow, groupFor, orderByDemand, type DemandGroup, type Rect } from "./demand.js";
import { DemandPump, type PumpBatch } from "./demand-pump.js";
import type { TranslationJob } from "./job.js";
import type { Passage } from "./passage-index.js";
import type { TranslationUnit } from "../shared/types.js";

/**
 * One page's open translation run (feature 007, research R7).
 *
 * A run no longer means "translate the document"; it means "translate the demand the reader has
 * reached" — and it stays open, because scrolling brings more demand. Each round re-evaluates the
 * window, marks what is newly in it, and hands batches to the queue. Scrolling is therefore not a
 * second run, and the one-run rule of feature 005 is untouched.
 */

export interface PageRunOptions {
  job: TranslationJob;
  document: Document;
  view?: Window | null;
  /** Measures a passage in viewport coordinates; injected by tests, because jsdom has no layout. */
  measure?(element: Element): Rect | null;
  /** The visible band in viewport coordinates; defaults to the window's own height. */
  viewport?(): { top: number; bottom: number };
  /** The provider's concurrency ceiling. */
  ceiling: number;
  /** Whether the reader can see the page; defaults to the document's visibility. */
  pageVisible?(): boolean;
  /** Pins the reader's place across a round (feature 007 US4). */
  onBeforeRender?(): void;
  onAfterRender?(): void;
}

interface MeasuredPassage {
  passage: Passage;
  rect: Rect | null;
  rank: number;
}

export class PageRun {
  readonly #options: PageRunOptions;
  readonly #pump: DemandPump<TranslationUnit>;
  readonly #rects = new Map<Element, Rect>();
  #stopped = false;
  #rounds = 0;

  constructor(options: PageRunOptions) {
    this.#options = options;
    this.#pump = new DemandPump<TranslationUnit>({
      ceiling: Math.max(1, options.ceiling),
      dispatch: (batch) => this.#dispatch(batch),
    });
  }

  get rounds(): number {
    return this.#rounds;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  /** The first round: mark and dispatch what the reader can already see. */
  async start(): Promise<void> {
    // A run is meaningless without passages; collecting here keeps that true for every caller.
    if (this.#options.job.passages().length === 0) this.#options.job.collect();
    await this.round();
  }

  /**
   * Re-evaluate the window and queue what is newly in it.
   *
   * Enqueueing never waits for earlier work: a round that blocked while another drained would skip
   * every range the reader passed in the meantime - they scrolled three screenfuls, saw all of it,
   * and only the last one was ever asked for. Each call adds its demand to the queue synchronously;
   * the returned promise settles when the queue has drained, for callers that want to wait for that.
   * A passage cannot be requested twice either way, because the queue is fed only from passages whose
   * units are still queued.
   */
  round(): Promise<void> {
    if (this.#stopped) return Promise.resolve();
    return this.#runRound();
  }

  /** Drops everything unsent. In-flight requests are the job's to abort, not the queue's. */
  stop(): void {
    this.#stopped = true;
    this.#pump.cancel();
  }

  async #runRound(): Promise<void> {
    // FR-016: while the reader cannot see the page, nothing new is requested. The next round —
    // triggered by the visibility event when they return — evaluates the window they then see.
    if (!this.#pageVisible()) return;
    this.#rounds += 1;

    const enqueued = this.#enqueueDemand();
    if (enqueued > 0) this.#options.job.beginRound();
    this.#pump.pump();

    await this.#pump.whenIdle();
    // Only a round that finds the queue truly empty may declare the reader's screen done: an earlier
    // round can settle while a later one still has work in flight.
    if (!this.#stopped && this.#pump.queuedCount === 0 && this.#pump.startedCount === 0) {
      this.#options.job.endRound();
    }
  }

  #enqueueDemand(): number {
    const window = demandWindow(this.#viewport());
    const measured = this.#measurePending(window);
    const ordered = orderByDemand(measured, window);

    // One batch may carry several passages — batching is unchanged (FR-014). Planning per passage
    // would turn one screenful into a dozen requests and charge the reader for the overhead.
    const units: TranslationUnit[] = [];
    const groupOf = new Map<string, DemandGroup>();
    const rankOf = new Map<string, number>();
    const keepMarked: Element[] = [];
    for (const entry of ordered) {
      const queued = entry.passage.parts.filter((part) => part.state === "queued");
      if (queued.length === 0) continue;
      keepMarked.push(entry.passage.element);
      for (const unit of queued) {
        units.push(unit);
        groupOf.set(unit.id, entry.group);
        rankOf.set(unit.id, entry.rank);
      }
    }

    if (units.length > 0) {
      // The mark comes first, before the queue and therefore before any request (FR-001).
      this.#options.job.markPassages(keepMarked);
      const plan = planBatches(units);
      this.#pump.enqueue(
        plan.batches.map((batch) => {
          const first = batch.units[0];
          return {
            units: batch.units,
            group: first ? (groupOf.get(first.id) ?? "lookahead") : "lookahead",
            rank: first ? (rankOf.get(first.id) ?? 0) : 0,
          };
        }),
      );
    }

    // Work queued but not started yields to whatever the reader now sees (R5, contracts §2.2).
    this.#pump.resort((batch) => this.#rankFor(batch));
    return units.length;
  }

  /**
   * Measures only what might be in the window. A passage last seen below the lookahead keeps that
   * answer: content is only ever inserted, so it can move further down but never up — re-measuring
   * every passage on every scroll would be a layout read per passage per frame (SC-012).
   */
  #measurePending(window: ReturnType<typeof demandWindow>): MeasuredPassage[] {
    const passages = this.#options.job.passages();
    const ranks = new Map<Element, number>();
    passages.forEach((passage, index) => ranks.set(passage.element, index));
    const limit = window.bottom + window.lookahead;
    const measured: MeasuredPassage[] = [];

    for (const passage of this.#options.job.pendingPassages()) {
      const cached = this.#rects.get(passage.element);
      if (cached && cached.top >= limit) {
        measured.push({ passage, rect: cached, rank: ranks.get(passage.element) ?? 0 });
        continue;
      }
      const rect = this.#measure(passage.element);
      if (rect) this.#rects.set(passage.element, rect);
      measured.push({ passage, rect, rank: ranks.get(passage.element) ?? 0 });
    }
    return measured;
  }

  #rankFor(batch: PumpBatch<TranslationUnit>): { group: DemandGroup; rank: number } {
    const element = batch.units[0]?.domRef;
    if (!element) return { group: "lookahead", rank: Number.MAX_SAFE_INTEGER };
    const rect = this.#measure(element);
    if (rect) this.#rects.set(element, rect);
    const group = groupFor(rect, demandWindow(this.#viewport()));
    // A passage the reader has left keeps its place in the queue; it is never dropped (R5).
    const rank = this.#options.job
      .passages()
      .findIndex((passage) => passage.element === element);
    return { group: group ?? "lookahead", rank: rank < 0 ? Number.MAX_SAFE_INTEGER : rank };
  }

  async #dispatch(batch: PumpBatch<TranslationUnit>): Promise<void> {
    if (this.#stopped) return;
    this.#options.onBeforeRender?.();
    try {
      await this.#options.job.dispatchUnits(batch.units);
    } finally {
      this.#options.onAfterRender?.();
    }
  }

  /**
   * Rectangles are kept in **document** coordinates, not viewport coordinates. A cache of
   * viewport-relative rectangles is invalidated by every scroll — that mistake makes a passage the
   * reader has just reached look like it is still far below, and nothing is ever requested again.
   * In document space "content is only ever added" holds, so the cache is sound.
   */
  #measure(element: Element): Rect | null {
    const custom = this.#options.measure;
    if (custom) return custom(element);
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    const offset = this.#scrollY();
    return { top: rect.top + offset, bottom: rect.bottom + offset };
  }

  #pageVisible(): boolean {
    const custom = this.#options.pageVisible;
    if (custom) return custom();
    const doc = this.#options.document;
    if (typeof doc.visibilityState === "string") return doc.visibilityState !== "hidden";
    return true;
  }

  /** The visible band, in the same document coordinates as the measured rectangles. */
  #viewport(): { top: number; bottom: number } {
    const custom = this.#options.viewport;
    if (custom) return custom();
    const view = this.#options.view ?? this.#options.document.defaultView;
    const offset = this.#scrollY();
    return { top: offset, bottom: offset + (view?.innerHeight ?? 0) };
  }

  #scrollY(): number {
    const view = this.#options.view ?? this.#options.document.defaultView;
    return view?.scrollY ?? 0;
  }
}
