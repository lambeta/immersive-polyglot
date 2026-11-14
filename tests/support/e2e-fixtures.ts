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
