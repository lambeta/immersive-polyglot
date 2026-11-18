import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { expectNoResidue, sendToTab, waitForContentScript } from "../support/e2e-fixtures.js";
import {
  bodyText,
  CAPTURED_LABELS,
  seedDiagramProvider,
  shapeBoxes,
  svgTexts,
  translateCaptured,
  waitForTranslated,
} from "../support/diagram-fixtures.js";

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
const URL_PATH = "/pages/article-eval-driven-development.html";

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

test("the captured article translates its six phrases in place and keeps every shape", async () => {
  const url = `${stub.origin}${URL_PATH}`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  const before = await shapeBoxes(page);
  expect(before.length).toBe(42);

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 9);

  const texts = await svgTexts(page);
  const values = texts.map((entry) => entry.text);
  for (const translated of Object.values(CAPTURED_LABELS)) expect(values).toContain(translated);
  for (const source of Object.keys(CAPTURED_LABELS)) expect(values).not.toContain(source);
  for (const name of ["Agent", "Evaluator", "Dataset", "Developer", "loop", "1", "2", "3", "4", "5"]) {
    expect(values).toContain(name);
  }

  const visible = await bodyText(page);
  expect(visible).not.toContain("@keyframes");
  expect(visible).not.toContain("#mermaid-");
  expect(visible).not.toContain("font-family");
  expect(await page.locator("svg [data-ipt]").count()).toBe(0);
  expect(await shapeBoxes(page)).toEqual(before);

  // The drawing stays visible in the two other prose display modes.
  await sendToTab(extension, url, { type: "setDisplayMode", mode: "above" });
  expect(await page.locator("svg").isVisible()).toBe(true);
  await sendToTab(extension, url, { type: "setDisplayMode", mode: "only" });
  expect(await page.locator("svg").isVisible()).toBe(true);
  expect((await svgTexts(page)).map((entry) => entry.text)).toContain(
    CAPTURED_LABELS["Return metric scores"],
  );
  await sendToTab(extension, url, { type: "setDisplayMode", mode: "bilingual" });

  await sendToTab(extension, url, { type: "toggleTranslation" });
  await expectNoResidue(page);
  expect((await svgTexts(page)).map((entry) => entry.text)).toContain("Return metric scores");
  expect(await shapeBoxes(page)).toEqual(before);
});

test("twenty translate/restore cycles leave the captured page byte-identical", async () => {
  const url = `${stub.origin}${URL_PATH}`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const baseline = await page.evaluate(() => document.body.innerHTML);

  for (let cycle = 0; cycle < 20; cycle += 1) {
    await sendToTab(extension, url, { type: "translatePage" });
    await waitForTranslated(extension, url, 9);
    await sendToTab(extension, url, { type: "toggleTranslation" });
    await expectNoResidue(page);
  }

  expect(await page.evaluate(() => document.body.innerHTML)).toBe(baseline);
});
