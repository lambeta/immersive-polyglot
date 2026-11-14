import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RETRYABLE, callProvider, clearEgressLog, parseBatchOutput, ProviderError } from "../../src/background/provider-client.js";
import type { ProviderErrorClass } from "../../src/shared/types.js";
import { startStubProvider, type StubProvider, type StubMode } from "../support/stub-provider.js";

/**
 * T060 / SC-007: each stub failure mode maps to exactly one class, the non-retryable set is
 * exact, and every class has a user-facing message in the catalog.
 */

let stub: StubProvider;
const catalog = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../src/_locales/en/messages.json"), "utf8"),
) as Record<string, { message: string }>;

beforeAll(async () => {
  stub = await startStubProvider();
});
afterAll(async () => {
  await stub.close();
});

const config = {
  secret: "sk-test",
  systemInstruction: "Translate.",
  timeoutMs: 2_000,
};

function provider() {
  return {
    id: "p",
    endpoint: `${stub.origin}/v1/chat/completions`,
    model: "m",
    extraHeaders: {},
    timeoutMs: 2_000,
  };
}

const CASES: { mode: StubMode; expected: ProviderErrorClass | "none" }[] = [
  { mode: "success", expected: "none" },
  { mode: "authRejected", expected: "authRejected" },
  { mode: "rateLimited", expected: "rateLimited" },
  { mode: "serverError", expected: "serverError" },
  { mode: "modelUnavailable", expected: "modelUnavailable" },
  { mode: "quotaExhausted", expected: "quotaExhausted" },
  { mode: "connectionReset", expected: "unreachable" },
];

describe("one class per failure", () => {
  for (const testCase of CASES) {
    it(`stub mode "${testCase.mode}" becomes ${testCase.expected}`, async () => {
      stub.reset();
      clearEgressLog();
      stub.setMode(testCase.mode);
      try {
        const outcome = await callProvider({ ...config, provider: provider(), segments: ["A"] });
        expect(testCase.expected).toBe("none");
        expect(outcome.results).toHaveLength(1);
      } catch (error) {
        expect(testCase.expected).not.toBe("none");
        expect((error as ProviderError).errorClass).toBe(testCase.expected);
      }
    }, 15_000);
  }

  it("classifies a short array as malformed and empty outputs as emptyTranslation", () => {
    expect(parseBatchOutput(JSON.stringify(["only"]), 4).errorClass).toBe("malformedResponse");
    expect(parseBatchOutput(JSON.stringify([""]), 1).errorClass).toBe("emptyTranslation");
  });
});

describe("retry policy per class", () => {
  it("never retries a rejected credential, an exhausted quota, an unavailable model or a cancel", () => {
    for (const errorClass of ["authRejected", "quotaExhausted", "modelUnavailable", "cancelled", "invalidRequest"] as const) {
      expect(RETRYABLE[errorClass], errorClass).toBe(false);
    }
  });

  it("does retry the transient classes", () => {
    for (const errorClass of ["unreachable", "timeout", "rateLimited", "serverError"] as const) {
      expect(RETRYABLE[errorClass], errorClass).toBe(true);
    }
  });
});

describe("every class has a message a user can act on", () => {
  it("covers every ProviderErrorClass in the catalog", () => {
    const classes: ProviderErrorClass[] = [
      "unreachable",
      "timeout",
      "authRejected",
      "rateLimited",
      "quotaExhausted",
      "modelUnavailable",
      "malformedResponse",
      "emptyTranslation",
      "serverError",
      "invalidRequest",
      "cancelled",
    ];
    for (const errorClass of classes) {
      const key = `error${errorClass.charAt(0).toUpperCase()}${errorClass.slice(1)}`;
      const message = catalog[key]?.message ?? "";
      expect(message.length, key).toBeGreaterThan(10);
    }
  });
});
