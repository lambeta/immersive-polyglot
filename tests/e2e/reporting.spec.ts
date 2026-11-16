import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  jobStatus,
  sendToTab,
  waitForContentScript,
} from "../support/e2e-fixtures.js";

/**
 * FR-031 and the 2026-11-15 clarification: the panel reports the page as translated once the
 * reader's own screen is done, and shows progress again only while a round is really in flight.
 * Figures count what was translated; no new status label exists for a partly translated page.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
const LONG_PAGE = "/pages/article-endless.html";

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
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

test("the page is reported translated for what the reader reached, and counts grow on scrolling", async () => {
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await waitForContentScript(page);
  await sendToTab(extension, page.url(), { type: "translatePage" });

  await expect
    .poll(async () => (await jobStatus(extension, page.url())).state, { timeout: 40_000 })
    .toBe("completed");

  const first = await jobStatus(extension, page.url());
  expect(first.counts.translated).toBeGreaterThan(0);
  expect(first.counts.translated).toBeLessThan(200);

  // Reading on means leaving the translated region behind; each new translation also makes the page
  // taller, so the reader keeps scrolling until something new is asked for.
  let grown = false;
  for (let step = 0; step < 6 && !grown; step += 1) {
    await page.evaluate(() => window.scrollBy(0, 1400));
    await page.waitForTimeout(900);
    const counts = (await jobStatus(extension, page.url())).counts;
    grown = counts.translated > first.counts.translated;
  }
  expect(grown).toBe(true);

  await expect
    .poll(async () => (await jobStatus(extension, page.url())).state, { timeout: 30_000 })
    .toBe("completed");
});
