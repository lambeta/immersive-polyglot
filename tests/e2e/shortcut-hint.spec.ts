import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";
import { contrastOf, overflowOf } from "../support/surface-metrics.js";

/**
 * The shortcut hint in the real panel (feature 009, US2).
 *
 * The label is compared with the same browser's live `chrome.commands.getAll()` answer, so a
 * hard-coded key cannot pass: whatever this platform reports — ⌥A on macOS, Alt+A elsewhere — is
 * what the panel must render, verbatim (FR-020, FR-027).
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
const PANEL = { width: 384, height: 720 };

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_hint",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-hint-1234",
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

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

/** The binding Chrome reports for the translate/restore command, read in the panel's own context. */
async function liveShortcut(popup: Page): Promise<string> {
  const commands = await popup.evaluate(() => chrome.commands.getAll());
  const entry = commands.find((command) => command.name === "toggle-translation");
  return entry?.shortcut ?? "";
}

test("the chip names the combination the browser reports, not a literal (FR-018, FR-020, SC-007)", async () => {
  const { popup } = await openPanelFor();
  const shortcut = await liveShortcut(popup);

  expect(shortcut.length).toBeGreaterThan(0);
  expect(shortcut.endsWith("A"), `the shipped default binds A, reported as ${shortcut}`).toBe(true);

  const chip = popup.locator("#translate-key");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText(shortcut);
  await expect(popup.locator("#translate-label")).toHaveText("Translate this page");
});

test("the chip is still there when the button offers to restore, and joins the accessible name (FR-019, FR-023, FR-027)", async () => {
  const { url, page, popup } = await openPanelFor();
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);

  await popup.reload();
  await popup.waitForSelector("#translate");
  const shortcut = await liveShortcut(popup);

  await expect(popup.locator("#translate-label")).toHaveText("Show original");
  await expect(popup.locator("#translate-key")).toHaveText(shortcut);
  await expect(popup.locator("#translate-key")).toBeVisible();

  // The real accessibility tree: the button's name carries the action and the key.
  const tree = await popup.accessibility.snapshot();
  const button = (function find(node: typeof tree): typeof tree {
    if (!node) return null;
    if (node.role === "button" && (node.name ?? "").includes("Show original")) return node;
    for (const child of node.children ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  })(tree);
  expect(button, "the primary action is in the accessibility tree").not.toBeNull();
  expect(button?.name ?? "").toContain(shortcut);
});

test("the icon's own tooltip is untouched (FR-026)", async () => {
  const { url } = await openPanelFor();
  const title = await extension.serviceWorker.evaluate(async (needle) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((candidate) => (candidate.url ?? "").startsWith(needle));
    if (!tab?.id) throw new Error(`no tab for ${needle}`);
    return chrome.action.getTitle({ tabId: tab.id });
  }, url);
  expect(title).toBe("Immersive Polyglot — translate this page");
});

test("the chip never breaks the panel's width, height or contrast (FR-022, FR-024, SC-011)", async () => {
  const { popup } = await openPanelFor();
  await expect(popup.locator("#translate-key")).toBeVisible();

  // Fixed width, one primary control, no sideways scroll.
  expect(await popup.evaluate(() => document.documentElement.clientWidth)).toBe(PANEL.width);
  expect(await overflowOf(popup)).toBeLessThanOrEqual(1);
  const box = await popup.locator("#translate").boundingBox();
  expect(box, "the primary action has a box").not.toBeNull();
  expect(Math.round(box!.height)).toBe(44);

  // FR-024 / constitution V: a 30 % longer label must not clip or wrap, and the chip stays legible.
  await popup.evaluate(() => {
    const label = document.querySelector<HTMLElement>("#translate-label");
    if (!label) throw new Error("no label");
    label.textContent = "Translate this entire page";
  });
  const longLabelProblem = await popup.evaluate(() => {
    const label = document.querySelector<HTMLElement>("#translate-label");
    const button = document.querySelector<HTMLElement>("#translate");
    if (!label || !button) throw new Error("no control");
    const wraps = label.getClientRects().length > 1;
    const clips = label.scrollWidth > label.clientWidth + 1;
    const buttonOverflows = button.scrollHeight > button.clientHeight + 1;
    return { wraps, clips, buttonOverflows };
  });
  expect(longLabelProblem).toEqual({ wraps: false, clips: false, buttonOverflows: false });
  expect(await overflowOf(popup)).toBeLessThanOrEqual(1);
  await expect(popup.locator("#translate-key")).toBeVisible();

  // 200 % zoom: the words and the key stay readable (feature 006's no-clip promise).
  await popup.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await popup.waitForTimeout(150);
  const clippedAtZoom = await popup.evaluate(() => {
    const label = document.querySelector<HTMLElement>("#translate-label");
    if (!label) throw new Error("no label");
    return label.scrollWidth > label.clientWidth + 1 || label.getClientRects().length > 1;
  });
  expect(clippedAtZoom).toBe(false);
  await expect(popup.locator("#translate-key")).toBeVisible();

  // The chip's ink against the button's ground, in both themes.
  await popup.evaluate(() => {
    document.body.style.zoom = "1";
  });
  for (const scheme of ["light", "dark"] as const) {
    await popup.emulateMedia({ colorScheme: scheme });
    await popup.waitForTimeout(250);
    const readings = await contrastOf(popup, ["#translate-key"]);
    const reading = readings[0];
    if (!reading) throw new Error("no contrast reading for the chip in " + scheme);
    expect(reading.ratio, `chip contrast in ${scheme}`).toBeGreaterThanOrEqual(4.5);
  }
});
