import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  jobStatus,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";
import { overflowOf, surfaceHeight } from "../support/surface-metrics.js";

/** Feature 008, T17/T19: two tabs, the height budget, and a right-to-left locale. */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR, usage: "deepseek" });
  extension = await launchWithExtension();
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

function pricedEndpoint(): string {
  const port = new URL(stub.origin).port;
  return `http://api.deepseek.com:${port}/v1/chat/completions`;
}

async function seed(providers: { id: string; endpoint: string; model: string }[]): Promise<void> {
  await configureProviders(
    extension,
    providers.map((provider) => ({
      ...provider,
      name: provider.id,
      secret: "sk-e2e-surfaces-1234",
      timeoutMs: 8_000,
    })),
  );
}

async function openPanel(): Promise<import("@playwright/test").Page> {
  const popup = await extension.context.newPage();
  await popup.setViewportSize({ width: 384, height: 720 });
  await popup.goto(extension.popupUrl, { waitUntil: "domcontentloaded" });
  await popup.waitForSelector("#usage");
  return popup;
}

async function translateTo(url: string, index: number): Promise<void> {
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await page.bringToFront();
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);
  // Keep the tab addressable by its own URL; nothing else is stored here.
  expect(index).toBeGreaterThanOrEqual(0);
}

test("each tab's panel reports its own figures", async () => {
  await seed([{ id: "priced", endpoint: pricedEndpoint(), model: "deepseek-flash" }]);
  const firstUrl = `${stub.origin}/pages/news-article-a.html`;
  const secondUrl = `${stub.origin}/pages/blog-short.html`;

  const first = await extension.openPage(firstUrl);
  await waitForContentScript(first);
  await first.bringToFront();
  await sendToTab(extension, firstUrl, { type: "translatePage" });
  await waitForTranslation(first, 1);

  const second = await extension.openPage(secondUrl);
  await waitForContentScript(second);
  await second.bringToFront();
  await sendToTab(extension, secondUrl, { type: "translatePage" });
  await waitForTranslation(second, 1);

  const firstStatus = await jobStatus(extension, firstUrl);
  const secondStatus = await jobStatus(extension, secondUrl);
  expect(firstStatus.usage?.spend?.tokens.total).toBeGreaterThan(0);
  expect(secondStatus.usage?.spend?.tokens.total).toBeGreaterThan(0);

  await first.bringToFront();
  const firstPanel = await openPanel();
  const firstText = (await firstPanel.locator("#usage").textContent()) ?? "";
  expect(firstText).toContain(
    `${(firstStatus.usage?.spend?.tokens.total ?? 0).toLocaleString("en")} tokens spent`,
  );
  expect(firstText).toContain("≈ ¥");
  await firstPanel.close();

  await second.bringToFront();
  const secondPanel = await openPanel();
  const secondText = (await secondPanel.locator("#usage").textContent()) ?? "";
  expect(secondText).toContain(
    `${(secondStatus.usage?.spend?.tokens.total ?? 0).toLocaleString("en")} tokens spent`,
  );
  await secondPanel.close();
});

test("the panel stays inside 600 px with the row and the note", async () => {
  await seed([
    { id: "unpriced", endpoint: `${stub.origin}/v1/chat/completions`, model: "deepseek-flash" },
  ]);
  const url = `${stub.origin}/pages/news-article-a.html`;
  await translateTo(url, 0);

  const popup = await openPanel();
  await expect(popup.locator("#usage .usage__spend")).toHaveCount(1);
  await expect(popup.locator("#usage .usage__note")).toHaveCount(1);

  const height = await surfaceHeight(popup);
  expect(height).toBeLessThanOrEqual(600);
  expect(await overflowOf(popup)).toBeLessThanOrEqual(1);
  expect(await overflowOf(popup, "#usage")).toBeLessThanOrEqual(1);

  await popup.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  expect(await overflowOf(popup, "#usage")).toBeLessThanOrEqual(1);
  const text = (await popup.locator("#usage .usage__spend").textContent()) ?? "";
  expect(text).toContain("tokens spent");
  expect(text.match(/[0-9]/gu)?.length ?? 0).toBeGreaterThan(0);
  await popup.close();
});
