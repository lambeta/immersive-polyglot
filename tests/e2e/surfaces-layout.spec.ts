import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { configureProviders, waitForContentScript } from "../support/e2e-fixtures.js";
import { overflowOf } from "../support/surface-metrics.js";

/**
 * Feature 006 US4 (T030): the surfaces fit the window at every width the product claims, and the
 * 30% longer / 200% zoom cases clip nothing.
 *
 * Overflow is measured on the live document, because the two ways a layout breaks here — a grid
 * track wider than its column and a label that refuses to wrap — only exist once it is laid out.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
const SECTIONS = [
  "panel-providers",
  "panel-routing",
  "panel-sites",
  "panel-glossary",
  "panel-display",
  "panel-style",
  "panel-privacy",
  "panel-diagnostics",
];

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_layout",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-layout-1234",
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

test("no section scrolls sideways from 320 px to 1440 px (T030)", async () => {
  const options = await extension.openOptions();
  await options.waitForSelector("#provider-name");

  for (const width of [320, 390, 768, 1024, 1440]) {
    await options.setViewportSize({ width, height: 900 });
    for (const section of SECTIONS) {
      await options.click(`button[aria-controls="${section}"]`);
      const overflow = await overflowOf(options);
      expect(overflow, `${section} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }

  // FR-024: below 1024 px the rail stops being a column and the content is one column.
  await options.setViewportSize({ width: 900, height: 900 });
  const columns = await options.evaluate(() => {
    const shell = document.querySelector(".shell");
    if (!shell) return 0;
    return getComputedStyle(shell).gridTemplateColumns.split(" ").filter(Boolean).length;
  });
  expect(columns).toBe(1);
});

test("the panel fits its own column at every state (T030)", async () => {
  const fixture = await extension.openPage(`${stub.origin}/pages/news-article-a.html`);
  await waitForContentScript(fixture);
  await fixture.bringToFront();

  const popup = await extension.context.newPage();
  await popup.setViewportSize({ width: 384, height: 720 });
  await popup.goto(extension.popupUrl);
  await popup.waitForSelector("#translate");

  expect(await overflowOf(popup)).toBeLessThanOrEqual(1);
  // A 384 px surface cannot carry a wider grid: the five tile columns and the three-way switch
  // are the parts that would push it out.
  expect(await overflowOf(popup, ".style-picker__grid")).toBeLessThanOrEqual(1);
  expect(await overflowOf(popup, ".segmented__track")).toBeLessThanOrEqual(1);
});

test("200% zoom clips no label and adds no sideways scroll (T030)", async () => {
  const options = await extension.openOptions();
  await options.waitForSelector("#provider-name");
  await options.click('button[aria-controls="panel-display"]');

  await options.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await options.waitForTimeout(150);

  expect(await overflowOf(options, "#panel-display")).toBeLessThanOrEqual(1);
  const clipped = await options.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".style-picker-name"))
      .filter((name) => name.scrollWidth > name.clientWidth + 1)
      .map((name) => name.textContent ?? ""),
  );
  expect(clipped).toEqual([]);
});
