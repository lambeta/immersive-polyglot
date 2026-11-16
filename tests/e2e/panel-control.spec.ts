import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  jobStatus,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
  writeSettings,
} from "../support/e2e-fixtures.js";
import { surfaceHeight } from "../support/surface-metrics.js";

/**
 * The page control's own contract (feature 006, US1: T012–T014).
 *
 * The panel is a read-only view of the content agent's state, so these tests drive real runs over
 * the real wire and then read what the panel says about them. Three properties are pinned here:
 * the state and the single action (FR-001, FR-002, FR-004), the independence of the condition
 * lines (FR-003, FR-010), and the height budget that keeps the action on screen (FR-008, FR-009).
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
const PANEL = { width: 384, height: 720 };

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

async function seedProvider(options: { endpoint?: string } = {}): Promise<void> {
  await configureProviders(extension, [
    {
      id: "p_panel",
      name: "Stub",
      endpoint: options.endpoint ?? `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-panel-1234",
      timeoutMs: 3_000,
    },
  ]);
}

/** Opens a fixture page, makes it the tab the panel acts on, and opens the panel. */
async function openPanelFor(name = "news-article-a.html") {
  const url = `${stub.origin}/pages/${name}`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await page.bringToFront();
  const popup = await extension.context.newPage();
  await popup.setViewportSize(PANEL);
  await popup.goto(extension.popupUrl);
  await popup.waitForSelector("#translate");
  return { url, page, popup };
}

test("the panel shows the site, the state and exactly one primary action (T012)", async () => {
  await seedProvider();
  const { url, page, popup } = await openPanelFor();

  await expect(popup.locator("h1")).toHaveText("Immersive Polyglot");
  await expect(popup.locator("#site-host")).toHaveText("127.0.0.1");
  await expect(popup.locator("#status")).toHaveText("Not translated");
  await expect(popup.locator("#translate-label")).toHaveText("Translate this page");
  await expect(popup.locator("#translate")).toBeEnabled();
  // FR-001/FR-002: one filled action, and it is the translate control.
  await expect(popup.locator(".btn--primary")).toHaveCount(1);

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 3);
  await popup.reload();
  await expect(popup.locator("#status")).toContainText("Translated");
  await expect(popup.locator("#translate-label")).toHaveText("Show original");
  await expect(popup.locator("#translate")).toBeEnabled();
  expect(await jobStatus(extension, url)).toMatchObject({ state: "completed" });
});

test("without a provider the panel refuses to act and names the settings page (T012)", async () => {
  const { popup } = await openPanelFor();

  await expect(popup.locator("#translate")).toBeDisabled();
  await expect(popup.locator("#translate-label")).toHaveText("Translate this page");
  const reason = popup.locator("#no-provider");
  await expect(reason).toBeVisible();
  await expect(reason).toContainText("Open settings");
});

test("a run that fails keeps the action pressable and reports the reason (T013)", async () => {
  await seedProvider();
  const { url, popup } = await openPanelFor();
  stub.setMode("authRejected");

  await sendToTab(extension, url, { type: "translatePage" });
  await expect
    .poll(async () => (await jobStatus(extension, url)).state, { timeout: 20_000 })
    .toBe("failed");
  await popup.reload();

  await expect(popup.locator("#failure")).toBeVisible();
  await expect(popup.locator("#failure")).toContainText("rejected the credential");
  // The condition explains the run; it never becomes the only thing to press.
  await expect(popup.locator("#translate-label")).toHaveText("Show original");
  await expect(popup.locator("#translate")).toBeEnabled();
});

test("a volume cap is its own line, with the count it held back (T013)", async () => {
  await configureProviders(
    extension,
    [
      {
        id: "p_panel",
        name: "Stub",
        endpoint: `${stub.origin}/v1/chat/completions`,
        model: "stub-model",
        secret: "sk-e2e-panel-1234",
        timeoutMs: 3_000,
      },
    ],
    { limits: { maxConcurrency: 2, sessionCapSegments: 2, sessionCapChars: 0, siteCaps: {} } },
  );
  const { url, popup } = await openPanelFor();

  await sendToTab(extension, url, { type: "translatePage" });
  await expect
    .poll(async () => (await jobStatus(extension, url)).capReached, { timeout: 20_000 })
    .toBe(true);
  await popup.reload();

  await expect(popup.locator("#cap")).toBeVisible();
  await expect(popup.locator("#cap")).toContainText("Volume cap reached");
  await expect(popup.locator("#translate-label")).toHaveText("Show original");
});

test("a rule pointing at a missing provider is reported without stopping translation (T013)", async () => {
  await seedProvider();
  await writeSettings(extension, {
    routing: {
      defaultProviderId: "p_panel",
      rules: [
        { id: "r_missing", kind: "site", match: "127.0.0.1", providerId: "p_gone", enabled: true },
      ],
    },
  });
  const { url, page, popup } = await openPanelFor();

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);
  await popup.reload();

  await expect(popup.locator("#broken-rule")).toBeVisible();
  await expect(popup.locator("#broken-rule")).toContainText("127.0.0.1");
  await expect(popup.locator("#translate-label")).toHaveText("Show original");
});

test("the idle panel states the session record not at all (T013)", async () => {
  await seedProvider();
  const { popup } = await openPanelFor();

  await expect(popup.locator("#usage")).toHaveCount(1);
  expect(await popup.locator("#usage li").count()).toBe(0);
  // The heading goes with it: an empty section under a heading is a promise with nothing behind it.
  await expect(popup.locator(".usage")).toBeHidden();
});

test("the panel keeps its action and its way into settings inside 600 px (T014)", async () => {
  await seedProvider();
  const { url, page, popup } = await openPanelFor();

  const idle = await surfaceHeight(popup);
  expect(idle).toBeLessThanOrEqual(600);
  // FR-008: the way into settings cannot be scrolled away, because it is in the header.
  await expect(popup.locator("#settings")).toBeInViewport();

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 3);
  await popup.reload();
  await expect(popup.locator("#status")).toContainText("Translated");

  const translated = await surfaceHeight(popup);
  expect(translated).toBeLessThanOrEqual(600);
  // The record exists in this state, so the budget was measured with content in it.
  expect(await popup.locator("#usage li").count()).toBeGreaterThan(1);
  await expect(popup.locator("#settings")).toBeInViewport();
});
