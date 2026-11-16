import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  expectNoResidue,
  jobStatus,
  pageSnapshot,
  pendingMarks,
  requestedPassages,
  restorePage,
  sendToTab,
  waitForContentScript,
  waitForMarks,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/** US3 — no mark ever dangles, and turning translation off still restores the page exactly. */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
const LONG_PAGE = "/pages/article-endless.html";

let stub: StubProvider;
let extension: LaunchedExtension;

async function configure(overrides: Record<string, unknown> = {}): Promise<void> {
  await configureProviders(
    extension,
    [
      {
        id: "p_stub",
        name: "Stub",
        endpoint: `${stub.origin}/v1/chat/completions`,
        model: "stub-model",
        secret: "sk-e2e-abcdef123456",
        timeoutMs: 20_000,
      },
    ],
    overrides,
  );
}

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR, latencyMs: 350 });
  extension = await launchWithExtension();
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

test("turning translation off with marks on screen restores the page exactly (SC-007)", async () => {
  await configure();
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await waitForContentScript(page);
  const before = await pageSnapshot(page);

  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForMarks(page);
  expect(await pendingMarks(page)).toBeGreaterThan(0);

  await restorePage(extension, page.url());

  await expectNoResidue(page);
  expect(await pendingMarks(page)).toBe(0);
  const after = await pageSnapshot(page);
  expect(after.html).toBe(before.html);
  expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(1);
});

test("cancelling removes every mark at once", async () => {
  await configure();
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await waitForContentScript(page);
  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForMarks(page);

  await sendToTab(extension, page.url(), { type: "cancelJob" });

  await expect.poll(() => pendingMarks(page), { timeout: 10_000 }).toBe(0);
});

test("a volume cap stops dispatch, reports once, and leaves no mark behind (FR-019)", async () => {
  await configure({ limits: { maxConcurrency: 2, sessionCapSegments: 3, sessionCapChars: 0, siteCaps: {} } });
  const page = await extension.openPage(`${stub.origin}${LONG_PAGE}`);
  await waitForContentScript(page);

  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForTranslation(page, 1).catch(() => undefined);
  await page.waitForTimeout(2_000);

  const status = await jobStatus(extension, page.url());
  expect(status.capReached).toBe(true);
  expect(requestedPassages(stub.requestedSegments()).length).toBeLessThanOrEqual(3);
  await expect.poll(() => pendingMarks(page), { timeout: 10_000 }).toBe(0);
});
