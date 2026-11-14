import { ProviderError } from "./provider-client.js";

/**
 * FR-026: a failed request is retried within a bounded policy, and the failure that survives is
 * the original one so the caller still knows which passages it affected.
 *
 * Delays are computed here rather than in the caller so the policy has exactly one definition:
 * the contract fixes 2 retries, a 0.5 s base and an 8 s cap (contracts/provider-adapter.md §4).
 */

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  capDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 500,
  capDelayMs: 8000,
};

/** Spread either side of the computed backoff, so a fleet of retries does not re-synchronise. */
const JITTER_RATIO = 0.2;

/**
 * Delay before retrying the attempt that just failed (attempt 1 = the first attempt).
 *
 * The exponential growth is capped first and jittered second, matching the contract's wording
 * ("0.5 s base, cap 8 s") for the growth while keeping the cap the ceiling of the growth rather
 * than of the jitter as well. `jitter` is injected so a test can pin the delay.
 */
export function delayForAttempt(
  attempt: number,
  policy: RetryPolicy,
  jitter: () => number = Math.random,
): number {
  const growth = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const bounded = Math.min(growth, policy.capDelayMs);
  const sample = Math.min(Math.max(jitter(), 0), 1);
  return Math.round(bounded * (1 + (sample * 2 - 1) * JITTER_RATIO));
}

export interface RetryHooks {
  onRetry?(attempt: number, delayMs: number, error: unknown): void;
  sleep?(ms: number): Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * A ProviderError carries its own verdict. Anything else (a thrown Error, a rejected non-error)
 * is retried: no part of the taxonomy declares it permanent, and surfacing a transport hiccup as a
 * translation failure would report a passage as untranslatable when a second attempt would have
 * succeeded. The budget is bounded either way, so this cannot loop.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof ProviderError) return error.retryable;
  if (typeof error === "object" && error !== null && "retryable" in error) {
    return (error as { retryable?: unknown }).retryable !== false;
  }
  return true;
}

/**
 * A provider's Retry-After is the only hint about when it will accept work again, so it replaces
 * the computed backoff - but the user is still waiting, so it cannot exceed the cap.
 */
function delayForError(error: unknown, attempt: number, policy: RetryPolicy): number {
  if (error instanceof ProviderError && error.retryAfterMs !== undefined) {
    return Math.max(0, Math.min(error.retryAfterMs, policy.capDelayMs));
  }
  return delayForAttempt(attempt, policy);
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  hooks: RetryHooks = {},
): Promise<T> {
  const sleep = hooks.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryable(error) || attempt > policy.maxRetries) throw error;
      const delayMs = delayForError(error, attempt, policy);
      hooks.onRetry?.(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }
}
