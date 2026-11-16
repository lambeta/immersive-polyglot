import type { Currency } from "./types.js";

/**
 * Feature 008, R2: the provider price lists the product ships with. Plain data with one date, so a
 * provider's announcement is a release, not a refactor. Nothing here is fetched at runtime (FR-024).
 *
 * Rates are per 1M tokens. Off-peak is half of peak in the published list, and both tiers are stored
 * rather than derived, so a future announcement can break the relation without a code change.
 */

export interface RateSet {
  hitOff: number;
  hitPeak: number;
  missOff: number;
  missPeak: number;
  outOff: number;
  outPeak: number;
}

export type ModelPrices = Record<Currency, RateSet>;

export interface PriceSnapshot {
  /** The month the prices were copied, shown as the basis (FR-009). */
  snapshot: string;
  /** The provider label the basis names. */
  provider: string;
  /** Endpoint hosts this snapshot applies to. */
  hosts: readonly string[];
  models: Record<string, ModelPrices>;
  /** Model names the provider still accepts and the model whose price applies. */
  aliases: Record<string, string>;
  /** Local wall-clock peak windows, [start, end) in minutes after midnight. */
  peakWindows: readonly { start: number; end: number }[];
  timeZone: string;
  /** Dates the snapshot can classify as off-peak (the published statutory holidays). */
  holidays: readonly string[];
  coverageYears: readonly number[];
}

const FLASH_CNY: RateSet = { hitOff: 0.02, hitPeak: 0.04, missOff: 1, missPeak: 2, outOff: 4, outPeak: 8 };
const PRO_CNY: RateSet = { hitOff: 0.15, hitPeak: 0.3, missOff: 4.5, missPeak: 9, outOff: 13.5, outPeak: 27 };
const FLASH_USD: RateSet = { hitOff: 0.003, hitPeak: 0.006, missOff: 0.15, missPeak: 0.3, outOff: 0.6, outPeak: 1.2 };
const PRO_USD: RateSet = { hitOff: 0.022, hitPeak: 0.044, missOff: 0.66, missPeak: 1.32, outOff: 1.98, outPeak: 3.96 };

/** The official 2026 State Council holiday periods, every day of each period. */
const HOLIDAYS_2026: readonly string[] = [
  "2026-01-01", "2026-01-02", "2026-01-03",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19",
  "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
  "2026-04-04", "2026-04-05", "2026-04-06",
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  "2026-06-19", "2026-06-20", "2026-06-21",
  "2026-09-25", "2026-09-26", "2026-09-27",
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",
  "2026-10-06", "2026-10-07",
];

export const PRICE_SNAPSHOT: PriceSnapshot = {
  snapshot: "2026-11",
  provider: "DeepSeek",
  hosts: ["api.deepseek.com"],
  models: {
    // Only the models with a price row of their own. The legacy names DeepSeek still serves are
    // priced through `aliases` below, at the Flash rate the provider documents for them — they must
    // not be dropped (FR-028, owner correction 2026-11-16).
    "deepseek-flash": { CNY: FLASH_CNY, USD: FLASH_USD },
    "deepseek-v4-pro": { CNY: PRO_CNY, USD: PRO_USD },
  },
  aliases: {
    "deepseek-v4-flash": "deepseek-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-flash",
    // Names a profile configured before the preset changed still carries. DeepSeek serves them
    // through its current default model and bills them at the Flash price; leaving them unpriced
    // told a working DeepSeek reader that its own provider had no price (owner report, 2026-11-16).
    "deepseek-chat": "deepseek-flash",
    "deepseek-reasoner": "deepseek-flash",
  },
  peakWindows: [
    { start: 9 * 60, end: 12 * 60 },
    { start: 14 * 60, end: 18 * 60 },
  ],
  timeZone: "Asia/Shanghai",
  holidays: HOLIDAYS_2026,
  coverageYears: [2026],
};
