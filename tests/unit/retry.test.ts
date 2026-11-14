import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RETRY_POLICY,
  delayForAttempt,
  withRetry,
} from "../../src/background/retry.js";
import type { RetryHooks, RetryPolicy } from "../../src/background/retry.js";
import { ProviderError } from "../../src/background/provider-client.js";

const policy: RetryPolicy = { maxRetries: 2, baseDelayMs: 500, capDelayMs: 8000 };

/** A jitter source that lands exactly in the middle, so the delay equals the pure backoff. */
const noJitter = () => 0.5;

function sleepRecorder(): { delays: number[]; hooks: RetryHooks } {
  const delays: number[] = [];
  return {
    delays,
    hooks: {
      sleep: async (ms: number) => {
        delays.push(ms);
      },
    },
  };
}

function failing(message: string, options: ConstructorParameters<typeof ProviderError>[2] = {}) {
  let calls = 0;
  const operation = async (attempt: number): Promise<string> => {
    calls += 1;
    throw new ProviderError("serverError", `${message} ${attempt}`, options);
  };
  return { operation, calls: () => calls };
}

describe("DEFAULT_RETRY_POLICY", () => {
  it("is the contract's bounded policy: 2 retries, 500 ms base, 8 s cap", () => {
    expect(DEFAULT_RETRY_POLICY).toEqual({ maxRetries: 2, baseDelayMs: 500, capDelayMs: 8000 });
  });
});

describe("delayForAttempt", () => {
  it("doubles from the base: 500, 1000, 2000, 4000", () => {
    expect(delayForAttempt(1, policy, noJitter)).toBe(500);
    expect(delayForAttempt(2, policy, noJitter)).toBe(1000);
    expect(delayForAttempt(3, policy, noJitter)).toBe(2000);
    expect(delayForAttempt(4, policy, noJitter)).toBe(4000);
  });

  it("caps the exponential growth at capDelayMs", () => {
    expect(delayForAttempt(5, policy, noJitter)).toBe(8000);
    expect(delayForAttempt(12, policy, noJitter)).toBe(8000);
    expect(delayForAttempt(50, policy, noJitter)).toBe(8000);
  });

  it("applies -20% .. +20% jitter around the bounded backoff", () => {
    expect(delayForAttempt(2, policy, () => 0)).toBe(800);
    expect(delayForAttempt(2, policy, () => 1)).toBe(1200);
    expect(delayForAttempt(1, policy, () => 0)).toBe(400);
    expect(delayForAttempt(1, policy, () => 1)).toBe(600);
    expect(delayForAttempt(1, policy, () => 0.25)).toBe(450);
    expect(delayForAttempt(1, policy, () => 0.75)).toBe(550);
  });

  it("treats attempt 0 like the first attempt instead of dividing the base", () => {
    expect(delayForAttempt(0, policy, noJitter)).toBe(500);
  });

  it("honours a policy whose base already exceeds the cap", () => {
    const tight: RetryPolicy = { maxRetries: 2, baseDelayMs: 20000, capDelayMs: 8000 };
    expect(delayForAttempt(1, tight, noJitter)).toBe(8000);
  });
});

describe("withRetry", () => {
  it("returns the first success without sleeping or reporting a retry", async () => {
    const { delays, hooks } = sleepRecorder();
    const attempts: number[] = [];
    const onRetry = vi.fn();
    const value = await withRetry(
      async (attempt) => {
        attempts.push(attempt);
        return "done";
      },
      policy,
      { ...hooks, onRetry },
    );
    expect(value).toBe("done");
    expect(attempts).toEqual([1]);
    expect(delays).toEqual([]);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("stops after 2 retries (3 attempts) and rethrows the original error with its failedIndices", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { delays, hooks } = sleepRecorder();
    const attempts: number[] = [];
    const original = new ProviderError("serverError", "boom", { status: 500, failedIndices: [2, 5] });
    let thrown: unknown;

    try {
      await withRetry(
        async (attempt) => {
          attempts.push(attempt);
          throw original;
        },
        policy,
        hooks,
      );
    } catch (error) {
      thrown = error;
    }

    expect(attempts).toEqual([1, 2, 3]);
    expect(thrown).toBe(original);
    expect((thrown as ProviderError).failedIndices).toEqual([2, 5]);
    expect(delays).toEqual([500, 1000]);
  });

  it("uses the exact delay sequence from the policy, honouring the injected backoff shape", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { delays, hooks } = sleepRecorder();
    const { operation } = failing("always");
    await expect(withRetry(operation, policy, hooks)).rejects.toBeInstanceOf(ProviderError);
    expect(delays).toEqual([500, 1000]);
    expect(random).toHaveBeenCalled();
  });

  it("rethrows a non-retryable ProviderError immediately, without sleeping", async () => {
    const { delays, hooks } = sleepRecorder();
    const onRetry = vi.fn();
    const authError = new ProviderError("authRejected", "401", { status: 401 });

    await expect(
      withRetry(async () => {
        throw authError;
      }, policy, { ...hooks, onRetry }),
    ).rejects.toBe(authError);

    expect(delays).toEqual([]);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it.each(["authRejected", "quotaExhausted", "modelUnavailable", "cancelled", "invalidRequest"] as const)(
    "never retries %s",
    async (errorClass) => {
      const { delays, hooks } = sleepRecorder();
      const error = new ProviderError(errorClass, "permanent");
      expect(error.retryable).toBe(false);
      await expect(
        withRetry(async () => {
          throw error;
        }, policy, hooks),
      ).rejects.toBe(error);
      expect(delays).toEqual([]);
    },
  );

  it("honours an explicit retryable flag that contradicts the class default", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { delays, hooks } = sleepRecorder();
    const forcedRetry = new ProviderError("malformedResponse", "short array", { retryable: true });
    await expect(
      withRetry(async () => {
        throw forcedRetry;
      }, policy, hooks),
    ).rejects.toBe(forcedRetry);
    expect(delays).toEqual([500, 1000]);

    const noRetry = new ProviderError("serverError", "stop", { retryable: false });
    const second = sleepRecorder();
    await expect(
      withRetry(async () => {
        throw noRetry;
      }, policy, second.hooks),
    ).rejects.toBe(noRetry);
    expect(second.delays).toEqual([]);
  });

  it("sleeps Retry-After instead of the computed backoff", async () => {
    const { delays, hooks } = sleepRecorder();
    const rateLimited = new ProviderError("rateLimited", "429", { status: 429, retryAfterMs: 3000 });
    await expect(
      withRetry(async () => {
        throw rateLimited;
      }, policy, hooks),
    ).rejects.toBe(rateLimited);
    expect(delays).toEqual([3000, 3000]);
  });

  it("caps a long Retry-After at capDelayMs", async () => {
    const { delays, hooks } = sleepRecorder();
    const rateLimited = new ProviderError("rateLimited", "429", { status: 429, retryAfterMs: 120000 });
    await expect(
      withRetry(async () => {
        throw rateLimited;
      }, policy, hooks),
    ).rejects.toBe(rateLimited);
    expect(delays).toEqual([8000, 8000]);
  });

  it("calls onRetry once per retry with the failed attempt number and the delay used", async () => {
    const { delays, hooks } = sleepRecorder();
    const seen: { attempt: number; delayMs: number; error: unknown }[] = [];
    const errors: unknown[] = [];
    const operation = async (attempt: number): Promise<never> => {
      const error = new ProviderError(
        "rateLimited",
        `attempt ${attempt}`,
        attempt === 1 ? { retryAfterMs: 1500 } : {},
      );
      errors.push(error);
      throw error;
    };

    await expect(
      withRetry(operation, policy, {
        ...hooks,
        onRetry: (attempt, delayMs, error) => seen.push({ attempt, delayMs, error }),
      }),
    ).rejects.toBeInstanceOf(ProviderError);

    expect(seen.map((entry) => entry.attempt)).toEqual([1, 2]);
    expect(seen.map((entry) => entry.delayMs)).toEqual(delays);
    expect(seen[0]?.delayMs).toBe(1500);
    expect(seen[0]?.error).toBe(errors[0]);
    expect(seen[1]?.error).toBe(errors[1]);
  });

  it("returns a value that succeeds after a retry", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { delays, hooks } = sleepRecorder();
    let calls = 0;
    const value = await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) throw new ProviderError("unreachable", "network hiccup");
        return calls;
      },
      policy,
      hooks,
    );
    expect(value).toBe(2);
    expect(delays).toEqual([500]);
  });

  it("retries a plain Error, because no part of the taxonomy declares it permanent", async () => {
    const { delays, hooks } = sleepRecorder();
    const attempts: number[] = [];
    await expect(
      withRetry(
        async (attempt) => {
          attempts.push(attempt);
          throw new Error("transport reset");
        },
        policy,
        hooks,
      ),
    ).rejects.toThrow("transport reset");
    expect(attempts).toEqual([1, 2, 3]);
    // No jitter is injected here, so the assertions cover the production Math.random path.
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(400);
    expect(delays[0]).toBeLessThanOrEqual(600);
    expect(delays[1]).toBeGreaterThanOrEqual(800);
    expect(delays[1]).toBeLessThanOrEqual(1200);
  });

  it("makes a single attempt when maxRetries is 0", async () => {
    const { delays, hooks } = sleepRecorder();
    const attempts: number[] = [];
    await expect(
      withRetry(
        async (attempt) => {
          attempts.push(attempt);
          throw new ProviderError("unreachable", "down");
        },
        { maxRetries: 0, baseDelayMs: 500, capDelayMs: 8000 },
        hooks,
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(attempts).toEqual([1]);
    expect(delays).toEqual([]);
  });

  it("defaults to DEFAULT_RETRY_POLICY when no policy is given", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const delays: number[] = [];
    const attempts: number[] = [];
    await expect(
      withRetry(
        async (attempt) => {
          attempts.push(attempt);
          throw new ProviderError("timeout", "slow");
        },
        undefined,
        {
          sleep: async (ms) => {
            delays.push(ms);
          },
        },
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(attempts).toEqual([1, 2, 3]);
    expect(delays).toEqual([500, 1000]);
  });
});
