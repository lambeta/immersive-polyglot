import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  translationTexts,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/** FR-036 — two pages translate independently; nothing crosses between them. */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

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

test("two tabs keep their own translations and their own requests", async () => {
  const first = await extension.openPage(`${stub.origin}/pages/news-article-a.html`);
  const second = await extension.openPage(`${stub.origin}/pages/wiki-entry.html`);
  await waitForContentScript(first);
  await waitForContentScript(second);

  await sendToTab(extension, first.url(), { type: "translatePage" });
  await sendToTab(extension, second.url(), { type: "translatePage" });

  await waitForTranslation(first);
  await waitForTranslation(second);

  const firstTexts = await translationTexts(first);
  const secondTexts = await translationTexts(second);
  expect(firstTexts.length).toBeGreaterThan(0);
  expect(secondTexts.length).toBeGreaterThan(0);

  // The same passage must never appear in both tabs' translations: each run translated its own page.
  const overlap = firstTexts.filter((text) => secondTexts.includes(text));
  expect(overlap).toEqual([]);
});
