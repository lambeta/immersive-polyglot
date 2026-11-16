import { expect, test } from "@playwright/test";
import { launchWithExtension } from "../support/load-extension.js";

/**
 * First-run convenience (owner request): a fresh profile starts pre-filled with DeepSeek's
 * endpoint and model, the credential stays blank, and the disclosure still gates it.
 *
 * Feature 008 (R9): the pre-filled model is `deepseek-flash`, a name DeepSeek still publishes and
 * the shipped price catalogue prices; the retired `deepseek-chat` alias is gone from the preset.
 */

test("a fresh profile starts on the DeepSeek preset with an empty credential", async () => {
  const extension = await launchWithExtension();
  try {
    const options = await extension.openOptions();

    await expect(options.locator("#provider-name")).toHaveValue("DeepSeek");
    await expect(options.locator("#provider-endpoint")).toHaveValue(
      "https://api.deepseek.com/chat/completions",
    );
    await expect(options.locator("#provider-model")).toHaveValue("deepseek-flash");
    await expect(options.locator("#provider-credential")).toHaveValue("");
    await expect(options.locator("#provider-credential")).toBeDisabled();
  } finally {
    await extension.close();
  }
});

test("the preset button refills the fields after they were edited", async () => {
  const extension = await launchWithExtension();
  try {
    const options = await extension.openOptions();
    await options.fill("#provider-name", "Something else");
    await options.fill("#provider-endpoint", "https://example.test/v1/chat/completions");
    await options.fill("#provider-model", "other-model");

    await options.click("#provider-preset");

    await expect(options.locator("#provider-name")).toHaveValue("DeepSeek");
    await expect(options.locator("#provider-endpoint")).toHaveValue(
      "https://api.deepseek.com/chat/completions",
    );
    await expect(options.locator("#provider-model")).toHaveValue("deepseek-flash");
  } finally {
    await extension.close();
  }
});
