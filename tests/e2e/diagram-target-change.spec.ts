import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { expectNoResidue, sendToTab, waitForContentScript } from "../support/e2e-fixtures.js";
import { configureProviders } from "../support/e2e-fixtures.js";
import { seedDiagramProvider, svgTexts, waitForTranslated } from "../support/diagram-fixtures.js";

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let zhStub: StubProvider;
let deStub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  zhStub = await startStubProvider({
    staticDir: PAGES_DIR,
    translate: (text) => `中:${text}`,
  });
  deStub = await startStubProvider({
    staticDir: PAGES_DIR,
    translate: (text) => `德:${text}`,
  });
  extension = await launchWithExtension();
});

test.afterEach(async () => {
  await extension.close();
  await zhStub.close();
  await deStub.close();
});

test("a target-language change re-collects the phrases in the new language", async () => {
  const url = `${zhStub.origin}/pages/article-eval-driven-development.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await seedDiagramProvider(extension, zhStub);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 9);
  expect((await svgTexts(page)).map((entry) => entry.text)).toContain("中:Return metric scores");

  await sendToTab(extension, url, { type: "toggleTranslation" });
  await expectNoResidue(page);

  // A different provider and target language: the next run must re-collect the drawing's labels.
  await configureProviders(
    extension,
    [
      {
        id: "p_de",
        name: "German stub",
        endpoint: `${deStub.origin}/v1/chat/completions`,
        model: "stub-model",
        secret: "sk-e2e-diagram-de-123456",
      },
    ],
    { ui: { targetLang: "de", sourceLang: "en", displayMode: "bilingual" } },
  );
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 9);

  const values = (await svgTexts(page)).map((entry) => entry.text);
  expect(values).toContain("德:Return metric scores");
  expect(values).not.toContain("中:Return metric scores");
  expect(values.filter((value) => value === "德:Return metric scores")).toHaveLength(1);
});
