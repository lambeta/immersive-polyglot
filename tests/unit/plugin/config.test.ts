import { describe, expect, it } from "vitest";
import { Config } from "../../../src/plugin/host/index.js";

describe("plugin config", () => {
  it("fills every documented default, so a bare patch row still works", () => {
    const config = Config({});
    expect(config).toMatchObject({
      route: "dsh",
      endpoint: "https://api.deepseek.com/chat/completions",
      model: "deepseek-chat",
      targetLang: "zh",
      glossary: [],
      maxAnswersPerPage: 12,
      maxCharsPerBatch: 6000,
      timeoutMs: 60000,
      maxRetries: 2,
    });
  });

  it("routes through DSH's own model by default, and accepts the own-endpoint route", () => {
    expect(Config({}).route).toBe("dsh");
    expect(Config({ route: "own" }).route).toBe("own");
    expect(() => Config({ route: "somewhere" } as never)).toThrow();
  });

  it("keeps what the reader set and fills the rest", () => {
    const config = Config({ model: "deepseek-reasoner", glossary: [{ sourceTerm: "KV cache", targetTerm: "KV 缓存" }] });
    expect(config.model).toBe("deepseek-reasoner");
    expect(config.endpoint).toBe("https://api.deepseek.com/chat/completions");
    expect(config.glossary).toEqual([{ sourceTerm: "KV cache", targetTerm: "KV 缓存", caseSensitive: false }]);
  });

  it("rejects a page size no provider could serve", () => {
    expect(() => Config({ maxAnswersPerPage: 0 })).toThrow();
  });

  it("rejects a glossary entry without both terms", () => {
    expect(() => Config({ glossary: [{ sourceTerm: "KV cache" }] as never })).toThrow();
  });
});
