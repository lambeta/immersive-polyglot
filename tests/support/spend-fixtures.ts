import type { UsageReport } from "../../src/shared/types.js";

/**
 * Feature 008: the one worked example every spend test reuses (contracts/pricing-and-tiers.md §6).
 * Fixed numbers keep the arithmetic checkable by hand: 5,000 input tokens of which 4,000 were
 * cached, 500 output tokens, priced against deepseek-flash in CNY.
 */

export const WORKED_USAGE: UsageReport = {
  promptTokens: 5_000,
  completionTokens: 500,
  totalTokens: 5_500,
  cacheHitTokens: 4_000,
  cacheMissTokens: 1_000,
};

export const WORKED_TOTAL_TOKENS = 5_500;
export const WORKED_OFF_PEAK_CNY = 0.00308;
export const WORKED_PEAK_CNY = 0.00616;
export const WORKED_OFF_PEAK_USD = 0.000462;
