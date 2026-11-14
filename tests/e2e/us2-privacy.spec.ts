import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, readExtensionStorage, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * US2 (T045): a marker string is followed through the network and the storage layer, so the
 * privacy claims are asserted rather than asserted-about (SC-005, SC-006, FR-022, FR-024).
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

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

test("page text reaches only the configured endpoint and is never stored", async () => {
  await configureProviders(extension, [
    {
      id: "p_us2",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-uvwxyz987654",
    },
  ]);

  const pageUrl = `${stub.origin}/pages/article-privacy.html`;
  const page = await extension.openPage(pageUrl);
  await waitForContentScript(page);

  const outbound: string[] = [];
  page.on("request", (request) => outbound.push(request.url()));

  await sendToTab(extension, pageUrl, { type: "translatePage" });
  await waitForTranslation(page, 1);

  // The marker travelled to the provider the user configured...
  const bodies = stub.requests.map((request) => JSON.stringify(request.body)).join(" ");
  expect(bodies).toContain("ZZPRIVACYZZ");

  // ...and to nowhere else. Every request the page made was to the stub origin.
  const foreign = outbound.filter((url) => !url.startsWith(stub.origin));
  expect(foreign).toEqual([]);

  // Storage holds configuration only: no page text, no job state (FR-025). Read through the
  // extension's own storage API, because the page has none — which is the point of the next
  // assertion.
  const stored = JSON.stringify(
    await extension.serviceWorker.evaluate(() => chrome.storage.local.get(null)),
  );
  expect(stored).not.toContain("ZZPRIVACYZZ");
  expect(stored).not.toContain("harbour");
  expect(stored).not.toContain("translatedText");

  // The secret is never readable from page context, and storage is not exposed to the page.
  const pageContext = await page.evaluate(() => {
    const injected = (globalThis as { chrome?: { storage?: unknown } }).chrome;
    return {
      hasChromeStorage: typeof injected?.storage !== "undefined",
      body: document.body.innerHTML,
    };
  });
  expect(pageContext.hasChromeStorage).toBe(false);
  expect(pageContext.body).not.toContain("sk-e2e-uvwxyz987654");
});

test("the diagnostics view masks the credential and delete-all leaves nothing behind", async () => {
  await configureProviders(extension, [
    {
      id: "p_us2b",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-uvwxyz987654",
    },
  ]);

  const options = await extension.openOptions();
  await options.getByRole("button", { name: "Diagnostics" }).click();
  await options.getByRole("button", { name: "Refresh" }).click();

  const diagnostics = await options.locator("#diagnostics-list").textContent();
  expect(diagnostics).toContain("••••7654");
  expect(diagnostics).not.toContain("sk-e2e-uvwxyz987654");

  options.on("dialog", (dialog) => void dialog.accept());
  await options.getByRole("button", { name: "Privacy and data" }).click();
  await options.click("#delete-all");
  await expect(options.locator("#privacy-feedback")).toContainText("deleted and verified empty", {
    timeout: 15_000,
  });

  const remaining = await readExtensionStorage(options);
  expect(remaining).toEqual({});
  await options.close();
});

test("the disclosure is shown before the first credential can be entered", async () => {
  const options = await extension.openOptions();
  await expect(options.getByText("Before you enter a credential")).toBeVisible();
  await expect(options.locator("#provider-credential")).toBeDisabled();
  await options.check("#acknowledge");
  await expect(options.locator("#provider-credential")).toBeEnabled();
  await options.close();
});
