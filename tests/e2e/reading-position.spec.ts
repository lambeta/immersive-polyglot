import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForMarks,
} from "../support/e2e-fixtures.js";

/**
 * US4 — filling in above does not move what the reader is reading (SC-008).
 *
 * The case that matters is in-flight work *above* the reader: they pressed translate, the top
 * screenful was already requested, and they scrolled on before it arrived. Every arriving translation
 * pushes the parked passage down, so the guard is what keeps the page still. Measured, not eyeballed,
 * on both fixtures — including the one that disables the browser's own scroll anchoring.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR, latencyMs: 700 });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_stub",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-abcdef123456",
      timeoutMs: 25_000,
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

for (const fixture of ["article-endless.html", "article-endless-noanchor.html"]) {
  test(`the parked passage keeps its place while translations land above it (${fixture})`, async () => {
    const page = await extension.openPage(`${stub.origin}/pages/${fixture}`);
    await waitForContentScript(page);

    await sendToTab(extension, page.url(), { type: "translatePage" });
    await waitForMarks(page);

    // The reader scrolls on before the first screenful has arrived: the work now lands above them.
    await page.evaluate(() => window.scrollTo(0, 1900));
    await page.waitForTimeout(250);

    // The passage the reader's eye is on: the topmost one that begins on screen. Content that lands
    // above it must not push it; content that lands below it is expected reading flow.
    const parked = await page.evaluate(() => {
      const height = window.innerHeight;
      const target = Array.from(document.querySelectorAll("p.passage")).find((paragraph) => {
        const rect = paragraph.getBoundingClientRect();
        return rect.top >= 0 && rect.top < height;
      });
      if (!target) throw new Error("no passage beginning on screen after scrolling");
      const host = window as unknown as { __iptParked?: Element; __iptTargets: number };
      host.__iptParked = target;
      host.__iptTargets = document.querySelectorAll('[data-ipt="target"]').length;
      return { top: target.getBoundingClientRect().top, token: (target.textContent ?? "").slice(0, 4) };
    });

    // Wait until several more translations have landed, wherever the page ended up putting them.
    const alreadyTranslated = await page.locator('[data-ipt="target"]').count();
    await page.waitForFunction(
      (minimum) => document.querySelectorAll('[data-ipt="target"]').length >= minimum,
      alreadyTranslated + 5,
      { timeout: 45_000 },
    );
    await page.waitForTimeout(400);

    const moved = await page.evaluate(() => {
      const host = window as unknown as { __iptParked?: Element };
      return host.__iptParked?.getBoundingClientRect().top ?? Number.NaN;
    });

    expect(Math.abs(moved - parked.top)).toBeLessThanOrEqual(4);
  });
}
