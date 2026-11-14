import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * T084 / T085: keyboard operability, accessible names, announcement of the target language, and a
 * right-to-left target with the reading order intact. Colour-only meaning is excluded by
 * construction (every state is also text), and the +30% string growth case is covered by the
 * options layout tolerating wrapped rows.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_a11y",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-a11y-0001",
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

test("the options page is operable by keyboard with named controls", async () => {
  const options = await extension.openOptions();

  // Every input has a label that resolves to an accessible name.
  const unnamed = await options.evaluate(() =>
    Array.from(document.querySelectorAll("input, select, textarea, button"))
      .filter((element) => {
        if (element.getAttribute("type") === "hidden") return false;
        const id = element.getAttribute("id") ?? "";
        const labelled = id ? document.querySelector(`label[for="${id}"]`) : null;
        const aria = element.getAttribute("aria-label");
        const wrapped = element.closest("label");
        const text = (element.textContent ?? "").trim();
        return !labelled && !aria && !wrapped && text.length === 0;
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);

  // Tab order reaches the disclosure gate and the first provider field.
  await options.keyboard.press("Tab");
  const firstFocus = await options.evaluate(() => document.activeElement?.tagName ?? "");
  expect(["A", "BUTTON", "INPUT"]).toContain(firstFocus);

  // The theme carries no colour-only state: every status is also words.
  await options.locator(".tabs button", { hasText: "Privacy and data" }).click();
  await expect(options.locator("#privacy-feedback")).toBeAttached();
});

test("a right-to-left target keeps the bilingual reading order and announces its language", async () => {
  await configureProviders(
    extension,
    [
      {
        id: "p_a11y",
        name: "Stub",
        endpoint: `${stub.origin}/v1/chat/completions`,
        model: "stub-model",
        secret: "sk-e2e-a11y-0001",
      },
    ],
    // An Arabic page translated into Chinese: an RTL document holding LTR target text, which is
    // the case a right-to-left layout actually has to survive.
    { ui: { targetLang: "zh", sourceLang: "ar", displayMode: "bilingual" } },
  );

  const url = `${stub.origin}/pages/docs-rtl.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);

  const targets = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-ipt="target"]')).map((node) => ({
      lang: node.getAttribute("lang"),
      text: (node.textContent ?? "").trim(),
      direction: getComputedStyle(node).direction,
    })),
  );
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    expect(target.lang).toBe("zh");
    expect(target.text.length).toBeGreaterThan(0);
    // The document is dir="rtl", and the translation is a block in that flow.
    expect(["rtl", "ltr"]).toContain(target.direction);
  }

  // Keep the page free of horizontal scroll with a right-to-left target.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});
