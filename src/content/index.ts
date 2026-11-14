import {
  PORT_NAME,
  parsePortResponse,
  type CommandMessage,
  type JobStatusPayload,
  type PortRequest,
} from "../shared/messages.js";
import { resolveProvider } from "../shared/routing.js";
import { createSettingsStore } from "../shared/settings.js";
import { resolveDisplayStyleForHost } from "../shared/display-styles.js";
import type { DisplayMode, DisplayStyleId, ErrorClass, Settings } from "../shared/types.js";
import { RequestLimiter, VolumeBudget } from "./limiter.js";
import { PageObserver } from "./observer.js";
import { TranslationJob, type BatchCaller, type BatchReply, type BatchRequestPayload } from "./job.js";
import { selectedBlocks } from "./selection.js";

/**
 * The page agent: it owns the job (research R3), the page mutation and the journal, and it talks
 * to the service worker over a long-lived port for every network call. It holds no credential and
 * never asks for one (FR-021).
 */

const settingsStore = createSettingsStore();

interface PendingRequest {
  payload: BatchRequestPayload;
  resolve(reply: BatchReply): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  signal: AbortSignal | undefined;
  abortListener?: () => void;
}

/** Port client with reconnect-and-re-issue semantics (contract section 5). */
class TranslatePort implements BatchCaller {
  #port: chrome.runtime.Port | null = null;
  readonly #pending = new Map<string, PendingRequest>();
  #reconnectFailures: number[] = [];
  #reconnecting = false;

  #connect(): chrome.runtime.Port {
    const port = chrome.runtime.connect({ name: PORT_NAME });
    port.onMessage.addListener((raw: unknown) => this.#onMessage(raw));
    port.onDisconnect.addListener(() => this.#onDisconnect());
    this.#port = port;
    return port;
  }

  #ensure(): chrome.runtime.Port {
    return this.#port ?? this.#connect();
  }

  #onMessage(raw: unknown): void {
    let response;
    try {
      response = parsePortResponse(raw);
    } catch {
      return;
    }
    const pending = this.#pending.get(response.requestId);
    if (!pending) return;
    this.#pending.delete(response.requestId);
    clearTimeout(pending.timer);
    if (pending.abortListener) pending.signal?.removeEventListener("abort", pending.abortListener);

    if (response.type === "batchResult") {
      pending.resolve({ results: response.results, failedIndices: [] });
      return;
    }
    if (response.type === "batchError") {
      pending.reject(
        Object.assign(new Error(response.message), {
          errorClass: response.errorClass,
          retryable: response.retryable,
          failedIndices: response.failedIndices,
        }),
      );
      return;
    }
    if (response.type === "verifyResult") {
      pending.resolve({ results: [], failedIndices: [] });
    }
  }

  #onDisconnect(): void {
    this.#port = null;
    if (this.#pending.size === 0) return;
    const now = Date.now();
    this.#reconnectFailures = this.#reconnectFailures.filter((at) => now - at < 30_000);
    this.#reconnectFailures.push(now);

    if (this.#reconnectFailures.length >= 3) {
      this.#rejectAll({ errorClass: "workerUnavailable" });
      return;
    }
    if (this.#reconnecting) return;
    this.#reconnecting = true;
    setTimeout(() => {
      this.#reconnecting = false;
      // Only requests that still have no result are re-issued; a late duplicate cannot render.
      for (const pending of this.#pending.values()) {
        try {
          this.#ensure().postMessage({ type: "translateBatch", ...pending.payload });
        } catch {
          pending.reject({ errorClass: "workerUnavailable" });
        }
      }
    }, 150);
  }

  #rejectAll(error: unknown): void {
    for (const [requestId, pending] of this.#pending) {
      clearTimeout(pending.timer);
      this.#pending.delete(requestId);
      pending.reject(error);
    }
  }

  translate(payload: BatchRequestPayload, signal: AbortSignal): Promise<BatchReply> {
    return new Promise<BatchReply>((resolve, reject) => {
      let port: chrome.runtime.Port;
      try {
        port = this.#ensure();
      } catch {
        reject({ errorClass: "workerUnavailable" });
        return;
      }

      const timer = setTimeout(() => {
        this.#pending.delete(payload.requestId);
        try {
          port.postMessage({ type: "cancel", requestId: payload.requestId } satisfies PortRequest);
        } catch {
          // The port is gone; the disconnect path already rejected the request.
        }
        reject({ errorClass: "timeout" });
      }, payload.timeoutMs + 2_000);

      const abortListener = () => {
        this.#pending.delete(payload.requestId);
        clearTimeout(timer);
        try {
          port.postMessage({ type: "cancel", requestId: payload.requestId } satisfies PortRequest);
        } catch {
          // Nothing to cancel on a dead port.
        }
        reject({ errorClass: "cancelled" });
      };
      signal.addEventListener("abort", abortListener, { once: true });

      this.#pending.set(payload.requestId, { payload, resolve, reject, timer, signal, abortListener });
      try {
        port.postMessage({ type: "translateBatch", ...payload } satisfies PortRequest);
      } catch {
        this.#pending.delete(payload.requestId);
        clearTimeout(timer);
        reject({ errorClass: "workerUnavailable" });
      }
    });
  }

  cancelPending(): void {
    this.#rejectAll({ errorClass: "cancelled" });
  }
}

const portClient = new TranslatePort();

const RESTRICTED_SCHEMES = new Set([
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "devtools:",
  "view-source:",
  "chrome-search:",
  "chrome-untrusted:",
]);

/** Why this page cannot be translated, or null when it can (US4 scenario 5, FR-014). */
export function unsupportedReason(doc: Document = document): string | null {
  const protocol = doc.location?.protocol ?? "";
  if (RESTRICTED_SCHEMES.has(protocol)) return "restrictedPage";
  const host = doc.location?.hostname ?? "";
  if (host === "chromewebstore.google.com" || host.endsWith("chrome.google.com")) {
    return "restrictedPage";
  }
  const contentType = doc.contentType ?? "";
  if (contentType && !/text\/html|application\/xhtml|text\/plain|application\/xml/.test(contentType)) {
    return "unsupportedPage";
  }
  return null;
}

function displayModeFor(settings: Settings): DisplayMode {
  const host = location.hostname;
  const site = settings.sites.find((preference) => matches(preference.sitePattern, host));
  return site?.displayMode ?? settings.ui.displayMode;
}

function displayStyleFor(settings: Settings): DisplayStyleId {
  return resolveDisplayStyleForHost(settings, location.hostname).styleId;
}

function targetLangFor(settings: Settings): string {
  const host = location.hostname;
  const site = settings.sites.find((preference) => matches(preference.sitePattern, host));
  return site?.targetLang ?? settings.ui.targetLang;
}

function matches(pattern: string, host: string): boolean {
  const cleaned = pattern.replace(/^\*\./, "").toLowerCase();
  const normalisedHost = host.replace(/^www\./, "").toLowerCase();
  return normalisedHost === cleaned || normalisedHost.endsWith(`.${cleaned}`);
}

let job: TranslationJob | null = null;
let observer: PageObserver | null = null;
let cachedSettings: Settings | null = null;
let lastStatus: JobStatusPayload = {
  jobId: null,
  pageKey: `${location.origin}${location.pathname}`,
  providerId: null,
  state: "idle",
  counts: { total: 0, translated: 0, failed: 0, skipped: 0, reused: 0 },
  capReached: false,
  skipped: 0,
};

function broadcast(status: JobStatusPayload): void {
  lastStatus = status;
  try {
    chrome.runtime.sendMessage({ type: "jobUpdated", status }).catch(() => {
      // No popup is open; the status is still available on request.
    });
  } catch {
    // Extension context invalidated during a reload; nothing to report.
  }
}

async function settings(force = false): Promise<Settings> {
  if (!cachedSettings || force) cachedSettings = await settingsStore.load();
  return cachedSettings;
}

async function startTranslation(options: { providerOverrideId?: string; elements?: Element[] } = {}): Promise<void> {
  const reason = unsupportedReason();
  if (reason) {
    broadcast({
      ...lastStatus,
      state: "failed",
      failure: { errorClass: reason as ErrorClass, message: reason },
    });
    return;
  }

  const current = await settings(true);
  const targetLang = targetLangFor(current);
  const decision = resolveProvider(current, {
    pageUrl: location.href,
    sourceLang: current.ui.sourceLang,
    targetLang,
    pageOverrideProviderId: options.providerOverrideId ?? null,
  });

  if (!decision.providerId) {
    broadcast({
      ...lastStatus,
      state: "failed",
      failure: { errorClass: "providerMissing", message: "No provider configured" },
    });
    return;
  }

  const provider = current.providers.find((candidate) => candidate.id === decision.providerId);
  if (!provider) return;

  if (job) job.cancel();

  const budget = new VolumeBudget({
    sessionCapSegments: current.limits.sessionCapSegments,
    sessionCapChars: current.limits.sessionCapChars,
    siteCapSegments: current.limits.siteCaps[location.hostname] ?? 0,
  });

  job = new TranslationJob({
    document,
    root: document.body,
    settings: current,
    providerId: provider.id,
    displayMode: displayModeFor(current),
    displayStyle: displayStyleFor(current),
    targetLang,
    sourceLang: current.ui.sourceLang,
    caller: portClient,
    budget,
    limiter: new RequestLimiter({ maxConcurrency: provider.maxConcurrency }),
    onProgress: (status) => {
      broadcast({ ...status, brokenRules: decision.brokenRules });
    },
    view: window,
  });

  startObserver();

  if (options.elements && options.elements.length > 0) {
    await job.translateElements(options.elements);
  } else {
    await job.run();
  }
}

function startObserver(): void {
  observer?.stop();
  observer = new PageObserver({
    root: document.body,
    onNewContent: (elements: Element[]) => {
      if (!job) return;
      if (job.state === "idle" || job.state === "cancelled") return;
      void job.translateElements(elements);
    },
  });
  observer.start();
}

function restore(): void {
  observer?.stop();
  observer = null;
  if (job) {
    job.restore();
    job = null;
  }
  broadcast({ ...lastStatus, jobId: null, state: "idle", failure: undefined });
}

function handleCommand(command: CommandMessage, sendResponse: (reply: unknown) => void): void {
  switch (command.type) {
    case "translatePage":
      void startTranslation({ ...(command.providerOverrideId ? { providerOverrideId: command.providerOverrideId } : {}) });
      sendResponse({ ok: true });
      return;
    case "toggleTranslation":
      if (job) {
        restore();
      } else {
        void startTranslation();
      }
      sendResponse({ ok: true });
      return;
    case "translateSelection": {
      const blocks = selectedBlocks(document);
      if (blocks.length === 0) {
        sendResponse({ ok: false, errorClass: "selectionEmpty" });
        return;
      }
      void startTranslation({ elements: blocks });
      sendResponse({ ok: true });
      return;
    }
    case "cancelJob":
      job?.cancel();
      portClient.cancelPending();
      sendResponse({ ok: true });
      return;
    case "setDisplayStyle":
      // FR-002: restyle what is already on the page; the next render resolves from storage.
      cachedSettings = null;
      job?.setDisplayStyle(command.style);
      sendResponse({ ok: true });
      return;
    case "setDisplayMode":
      // The page control has always sent this; routing it here keeps the pair consistent.
      job?.setDisplayMode(command.mode);
      sendResponse({ ok: true });
      return;
    case "getJobStatus":
      sendResponse(lastStatus);
      return;
    case "providerChanged":
      cachedSettings = null;
      sendResponse({ ok: true });
      return;
    default:
      sendResponse({ ok: false });
  }
}

chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  if (!raw || typeof raw !== "object") {
    sendResponse({ ok: false });
    return false;
  }
  handleCommand(raw as CommandMessage, sendResponse);
  return true;
});

// Readiness marker: the e2e suite waits for it instead of sleeping.
document.documentElement.dataset["iptReady"] = "1";

if (document.readyState !== "loading") {
  void settings().catch(() => undefined);
}
