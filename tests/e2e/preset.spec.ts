import { expect, test } from "@playwright/test";
import { launchWithExtension } from "../support/load-extension.js";

/**
 * First-run convenience (owner request): a fresh profile starts pre-filled with DeepSeek's
 * endpoint and model, the credential stays blank, and the disclosure still gates it.
 */

test("a fresh profile starts on the DeepSeek preset with an empty credential", async () => {
  const extension = await launchWithExtension();
  try {
    const options = await extension.openOptions();

    await expect(options.locator("#provider-name")).toHaveValue("DeepSeek");
    await expect(options.locator("#provider-endpoint")).toHaveValue(
      "https://api.deepseek.com/chat/completions",
    );
    await expect(options.locator("#provider-model")).toHaveValue("deepseek-chat");
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
    await expect(options.locator("#provider-model")).toHaveValue("deepseek-chat");
  } finally {
    await extension.close();
  }
});
