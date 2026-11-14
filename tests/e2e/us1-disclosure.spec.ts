import { expect, test } from "@playwright/test";
import { launchWithExtension } from "../support/load-extension.js";

/**
 * T031 / FR-023: in a fresh profile with only this product installed, the privacy disclosure is
 * shown and must be acknowledged before the credential field accepts input.
 */

test("the disclosure gates the credential field in a fresh profile", async () => {
  const extension = await launchWithExtension();
  try {
    const options = await extension.openOptions();

    const disclosure = options.locator(".disclosure");
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toContainText("Page text is sent only to the translation endpoint");
    await expect(disclosure).toContainText("not encrypted on disk");
    await expect(disclosure).toContainText("remove everything with one action");

    const credential = options.locator("#provider-credential");
    const acknowledge = options.locator("#acknowledge");
    await expect(acknowledge).not.toBeChecked();
    await expect(credential).toBeDisabled();

    // Typing into a disabled field changes nothing.
    await credential.fill("sk-should-not-stick", { force: true }).catch(() => undefined);
    await expect(credential).toHaveValue("");

    await acknowledge.check();
    await expect(credential).toBeEnabled();
    await credential.fill("sk-now-allowed");
    await expect(credential).toHaveValue("sk-now-allowed");

    // Withdrawing the acknowledgement disables the field again and clears what was typed.
    await acknowledge.uncheck();
    await expect(credential).toBeDisabled();
    await expect(credential).toHaveValue("");
  } finally {
    await extension.close();
  }
});
