import { expect, test } from "@playwright/test";
import { launchWithExtension } from "../support/load-extension.js";
import { startStubProvider } from "../support/stub-provider.js";
import { fileURLToPath } from "node:url";

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

/**
 * T021 / SC-001 baseline: the unpacked extension really loads in Chromium, its service worker
 * runs, the popup renders from the catalog, and the stub provider is reachable over HTTP.
 * Everything here is real except the provider, which is the boundary this product does not own.
 */

test("the extension loads, the worker registers and the popup renders", async () => {
  const stub = await startStubProvider({ staticDir: PAGES_DIR });
  const extension = await launchWithExtension();
  const consoleErrors: string[] = [];

  try {
    extension.context.on("page", (page) => {
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
    });

    expect(extension.extensionId).toMatch(/^[a-p]{32}$/);
    const runtimeId = await extension.serviceWorker.evaluate(() => chrome.runtime.id);
    expect(runtimeId).toBe(extension.extensionId);

    const popup = await extension.context.newPage();
    await popup.goto(extension.popupUrl);
    await expect(popup.locator("h1")).toHaveText("Immersive Polyglot");
    await expect(popup.locator("#translate")).toHaveText("Translate this page");
    // No provider is configured, so translating is not offered as a working action.
    await expect(popup.locator("#translate")).toBeDisabled();

    const page = await extension.openPage(`${stub.origin}/pages/news-article-a.html`);
    await expect(page.locator("h1")).toHaveText("Harbour authority approves the northern breakwater");
    await page.waitForFunction(() => document.documentElement.dataset["iptReady"] === "1");

    expect(consoleErrors).toEqual([]);
  } finally {
    await extension.close();
    await stub.close();
  }
});

test("the stub provider answers a chat-completion request over real HTTP", async () => {
  const stub = await startStubProvider({ staticDir: PAGES_DIR });
  try {
    const response = await fetch(`${stub.origin}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({
        model: "test-model",
        messages: [
          { role: "system", content: "translate" },
          { role: "user", content: JSON.stringify(["Hello", "World"]) },
        ],
      }),
    });
    const body = (await response.json()) as { choices: { message: { content: string } }[] };
    const content = body.choices[0]?.message.content ?? "";
    expect(JSON.parse(content)).toEqual(["【译】Hello", "【译】World"]);
    expect(stub.requests).toHaveLength(1);
  } finally {
    await stub.close();
  }
});
