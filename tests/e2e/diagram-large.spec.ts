import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { sendToTab, waitForContentScript } from "../support/e2e-fixtures.js";
import { seedDiagramProvider, sentBodies, waitForTranslated } from "../support/diagram-fixtures.js";

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await seedDiagramProvider(extension, stub);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

test("a five-thousand-element drawing starts translating within two seconds", async () => {
  const url = `${stub.origin}/pages/diagram-large.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await page.waitForFunction(() => document.documentElement.getAttribute("data-large-ready") === "1");

  const counts = await page.evaluate(() => ({
    elements: document.querySelectorAll("#large *").length,
    labels: document.querySelectorAll("#large text").length,
  }));
  expect(counts.elements).toBeGreaterThanOrEqual(5_000);
  expect(counts.labels).toBe(200);

  const startedAt = Date.now();
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 2);
  const firstLabelMs = Date.now() - startedAt;
  expect(firstLabelMs).toBeLessThan(2_000);

  const sent = sentBodies(stub);
  expect(sent).not.toContain("font-family");
  expect(sent).not.toContain("stroke-dashoffset");
  expect(await page.locator("#large [data-ipt]").count()).toBe(0);
});
