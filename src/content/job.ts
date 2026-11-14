import { planBatches } from "./batcher.js";
import { segmentPage, type SegmentDuplicate } from "./segmenter.js";
import { Renderer } from "./renderer.js";
import { Journal, restorePage } from "./restorer.js";
import type { PageObserver } from "./observer.js";
import type { VolumeBudget, RequestLimiter } from "./limiter.js";
import type {
  DisplayMode,
  DisplayStyleId,
  ErrorClass,
  JobCounts,
  JobState,
  ProviderErrorClass,
  Settings,
  TranslationUnit,
} from "../shared/types.js";
import type { JobStatusPayload } from "../shared/messages.js";

/**
 * Owns one translation run over one page (research R3: the content script owns the job because
 * it is the only context that lives as long as the page). It never renders a unit that is not
 * `translated` (FR-020), applies results by index (FR-008), reuses duplicate source text
 * (FR-011), stops at a volume cap (FR-029) and cancels within the promised time (FR-012).
 */

export interface BatchRequestPayload {
  requestId: string;
  providerId: string;
  segments: string[];
  glossary: Settings["glossary"];
  style: string;
  sourceLang: string;
  targetLang: string;
  timeoutMs: number;
}

export interface BatchReply {
  results: { index: number; text: string }[];
  failedIndices: number[];
  errorClass?: ErrorClass;
  message?: string;
}

export interface BatchCaller {
  translate(payload: BatchRequestPayload, signal: AbortSignal): Promise<BatchReply>;
}

export interface JobOptions {
  document: Document;
  root?: ParentNode;
  settings: Settings;
  providerId: string;
  displayMode: DisplayMode;
  displayStyle?: DisplayStyleId;
  targetLang: string;
  sourceLang: string;
  caller: BatchCaller;
  budget?: VolumeBudget;
  limiter?: RequestLimiter;
  observer?: PageObserver;
  onProgress?: (status: JobStatusPayload) => void;
  view?: Window | null;
}

export interface JobResult {
  state: JobState;
  counts: JobCounts;
  capReached: boolean;
  reused: number;
  skipped: number;
  failure?: { errorClass: ErrorClass; message: string };
}

const FAILURE_MESSAGES: Record<string, string> = {
  unreachable: "Cannot reach the provider.",
  timeout: "The provider did not respond in time.",
  authRejected: "The provider rejected the credential.",
  rateLimited: "The provider is rate limiting requests.",
  quotaExhausted: "The provider reports an exhausted quota.",
  modelUnavailable: "The model is not available.",
  malformedResponse: "The provider returned an unexpected response.",
  emptyTranslation: "The provider returned empty translations.",
  serverError: "The provider returned a server error.",
  invalidRequest: "The provider rejected the request.",
  cancelled: "Cancelled.",
  workerUnavailable: "The background worker is unavailable.",
};

export class TranslationJob {
  readonly #options: JobOptions;
  readonly #journal = new Journal();
  readonly #renderer: Renderer;
  readonly #units: TranslationUnit[] = [];
  readonly #duplicates: SegmentDuplicate[] = [];
  /** Parts of each ordinary source block, in collection order; sorted by partIndex when rendered. */
  readonly #blockParts = new Map<Element, TranslationUnit[]>();
  /** Parts of each duplicate block, keyed by the duplicate element. */
  readonly #duplicateBlocks = new Map<Element, SegmentDuplicate[]>();
  readonly #byId = new Map<string, TranslationUnit>();
  readonly #controllers = new Map<string, AbortController>();
  #state: JobState = "idle";
  #cancelled = false;
  #capReached = false;
  #failure: { errorClass: ErrorClass; message: string } | undefined;
  #sourceLang: string;
  #jobId = `job_${Date.now().toString(36)}`;
  #charsSent = 0;

  constructor(options: JobOptions) {
    this.#options = options;
    this.#sourceLang = options.sourceLang;
    this.#renderer = new Renderer(this.#journal, {
      displayMode: options.displayMode,
      displayStyle: options.displayStyle,
      targetLang: options.targetLang,
      view: options.view ?? null,
    });
  }

  get journal(): Journal {
    return this.#journal;
  }

  get renderer(): Renderer {
    return this.#renderer;
  }

  get units(): readonly TranslationUnit[] {
    return this.#units;
  }

  get counts(): JobCounts {
    return countUnits(this.#units, this.#duplicates.length);
  }

  get state(): JobState {
    return this.#state;
  }

  /** Segment the page once; the same call also services late content. */
  collect(root: ParentNode = this.#options.root ?? this.#options.document.body): number {
    const result = segmentPage(root, {
      targetLang: this.#options.targetLang,
      ...(this.#options.sourceLang === "auto" ? {} : { sourceLang: this.#options.sourceLang }),
    });
    this.#sourceLang = result.sourceLang;

    let added = 0;
    for (const unit of result.units) {
      const existing = this.#byId.get(unit.id);
      if (existing) {
        if (existing.sourceText === unit.sourceText) continue;
        // A late collection restarts the segmenter's index counter. Keep the id unique rather
        // than conflating two different passages that happen to land on the same index.
        let suffix = 2;
        let candidate = `${unit.id}-${suffix}`;
        while (this.#byId.has(candidate)) {
          suffix += 1;
          candidate = `${unit.id}-${suffix}`;
        }
        unit.id = candidate;
      }
      this.#byId.set(unit.id, unit);
      this.#units.push(unit);
      if (unit.state === "queued" && unit.domRef) {
        const parts = this.#blockParts.get(unit.domRef) ?? [];
        parts.push(unit);
        this.#blockParts.set(unit.domRef, parts);
      }
      added += 1;
    }
    for (const duplicate of result.duplicates) {
      const original = this.#byId.get(duplicate.ofUnitId);
      if (!original || original.state !== "queued") continue;
      const known = this.#duplicates.some(
        (entry) => entry.element === duplicate.element && entry.partIndex === duplicate.partIndex,
      );
      if (known) continue;
      this.#duplicates.push(duplicate);
      const entries = this.#duplicateBlocks.get(duplicate.element) ?? [];
      entries.push(duplicate);
      this.#duplicateBlocks.set(duplicate.element, entries);
    }
    return added;
  }

  /** Late content: collect only what arrived, then translate the units that are still queued. */
  async translateElements(elements: Element[]): Promise<JobResult> {
    for (const element of elements) {
      if (!element.isConnected) continue;
      this.collect(element);
    }
    return this.run();
  }

  async run(): Promise<JobResult> {
    this.#state = "segmenting";
    this.#emit();

    if (this.#units.length === 0) this.collect();

    const queue = this.#units.filter((unit) => unit.state === "queued");
    if (queue.length === 0) {
      this.#state = "completed";
      this.#emit();
      return this.result();
    }

    const plan = planBatches(queue);
    this.#state = "translating";
    this.#emit();

    const tasks = plan.batches.map((batch) => this.#runBatch(batch.units, batch.index));
    await Promise.all(tasks);

    if (!this.#cancelled) {
      this.#state = this.#failure ? "failed" : "completed";
    }
    this.#emit();
    return this.result();
  }

  async #runBatch(batchUnits: TranslationUnit[], batchIndex: number): Promise<void> {
    const settings = this.#options.settings;
    const provider = settings.providers.find((candidate) => candidate.id === this.#options.providerId);
    if (!provider) {
      this.#fail("providerMissing", "No provider configured for this page.");
      return;
    }

    const dispatchable: TranslationUnit[] = [];
    for (const unit of batchUnits) {
      if (this.#budgetRefuse(unit)) {
        unit.state = "skipped";
        unit.skipReason = "capReached";
        continue;
      }
      dispatchable.push(unit);
    }
    if (dispatchable.length === 0) return;

    this.#charsSent += dispatchable.reduce((total, unit) => total + unit.sourceText.length, 0);
    const requestId = `${this.#jobId}_${batchIndex}`;
    const controller = new AbortController();
    this.#controllers.set(requestId, controller);
    for (const unit of dispatchable) unit.state = "translating";
    this.#emit();

    try {
      const payload: BatchRequestPayload = {
        requestId,
        providerId: provider.id,
        segments: dispatchable.map((unit) => unit.sourceText),
        glossary: settings.glossary,
        style: settings.style.instruction,
        sourceLang: this.#sourceLang,
        targetLang: this.#options.targetLang,
        timeoutMs: provider.timeoutMs,
      };
      const call = () => this.#options.caller.translate(payload, controller.signal);
      // The limiter is the concurrency ceiling; cancellation still flows through the job's own
      // controller, so a cancelled job aborts its in-flight calls even when queued.
      const reply = this.#options.limiter ? await this.#options.limiter.run(call) : await call();

      this.#applyReply(dispatchable, reply);
    } catch (error) {
      if (this.#cancelled) {
        for (const unit of dispatchable) {
          if (unit.state === "translating") unit.state = "cancelled";
        }
        return;
      }
      const errorClass = (error as { errorClass?: ErrorClass }).errorClass ?? "unreachable";
      this.#markFailed(dispatchable, errorClass);
      this.#fail(errorClass, FAILURE_MESSAGES[errorClass] ?? "Translation failed.");
    } finally {
      this.#controllers.delete(requestId);
      this.#emit();
    }
  }

  #applyReply(batchUnits: TranslationUnit[], reply: BatchReply): void {
    const failed = new Set(reply.failedIndices);
    for (const result of reply.results) {
      const unit = batchUnits[result.index];
      if (!unit || failed.has(result.index)) continue;
      const text = result.text.trim();
      if (text.length === 0) {
        this.#markUnitFailed(unit, "emptyTranslation");
        continue;
      }
      unit.translatedText = text;
      unit.state = "translated";
      this.#render(unit);
      this.#renderDuplicates(unit);
    }

    for (const unit of batchUnits) {
      if (unit.state === "translated" || unit.state === "cancelled" || unit.state === "skipped") {
        continue;
      }
      this.#markUnitFailed(unit, (reply.errorClass as ProviderErrorClass) ?? "malformedResponse");
    }

    if (reply.errorClass) {
      this.#fail(reply.errorClass, FAILURE_MESSAGES[reply.errorClass] ?? "Translation failed.");
    }
    this.#options.onProgress?.(this.status());
  }

  #render(unit: TranslationUnit): void {
    const element = unit.domRef;
    if (!element || !element.isConnected) return;
    this.#renderBlock(element);
  }

  /**
   * Compose every translated part of one source block in part order and hand the whole passage to
   * the renderer, which owns the single container for that block (FR-001, FR-002, FR-003).
   */
  #renderBlock(element: Element): void {
    const units = this.#blockParts.get(element) ?? [];
    const parts: { id: string; partIndex: number; text: string; targetLang: string }[] = [];
    for (const unit of units) {
      parts.push({
        id: unit.id,
        partIndex: unit.partIndex,
        text:
          unit.state === "translated" ? (unit.translatedText ?? "").trim() : "",
        targetLang: unit.targetLang,
      });
    }
    // A sentence repeated inside one block is registered as a duplicate of an earlier part of the
    // same block. It is an extra part of this passage, not a separate duplicate block.
    for (const entry of this.#duplicates) {
      if (entry.element !== element) continue;
      const original = this.#byId.get(entry.ofUnitId);
      if (!original || original.domRef !== element) continue;
      parts.push({
        id: entry.unitId,
        partIndex: entry.partIndex,
        text:
          original.state === "translated" ? (original.translatedText ?? "").trim() : "",
        targetLang: original.targetLang,
      });
    }
    if (parts.length === 0) return;
    parts.sort((left, right) => left.partIndex - right.partIndex);

    const contributing = parts.filter((part) => part.text.length > 0);
    if (contributing.length === 0) return;
    const text = contributing.map((part) => part.text).join(" ");
    if (text.length === 0) return;
    const blockId = parts[0]?.id;
    if (!blockId) return;

    this.#renderer.renderUnit(
      { id: blockId, targetLang: contributing[0]?.targetLang },
      text,
      element,
    );
  }

  #renderDuplicates(unit: TranslationUnit): void {
    const touched = new Set<Element>();
    for (const [element, entries] of this.#duplicateBlocks) {
      if (touched.has(element) || !element.isConnected) continue;
      if (!entries.some((entry) => entry.ofUnitId === unit.id)) continue;
      touched.add(element);

      const ordered = entries.slice().sort((left, right) => left.partIndex - right.partIndex);
      const blockId = ordered[0]?.unitId;
      if (!blockId) continue;
      const contributing: { text: string; targetLang: string }[] = [];
      for (const entry of ordered) {
        const original = this.#byId.get(entry.ofUnitId);
        // Duplicates of parts in this very block are composed by #renderBlock, not as a block.
        if (original?.domRef === element) continue;
        if (original?.state !== "translated" || !original.translatedText) continue;
        contributing.push({ text: original.translatedText.trim(), targetLang: original.targetLang });
      }
      const text = contributing
        .map((part) => part.text)
        .filter((part) => part.length > 0)
        .join(" ");
      if (text.length === 0) continue;
      this.#renderer.renderUnit(
        { id: blockId, targetLang: contributing[0]?.targetLang },
        text,
        element,
      );
    }
  }

  #markUnitFailed(unit: TranslationUnit, errorClass: ErrorClass): void {
    unit.state = "failed";
    unit.errorClass = errorClass;
  }

  #markFailed(units: TranslationUnit[], errorClass: ErrorClass): void {
    for (const unit of units) {
      if (unit.state === "translated") continue;
      this.#markUnitFailed(unit, errorClass);
    }
  }

  #fail(errorClass: ErrorClass, message: string): void {
    if (errorClass === "cancelled") return;
    this.#failure ??= { errorClass, message };
  }

  #skippedCount(): number {
    return this.#units.filter((unit) => unit.state === "skipped").length;
  }

  #budgetRefuse(unit: TranslationUnit): boolean {
    const budget = this.#options.budget;
    if (!budget) return false;
    const accepted = budget.tryReserve(1, unit.sourceText.length);
    if (!accepted) {
      this.#capReached = true;
      return true;
    }
    unit.attempts += 1;
    return false;
  }

  /** FR-012: stop further work, discard late results, finish quickly. */
  cancel(): void {
    if (this.#state === "completed" || this.#state === "cancelled") return;
    this.#cancelled = true;
    this.#state = "cancelled";
    for (const controller of this.#controllers.values()) controller.abort();
    this.#controllers.clear();
    for (const unit of this.#units) {
      if (unit.state === "queued" || unit.state === "translating") unit.state = "cancelled";
    }
    this.#emit();
  }

  restore(): { replayed: number; residue: number } {
    const scrollY = this.#options.view?.scrollY ?? 0;
    const result = restorePage(this.#journal, {
      document: this.#options.document,
      scrollY,
    });
    return { replayed: result.replayed, residue: result.residue };
  }

  setDisplayMode(mode: DisplayMode): void {
    this.#renderer.setDisplayMode(mode);
  }

  /** FR-002: presentation-only, so no unit state changes and no request is issued. */
  setDisplayStyle(style: DisplayStyleId | string): void {
    this.#renderer.setDisplayStyle(style);
  }

  /** Cost visibility (FR-028): what this session has actually sent, never a money figure (FR-029). */
  usage(): {
    segmentsTranslated: number;
    approxChars: number;
    reusedSegments: number;
    perProvider: Record<string, number>;
  } {
    const counts = this.counts;
    return {
      segmentsTranslated: counts.translated,
      approxChars: this.#charsSent,
      reusedSegments: this.#duplicates.length,
      perProvider: { [this.#options.providerId]: counts.translated },
    };
  }

  result(): JobResult {
    const counts = this.counts;
    return {
      state: this.#state,
      counts,
      capReached: this.#capReached,
      reused: this.#duplicates.length,
      skipped: this.#skippedCount(),
      ...(this.#failure ? { failure: this.#failure } : {}),
    };
  }

  status(): JobStatusPayload {
    return {
      jobId: this.#jobId,
      pageKey: pageKey(this.#options.document),
      providerId: this.#options.providerId,
      state: this.#state,
      counts: this.counts,
      capReached: this.#capReached,
      skipped: this.#skippedCount(),
      ...(this.#failure ? { failure: this.#failure } : {}),
      usage: this.usage(),
    };
  }

  #emit(): void {
    this.#options.onProgress?.(this.status());
  }
}

function countUnits(units: TranslationUnit[], reused: number): JobCounts {
  const counts: JobCounts = { total: units.length, translated: 0, failed: 0, skipped: 0, reused };
  for (const unit of units) {
    if (unit.state === "translated") counts.translated += 1;
    else if (unit.state === "failed") counts.failed += 1;
    else if (unit.state === "skipped") counts.skipped += 1;
  }
  return counts;
}

function pageKey(doc: Document): string {
  const url = doc.location?.href ?? "";
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}
