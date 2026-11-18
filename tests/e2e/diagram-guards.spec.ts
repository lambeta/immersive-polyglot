import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { jobStatus, sendToTab, waitForContentScript } from "../support/e2e-fixtures.js";
import {
  CAPTURED_LABELS,
  seedDiagramProvider,
  sentBodies,
  svgTexts,
  translateCaptured,
  waitForTranslated,
} from "../support/diagram-fixtures.js";

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR, translate: translateCaptured });
  extension = await launchWithExtension();
  await seedDiagramProvider(extension, stub);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

test("opaque graphics and a typeset equation are preserved and unsent", async () => {
  const url = `${stub.origin}/pages/diagram-opaque.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  const selectors = ["#chart", "#photo", "#plugin", "#frame", "#media", "#equation", "#icon"];
  const before = await page.evaluate(
    (list) => list.map((selector) => document.querySelector(selector)?.outerHTML ?? ""),
    selectors,
  );
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 10);

  const after = await page.evaluate(
    (list) => list.map((selector) => document.querySelector(selector)?.outerHTML ?? ""),
    selectors,
  );
  expect(after).toEqual(before);

  const sent = sentBodies(stub);
  for (const forbidden of [
    "Canvas fallback text",
    "Plugin fallback text",
    "Embedded prose",
    "Media fallback text",
    "Warning",
  ]) {
    expect(sent).not.toContain(forbidden);
  }
  expect((await jobStatus(extension, url)).counts.skipped).toBe(0);
});

test("a page holding only a drawing translates its phrases and leaves the drawing visible", async () => {
  const url = `${stub.origin}/pages/diagram-only.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 2);

  const values = (await svgTexts(page)).map((entry) => entry.text);
  expect(values).toContain(CAPTURED_LABELS["Return metric scores"]);
  expect(values).toContain(CAPTURED_LABELS["Define 3-5 key metrics"]);
  expect(values).toContain("Agent");
  expect(await page.locator("svg [data-ipt]").count()).toBe(0);
  expect((await jobStatus(extension, url)).counts.total).toBe(2);
});

test("a drawing injected after translation starts is discovered and translated", async () => {
  const url = `${stub.origin}/pages/diagram-late.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 2);

  await expect
    .poll(async () => page.locator("#late text").allTextContents(), { timeout: 20_000 })
    .toContain(CAPTURED_LABELS["Generate outputs for test cases"]);
  expect(await page.locator("#late text").allTextContents()).toContain("Agent");

  const sent = sentBodies(stub);
  expect(sent).not.toContain("font-family");
  expect(sent).not.toContain("stroke-dashoffset");
  expect(await page.locator("#late [data-ipt]").count()).toBe(0);
});
