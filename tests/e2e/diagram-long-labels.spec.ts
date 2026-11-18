import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { sendToTab, waitForContentScript } from "../support/e2e-fixtures.js";
import {
  seedDiagramProvider,
  sentBodies,
  shapeBoxes,
  svgTexts,
  waitForTranslated,
} from "../support/diagram-fixtures.js";

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
const TRANSLATIONS: Record<string, string> = {
  "Short label": "这是一个非常非常长的译文标签用来测试回退行为",
  "Tiny text": "短标签文本",
};

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({
    staticDir: PAGES_DIR,
    translate: (text) => TRANSLATIONS[text] ?? `【译】${text}`,
  });
  extension = await launchWithExtension();
  await seedDiagramProvider(extension, stub);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

test("a long translation shrinks only its own label, or keeps the source at the floor", async () => {
  const url = `${stub.origin}/pages/diagram-long-labels.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const before = await shapeBoxes(page);

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 4);

  const labels = await svgTexts(page);
  const short = labels.find((entry) => entry.text === "Short label");
  const tiny = labels.find((entry) => entry.text === TRANSLATIONS["Tiny text"]);
  expect(short, "the long label falls back to its source text").toBeDefined();
  expect(short?.size).toBe("16px");
  expect(tiny, "the shorter label shows its translation").toBeDefined();
  const tinySize = Number.parseFloat(tiny?.size ?? "16");
  expect(tinySize).toBeLessThan(16);
  expect(tinySize).toBeGreaterThanOrEqual(12);

  expect(await shapeBoxes(page)).toEqual(before);
  expect(await page.locator("svg [data-ipt]").count()).toBe(0);
  const sent = sentBodies(stub);
  expect(sent).not.toContain("font-family");
});
