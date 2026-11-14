import type { TranslationUnit } from "../shared/types.js";

/**
 * Packs translation units into requests (research R7): as few batches as the estimated token
 * budget allows, in document order, never splitting a unit. The plan carries an index mapping so
 * a provider's result array can be re-associated with units by position (FR-008).
 */

export interface PlannedBatch {
  index: number;
  units: TranslationUnit[];
  estimatedTokens: number;
}

export interface BatchPlan {
  batches: PlannedBatch[];
  byUnitId: Record<string, { batch: number; position: number }>;
}

/** FR-010's budget. A provider's real limit is unknown, so the estimate stays conservative. */
const DEFAULT_TOKEN_BUDGET = 1500;

/**
 * The per-unit overhead is real: every segment is sent as its own JSON array entry with its own
 * quoting and separator, which a pure character count would miss.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + 4;
}

export function planBatches(
  units: TranslationUnit[],
  options: { tokenBudget?: number } = {},
): BatchPlan {
  const budget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const batches: PlannedBatch[] = [];
  const byUnitId: BatchPlan["byUnitId"] = {};
  let current: PlannedBatch | null = null;

  for (const unit of units) {
    // Skipped units already have their outcome; batching them would waste the budget (FR-011).
    if (unit.state !== "queued") continue;

    const cost = estimateTokens(unit.sourceText);
    // A unit over the whole budget still gets exactly one batch: dropping or splitting it would
    // lose or fragment content, and the provider is the only authority on its own limit.
    if (current === null || current.estimatedTokens + cost > budget) {
      current = { index: batches.length, units: [], estimatedTokens: 0 };
      batches.push(current);
    }
    current.units.push(unit);
    current.estimatedTokens += cost;
    byUnitId[unit.id] = { batch: current.index, position: current.units.length - 1 };
  }

  return { batches, byUnitId };
}
