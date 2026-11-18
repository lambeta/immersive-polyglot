import { planBatches } from "./batcher.js";
import { PassageIndex, type Passage } from "./passage-index.js";
import { segmentPage } from "./segmenter.js";
import { Renderer } from "./renderer.js";
import { graphicRootOf, isGraphicLabel } from "./graphics.js";
import { Journal, restorePage } from "./restorer.js";
import type { PageObserver } from "./observer.js";
import type { LabelMeasure } from "./label-renderer.js";
import type { VolumeBudget, RequestLimiter } from "./limiter.js";
import { classifyTier, estimateSpend } from "../shared/pricing.js";
import type {
  DisplayMode,
  DisplayStyleId,
  ErrorClass,
  JobCounts,
  JobState,
  ProviderErrorClass,
  SessionUsageRecord,
  Settings,
  SpendRecord,
  TokenParts,
  TranslationTypography,
  TranslationUnit,
  UsageReport,
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
  /** Feature 008: what the provider reported for this response, when it reported anything. */
  usage?: UsageReport;
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
  /** Feature 004: the reader's translation typography (FR-009, FR-010). */
  typography?: TranslationTypography;
  targetLang: string;
  sourceLang: string;
  caller: BatchCaller;
  budget?: VolumeBudget;
  limiter?: RequestLimiter;
  observer?: PageObserver;
  onProgress?: (status: JobStatusPayload) => void;
  /** Feature 007 FR-027: pins the reader's place across each render. */
  beforeMutation?(): void;
  afterMutation?(): void;
  view?: Window | null;
  /** Feature 010: jsdom has no getBBox; the label fit takes an explicit measurement in tests. */
  measureLabel?: LabelMeasure;
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
  /** Block ↔ parts ↔ repeated occurrences, shared with the demand pump (feature 007). */
  readonly #passages = new PassageIndex();
  readonly #byId = new Map<string, TranslationUnit>();
  /** Feature 010: label roots already considered by this run; a translated label is never re-read. */
  readonly #seenLabels = new WeakSet<Element>();
  #batchSeq = 0;
  readonly #controllers = new Map<string, AbortController>();
  #state: JobState = "idle";
  #cancelled = false;
  #capReached = false;
  #failure: { errorClass: ErrorClass; message: string } | undefined;
  #sourceLang: string;
  #jobId = `job_${Date.now().toString(36)}`;
  #charsSent = 0;
  /**
   * Feature 008 (R5): what this run has actually been told it consumed, per tier. It is reported,
   * never invented, and it is cleared only when translation is turned off (R11).
   */
  #spendProvider: { endpoint: string; model: string } | null = null;
  #spendRecorded = false;
  #spendIncomplete = false;
  #spendTotal = 0;
  #spendPrompt = 0;
  #spendCompletion = 0;
  #spendHit = 0;
  #spendMiss = 0;
  #spendPeak: TokenParts = { hit: 0, miss: 0, out: 0 };
  #spendOffPeak: TokenParts = { hit: 0, miss: 0, out: 0 };

  constructor(options: JobOptions) {
    this.#options = options;
    this.#sourceLang = options.sourceLang;
    const provider = options.settings.providers.find(
      (candidate) => candidate.id === options.providerId,
    );
    this.#spendProvider = provider
      ? { endpoint: provider.endpoint, model: provider.model }
      : null;
    this.#renderer = new Renderer(this.#journal, {
      displayMode: options.displayMode,
      displayStyle: options.displayStyle,
      ...(options.typography ? { typography: options.typography } : {}),
      targetLang: options.targetLang,
      view: options.view ?? null,
      ...(options.measureLabel ? { measureLabel: options.measureLabel } : {}),
      ...(options.beforeMutation ? { beforeMutation: options.beforeMutation } : {}),
      ...(options.afterMutation ? { afterMutation: options.afterMutation } : {}),
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
    return countUnits(this.#units, this.#occurrenceCount());
  }

  /** Passages that still have something to request, in document order (feature 007). */
  pendingPassages(): Passage[] {
    return this.#passages.pending();
  }

  /** Every passage the run knows about, in document order: the demand pump's rank source. */
  passages(): Passage[] {
    return this.#passages.all();
  }

  #occurrenceCount(): number {
    return this.#passages.all().reduce((total, passage) => total + passage.occurrences.length, 0);
  }

  get state(): JobState {
    return this.#state;
  }

  /** Segment the page once; the same call also services late content. */
  collect(root: ParentNode = this.#options.root ?? this.#options.document.body): number {
    // A root inside a drawing is never a passage root: segment the drawing, which harvests only its
    // unseen labels (feature 010, R7).
    const element = root.nodeType === 1 ? (root as Element) : null;
    const target = element === null ? root : (graphicRootOf(element) ?? root);
    const result = segmentPage(target, {
      targetLang: this.#options.targetLang,
      ...(this.#options.sourceLang === "auto" ? {} : { sourceLang: this.#options.sourceLang }),
      seenLabels: this.#seenLabels,
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
      if (unit.state === "queued" && unit.domRef) this.#passages.addUnit(unit);
      added += 1;
    }
    for (const duplicate of result.duplicates) {
      const original = this.#byId.get(duplicate.ofUnitId);
      if (!original || original.state !== "queued") continue;
      this.#passages.addOccurrence(duplicate);
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

    const tasks = plan.batches.map((batch) => this.dispatchUnits(batch.units));
    await Promise.all(tasks);

    if (!this.#cancelled) {
      this.#state = this.#failure ? "failed" : "completed";
    }
    this.#emit();
    return this.result();
  }

  /**
   * Feature 007: one batch, dispatched on demand. The demand pump calls this; `run()` calls it for
   * every batch at once, which is exactly what "the whole page is inside the window" means.
   */
  async dispatchUnits(batchUnits: TranslationUnit[]): Promise<void> {
    if (this.#cancelled) return;
    await this.#runBatch(batchUnits, this.#batchSeq++);
  }

  /** The panel says a round is in progress only while one is (R9). */
  beginRound(): void {
    if (this.#cancelled) return;
    if (this.#state === "idle") this.#state = "segmenting";
    this.#state = "translating";
    this.#emit();
  }

  /**
   * ...and says the page is translated for what the reader has reached, not for the whole document
   * (R9). Passages below the fold stay queued until the reader scrolls to them; counting them as
   * "still owed" would leave the panel saying "Translating…" forever.
   */
  endRound(): void {
    if (this.#cancelled) return;
    this.#state = this.#failure ? "failed" : "completed";
    this.#emit();
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
        this.#settleMark(unit);
        continue;
      }
      dispatchable.push(unit);
    }
    if (dispatchable.length === 0) return;

    this.#charsSent += dispatchable.reduce((total, unit) => total + unit.sourceText.length, 0);
    const requestId = `${this.#jobId}_${batchIndex}`;
    const controller = new AbortController();
    this.#controllers.set(requestId, controller);
    // FR-001: the mark is visible before the request leaves, so the reader sees the passage they are
    // looking at being worked on rather than a page that does nothing and then fills in.
    for (const unit of dispatchable) {
      unit.state = "translating";
      this.#showPending(unit);
    }
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
      // The tier is the one in effect when the request is actually made, not when the answer
      // arrived — and not when the batch was queued: behind the concurrency ceiling a batch can
      // wait across a peak boundary, so the instant is read inside the call itself.
      let requestedAt = 0;
      const call = () => {
        requestedAt = Date.now();
        return this.#options.caller.translate(payload, controller.signal);
      };
      // The limiter is the concurrency ceiling; cancellation still flows through the job's own
      // controller, so a cancelled job aborts its in-flight calls even when queued.
      const reply = this.#options.limiter ? await this.#options.limiter.run(call) : await call();

      this.#applyReply(dispatchable, reply, requestedAt);
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

  #applyReply(
    batchUnits: TranslationUnit[],
    reply: BatchReply,
    requestedAt: number = Date.now(),
  ): void {
    // FR-011/FR-012: a cancelled or restored run discards late results instead of rendering them
    // into a page that has already been put back (research R6).
    if (this.#cancelled) return;
    let delivered = 0;
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
      delivered += 1;
      this.#render(unit);
      this.#renderDuplicates(unit);
    }

    for (const unit of batchUnits) {
      if (unit.state === "translated" || unit.state === "cancelled" || unit.state === "skipped") {
        continue;
      }
      this.#markUnitFailed(unit, (reply.errorClass as ProviderErrorClass) ?? "malformedResponse");
    }

    // FR-002: a response counts once, and only when it put something on the page.
    if (delivered > 0 && reply.usage) this.#recordUsage(reply.usage, requestedAt);

    if (reply.errorClass) {
      this.#fail(reply.errorClass, FAILURE_MESSAGES[reply.errorClass] ?? "Translation failed.");
    }
    this.#options.onProgress?.(this.status());
  }

  /**
   * FR-001: mark passages that have just entered the queue, before any request is issued. One mark
   * per source block; the renderer refuses a block that already shows a translation.
   */
  markPassages(elements: readonly Element[]): void {
    for (const element of elements) {
      if (isGraphicLabel(element)) continue;
      const unit = this.#passages.partsOf(element)[0];
      if (unit) this.#renderer.showPending(element, unit.id);
    }
  }

  /** One mark per source block; the renderer refuses a block that already shows a translation. */
  #showPending(unit: TranslationUnit): void {
    const element = unit.domRef;
    if (!element || !element.isConnected) return;
    // A label changes in place; a rotation or placeholder inside a drawing would be a second,
    // page-visible mutation and is forbidden (FR-012).
    if (isGraphicLabel(element)) return;
    this.#renderer.showPending(element, unit.id);
  }

  #render(unit: TranslationUnit): void {
    const element = unit.domRef;
    if (!element || !element.isConnected) return;
    if (isGraphicLabel(element)) {
      if (unit.state === "translated" && unit.translatedText) {
        this.#renderer.renderLabel(
          { id: unit.id, targetLang: unit.targetLang },
          unit.translatedText,
          element,
        );
      }
      return;
    }
    this.#renderBlock(element);
  }

  /**
   * Compose every translated part of one source block in part order and hand the whole passage to
   * the renderer, which owns the single container for that block (FR-001, FR-002, FR-003).
   */
  #renderBlock(element: Element): void {
    const units = this.#passages.partsOf(element);
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
    for (const entry of this.#passages.occurrencesOf(element)) {
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
    // Which passages borrow this unit's text; each of them is then composed from ALL of its own
    // occurrences, so a passage built from several borrowed parts is never left half-filled.
    const touched = new Set<Element>();
    for (const occurrence of this.#passages.occurrencesOfUnit(unit.id)) touched.add(occurrence.element);

    for (const element of touched) {
      if (!element.isConnected) continue;
      const ordered = this.#passages
        .occurrencesOf(element)
        .slice()
        .sort((left, right) => left.partIndex - right.partIndex);
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
      if (isGraphicLabel(element)) {
        this.#renderer.renderLabel(
          { id: blockId, targetLang: contributing[0]?.targetLang },
          text,
          element,
        );
        continue;
      }
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
    this.#settleMark(unit);
  }

  /**
   * FR-021: a mark must never outlive its reason. Once a passage has no part still queued or in
   * flight and has not produced a translation, its mark is removed — the reader sees nothing in the
   * slot rather than a rotation that will never end.
   */
  #settleMark(unit: TranslationUnit): void {
    const element = unit.domRef;
    if (!element) return;
    const parts = this.#passages.partsOf(element);
    const stillWorking = parts.some((part) => part.state === "queued" || part.state === "translating");
    const translated = parts.some((part) => part.state === "translated");
    if (!stillWorking && !translated) this.#renderer.removePending(element);
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
    // FR-024: stopping removes every mark at once, whether or not its request ever answers.
    for (const source of this.#renderer.pendingSources()) this.#renderer.removePending(source);
    this.#emit();
  }

  restore(): { replayed: number; residue: number } {
    // Restoring is terminal for the run: without this, a batch already in flight would render into a
    // page that has just been put back (FR-011; research R6).
    this.cancel();
    // R11: only turning translation off clears the record; a bare cancel keeps it.
    this.#clearSpend();
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

  /** Feature 004 FR-019: presentation-only, same guarantee as setDisplayStyle. */
  setTypography(typography: TranslationTypography): void {
    this.#renderer.setTypography(typography);
  }

  /**
   * Cost visibility (FR-001, FR-014): what this session has actually sent and, when the provider
   * reported usage, what it consumed and what that costs at its published prices.
   */
  usage(): SessionUsageRecord {
    const counts = this.counts;
    const spend = this.#spendRecord();
    return {
      segmentsTranslated: counts.translated,
      approxChars: this.#charsSent,
      reusedSegments: this.#occurrenceCount(),
      perProvider: { [this.#options.providerId]: counts.translated },
      ...(spend ? { spend } : {}),
    };
  }

  /** R11/R12: measured consumption, reported only while its translations are still on the page. */
  #spendRecord(): SpendRecord | undefined {
    if (!this.#spendRecorded) return undefined;
    const stillShown = this.#units.some(
      (unit) => unit.state === "translated" && unit.domRef?.isConnected === true,
    );
    if (!stillShown) return undefined;

    const tokens = {
      total: this.#spendTotal,
      prompt: this.#spendPrompt,
      completion: this.#spendCompletion,
      hit: this.#spendHit,
      miss: this.#spendMiss,
    };
    const provider = this.#spendProvider;
    if (!provider) return { tokens, price: null, unavailable: "noPriceList" };
    const named = { tokens, model: provider.model };

    const estimate = estimateSpend({
      endpoint: provider.endpoint,
      model: provider.model,
      targetLang: this.#options.targetLang,
      total: this.#spendTotal,
      peak: this.#spendPeak,
      offPeak: this.#spendOffPeak,
      usageIncomplete: this.#spendIncomplete,
    });
    return "unavailable" in estimate
      ? { ...named, price: null, unavailable: estimate.unavailable }
      : { ...named, price: estimate };
  }

  #recordUsage(usage: UsageReport, requestedAt: number): void {
    const prompt = usage.promptTokens;
    const completion = usage.completionTokens;
    const total = usage.totalTokens ?? (prompt ?? 0) + (completion ?? 0);
    const hit = usage.cacheHitTokens ?? 0;
    const miss = usage.cacheMissTokens ?? prompt ?? 0;
    const out = completion ?? 0;

    if (prompt === undefined || completion === undefined) this.#spendIncomplete = true;

    this.#spendTotal += total;
    this.#spendPrompt += prompt ?? 0;
    this.#spendCompletion += completion ?? 0;
    this.#spendHit += hit;
    this.#spendMiss += miss;
    this.#spendRecorded = true;

    const bucket = classifyTier(requestedAt) === "peak" ? this.#spendPeak : this.#spendOffPeak;
    bucket.hit += hit;
    bucket.miss += miss;
    bucket.out += out;
  }

  #clearSpend(): void {
    this.#spendRecorded = false;
    this.#spendIncomplete = false;
    this.#spendTotal = 0;
    this.#spendPrompt = 0;
    this.#spendCompletion = 0;
    this.#spendHit = 0;
    this.#spendMiss = 0;
    this.#spendPeak = { hit: 0, miss: 0, out: 0 };
    this.#spendOffPeak = { hit: 0, miss: 0, out: 0 };
  }

  result(): JobResult {
    const counts = this.counts;
    return {
      state: this.#state,
      counts,
      capReached: this.#capReached,
      reused: this.#occurrenceCount(),
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
