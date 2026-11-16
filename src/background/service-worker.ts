import {
  PORT_NAME,
  parseCommand,
  parsePortRequest,
  type CommandMessage,
  type PortResponse,
} from "../shared/messages.js";
import { buildSystemInstruction } from "../shared/prompt.js";
import { createSettingsStore } from "../shared/settings.js";
import type { ErrorClass, TranslationProvider } from "../shared/types.js";
import { CredentialVault, RedactingLogger, publicCredentialView } from "./credentials.js";
import {
  ProviderError,
  callProvider,
  toProviderConfig,
  verifyProviderConnection,
} from "./provider-client.js";
import { DEFAULT_RETRY_POLICY, withRetry } from "./retry.js";
import { BadgePainter, badgeOn, tabIdOf } from "./status-badge.js";

/**
 * The service worker owns the wire and nothing else (research R3). It holds no job state: every
 * request is self-contained, so Chrome terminating the worker mid-job costs at most one re-issued
 * request. Credentials are read here and never placed in a message (FR-021).
 */

const store = createSettingsStore();
const vault = new CredentialVault(store);
const logger = new RedactingLogger();
const inFlight = new Map<string, AbortController>();
/** Feature 009: paints the page's own status onto that tab's toolbar icon. */
const badgePainter = new BadgePainter({ onError: (message) => logger.info(message) });

function post(port: chrome.runtime.Port, message: PortResponse): void {
  try {
    port.postMessage(message);
  } catch {
    // The tab went away between the response and the send; nothing to recover.
  }
}

function errorResponse(
  requestId: string,
  errorClass: ErrorClass,
  failedIndices: number[],
): PortResponse {
  return {
    type: "batchError",
    requestId,
    errorClass,
    retryable: false,
    failedIndices,
    message: errorClass,
  };
}

async function resolveProvider(
  providerId: string,
): Promise<{ provider: TranslationProvider; secret: string } | null> {
  const settings = await store.load();
  const provider = settings.providers.find(
    (candidate) => candidate.id === providerId && candidate.enabled,
  );
  if (!provider) return null;
  const secret = await vault.secret(provider.id);
  if (!secret) return null;
  return { provider, secret };
}

async function handleTranslateBatch(
  port: chrome.runtime.Port,
  request: Extract<ReturnType<typeof parsePortRequest>, { type: "translateBatch" }>,
): Promise<void> {
  const indices = request.segments.map((_, index) => index);
  const resolved = await resolveProvider(request.providerId);
  if (!resolved) {
    post(port, errorResponse(request.requestId, "providerMissing", indices));
    logger.warn(`translateBatch: provider ${request.providerId} is missing, disabled or has no credential`);
    return;
  }

  const controller = new AbortController();
  inFlight.set(request.requestId, controller);

  try {
    const systemInstruction = buildSystemInstruction({
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
      glossary: request.glossary,
      style: request.style,
    });
    const providerConfig = toProviderConfig(resolved.provider);

    const call = () =>
      callProvider({
        provider: providerConfig,
        secret: resolved.secret,
        systemInstruction,
        segments: request.segments,
        signal: controller.signal,
      });

    let outcome = await withRetry(call, DEFAULT_RETRY_POLICY, {
      onRetry: (attempt, delayMs, error) => {
        const errorClass = (error as ProviderError).errorClass ?? "unreachable";
        logger.warn(`retry ${attempt} in ${delayMs}ms after ${errorClass}`);
      },
    });

    // A parse outcome is not an exception, so the retry policy cannot see it. The contract asks
    // for exactly one more attempt when a response is plausibly misaligned.
    if (outcome.errorClass === "malformedResponse" && outcome.retryable) {
      logger.warn("malformed response: retrying the batch once");
      outcome = await call();
    }

    if (outcome.errorClass) {
      post(port, {
        type: "batchError",
        requestId: request.requestId,
        errorClass: outcome.errorClass,
        retryable: outcome.retryable,
        failedIndices: outcome.failedIndices,
        message: outcome.errorClass,
      });
      return;
    }

    post(port, {
      type: "batchResult",
      requestId: request.requestId,
      results: outcome.results,
      ...(outcome.usage ? { usage: outcome.usage } : {}),
    });
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    const errorClass: ErrorClass = providerError?.errorClass ?? "unreachable";
    post(port, {
      type: "batchError",
      requestId: request.requestId,
      errorClass,
      retryable: providerError?.retryable ?? false,
      failedIndices: providerError?.failedIndices.length ? providerError.failedIndices : indices,
      message: errorClass,
    });
    logger.warn(`translateBatch failed: ${errorClass}`);
  } finally {
    inFlight.delete(request.requestId);
  }
}

async function handleVerify(
  port: chrome.runtime.Port,
  request: Extract<ReturnType<typeof parsePortRequest>, { type: "verifyProvider" }>,
): Promise<void> {
  const resolved = await resolveProvider(request.providerId);
  if (!resolved) {
    post(port, {
      type: "verifyResult",
      requestId: request.requestId,
      ok: false,
      errorClass: "providerMissing",
    });
    return;
  }

  const outcome = await verifyProviderConnection({
    provider: toProviderConfig(resolved.provider),
    secret: resolved.secret,
    systemInstruction: buildSystemInstruction({
      sourceLang: "auto",
      targetLang: "en",
      glossary: [],
      style: "",
    }),
  });

  const at = new Date().toISOString();
  await store.save((current) => {
    const provider = current.providers.find((candidate) => candidate.id === request.providerId);
    if (provider) {
      provider.lastVerification = outcome.ok
        ? { at, ok: true }
        : { at, ok: false, errorClass: outcome.errorClass };
    }
    return current;
  });

  if (outcome.ok) {
    post(port, { type: "verifyResult", requestId: request.requestId, ok: true });
  } else {
    post(port, {
      type: "verifyResult",
      requestId: request.requestId,
      ok: false,
      errorClass: outcome.errorClass,
    });
    logger.warn(`verification failed: ${outcome.errorClass}`);
  }
}

async function handlePortMessage(port: chrome.runtime.Port, raw: unknown): Promise<void> {
  let request;
  try {
    request = parsePortRequest(raw);
  } catch (error) {
    // Invariant 5: an unknown type is rejected and logged, never swallowed.
    logger.error(`rejected message: ${(error as Error).message}`);
    const requestId =
      raw && typeof raw === "object" && typeof (raw as { requestId?: unknown }).requestId === "string"
        ? (raw as { requestId: string }).requestId
        : "unknown";
    post(port, errorResponse(requestId, "invalidRequest", []));
    return;
  }

  switch (request.type) {
    case "translateBatch":
      await handleTranslateBatch(port, request);
      return;
    case "verifyProvider":
      await handleVerify(port, request);
      return;
    case "cancel":
      inFlight.get(request.requestId)?.abort();
      logger.info(`cancel requested for ${request.requestId}`);
      return;
    case "ping":
      return;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) {
    logger.warn(`unexpected port name: ${port.name}`);
    port.disconnect();
    return;
  }
  port.onMessage.addListener((raw: unknown) => {
    void handlePortMessage(port, raw);
  });
});

async function handleCommand(
  command: CommandMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (reply: unknown) => void,
): Promise<void> {
  switch (command.type) {
    case "jobUpdated": {
      // Feature 009 FR-001–FR-008: the page is the authority; its own status paints its tab.
      // A sender without a tab (an extension page, a test) paints nothing (FR-004).
      const tabId = tabIdOf(sender);
      if (tabId !== null) void badgePainter.apply(tabId, badgeOn(command.status));
      sendResponse({ ok: true });
      return;
    }
    case "getCredentialMask":
      sendResponse({ masked: await vault.mask(command.providerId) });
      return;
    case "clearLogs":
      logger.clear();
      sendResponse({ ok: true });
      return;
    case "providerChanged": {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        chrome.tabs.sendMessage(tab.id, { type: "providerChanged" }).catch(() => {
          // A tab without the content script (browser page, restricted page) is not a failure.
        });
      }
      sendResponse({ ok: true });
      return;
    }
    case "styleChanged": {
      // contracts/settings-and-messages.md section 4.2: relay the style to every tab.
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        chrome.tabs.sendMessage(tab.id, { type: "setDisplayStyle", style: command.style }).catch(() => {
          // A tab without the content script is not a failure.
        });
      }
      sendResponse({ ok: true });
      return;
    }
    case "typographyChanged": {
      // Feature 004 FR-019: the same relay the display style uses, with the pair intact.
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        chrome.tabs.sendMessage(tab.id, { type: "setTypography", typography: command.typography }).catch(() => {
          // A tab without the content script is not a failure.
        });
      }
      sendResponse({ ok: true });
      return;
    }
    default:
      sendResponse({ ok: false, ignored: command.type });
  }
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  let command: CommandMessage;
  try {
    command = parseCommand(raw);
  } catch (error) {
    logger.error(`rejected command: ${(error as Error).message}`);
    sendResponse({ ok: false });
    return false;
  }
  void handleCommand(command, sender, sendResponse);
  return true;
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "toggle-translation") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggleTranslation" });
  } catch {
    logger.info("keyboard shortcut pressed on a page without the content script");
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void store.load();
  // Feature 009: an update must not leave a previous version's check on any tab.
  void badgePainter.clearAll();
});

// Feature 009: a navigated tab starts over, so its icon goes back to the plain mark. The browser
// may reset a per-tab icon itself; the promise does not wait to find out (research R13).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") void badgePainter.clearTab(tabId);
});

export { publicCredentialView };
