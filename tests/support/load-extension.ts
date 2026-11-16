import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the built extension into a real Chromium profile (constitution principle III). The
 * profile is empty on every launch, so a test that passes here proves first-run behaviour too.
 */

const EXTENSION_DIR = fileURLToPath(new URL("../../dist", import.meta.url));

export interface LaunchedExtension {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: import("@playwright/test").Worker;
  optionsUrl: string;
  popupUrl: string;
  openPage(url: string): Promise<Page>;
  openOptions(): Promise<Page>;
  close(): Promise<void>;
}

/**
 * A freshly registered module service worker can answer an evaluate before its extension
 * bindings are attached; polling once beats a mysterious "chrome.runtime is undefined".
 */
async function waitForWorkerReady(worker: import("@playwright/test").Worker): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const ready = await worker.evaluate(
        () => typeof chrome !== "undefined" && Boolean(chrome.runtime?.id),
      );
      if (ready) return;
    } catch {
      // The worker may still be starting; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function launchWithExtension(options: { headless?: boolean } = {}): Promise<LaunchedExtension> {
  const profileDir = await mkdtemp(join(tmpdir(), "ipt-profile-"));
  const headless = options.headless ?? process.env.PW_HEADLESS === "1";

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      // Feature 008: lets a test point at the priced provider's host without leaving the machine.
      // The stub answers on 127.0.0.1; no real request ever reaches this name.
      "--host-resolver-rules=MAP api.deepseek.com 127.0.0.1",
    ],
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  await waitForWorkerReady(serviceWorker);

  return {
    context,
    extensionId,
    serviceWorker,
    optionsUrl: `chrome-extension://${extensionId}/ui/options/options.html`,
    popupUrl: `chrome-extension://${extensionId}/ui/popup/popup.html`,
    async openPage(url: string) {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return page;
    },
    async openOptions() {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
      return page;
    },
    async close() {
      await context.close();
      await rm(profileDir, { recursive: true, force: true });
    },
  };
}

/** Reads chrome.storage.local from inside an extension page. */
export async function readExtensionStorage(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => chrome.storage.local.get(null)) as Promise<Record<string, unknown>>;
}

/** Waits until the extension's content script has answered on the given page. */
export async function waitForContentScript(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset["iptReady"] === "1", undefined, {
    timeout: 15_000,
  });
}

/** Requests that reached a given origin, read from the browser's own network stack. */
export function trackRequests(page: Page, origin: string): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(origin)) urls.push(request.url());
  });
  return urls;
}
