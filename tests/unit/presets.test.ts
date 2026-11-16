import { describe, expect, it } from "vitest";
import { DEEPSEEK_PRESET } from "../../src/ui/options/presets.js";
import { PRICE_SNAPSHOT } from "../../src/shared/price-catalog.js";
import { resolveModel } from "../../src/shared/pricing.js";
import { validateEndpoint, validateProvider } from "../../src/shared/validation.js";

/**
 * The preset is a prefill, never a dependency (FR-002). These tests pin both halves of that
 * claim: the prefilled values are valid, and any other endpoint is equally usable.
 */

describe("DeepSeek preset", () => {
  it("prefills a valid, absolute https endpoint and a model identifier", () => {
    const { draft } = DEEPSEEK_PRESET;
    expect(draft.endpoint).toBe("https://api.deepseek.com/chat/completions");
    expect(validateEndpoint(draft.endpoint)).toBeNull();
    expect(draft.model.trim().length).toBeGreaterThan(0);
    expect(draft.name.trim().length).toBeGreaterThan(0);
  });

  it("passes provider validation with a credential, and fails without a model", () => {
    const draft = {
      ...DEEPSEEK_PRESET.draft,
      timeoutMs: 60_000,
      maxConcurrency: 3,
    };
    expect(validateProvider(draft, [])).toEqual([]);

    const broken = validateProvider({ ...draft, model: "  " }, []);
    expect(broken.map((issue) => issue.field)).toContain("model");
  });

  it("does not lock the user to one vendor: another endpoint validates just as well", () => {
    const other = {
      name: "Home server",
      endpoint: "http://127.0.0.1:8787/v1/chat/completions",
      model: "dev-model",
      timeoutMs: 60_000,
      maxConcurrency: 3,
    };
    expect(validateProvider(other, [])).toEqual([]);
  });

  it("never carries a credential", () => {
    expect(Object.keys(DEEPSEEK_PRESET.draft).sort()).toEqual(["endpoint", "model", "name"]);
  });

  it("prefills a model the shipped catalogue prices, and prices the legacy names too", () => {
    expect(resolveModel(DEEPSEEK_PRESET.draft.model, PRICE_SNAPSHOT)).not.toBeNull();
    // A profile configured before the preset changed still says deepseek-chat; it must be priced.
    expect(resolveModel("deepseek-chat", PRICE_SNAPSHOT)).not.toBeNull();
  });
});
