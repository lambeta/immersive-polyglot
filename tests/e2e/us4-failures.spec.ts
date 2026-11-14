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

/**
 * US4 (T063): each failure mode produces a distinct, actionable class and leaves the page clean.
 * Also covers cancellation timing, an oversized page rendering incrementally, and a page type the
 * product must not touch.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_us4",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-fail-9999",
      timeoutMs: 3_000,
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

async function openFixture(name: string) {
  const url = `${stub.origin}/pages/${name}`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  return { url, page };
}

test("a rejected credential is reported and nothing is rendered", async () => {
  stub.setMode("authRejected");
  const { url, page } = await openFixture("news-article-a.html");

  await sendToTab(extension, url, { type: "translatePage" });
  await expect
    .poll(async () => (await jobStatus(extension, url)).failure?.errorClass, { timeout: 20_000 })
    .toBe("authRejected");

  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);
  expect(stub.requests).toHaveLength(1);
});

test("a rate limit is retried with backoff and then succeeds", async () => {
  stub.setMode("rateLimited", { failFirst: 1 });
  const { url, page } = await openFixture("news-article-a.html");

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);

  expect(stub.requests.length).toBeGreaterThanOrEqual(2);
  const status = await jobStatus(extension, url);
  expect(status.state).toBe("completed");
});

test("a malformed response is retried once and then reported", async () => {
  stub.setMode("malformed");
  const { url, page } = await openFixture("news-article-a.html");

  await sendToTab(extension, url, { type: "translatePage" });
  await expect
    .poll(async () => (await jobStatus(extension, url)).failure?.errorClass, { timeout: 20_000 })
    .toBe("malformedResponse");

  expect(stub.requests.length).toBe(2);
  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);
});

test("empty translations are never rendered as content", async () => {
  stub.setMode("emptyStrings");
  const { url, page } = await openFixture("blog-short.html");

  await sendToTab(extension, url, { type: "translatePage" });
  await expect
    .poll(async () => (await jobStatus(extension, url)).failure?.errorClass, { timeout: 20_000 })
    .toBe("emptyTranslation");

  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);
  // The page is untouched, so it is still readable.
  await expect(page.locator("article p").first()).toContainText("folding bicycle");
});

test("markup in a translation is reduced to text before rendering", async () => {
  stub.setMode("markup");
  const { url, page } = await openFixture("blog-short.html");

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);

  const injected = await page.evaluate(() => {
    const targets = Array.from(document.querySelectorAll('[data-ipt="target"]'));
    return {
      scripts: targets.reduce((total, node) => total + node.querySelectorAll("script").length, 0),
      bold: targets.reduce((total, node) => total + node.querySelectorAll("b").length, 0),
      text: targets.map((node) => node.textContent ?? "").join(" "),
    };
  });
  expect(injected.scripts).toBe(0);
  expect(injected.bold).toBe(0);
  expect(injected.text).toContain("【译】");
});

test("a slow provider times out with a timeout failure, not a hang", async () => {
  test.setTimeout(60_000);
  stub.setMode("slow");
  const { url, page } = await openFixture("blog-short.html");

  await sendToTab(extension, url, { type: "translatePage" });
  await expect
    .poll(async () => (await jobStatus(extension, url)).failure?.errorClass, { timeout: 40_000 })
    .toBe("timeout");
  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);
});

test("cancellation stops the job within two seconds and renders nothing late", async () => {
  test.setTimeout(60_000);
  stub.setMode("slow");
  const { url, page } = await openFixture("article-long.html");

  await sendToTab(extension, url, { type: "translatePage" });
  await expect
    .poll(async () => (await jobStatus(extension, url)).state, { timeout: 10_000 })
    .toBe("translating");

  const startedAt = Date.now();
  await sendToTab(extension, url, { type: "cancelJob" });
  await expect
    .poll(async () => (await jobStatus(extension, url)).state, { timeout: 3_000 })
    .toBe("cancelled");
  expect(Date.now() - startedAt).toBeLessThan(2_000);

  await page.waitForTimeout(1_500);
  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);
});

test("an oversized page renders its first passages before the last batch is dispatched", async () => {
  test.setTimeout(150_000);
  stub.setMode("success", { latencyMs: 700 });
  const { url, page } = await openFixture("article-long.html");

  // Timestamps taken in the page and in the server, so "progressive" is measured, not inferred.
  await page.evaluate(() => {
    (window as unknown as { __firstTargetAt: number }).__firstTargetAt = 0;
    const observer = new MutationObserver(() => {
      const state = window as unknown as { __firstTargetAt: number };
      if (state.__firstTargetAt === 0 && document.querySelector('[data-ipt="target"]')) {
        state.__firstTargetAt = Date.now();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  await sendToTab(extension, url, { type: "translatePage" });

  await expect
    .poll(async () => (await jobStatus(extension, url)).state, { timeout: 120_000 })
    .toBe("completed");

  const firstTargetAt = await page.evaluate(
    () => (window as unknown as { __firstTargetAt: number }).__firstTargetAt,
  );
  const lastRequestAt = Math.max(...stub.requests.map((request) => request.at));
  const final = await page.locator('[data-ipt="target"]').count();

  expect(final).toBeGreaterThan(50);
  expect(firstTargetAt).toBeGreaterThan(0);
  // The reader saw translated passages before the final request had even arrived.
  expect(firstTargetAt).toBeLessThan(lastRequestAt);
  expect(stub.requests.length).toBeGreaterThan(1);
});

test("a page that is not an article is refused rather than half-modified", async () => {
  const url = `${stub.origin}/pages/data.json`;
  const page = await extension.openPage(url);

  const before = await page.evaluate(() => document.body.innerHTML.length);
  await sendToTab(extension, url, { type: "translatePage" }).catch(() => undefined);

  // On a JSON document the content script may not be injected at all; either way nothing changes.
  expect(await page.evaluate(() => document.body.innerHTML.length)).toBe(before);
  expect(await page.locator("[data-ipt]").count()).toBe(0);
});
