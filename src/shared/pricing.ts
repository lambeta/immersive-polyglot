import { PRICE_SNAPSHOT, type ModelPrices, type PriceSnapshot } from "./price-catalog.js";
import type {
  Currency,
  SpendPrice,
  SpendUnavailable,
  TokenParts,
} from "./types.js";

/**
 * Feature 008, R3/R6/R7: the only place that turns tokens into money. Pure functions over the
 * shipped catalogue; the panel formats, the job prices, and nothing here fetches or guesses.
 */

export type Tier = "peak" | "offPeak";

export interface RunSpend {
  endpoint: string;
  model: string;
  targetLang: string;
  /** The provider's own totals, summed; may differ from hit + miss + out (spec edge case). */
  total: number;
  peak: TokenParts;
  offPeak: TokenParts;
  /** A counted response reported a total but no input/output split: the run cannot be priced. */
  usageIncomplete: boolean;
}

export type PriceEstimate = SpendPrice;
export type EstimateOutcome = PriceEstimate | { unavailable: SpendUnavailable };

const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = PARTS_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    PARTS_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

export interface ZonedParts {
  /** YYYY-MM-DD in the provider's zone. */
  date: string;
  /** Minutes after local midnight. */
  minutes: number;
  /** 0 = Sunday. */
  weekday: number;
}

export function zonedParts(
  instant: Date | number,
  timeZone: string = PRICE_SNAPSHOT.timeZone,
): ZonedParts {
  const date = typeof instant === "number" ? new Date(instant) : instant;
  const parts = partsFormatter(timeZone).formatToParts(date);
  const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour") % 24;
  const minute = read("minute");
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    date: iso,
    minutes: hour * 60 + minute,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/**
 * R3: window first, holiday second. A holiday can only make a moment cheaper, so an unknown year is
 * wrong only inside a peak window — never across a whole night.
 */
export function classifyTier(
  instant: Date | number,
  snapshot: PriceSnapshot = PRICE_SNAPSHOT,
): Tier {
  const local = zonedParts(instant, snapshot.timeZone);
  if (local.weekday === 0 || local.weekday === 6) return "offPeak";
  const inPeak = snapshot.peakWindows.some(
    (window) => local.minutes >= window.start && local.minutes < window.end,
  );
  if (!inPeak) return "offPeak";
  return snapshot.holidays.includes(local.date) ? "offPeak" : "peak";
}

/** FR-028: only a name the provider publishes, or a documented alias of one. */
export function resolveModel(
  model: string,
  snapshot: PriceSnapshot = PRICE_SNAPSHOT,
): ModelPrices | null {
  const name = model.trim();
  if (name in snapshot.models) return snapshot.models[name] ?? null;
  const alias = snapshot.aliases[name];
  if (alias === undefined) return null;
  return snapshot.models[alias] ?? null;
}

export function providerSupported(
  endpoint: string,
  snapshot: PriceSnapshot = PRICE_SNAPSHOT,
): boolean {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return snapshot.hosts.some((candidate) => candidate.toLowerCase() === host);
  } catch {
    return false;
  }
}

/** R6: the published list named by the target language; no conversion exists. */
export function currencyForTarget(targetLang: string): Currency {
  return targetLang.trim().toLowerCase().startsWith("zh") ? "CNY" : "USD";
}

/** FR-006..FR-013: all-or-nothing, one reason, per-tier arithmetic. */
export function estimateSpend(
  spend: RunSpend,
  snapshot: PriceSnapshot = PRICE_SNAPSHOT,
): EstimateOutcome {
  if (!providerSupported(spend.endpoint, snapshot)) return { unavailable: "noPriceList" };
  const prices = resolveModel(spend.model, snapshot);
  if (!prices) return { unavailable: "modelNotPriced" };
  if (spend.usageIncomplete) return { unavailable: "usageIncomplete" };

  const currency = currencyForTarget(spend.targetLang);
  const rates = prices[currency];
  const amount =
    (spend.peak.hit * rates.hitPeak +
      spend.peak.miss * rates.missPeak +
      spend.peak.out * rates.outPeak +
      spend.offPeak.hit * rates.hitOff +
      spend.offPeak.miss * rates.missOff +
      spend.offPeak.out * rates.outOff) /
    1_000_000;

  return { amount, currency, snapshot: snapshot.snapshot, provider: snapshot.provider };
}

const NUMBER_FORMATTERS = new Map<string, Intl.NumberFormat>();
const SIGNIFICANT_FORMATTERS = new Map<string, Intl.NumberFormat>();

function numberFormatter(locale: string, digits: number): Intl.NumberFormat {
  const key = `${locale}:${digits}`;
  let formatter = NUMBER_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
    NUMBER_FORMATTERS.set(key, formatter);
  }
  return formatter;
}

function significantFormatter(locale: string): Intl.NumberFormat {
  let formatter = SIGNIFICANT_FORMATTERS.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumSignificantDigits: 2 });
    SIGNIFICANT_FORMATTERS.set(locale, formatter);
  }
  return formatter;
}

function significantDigits(text: string): number {
  return text.replace(/[^0-9]/gu, "").replace(/^0+/u, "").length;
}

/**
 * How far the formatter may extend past six decimals. Eight is the arithmetic floor rather than a
 * preference: one off-peak cache-hit token costs ¥0.00000002, and six decimals would read that as
 * zero.
 */
const MAX_FRACTION_DIGITS = 8;

/**
 * FR-013 (amended 2026-11-16): at least two significant digits, at most six decimals, never a zero
 * for a non-zero amount. Six decimals is the normal ceiling; below ¥0.000001 the "never zero"
 * promise wins and the amount keeps the decimals it needs, up to eight.
 */
export function formatAmount(amount: number, locale = "en"): string {
  if (!Number.isFinite(amount)) return "";
  if (amount === 0) return numberFormatter(locale, 2).format(0);
  for (let digits = 2; digits <= MAX_FRACTION_DIGITS; digits += 1) {
    const text = numberFormatter(locale, digits).format(amount);
    if (significantDigits(text) >= 2) return text;
  }
  return significantFormatter(locale).format(amount);
}

export function formatTokens(count: number, locale = "en"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(count);
}
