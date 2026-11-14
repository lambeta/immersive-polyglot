import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import {
  launchWithExtension,
  readExtensionStorage,
  type LaunchedExtension,
} from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * Feature 004 US2/US3: the reader's translation typography against the real extension, real
 * chrome.storage.local and real HTTP. No test-only code path is used.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
const FONT_STACK = '"Source Han Serif SC", serif';

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

async function seedProvider(): Promise<void> {
  await configureProviders(extension, [
    {
      id: "p_type",
      name: "Stub",
      endpoint: stub.origin + "/v1/chat/completions",
      model: "stub-model",
      secret: "sk-e2e-type-123456",
    },
  ]);
}

function pageUrlFor(name: string): string {
  return stub.origin + "/pages/" + name;
}

async function translate(pageUrl: string) {
  const page = await extension.openPage(pageUrl);
  await waitForContentScript(page);
  await sendToTab(extension, pageUrl, { type: "translatePage" });
  await waitForTranslation(page, 3);
  return page;
}

/** Reads every translated block's inline typography and the size ratio against its own source. */
async function typographyOf(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const sources = Array.from(document.querySelectorAll('[data-ipt="source"]'));
    return sources.map((source) => {
      const unit = source.getAttribute("data-ipt-unit");
      const target = document.querySelector<HTMLElement>(
        `[data-ipt="target"][data-ipt-unit="${unit}"]`,
      );
      const sourceStyle = getComputedStyle(source);
      const targetStyle = target ? getComputedStyle(target) : null;
      const sourceSize = Number.parseFloat(sourceStyle.fontSize);
      const targetSize = targetStyle ? Number.parseFloat(targetStyle.fontSize) : Number.NaN;
      return {
        family: targetStyle?.fontFamily ?? "",
        sourceFamily: sourceStyle.fontFamily,
        inlineSize: target?.style.fontSize ?? "",
        ratio: sourceSize > 0 ? targetSize / sourceSize : Number.NaN,
      };
    });
  });
}

async function openDisplayPanel() {
  const options = await extension.openOptions();
  await options.click('button[aria-controls="panel-display"]');
  return options;
}

test("saving a family and size restyles every block in place with no provider request (FR-019)", async () => {
  await seedProvider();
  const pageUrl = pageUrlFor("news-article-a.html");
  const page = await translate(pageUrl);
  const requestsBefore = stub.requests.length;

  const options = await openDisplayPanel();
  await options.fill("#translation-font-family", FONT_STACK);
  await options.fill("#translation-font-scale", "125");
  await options.click("#display-style-save");
  await expect(options.locator("#display-style-feedback")).toContainText("saved", {
    ignoreCase: true,
  });

  await expect
    .poll(async () => {
      const blocks = await typographyOf(page);
      return blocks.length > 0 && blocks.every((block) => block.inlineSize.length > 0);
    })
    .toBe(true);

  const blocks = await typographyOf(page);
  expect(blocks.length).toBeGreaterThanOrEqual(3);
  for (const block of blocks) {
    expect(block.family).toContain("Source Han Serif SC");
    expect(block.family.toLowerCase()).toContain(block.sourceFamily.split(",")[0]?.trim().toLowerCase() ?? "");
    expect(block.ratio).toBeGreaterThan(1.2);
    expect(block.ratio).toBeLessThan(1.3);
  }
  expect(stub.requests.length).toBe(requestsBefore);

  const stored = await readExtensionStorage(options);
  expect((stored["ui"] as Record<string, unknown>)["translationFontFamily"]).toBe(FONT_STACK);
  expect((stored["ui"] as Record<string, unknown>)["translationFontScale"]).toBe(125);
});

test("typography persists across a reload and a fresh translation (SC-008)", async () => {
  await seedProvider();
  const pageUrl = pageUrlFor("news-article-a.html");
  const page = await translate(pageUrl);

  const options = await openDisplayPanel();
  await options.fill("#translation-font-family", FONT_STACK);
  await options.fill("#translation-font-scale", "150");
  await options.click("#display-style-save");
  await expect(options.locator("#display-style-feedback")).toContainText("saved", { ignoreCase: true });

  await page.reload();
  await waitForContentScript(page);
  await sendToTab(extension, pageUrl, { type: "translatePage" });
  await waitForTranslation(page, 3);

  const blocks = await typographyOf(page);
  expect(blocks.length).toBeGreaterThanOrEqual(3);
  for (const block of blocks) {
    expect(block.family).toContain("Source Han Serif SC");
    expect(block.ratio).toBeGreaterThan(1.45);
    expect(block.ratio).toBeLessThan(1.55);
  }
});

test("a refused family or size saves nothing and leaves open pages unchanged (SC-007)", async () => {
  await seedProvider();
  const pageUrl = pageUrlFor("news-article-a.html");
  const page = await translate(pageUrl);
  const before = await typographyOf(page);

  const options = await openDisplayPanel();
  await options.fill("#translation-font-family", "Arial; color: red");
  await options.click("#display-style-save");
  await expect(options.locator("#display-style-feedback")).not.toBeEmpty();
  await expect(options.locator("#error-fontFamily")).toContainText("font-family");
  await expect(options.locator("#translation-font-family")).toHaveAttribute("aria-invalid", "true");

  await options.fill("#translation-font-family", "");
  await options.fill("#translation-font-scale", "999");
  await options.click("#display-style-save");
  await expect(options.locator("#error-fontScale")).toContainText("percentage");

  const after = await typographyOf(page);
  expect(after.map((block) => block.inlineSize)).toEqual(before.map((block) => block.inlineSize));
  const stored = await readExtensionStorage(options);
  expect((stored["ui"] as Record<string, unknown>)["translationFontFamily"] ?? "").toBe("");
  expect((stored["ui"] as Record<string, unknown>)["translationFontScale"] ?? 100).toBe(100);
});

test("reset returns every translation to the page's typography at 100% (FR-021)", async () => {
  await seedProvider();
  const pageUrl = pageUrlFor("news-article-a.html");
  const page = await translate(pageUrl);

  const options = await openDisplayPanel();
  await options.fill("#translation-font-family", FONT_STACK);
  await options.fill("#translation-font-scale", "150");
  await options.click("#display-style-save");
  await expect(options.locator("#display-style-feedback")).toContainText("saved", { ignoreCase: true });

  await options.click("#display-typography-reset");
  await expect(options.locator("#display-style-feedback")).toContainText("saved", { ignoreCase: true });

  // The overrides are gone: no inline size, and the computed family is the page's again.
  await expect
    .poll(async () => {
      const blocks = await typographyOf(page);
      return (
        blocks.length > 0 &&
        blocks.every(
          (block) => block.inlineSize === "" && block.family === block.sourceFamily,
        )
      );
    })
    .toBe(true);

  const stored = await readExtensionStorage(options);
  expect((stored["ui"] as Record<string, unknown>)["translationFontFamily"] ?? "").toBe("");
  expect((stored["ui"] as Record<string, unknown>)["translationFontScale"] ?? 100).toBe(100);
});

test("the live sample shows the entered family and size before saving (FR-022)", async () => {
  await seedProvider();
  const options = await openDisplayPanel();
  const sample = options.locator(".ipt-style-sample");

  await options.fill("#translation-font-family", FONT_STACK);
  await options.fill("#translation-font-scale", "125");
  await expect
    .poll(() =>
      sample.evaluate((element) => ({
        family: (element as HTMLElement).style.fontFamily,
        size: (element as HTMLElement).style.fontSize,
      })),
    )
    .toEqual({ family: FONT_STACK, size: "125%" });

  const stored = await readExtensionStorage(options);
  expect((stored["ui"] as Record<string, unknown>)["translationFontScale"] ?? 100).toBe(100);
  expect((stored["ui"] as Record<string, unknown>)["translationFontFamily"] ?? "").toBe("");
});
test("a 200% size keeps every block inside its container with no overlap (FR-016, SC-006)", async () => {
  await seedProvider();
  const pageUrl = pageUrlFor("news-article-a.html");
  const page = await translate(pageUrl);

  const options = await openDisplayPanel();
  await options.fill("#translation-font-scale", "200");
  await options.click("#display-style-save");
  await expect(options.locator("#display-style-feedback")).toContainText("saved", { ignoreCase: true });

  for (const width of [1280, 400]) {
    await page.setViewportSize({ width, height: 800 });
    const metrics = await page.evaluate(() => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-ipt="target"]'));
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      let outside = 0;
      let overlapping = 0;
      for (const target of targets) {
        const rect = target.getBoundingClientRect();
        const parent = target.parentElement?.getBoundingClientRect();
        if (parent && rect.right > parent.right + 1) outside += 1;
        const range = document.createRange();
        range.selectNodeContents(target);
        const lines = Array.from(range.getClientRects()).filter((line) => line.height > 0);
        for (let index = 1; index < lines.length; index += 1) {
          const previous = lines[index - 1];
          const current = lines[index];
          if (!previous || !current) continue;
          // Rectangles on one line sit side by side; only a vertical overlap that also
          // intersects horizontally means the text really collided.
          const horizontal = current.left < previous.right - 1 && current.right > previous.left + 1;
          if (current.top < previous.bottom - 1 && horizontal) overlapping += 1;
        }
      }
      return { overflow, outside, overlapping, count: targets.length };
    });
    expect(metrics.count).toBeGreaterThan(0);
    expect(metrics.overflow, "width " + width).toBeLessThanOrEqual(1);
    expect(metrics.outside, "width " + width).toBe(0);
    expect(metrics.overlapping, "width " + width).toBe(0);
  }
});