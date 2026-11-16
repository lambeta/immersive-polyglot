import { expect, test, type Page } from "@playwright/test";
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

/**
 * Feature 008, T14: the spend row on a real translated page, over the real wire. The priced
 * provider's host is resolved to the local stub, so the arithmetic is exercised end to end.
 */

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

/** The priced provider: the catalogue's host, resolved to the local stub by the test browser. */
function pricedEndpoint(): string {
  const port = new URL(stub.origin).port;
  return `http://api.deepseek.com:${port}/v1/chat/completions`;
}

async function seedPricedProvider(): Promise<void> {
  await configureProviders(extension, [
    {
      id: "p_spend",
      name: "DeepSeek",
      endpoint: pricedEndpoint(),
      model: "deepseek-flash",
      secret: "sk-e2e-spend-1234",
      timeoutMs: 8_000,
    },
  ]);
}

async function openPanel(): Promise<Page> {
  const popup = await extension.context.newPage();
  await popup.setViewportSize({ width: 384, height: 720 });
  await popup.goto(extension.popupUrl, { waitUntil: "domcontentloaded" });
  // Attached, not visible: an empty record is intentionally hidden by `:has(#usage:empty)`.
  await popup.waitForSelector("#usage", { state: "attached" });
  return popup;
}

async function translate(url: string): Promise<{ page: Page }> {
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await page.bringToFront();
  await sendToTab(extension, url, { type: "translatePage" });
  return { page };
}

function expectedAmounts(requestCount: number): number[] {
  return [requestCount * 0.00308, requestCount * 0.00616];
}


test("the panel reports the tokens and the price of a translated page", async () => {
  await seedPricedProvider();
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  const status = await jobStatus(extension, url);
  const spend = status.usage?.spend;
  const requests = stub.requests.length;
  expect(requests).toBeGreaterThan(0);
  expect(spend?.tokens.total).toBe(requests * 5_500);
  expect(spend?.price?.currency).toBe("CNY");
  expect(spend?.price?.snapshot).toBe("2026-11");
  const [offPeak, peak] = expectedAmounts(requests);
  const amount = spend?.price?.amount ?? -1;
  expect(Math.abs(amount - (offPeak ?? 0)) < 1e-9 || Math.abs(amount - (peak ?? 0)) < 1e-9).toBe(true);

  const popup = await openPanel();
  const text = (await popup.locator("#usage").textContent()) ?? "";
  expect(text).toContain(`${(requests * 5_500).toLocaleString("en")} tokens spent`);
  expect(text).toContain("≈ ¥");
  expect(text).toContain("DeepSeek list · 2026-11");

  await popup.reload();
  await popup.waitForSelector("#usage .usage__spend");
  expect((await popup.locator("#usage").textContent()) ?? "").toBe(text);
  await popup.close();
});

test("a profile that still says deepseek-chat is priced, not refused", async () => {
  await configureProviders(extension, [
    {
      id: "p_legacy",
      name: "DeepSeek",
      endpoint: pricedEndpoint(),
      model: "deepseek-chat",
      secret: "sk-e2e-legacy-1234",
      timeoutMs: 8_000,
    },
  ]);
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  const status = await jobStatus(extension, url);
  expect(status.usage?.spend?.price?.currency).toBe("CNY");
  expect(status.usage?.spend?.unavailable).toBeUndefined();

  const popup = await openPanel();
  const text = (await popup.locator("#usage").textContent()) ?? "";
  expect(text).toContain("≈ ¥");
  expect(text).not.toContain("No published price");
  await popup.close();
});

test("the figures rise while the run is in flight and never move backwards", async () => {
  await seedPricedProvider();
  stub.setMode("success", { latencyMs: 120 });
  const url = `${stub.origin}/pages/article-endless.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  const popup = await openPanel();
  const observed: number[] = [];
  for (let sample = 0; sample < 40; sample += 1) {
    const text = (await popup.locator("#usage .usage__tokens").textContent().catch(() => "")) ?? "";
    const digits = Number(text.replace(/[^0-9]/gu, ""));
    if (Number.isFinite(digits) && digits > 0) observed.push(digits);
    if (observed.length >= 3) break;
    await popup.waitForTimeout(100);
  }
  for (let index = 1; index < observed.length; index += 1) {
    expect(observed[index]).toBeGreaterThanOrEqual(observed[index - 1] ?? 0);
  }
  expect(observed.length).toBeGreaterThan(0);
  await popup.close();
});

test("turning translation off clears the row; a cancel keeps it", async () => {
  await seedPricedProvider();
  stub.setMode("success", { latencyMs: 150 });
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  await sendToTab(extension, url, { type: "cancelJob" });
  await page.waitForTimeout(300);

  const popup = await openPanel();
  await expect(popup.locator("#usage .usage__spend")).toHaveCount(1);

  await sendToTab(extension, url, { type: "toggleTranslation" });
  await page.waitForFunction(() => document.querySelectorAll("[data-ipt]").length === 0);

  await popup.reload();
  await popup.waitForSelector("#usage", { state: "attached" });
  await expect(popup.locator("#usage .usage__spend")).toHaveCount(0);
  await expect(popup.locator(".usage")).toBeHidden();
  await popup.close();
});
