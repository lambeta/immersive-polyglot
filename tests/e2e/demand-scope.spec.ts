import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  pendingMarks,
  requestedPassages,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * US2 — only what the reader is about to read is translated.
 *
 * The evidence is the provider's own record of what it was asked to translate, not the page's
 * appearance: "few requests" can still mean a whole page was sent in one batch. Real Chromium, real
 * HTTP, the 200-passage fixture.
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

/** Passage tokens inside the demand window at the moment it is evaluated. */
async function windowTokens(page: import("@playwright/test").Page): Promise<Set<string>> {
  const tokens = await page.evaluate(() => {
    const height = window.innerHeight;
    return Array.from(document.querySelectorAll("p.passage"))
      .filter((paragraph) => {
        const rect = paragraph.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < height * 2;
      })
      .map((paragraph) => (paragraph.textContent ?? "").slice(0, 4));
  });
  return new Set(tokens);
}

test("the first round sends only the passages in the window and nothing further down (SC-002)", async () => {
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await waitForContentScript(page);
  const window = await windowTokens(page);

  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForTranslation(page, 1);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-ipt="pending"]').length === 0,
    undefined,
    { timeout: 30_000 },
  );

  const requested = requestedPassages(stub.requestedSegments());
  expect(requested.length).toBeGreaterThan(0);

  const outside = requested.filter((token) => !window.has(token));
  expect(outside).toEqual([]);
  // The 200-passage page must not have been sent whole.
  expect(requested.length).toBeLessThan(60);
});

test("scrolling requests the next stretch exactly once and never the text behind (SC-005)", async () => {
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await waitForContentScript(page);
  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForTranslation(page, 1);

  // Each fill makes the page taller, so a screenful may land inside text that is already translated;
  // the reader's equivalent of "read on" is a scroll big enough to leave it behind.
  for (let step = 0; step < 4; step += 1) {
    await page.evaluate(() => window.scrollBy(0, 1600));
    await page.waitForTimeout(450);
  }

  const requested = requestedPassages(stub.requestedSegments());
  const unique = new Set(requested);
  // Each passage is charged at most once, whatever the reader did with the scrollbar.
  expect(unique.size).toBe(requested.length);
  // Reading four screenfuls requested more than the first round did.
  expect(unique.size).toBeGreaterThan(6);
});

test("reading 20 of 200 passages sends at most 30 percent of the page's characters (SC-004)", async () => {
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await waitForContentScript(page);

  const totalChars = await page.evaluate(() =>
    Array.from(document.querySelectorAll("p.passage")).reduce(
      (sum, paragraph) => sum + (paragraph.textContent ?? "").length,
      0,
    ),
  );

  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForTranslation(page, 1);
  for (let step = 0; step < 3; step += 1) {
    await page.evaluate(() => window.scrollBy(0, 700));
    await page.waitForTimeout(350);
  }

  const sentChars = stub.requestedSegments().reduce((sum, segment) => sum + segment.length, 0);
  expect(sentChars).toBeGreaterThan(0);
  expect(sentChars).toBeLessThanOrEqual(Math.round(totalChars * 0.3));
});

test("a resize that reveals more text requests it, exactly like scrolling (FR-011)", async () => {
  await extension.context.pages()[0]?.setViewportSize({ width: 1280, height: 500 });
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await page.setViewportSize({ width: 1280, height: 500 });
  await waitForContentScript(page);

  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForTranslation(page, 1);
  const before = requestedPassages(stub.requestedSegments()).length;

  await page.setViewportSize({ width: 1280, height: 1400 });
  await expect
    .poll(() => requestedPassages(stub.requestedSegments()).length, { timeout: 20_000 })
    .toBeGreaterThan(before);
});

/**
 * FR-016's hidden half — "requests nothing while nobody is looking" — is proved in
 * tests/dom/observer-demand.test.ts, where visibility can be controlled. Playwright's pages in one
 * context are both reported as visible by Chromium, so this end-to-end test proves the observable
 * half instead: leaving and returning loses nothing and duplicates nothing.
 */
test("leaving the page and coming back continues where it left off, each passage once", async () => {
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await waitForContentScript(page);
  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForTranslation(page, 1);
  await page.waitForTimeout(400);
  const before = requestedPassages(stub.requestedSegments());

  const other = await extension.context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await page.bringToFront();
  // Focus comes back before the tab's rendering does; a reader carries on scrolling until something
  // new is in front of them, so this test does the same instead of betting on one event.
  await page.waitForTimeout(600);
  let grown = false;
  for (let step = 0; step < 6 && !grown; step += 1) {
    await page.evaluate(() => window.scrollBy(0, 1800));
    await page.waitForTimeout(900);
    grown = requestedPassages(stub.requestedSegments()).length > before.length;
  }
  expect(grown).toBe(true);

  const after = requestedPassages(stub.requestedSegments());
  expect(new Set(after).size).toBe(after.length);
  await other.close();
});

test("a passage outside the window never wears a mark", async () => {
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await waitForContentScript(page);
  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForTranslation(page, 1);

  const window = await windowTokens(page);
  const marked = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-ipt="pending"]')).map((mark) =>
      (mark.previousElementSibling?.textContent ?? "").slice(0, 4),
    ),
  );
  for (const token of marked) expect(window.has(token)).toBe(true);
  expect(await pendingMarks(page)).toBe(0);
});
