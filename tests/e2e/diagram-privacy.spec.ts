import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { jobStatus, sendToTab, waitForContentScript } from "../support/e2e-fixtures.js";
import {
  CAPTURED_LABELS,
  seedDiagramProvider,
  sentBodies,
  translateCaptured,
  waitForTranslated,
} from "../support/diagram-fixtures.js";

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

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

test("only the six phrases reach the provider, and the counts are exact", async () => {
  const url = `${stub.origin}/pages/article-eval-driven-development.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslated(extension, url, 9);

  const sent = sentBodies(stub);
  for (const phrase of Object.keys(CAPTURED_LABELS)) expect(sent).toContain(phrase);
  for (const forbidden of ["@keyframes", "#mermaid-", "font-family", "stroke-dashoffset"]) {
    expect(sent).not.toContain(forbidden);
  }

  const status = await jobStatus(extension, url);
  expect(status.counts.total).toBe(9);
  expect(status.counts.translated).toBe(9);
  expect(status.counts.skipped).toBe(0);
  expect(status.usage?.approxChars).toBe(
    stub.requestedSegments().reduce((total, segment) => total + segment.length, 0),
  );
  expect(await page.locator("svg [data-ipt]").count()).toBe(0);
});
