import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { configureProviders, sendToTab, waitForContentScript } from "../support/e2e-fixtures.js";

/**
 * SC-012 — scrolling stays responsive while translation is running.
 *
 * The budget is measured, not asserted by inspection: the page reports its own long tasks while the
 * reader scrolls a 200-passage article. A product that read the layout of every passage on every
 * frame would show up here as a burst of tasks over 50 ms.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR, latencyMs: 120 });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_stub",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-abcdef123456",
      timeoutMs: 20_000,
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

test("a scripted scroll across a long page stays within the response budget", async () => {
  const page = await extension.openPage(`${stub.origin}/pages/article-endless.html`);
  await waitForContentScript(page);

  await page.evaluate(() => {
    const host = window as unknown as { __iptLong: number[] };
    host.__iptLong = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) host.__iptLong.push(entry.duration);
    });
    observer.observe({ entryTypes: ["longtask"] });
  });

  await sendToTab(extension, page.url(), { type: "translatePage" });
  await page.waitForTimeout(400);

  for (let step = 0; step < 24; step += 1) {
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(400);

  const longTasks = await page.evaluate(
    () => (window as unknown as { __iptLong: number[] }).__iptLong,
  );
  const worst = longTasks.length > 0 ? Math.max(...longTasks) : 0;
  expect(worst).toBeLessThanOrEqual(50);
});
