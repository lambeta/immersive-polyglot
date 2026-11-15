import { expect, type Page } from "@playwright/test";
import type { LaunchedExtension } from "./load-extension.js";
import type { JobStatusPayload } from "../../src/shared/messages.js";
import { CURRENT_SCHEMA_VERSION } from "../../src/shared/settings.js";

/**
 * Shared e2e plumbing. It drives the real extension through the same messages its own UI sends,
 * and writes configuration through real chrome.storage.local, so a passing test proves the wire
 * rather than a test-only code path.
 */

export interface StubProvider {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  secret: string;
  timeoutMs?: number;
  enabled?: boolean;
}

export function providerRecord(input: StubProvider): Record<string, unknown> {
  return {
    id: input.id,
    name: input.name,
    endpoint: input.endpoint,
    model: input.model,
    extraHeaders: {},
    enabled: input.enabled ?? true,
    timeoutMs: input.timeoutMs ?? 8_000,
    maxConcurrency: 2,
  };
}

export async function writeSettings(
  extension: LaunchedExtension,
  patch: Record<string, unknown>,
): Promise<void> {
  const options = await extension.openOptions();
  await options.evaluate(
    async ({ incoming, version }) => {
      const current = await chrome.storage.local.get(null);
      await chrome.storage.local.set({ ...current, ...incoming, schemaVersion: version });
      try {
        await chrome.runtime.sendMessage({ type: "providerChanged" });
      } catch {
        // No listener yet is harmless; the content script reloads settings on its next command.
      }
    },
    { incoming: patch, version: CURRENT_SCHEMA_VERSION },
  );
  await options.close();
}

/** Providers, credentials, routing default and a target language, in one write. */
export async function configureProviders(
  extension: LaunchedExtension,
  providers: StubProvider[],
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const credentials: Record<string, unknown> = {};
  for (const provider of providers) {
    credentials[provider.id] = {
      providerId: provider.id,
      secret: provider.secret,
      masked: `••••${provider.secret.slice(-4)}`,
      updatedAt: new Date().toISOString(),
    };
  }
  await writeSettings(extension, {
    providers: providers.map(providerRecord),
    credentials,
    routing: { defaultProviderId: providers[0]?.id ?? null, rules: [] },
    ui: { targetLang: "zh", sourceLang: "en", displayMode: "bilingual" },
    limits: { maxConcurrency: 2, sessionCapSegments: 0, sessionCapChars: 0, siteCaps: {} },
    ...overrides,
  });
}

/** Sends the same command the popup or the keyboard shortcut sends. */
export async function sendToTab(
  extension: LaunchedExtension,
  pageUrl: string,
  message: Record<string, unknown>,
): Promise<unknown> {
  return extension.serviceWorker.evaluate(
    async ({ url, command }) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url?.startsWith(url));
      if (!tab?.id) throw new Error(`no tab for ${url}`);
      return chrome.tabs.sendMessage(tab.id, command);
    },
    { url: pageUrl, command: message },
  );
}

export async function waitForTranslation(page: Page, minimum = 1): Promise<void> {
  await page.waitForFunction(
    (count) => document.querySelectorAll('[data-ipt="target"]').length >= count,
    minimum,
    { timeout: 30_000 },
  );
}

export async function translationTexts(page: Page): Promise<string[]> {
  return page.locator('[data-ipt="target"]').allTextContents();
}

export async function jobStatus(
  extension: LaunchedExtension,
  pageUrl: string,
): Promise<JobStatusPayload> {
  const reply = await sendToTab(extension, pageUrl, { type: "getJobStatus" });
  return reply as JobStatusPayload;
}

export async function restorePage(extension: LaunchedExtension, pageUrl: string): Promise<void> {
  await sendToTab(extension, pageUrl, { type: "toggleTranslation" });
}

export async function expectNoResidue(page: Page): Promise<void> {
  await expect(page.locator("[data-ipt]")).toHaveCount(0);
}

/** Waits until the content script has announced itself on the page. */
export async function waitForContentScript(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset["iptReady"] === "1", undefined, {
    timeout: 20_000,
  });
}
/** Fires the same command N times over the real wire without awaiting each other. */
export async function repeatCommand(
  extension: LaunchedExtension,
  pageUrl: string,
  message: Record<string, unknown>,
  times: number,
): Promise<void> {
  await extension.serviceWorker.evaluate(
    async ({ url, command, count }) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url?.startsWith(url));
      if (!tab?.id) throw new Error(`no tab for ${url}`);
      await Promise.all(
        Array.from({ length: count }, () => chrome.tabs.sendMessage(tab.id as number, command)),
      );
    },
    { url: pageUrl, command: message, count: times },
  );
}

/** Presses the popup's translate control N times inside one animation frame (the reader's action). */
export async function clickTranslate(page: Page, times = 5): Promise<void> {
  await page.evaluate((count) => {
    const button = document.querySelector<HTMLButtonElement>("#translate");
    if (!button) throw new Error("no #translate control");
    for (let index = 0; index < count; index += 1) button.click();
  }, times);
}

/** Selects the contents of one block so `translateSelection` has something to resolve. */
export async function selectPassage(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) throw new Error(`no element for ${sel}`);
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    if (!selection) throw new Error("no selection object");
    selection.removeAllRanges();
    selection.addRange(range);
  }, selector);
}

export interface PassageTranslations {
  passage: string;
  count: number;
}

/**
 * Counts the rendered translations that belong to each source passage: a container placed inside the
 * source (list items, table cells) or immediately beside it. `unattributed` is the number of
 * translation containers that belong to no source — anything above zero is a defect of its own.
 */
export async function translationsPerPassage(page: Page): Promise<PassageTranslations[]> {
  const result = await page.evaluate(() => {
    const sources = Array.from(document.querySelectorAll('[data-ipt="source"]'));
    const perSource = sources.map((source) => {
      let count = source.querySelectorAll('[data-ipt="target"]').length;

      // Beside the source in the direction the renderer placed it: a container belongs to exactly
      // one source, so a following sibling is never also counted for the source before it.
      const next = source.nextElementSibling;
      if (next && next.getAttribute("data-ipt") === "target") {
        let node: Element | null = next;
        while (node && node.getAttribute("data-ipt") === "target") {
          if (node.getAttribute("data-ipt-position") !== "before") count += 1;
          node = node.nextElementSibling;
        }
      }
      const previous = source.previousElementSibling;
      if (previous && previous.getAttribute("data-ipt") === "target") {
        let node: Element | null = previous;
        while (node && node.getAttribute("data-ipt") === "target") {
          if (node.getAttribute("data-ipt-position") === "before") count += 1;
          node = node.previousElementSibling;
        }
      }
      return { passage: (source.textContent ?? "").trim().slice(0, 48), count };
    });
    const attributed = perSource.reduce((total, entry) => total + entry.count, 0);
    const targets = document.querySelectorAll('[data-ipt="target"]').length;
    return { perSource, unattributed: targets - attributed };
  });
  return result.perSource;
}

/** The largest number of translations any one passage carries — 1 is healthy, 2+ is the defect. */
export async function maxTranslationsPerPassage(page: Page): Promise<number> {
  const perPassage = await translationsPerPassage(page);
  return perPassage.reduce((max, entry) => Math.max(max, entry.count), 0);
}