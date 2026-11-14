import type { ProviderInput } from "../../shared/validation.js";

/**
 * One first-run convenience preset, requested by the product owner: DeepSeek is the default
 * provider this product is expected to be used with.
 *
 * It is a *prefill*, not a dependency. FR-002 forbids depending on a built-in provider list, and
 * this keeps that promise: every field stays free-form after the prefill, any reachable endpoint
 * works, and nothing in the translation path references this module.
 */
export interface ProviderPreset {
  id: "deepseek";
  labelKey: string;
  draft: Pick<ProviderInput, "name" | "endpoint" | "model">;
}

export const DEEPSEEK_PRESET: ProviderPreset = {
  id: "deepseek",
  labelKey: "providerPresetDeepseek",
  draft: {
    name: "DeepSeek",
    // OpenAI-compatible chat completions; the base URL alone is not the request endpoint.
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
  },
};
