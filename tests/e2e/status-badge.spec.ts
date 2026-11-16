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

/**
 * The toolbar check in a real browser (feature 009, US1).
 *
 * The product composes the checked icon, so the observable is what it asks Chrome to display: the
 * real `chrome.action.setIcon` is wrapped in the real service worker and every call is recorded
 * with its tab and paths. Combined with tests/e2e/badge-icon.spec.ts — which measures the shipped
 * pixels — this proves the whole chain: status → decision → icon call → correct raster.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_badge",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-badge-1234",
      timeoutMs: 20_000,
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

interface IconCall {
  tabId?: number;
  path: Record<string, string>;
}

/** Records every `setIcon` the real service worker makes, without changing its behaviour. */
async function installIconSpy(): Promise<void> {
  await extension.serviceWorker.evaluate(() => {
    const scope = globalThis as unknown as { __iconCalls: IconCall[] };
    scope.__iconCalls = [];
    const real = chrome.action.setIcon.bind(chrome.action);
    chrome.action.setIcon = (details: chrome.action.TabIconDetails): Promise<void> => {
      const path = typeof details.path === "object" && details.path !== null ? details.path : {};
      scope.__iconCalls.push({ tabId: details.tabId, path });
      return real(details);
    };
  });
}

async function iconCalls(): Promise<IconCall[]> {
  return extension.serviceWorker.evaluate(
    () => (globalThis as unknown as { __iconCalls: IconCall[] }).__iconCalls,
  );
}

function isChecked(path: Record<string, string>): boolean {
  const paths = Object.values(path);
  return paths.length === 4 && paths.every((candidate) => candidate.endsWith("-check.png"));
}

function isPlain(path: Record<string, string>): boolean {
  const paths = Object.values(path);
  return paths.length === 4 && paths.every((candidate) => candidate.endsWith(".png") && !candidate.endsWith("-check.png"));
}

async function tabIdFor(url: string): Promise<number> {
  return extension.serviceWorker.evaluate(async (needle) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((candidate) => (candidate.url ?? "").startsWith(needle));
    if (!tab?.id) throw new Error(`no tab for ${needle}`);
    return tab.id;
  }, url);
}

async function callsFor(tabId: number): Promise<IconCall[]> {
  return (await iconCalls()).filter((call) => call.tabId === tabId);
}

/**
 * Waits for one tab's icon calls to reach a state and returns how long it took. The deadline is the
 * assertion FR-003 makes; measuring it here keeps a slow poll loop from hiding a slow product.
 */
async function waitForIcon(
  tabId: number,
  want: (calls: IconCall[]) => boolean,
  timeoutMs: number,
): Promise<{ calls: IconCall[]; elapsed: number }> {
  const started = Date.now();
  let last: IconCall[] = [];
  while (Date.now() - started < timeoutMs) {
    last = await callsFor(tabId);
    if (want(last)) return { calls: last, elapsed: Date.now() - started };
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`icon calls did not reach the expected state in ${timeoutMs} ms; last=${JSON.stringify(last)}`);
}

const hasChecked = (calls: IconCall[]): boolean => calls.some((call) => isChecked(call.path));
const lastIsChecked = (calls: IconCall[]): boolean =>
  calls.length > 0 && isChecked(calls[calls.length - 1]?.path ?? {});
const lastIsPlain = (calls: IconCall[]): boolean =>
  calls.length > 0 && isPlain(calls[calls.length - 1]?.path ?? {});

/** The status the page itself reports, polled until the run is no longer in flight. */
async function waitForSettled(url: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = await jobStatus(extension, url);
  while (Date.now() < deadline) {
    last = await jobStatus(extension, url);
    if (last.state === "completed" || last.state === "failed" || last.state === "cancelled") {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`run did not settle; last=${JSON.stringify(last.state)}`);
}

test("an untouched page asks for no checked icon (FR-002, SC-004)", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const tabId = await tabIdFor(url);
  await installIconSpy();
  await page.waitForTimeout(400);

  // A navigation may still ask for the plain set while the worker catches up with the load; what an
  // untouched page must never do is claim the check.
  const calls = await callsFor(tabId);
  expect(calls.some((call) => isChecked(call.path))).toBe(false);
  if (calls.length > 0) expect(lastIsPlain(calls)).toBe(true);
});

test("the check appears as the run starts, before the first translation, and stays (FR-001, FR-003, FR-009, FR-010, FR-011, SC-005)", async () => {
  // A provider slow enough that the icon must be swapped while nothing has been translated yet.
  stub.setMode("success", { latencyMs: 2_500 });
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const tabId = await tabIdFor(url);
  await installIconSpy();

  await sendToTab(extension, url, { type: "translatePage" });

  const { elapsed } = await waitForIcon(tabId, hasChecked, 1_000);
  expect(elapsed).toBeLessThanOrEqual(1_000);

  // The check claimed a run, not a translation: nothing has landed yet.
  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);

  await waitForTranslation(page, 1);
  expect(lastIsChecked(await callsFor(tabId))).toBe(true);
});

test("two tabs keep their own check (FR-004, SC-006)", async () => {
  const first = `${stub.origin}/pages/news-article-a.html`;
  const second = `${stub.origin}/pages/wiki-entry.html`;
  const firstPage = await extension.openPage(first);
  const secondPage = await extension.openPage(second);
  await waitForContentScript(firstPage);
  await waitForContentScript(secondPage);
  const firstTab = await tabIdFor(first);
  const secondTab = await tabIdFor(second);
  await installIconSpy();

  await sendToTab(extension, first, { type: "translatePage" });
  await waitForTranslation(firstPage, 2);

  expect(hasChecked(await callsFor(firstTab))).toBe(true);
  expect(await callsFor(secondTab)).toEqual([]);
});

test("restoring puts the plain icon back within one second (FR-008, SC-012)", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const tabId = await tabIdFor(url);
  await installIconSpy();
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 2);
  await waitForIcon(tabId, lastIsChecked, 1_000);

  await sendToTab(extension, url, { type: "toggleTranslation" });
  const { elapsed } = await waitForIcon(tabId, lastIsPlain, 1_000);
  expect(elapsed).toBeLessThanOrEqual(1_000);
});

test("a navigation puts the plain icon back, without waiting for the browser to do it (FR-002, edge case)", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const tabId = await tabIdFor(url);
  await installIconSpy();
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);
  await waitForIcon(tabId, lastIsChecked, 1_000);

  await page.goto(`${stub.origin}/pages/blog-short.html`, { waitUntil: "domcontentloaded" });
  await waitForContentScript(page);
  const { calls } = await waitForIcon(tabId, lastIsPlain, 5_000);
  expect(hasChecked(calls)).toBe(true);
});

test("a run that cannot start leaves no check, and the panel still says why (FR-002, FR-007, SC-004)", async () => {
  await writeSettings(extension, {
    providers: [],
    routing: { defaultProviderId: null, rules: [] },
  });

  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const tabId = await tabIdFor(url);
  await installIconSpy();
  await sendToTab(extension, url, { type: "translatePage" });

  const status = await waitForSettled(url);
  expect(status.state).toBe("failed");
  expect(status.failure?.errorClass).toBe("providerMissing");

  // The tab navigated before the run, so the icon is already plain; what matters is that no check
  // was ever claimed and that whatever was written last is the plain mark.
  const calls = await callsFor(tabId);
  expect(calls.some((call) => isChecked(call.path))).toBe(false);
  if (calls.length > 0) expect(lastIsPlain(calls)).toBe(true);
});

test("a page with no translatable passage leaves no check (FR-002, SC-004)", async () => {
  const url = `${stub.origin}/pages/empty-body.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const tabId = await tabIdFor(url);
  await installIconSpy();
  await sendToTab(extension, url, { type: "translatePage" });

  const status = await waitForSettled(url);
  expect(status.counts.translated).toBe(0);

  // No translation is on the page, so no check may remain. The run may never have claimed one —
  // the navigation-time clear already put the plain icon back — so both shapes are accepted, and
  // what is refused is a checked icon left standing.
  const { calls } = await waitForIcon(tabId, (current) => !lastIsChecked(current), 1_000);
  expect(lastIsChecked(calls)).toBe(false);
});

test("a failure after translations landed keeps the check (FR-006, SC-004)", async () => {
  stub.setMode("success", { latencyMs: 400 });
  const url = `${stub.origin}/pages/article-long.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const tabId = await tabIdFor(url);
  await installIconSpy();
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);

  // The first batch is on the page; every later one is refused. The check answers "translation is
  // on", so it stays, and the failure is the panel's business.
  stub.setMode("authRejected");

  const status = await waitForSettled(url);
  expect(status.counts.translated).toBeGreaterThan(0);
  expect(status.state).not.toBe("idle");
  expect(lastIsChecked(await callsFor(tabId))).toBe(true);
});