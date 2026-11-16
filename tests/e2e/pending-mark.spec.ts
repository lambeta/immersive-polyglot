import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  pendingMarks,
  selectPassage,
  sendToTab,
  translationTexts,
  waitForContentScript,
  waitForMarks,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * US1 — the passage being translated says so, in the place its translation will appear.
 * Real Chromium, the unpacked extension, real HTTP. The provider is slowed down so the mark's
 * lifetime is observable; nothing else is a stand-in.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR, latencyMs: 400 });
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

test("each visible passage shows a mark and then its translation, never both", async () => {
  const page = await extension.openPage(`${stub.origin}/pages/blog-post.html`);
  await waitForContentScript(page);
  const url = page.url();

  // Sample while the page fills: a mark beside a translation for the same passage, or two marks on
  // one passage, is the defect this test exists to catch (FR-003, FR-004).
  await page.evaluate(() => {
    const host = window as unknown as { __iptViolations: string[]; __iptTimer: number };
    host.__iptViolations = [];
    host.__iptTimer = window.setInterval(() => {
      for (const source of Array.from(document.querySelectorAll('[data-ipt="source"]'))) {
        const first = source.nextElementSibling;
        const second = first?.nextElementSibling;
        if (first?.getAttribute("data-ipt") === "pending" && second?.getAttribute("data-ipt") === "target") {
          host.__iptViolations.push("mark and translation together");
        }
        if (first?.getAttribute("data-ipt") === "pending" && !second?.hasAttribute("data-ipt")) return;
        if (
          first?.getAttribute("data-ipt") === "pending" &&
          second?.getAttribute("data-ipt") === "pending"
        ) {
          host.__iptViolations.push("two marks");
        }
      }
    }, 20);
  });

  await sendToTab(extension, url, { type: "translatePage" });

  await expect
    .poll(async () => (await pendingMarks(page)) + (await page.locator('[data-ipt="target"]').count()), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  await waitForTranslation(page, 1);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-ipt="pending"]').length === 0,
    undefined,
    { timeout: 30_000 },
  );

  const violations = await page.evaluate(() => {
    const host = window as unknown as { __iptViolations: string[]; __iptTimer: number };
    window.clearInterval(host.__iptTimer);
    return host.__iptViolations;
  });

  expect(violations).toEqual([]);
  const texts = await translationTexts(page);
  expect(texts.length).toBeGreaterThan(0);
  expect(texts.every((text) => text.startsWith("【译】"))).toBe(true);
});

test("a page of one screenful is translated in full, with a mark for every passage first", async () => {
  const page = await extension.openPage(`${stub.origin}/pages/blog-short.html`);
  await waitForContentScript(page);
  const url = page.url();

  const started = Date.now();
  await sendToTab(extension, url, { type: "translatePage" });

  // SC-001: something happens for the visible passages within a second of the press.
  await page.waitForFunction(
    () => document.querySelectorAll('[data-ipt="pending"], [data-ipt="target"]').length > 0,
    undefined,
    { timeout: 1_500 },
  );
  expect(Date.now() - started).toBeLessThan(1_500);

  // FR-017: a page that fits on one screen is translated in full, with no extra step.
  await waitForTranslation(page);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-ipt="pending"]').length === 0,
    undefined,
    { timeout: 30_000 },
  );
  const sources = await page.locator('[data-ipt="source"]').count();
  const targets = await page.locator('[data-ipt="target"]').count();
  expect(sources).toBeGreaterThan(0);
  expect(targets).toBe(sources);
});

test("a selection translation shows a mark that becomes its translation", async () => {
  const page = await extension.openPage(`${stub.origin}/pages/blog-post.html`);
  await waitForContentScript(page);
  const url = page.url();

  await selectPassage(page, "p");
  await sendToTab(extension, url, { type: "translateSelection" });
  await waitForMarks(page).catch(() => undefined);

  await waitForTranslation(page, 1);
  const targets = await page.locator('[data-ipt="target"]').count();
  expect(targets).toBeGreaterThan(0);
});
