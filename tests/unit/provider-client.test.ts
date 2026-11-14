import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ProviderError,
  buildHeaders,
  buildRequestBody,
  callProvider,
  classifyStatus,
  clearEgressLog,
  egressLog,
  parseBatchOutput,
} from "../../src/background/provider-client.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";

/**
 * T027 / FR-001, FR-003: the request really is the shape contracts/provider-adapter.md section 2
 * specifies, proven against a real HTTP server rather than a mocked fetch.
 */

let stub: StubProvider;

beforeAll(async () => {
  stub = await startStubProvider();
});

afterAll(async () => {
  await stub.close();
});

beforeEach(() => {
  stub.reset();
  clearEgressLog();
});

function provider(overrides: Partial<Parameters<typeof callProvider>[0]["provider"]> = {}) {
  return {
    id: "p_1",
    endpoint: `${stub.origin}/v1/chat/completions`,
    model: "test-model",
    extraHeaders: {},
    timeoutMs: 5_000,
    ...overrides,
  };
}

const base = {
  secret: "sk-test-123456",
  systemInstruction: "Translate from English into Chinese (Simplified). Return only a JSON array.",
  timeoutMs: 5_000,
};

describe("request shape", () => {
  it("sends a chat completion with the user's model, temperature 0 and both messages", async () => {
    const outcome = await callProvider({ ...base, provider: provider(), segments: ["Hello", "World"] });
    expect(outcome.results).toEqual([
      { index: 0, text: "【译】Hello" },
      { index: 1, text: "【译】World" },
    ]);

    const request = stub.requests[0];
    expect(request?.path).toBe("/v1/chat/completions");
    expect(request?.headers["authorization"]).toBe("Bearer sk-test-123456");
    const body = request?.body as {
      model: string;
      temperature: number;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("test-model");
    expect(body.temperature).toBe(0);
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[0]?.content).toContain("Chinese (Simplified)");
    expect(body.messages[1]?.role).toBe("user");
    expect(JSON.parse(body.messages[1]?.content ?? "[]")).toEqual(["Hello", "World"]);
  });

  it("binds the credential to Authorization and refuses an override header", () => {
    const headers = buildHeaders(
      { ...provider(), extraHeaders: { authorization: "Bearer attacker", "x-api-version": "2" } },
      "sk-real",
    );
    expect(headers["authorization"]).toBe("Bearer sk-real");
    expect(headers["x-api-version"]).toBe("2");
  });

  it("records exactly one egress destination per request (FR-022)", async () => {
    await callProvider({ ...base, provider: provider(), segments: ["One"] });
    expect(egressLog).toEqual([provider().endpoint]);
  });
});

describe("failure taxonomy at the wire", () => {
  it("surfaces an unreachable provider distinctly", async () => {
    stub.setMode("connectionReset");
    await expect(
      callProvider({ ...base, provider: provider(), segments: ["One"] }),
    ).rejects.toMatchObject({ errorClass: "unreachable" });
  });

  it("surfaces a rejected credential distinctly, without retrying it", async () => {
    stub.setMode("authRejected");
    try {
      await callProvider({ ...base, provider: provider(), segments: ["One"] });
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).errorClass).toBe("authRejected");
      expect((error as ProviderError).retryable).toBe(false);
      expect((error as ProviderError).status).toBe(401);
      expect((error as Error).message).not.toContain("invalid api key");
    }
  });

  it("honours the request timeout", async () => {
    stub.setMode("slow");
    await expect(
      callProvider({ ...base, timeoutMs: 300, provider: provider(), segments: ["One"] }),
    ).rejects.toMatchObject({ errorClass: "timeout" });
  }, 10_000);

  it("maps statuses and bodies to exactly one class", () => {
    expect(classifyStatus(401, "")).toBe("authRejected");
    expect(classifyStatus(403, "")).toBe("authRejected");
    expect(classifyStatus(402, "")).toBe("quotaExhausted");
    expect(classifyStatus(429, "slow down")).toBe("rateLimited");
    expect(classifyStatus(429, "quota exceeded")).toBe("quotaExhausted");
    expect(classifyStatus(404, "model not found")).toBe("modelUnavailable");
    expect(classifyStatus(400, "invalid model id")).toBe("modelUnavailable");
    expect(classifyStatus(400, "bad header")).toBe("invalidRequest");
    expect(classifyStatus(500, "")).toBe("serverError");
    expect(classifyStatus(503, "")).toBe("serverError");
  });
});

describe("tolerant response parsing", () => {
  it("unwraps a fenced array", async () => {
    stub.setMode("fenced");
    const outcome = await callProvider({ ...base, provider: provider(), segments: ["A", "B"] });
    expect(outcome.results.map((result) => result.text)).toEqual(["【译】A", "【译】B"]);
  });

  it("marks a non-array response as malformed and retryable once", () => {
    const outcome = parseBatchOutput("Sure, here you go: nothing useful", 2);
    expect(outcome.errorClass).toBe("malformedResponse");
    expect(outcome.retryable).toBe(true);
    expect(outcome.failedIndices).toEqual([0, 1]);
  });

  it("applies the present entries of a short array and fails the rest", () => {
    const outcome = parseBatchOutput(JSON.stringify(["one"]), 3);
    expect(outcome.results).toEqual([{ index: 0, text: "one" }]);
    expect(outcome.failedIndices).toEqual([1, 2]);
    // A miss rate above 20% is a probable misalignment, so the batch is retried once.
    expect(outcome.retryable).toBe(true);
  });

  it("discards extra entries and asks for one retry", () => {
    const outcome = parseBatchOutput(JSON.stringify(["one", "two", "extra"]), 2);
    expect(outcome.results.map((result) => result.text)).toEqual(["one", "two"]);
    expect(outcome.errorClass).toBe("malformedResponse");
    expect(outcome.retryable).toBe(true);
  });

  it("fails whitespace-only outputs as empty translations, not as content", () => {
    const outcome = parseBatchOutput(JSON.stringify(["one", "   "]), 2);
    expect(outcome.results).toEqual([{ index: 0, text: "one" }]);
    expect(outcome.failedIndices).toEqual([1]);
    expect(outcome.errorClass).toBe("emptyTranslation");
    expect(outcome.retryable).toBe(false);
  });

  it("sanitizes markup out of a translation before it can be rendered", async () => {
    stub.setMode("markup");
    const outcome = await callProvider({ ...base, provider: provider(), segments: ["A"] });
    const text = outcome.results[0]?.text ?? "";
    expect(text).not.toContain("<b>");
    expect(text).not.toContain("<script");
    expect(text).toContain("【译】A");
  });

  it("unwraps an object with a single array-valued key", () => {
    const outcome = parseBatchOutput(JSON.stringify({ translations: ["alpha", "beta"] }), 2);
    expect(outcome.results.map((result) => result.text)).toEqual(["alpha", "beta"]);
    expect(outcome.failedIndices).toEqual([]);
  });

  it("builds a request body that names the model and keeps temperature at zero", () => {
    const body = JSON.parse(buildRequestBody({ model: "m-1" }, "instruction", ["a"])) as {
      model: string;
      temperature: number;
    };
    expect(body.model).toBe("m-1");
    expect(body.temperature).toBe(0);
  });
});
