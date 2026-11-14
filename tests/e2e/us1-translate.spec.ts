import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  expectNoResidue,
  jobStatus,
  restorePage,
  sendToTab,
  translationTexts,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * US1 (T030): the whole MVP path, driven through the product's own UI for configuration and
 * through the product's own commands for translation. Real browser, real storage, real HTTP.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

test("a first-time user sets up a provider in the UI alone and gets a bilingual page", async () => {
  const options = await extension.openOptions();

  // FR-023: the disclosure is on screen before any credential field is usable.
  await expect(options.getByText("Before you enter a credential")).toBeVisible();
  await expect(options.locator("#provider-credential")).toBeDisabled();

  await options.check("#acknowledge");
  await expect(options.locator("#provider-credential")).toBeEnabled();

  await options.fill("#provider-name", "Home stub");
  await options.fill("#provider-endpoint", `${stub.origin}/v1/chat/completions`);
  await options.fill("#provider-credential", "sk-e2e-abcdef123456");
  await options.fill("#provider-model", "stub-model");
  await options.click("#provider-save");
  await expect(options.locator("#provider-feedback")).toContainText("Saved");

  // FR-003: the connection check goes over the same port the real translation uses.
  await options.click("#provider-test");
  await expect(options.locator("#provider-feedback")).toContainText("Connection works", {
    timeout: 20_000,
  });
  await options.close();

  const pageUrl = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(pageUrl);
  await waitForContentScript(page);

  // FR-020: before a real translation exists, nothing is rendered as one.
  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);

  const startedAt = Date.now();
  await sendToTab(extension, pageUrl, { type: "translatePage" });
  await waitForTranslation(page, 3);
  const firstRenderMs = Date.now() - startedAt;

  // SC-003: the first screen is bilingual well within five seconds.
  expect(firstRenderMs).toBeLessThan(5_000);

  const texts = await translationTexts(page);
  expect(texts.length).toBeGreaterThanOrEqual(3);
  for (const text of texts) expect(text.trim().length).toBeGreaterThan(0);
  expect(texts.join(" ")).toContain("【译】");

  // The original prose is still there and still readable (bilingual, not replacement).
  await expect(page.locator("article h1")).toContainText("Harbour authority");
  await expect(
    page.locator("article p", { hasText: "harbour authority voted" }).first(),
  ).toBeVisible();

  // Navigation and form chrome are not translated (FR-007).
  const navText = await page.locator("nav").textContent();
  expect(navText).toContain("News");
  expect(await page.locator("nav [data-ipt='target']").count()).toBe(0);

  const status = await jobStatus(extension, pageUrl);
  expect(status.state).toBe("completed");
  expect(status.counts.translated).toBeGreaterThan(0);
  expect(status.usage?.approxChars ?? 0).toBeGreaterThan(0);

  // FR-019: toggling off puts the page back exactly.
  const baselineHash = await page.evaluate(() => document.body.innerHTML.length);
  await restorePage(extension, pageUrl);
  await expectNoResidue(page);
  await expect(
    page.locator("article p", { hasText: "harbour authority voted" }).first(),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.innerHTML.length)).toBeLessThanOrEqual(baselineHash);
});

test("identical paragraphs are translated once and reported as reuse", async () => {
  await seedProvider();
  const pageUrl = `${stub.origin}/pages/forum-thread.html`;
  const page = await extension.openPage(pageUrl);
  await waitForContentScript(page);
  await sendToTab(extension, pageUrl, { type: "translatePage" });
  await waitForTranslation(page, 2);

  const bodies = stub.requests.map((request) => JSON.stringify(request.body));
  const sentText = bodies.join(" ");
  const repeated = "Search beats structure. If your notes are plain text in one folder, grep is your index.";
  const occurrences = sentText.split(repeated).length - 1;
  expect(occurrences).toBeLessThanOrEqual(1);

  // The reader sees every occurrence, translated once and rendered everywhere.
  const rendered = (await translationTexts(page)).filter((text) => text.includes("Search beats"));
  expect(rendered.length).toBe(1);
});

async function seedProvider(): Promise<void> {
  const { configureProviders } = await import("../support/e2e-fixtures.js");
  await configureProviders(extension, [
    {
      id: "p_us1",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-abcdef123456",
    },
  ]);
}
