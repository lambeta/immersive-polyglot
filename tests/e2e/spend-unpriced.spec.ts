import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/** Feature 008, T17: tokens without a price, and no token row at all when usage is absent. */

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
  await popup.waitForSelector("#usage");
  return popup;
}

async function translate(url: string): Promise<{ page: Page }> {
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await page.bringToFront();
  await sendToTab(extension, url, { type: "translatePage" });
  return { page };
}



async function seedLocalProvider(): Promise<void> {
  await configureProviders(extension, [
    {
      id: "p_unpriced",
      name: "Local",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "deepseek-flash",
      secret: "sk-e2e-unpriced-1234",
      timeoutMs: 8_000,
    },
  ]);
}

test("an unpriced provider shows tokens and one muted note, never an amount", async () => {
  await seedLocalProvider();
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  const popup = await openPanel();
  const text = (await popup.locator("#usage").textContent()) ?? "";
  expect(text).toContain("tokens spent");
  expect(text).toContain("No published price for this provider.");
  expect(text).not.toContain("≈");
  expect(text).not.toContain("¥");
  expect(text).not.toContain("$");
  await popup.close();
});

test("a provider that reports nothing shows no token row and no price", async () => {
  await seedLocalProvider();
  stub.setMode("success", { usage: "none" });
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  const popup = await openPanel();
  await expect(popup.locator("#usage .usage__spend")).toHaveCount(0);
  await expect(popup.locator("#usage .usage__note")).toHaveCount(0);
  await expect(popup.locator("#usage li")).not.toHaveCount(0);
  await popup.close();
});

test("a total-only report keeps the tokens and explains why no price is shown", async () => {
  await seedPricedProvider();
  stub.setMode("success", { usage: "totalOnly" });
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  const popup = await openPanel();
  const text = (await popup.locator("#usage").textContent()) ?? "";
  expect(text).toContain("tokens spent");
  expect(text).toContain("did not report enough usage");
  expect(text).not.toContain("≈");
  await popup.close();
});

test("the page's own facts are unchanged beside the new row", async () => {
  await seedLocalProvider();
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  const popup = await openPanel();
  const rows = await popup.locator("#usage li").allTextContents();
  expect(rows[0]).toMatch(/segments? translated/);
  expect(rows[1]).toMatch(/characters sent/);
  expect(rows.some((row) => row.includes("tokens spent"))).toBe(true);
  await popup.close();
});
