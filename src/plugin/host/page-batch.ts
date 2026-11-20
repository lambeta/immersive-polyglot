import { planBatches } from "../../content/batcher.js";
import type { TranslationUnit } from "../../shared/types.js";
import type { AnswerProse } from "./answers.js";

/**
 * Page → bounded batches. The reader's gesture is a page, so the plan is computed per page and every
 * answer's segments travel together; the shared batcher still owns the token packing, so the plugin
 * cannot invent a second batching rule (spec FR-008, FR-014, FR-040).
 */

export interface PageLimits {
  /** Answers a single page request may carry. */
  maxAnswersPerPage: number;
  /** Characters a single provider request may carry, before the shared token estimate. */
  maxCharsPerBatch: number;
}

export interface PlannedSegment {
  unitId: string;
  messageId: string;
  blockIndex: number;
  text: string;
}

export interface PlannedBatch {
  /** Segments in the order the provider must echo back. */
  segments: PlannedSegment[];
}

export type SkipReason = "alreadyTranslated" | "capReached";

export interface PagePlan {
  batches: PlannedBatch[];
  skipped: { messageId: string; reason: SkipReason }[];
}

/** One unit id per answer block, so a returned array indexes back to exactly one block. */
export function unitIdOf(messageId: string, blockIndex: number): string {
  return `${messageId}#${blockIndex}`;
}

/**
 * Plan the provider requests for one page.
 * @param proses - the page's answers, in reading order.
 * @param translated - message ids that already hold a current translation.
 * @param limits - the reader's bounds.
 * @returns bounded batches plus what was skipped and why.
 */
export function planPage(
  proses: readonly AnswerProse[],
  translated: ReadonlySet<string>,
  limits: PageLimits,
): PagePlan {
  const skipped: PagePlan["skipped"] = [];
  const eligible: AnswerProse[] = [];
  for (const prose of proses) {
    if (translated.has(prose.messageId)) skipped.push({ messageId: prose.messageId, reason: "alreadyTranslated" });
    else eligible.push(prose);
  }

  const page = eligible.slice(0, Math.max(1, limits.maxAnswersPerPage));
  for (const dropped of eligible.slice(page.length)) {
    skipped.push({ messageId: dropped.messageId, reason: "capReached" });
  }

  const meta = new Map<string, PlannedSegment>();
  const units: TranslationUnit[] = [];
  for (const prose of page) {
    for (const segment of prose.segments) {
      const unitId = unitIdOf(prose.messageId, segment.blockIndex);
      meta.set(unitId, { unitId, messageId: prose.messageId, blockIndex: segment.blockIndex, text: segment.text });
      units.push({
        id: unitId,
        sourceText: segment.text,
        sourceLang: "auto",
        targetLang: "auto",
        state: "queued",
        attempts: 0,
        partIndex: 0,
      });
    }
  }

  const tokenBudget = Math.max(250, Math.floor(limits.maxCharsPerBatch / 4));
  const plan = planBatches(units, { tokenBudget });
  const batches: PlannedBatch[] = plan.batches.map((batch) => ({
    segments: batch.units.map((unit) => {
      const segment = meta.get(unit.id);
      if (segment === undefined) throw new Error(`unmapped unit ${unit.id}`);
      return segment;
    }),
  }));

  return { batches, skipped };
}

/**
 * Re-associate a provider's returned array with the planned segments.
 * @param batch - the batch that was sent.
 * @param results - what the provider returned, in order.
 * @returns the translated text per segment, or a failure when the count does not match.
 */
export function mapBatchResults(
  batch: PlannedBatch,
  results: readonly { index: number; text: string }[],
): { ok: true; byUnitId: Map<string, string> } | { ok: false; reason: "countMismatch" } {
  const byIndex = new Map(results.map((result) => [result.index, result.text]));
  const byUnitId = new Map<string, string>();
  for (const [position, segment] of batch.segments.entries()) {
    const text = byIndex.get(position);
    if (typeof text !== "string") return { ok: false, reason: "countMismatch" };
    byUnitId.set(segment.unitId, text);
  }
  return { ok: true, byUnitId };
}
