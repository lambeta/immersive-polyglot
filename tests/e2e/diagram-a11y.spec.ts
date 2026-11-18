import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { sendToTab, waitForContentScript } from "../support/e2e-fixtures.js";
import {
  CAPTURED_LABELS,
  seedDiagramProvider,
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

test("the drawing keeps its role and its translated phrases are the only text", async () => {
  const url = `${stub.origin}/pages/article-eval-driven-development.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  const svg = page.locator("svg").first();
  const roleBefore = await svg.getAttribute("role");
  const descriptionBefore = await svg.getAttribute("aria-roledescription");

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 9);

  expect(await svg.getAttribute("role")).toBe(roleBefore);
  expect(await svg.getAttribute("aria-roledescription")).toBe(descriptionBefore);
  expect(await page.locator("svg [data-ipt]").count()).toBe(0);
  expect(await page.locator("svg [aria-hidden='true']").count()).toBe(0);

  const values = (await svgTexts(page)).map((entry) => entry.text);
  expect(values).toContain(CAPTURED_LABELS["Return metric scores"]);
  expect(values.filter((value) => value === CAPTURED_LABELS["Return metric scores"])).toHaveLength(1);
  expect(values).toContain("Agent");
  expect(values).not.toContain("Return metric scores");
});
