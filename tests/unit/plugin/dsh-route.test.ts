import { describe, expect, it } from "vitest";
import { translateWithDsh, type DshLlm, type DshStreamChunk } from "../../../src/plugin/host/dsh-route.js";
import type { PagePlan } from "../../../src/plugin/host/page-batch.js";
import type { TranslateConfig } from "../../../src/plugin/host/translate.js";

/**
 * The DSH route sends the same instruction and the same segment array as the own-endpoint route, so
 * the assertions here are about routing, classification and mapping — not about prompt text.
 */

const config: TranslateConfig = {
  endpoint: "https://unused.test/chat",
  model: "unused",
  targetLang: "zh",
  timeoutMs: 1000,
  glossary: [],
};

const plan = (texts: string[]): PagePlan => ({
  batches: [{
    segments: texts.map((text, index) => ({ unitId: `m-1#${index}`, messageId: "m-1", blockIndex: index, text })),
  }],
  skipped: [],
});

function llm(chunks: DshStreamChunk[]): DshLlm {
  return {
    stream: () => (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
  };
}

const routeFor = (fake: DshLlm, model = { provider: "deepseek", model: "deepseek-chat" }) => ({
  llm: fake,
  selection: () => model,
});

const text = (value: string): DshStreamChunk => ({ type: "text-delta", text: value });

describe("the DSH model route", () => {
  it("maps a returned array back to unit ids and reports usage", async () => {
    const result = await translateWithDsh(plan(["Hello", "Bye"]), config, routeFor(llm([
      text("[\"你好。\","),
      text("\"再见。\"]"),
      { type: "usage", usage: { inputTokens: 10, outputTokens: 4 } },
      { type: "finish", reason: { kind: "stop" } },
    ])), "s-1");

    expect(result.requests).toBe(1);
    expect([...result.byUnitId]).toEqual([["m-1#0", "你好。"], ["m-1#1", "再见。"]]);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });
    expect(result.failures).toEqual([]);
  });

  it("classifies a terminal provider failure instead of pretending the answer is translated", async () => {
    const result = await translateWithDsh(plan(["Hello"]), config, routeFor(llm([
      { type: "finish", reason: { kind: "error", failure: { code: "AUTH_FAILED", message: "Invalid API key" } } },
    ])), "s-1");

    expect(result.byUnitId.size).toBe(0);
    expect(result.failures).toEqual([{ unitIds: ["m-1#0"], errorClass: "authRejected", message: "Invalid API key" }]);
  });

  it("reports a thrown stream as unreachable", async () => {
    const thrown: DshLlm = {
      stream: () => (async function* () {
        throw new Error("socket closed");
      })(),
    };
    const result = await translateWithDsh(plan(["Hello"]), config, routeFor(thrown), "s-1");
    expect(result.failures[0]?.errorClass).toBe("unreachable");
    expect(result.failures[0]?.message).toBe("socket closed");
  });

  it("refuses to invent a page when no model is selected", async () => {
    const result = await translateWithDsh(plan(["Hello"]), config, { llm: llm([]), selection: () => undefined }, "s-1");
    expect(result.requests).toBe(0);
    expect(result.failures[0]?.message).toContain("No DSH model");
  });

  it("treats unparsable output as a named failure, not as a translation", async () => {
    const result = await translateWithDsh(plan(["Hello"]), config, routeFor(llm([
      text("I cannot help with that."),
      { type: "finish", reason: { kind: "stop" } },
    ])), "s-1");
    expect(result.byUnitId.size).toBe(0);
    expect(result.failures[0]?.errorClass).toBe("malformedResponse");
  });

  it("keeps a batch all-or-nothing when the model returns a short array", async () => {
    const result = await translateWithDsh(plan(["Hello", "Bye"]), config, routeFor(llm([
      text("[\"你好。\"]"),
      { type: "finish", reason: { kind: "stop" } },
    ])), "s-1");
    // The own-endpoint route drops the whole batch on a count mismatch; this route must agree.
    expect(result.byUnitId.size).toBe(0);
    expect(result.failures[0]?.unitIds).toEqual(["m-1#1"]);
    expect(result.failures[0]?.errorClass).toBe("emptyTranslation");
  });
});
