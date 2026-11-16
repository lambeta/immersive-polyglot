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
import { resolveTypography } from "../shared/settings.js";
import type { DisplayMode, DisplayStyleId, ErrorClass, Settings } from "../shared/types.js";
import { RequestLimiter, VolumeBudget } from "./limiter.js";
import { PageObserver } from "./observer.js";
import { PageRun } from "./page-run.js";
import { ScrollAnchor } from "./scroll-anchor.js";
import { ViewportWatcher } from "./viewport.js";
import { TranslationJob, type BatchCaller, type BatchReply, type BatchRequestPayload, type JobResult } from "./job.js";
import { RunSlot, sameTarget, type RunOutcome, type RunTarget } from "./run-slot.js";
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
      pending.resolve({
        results: response.results,
        failedIndices: [],
        ...(response.usage ? { usage: response.usage } : {}),
      });
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

/** The block elements the segmenter can turn into passages; observed so scrolling reports cheaply. */
const PASSAGE_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt, figcaption, caption, summary";

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
/** The open page run (feature 007): rounds driven by the reader's demand window. */
let pageRun: PageRun | null = null;
let watcher: ViewportWatcher | null = null;
/** The page's single run slot: at most one run, however often the reader activates (data-model §1). */
const slot = new RunSlot();
/** What the current — or last finished — run was claimed for; supplies `sameTarget` (data-model §2). */
let claimedTarget: RunTarget | null = null;
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

interface Activation {
  absorbed: boolean;
  reason?: "running" | "repeat";
}

/**
 * Claim the page's run slot **synchronously**, then continue asynchronously unless the activation was
 * absorbed. The claim happens before the first `await`, which is what stops two rapid activations
 * from both starting a run (FR-001..FR-003; research R3).
 */
function activate(
  options: { providerOverrideId?: string; elements?: Element[] } = {},
): Activation {
  const requested: RunTarget =
    options.elements && options.elements.length > 0
      ? { kind: "selection", elements: options.elements }
      : { kind: "page" };

  const decision = slot.claim({ sameTarget: sameTarget(claimedTarget, requested) });
  // FR-013: an absorbed activation returns here — before settings(true), before resolveProvider,
  // before new VolumeBudget(...) and before any TranslationJob. It reads no storage, segments
  // nothing, requests nothing and consumes no allowance; the ordering is the guarantee.
  if (decision === "absorb-running") return { absorbed: true, reason: "running" };
  if (decision === "absorb-repeat") return { absorbed: true, reason: "repeat" };

  if (decision === "replace") {
    // At most one journal has ever written to this page: discard the previous run's output first,
    // so the page never holds output from two runs (FR-008; research R5).
    watcher?.stop();
    watcher = null;
    pageRun?.stop();
    pageRun = null;
    if (job) {
      job.cancel();
      job.restore();
      job = null;
    }
    observer?.stop();
    observer = null;
  }

  claimedTarget = requested;
  void runTranslation(requested, options).catch(() => {
    // A thrown continuation must never leave the slot in "starting", or every later press is absorbed.
    slot.settle("failed");
  });
  return { absorbed: false };
}

async function runTranslation(
  requested: RunTarget,
  options: { providerOverrideId?: string; elements?: Element[] },
): Promise<void> {
  const unsupported = unsupportedReason();
  if (unsupported) {
    slot.settle("failed");
    broadcast({
      ...lastStatus,
      state: "failed",
      failure: { errorClass: unsupported as ErrorClass, message: unsupported },
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
    slot.settle("failed");
    broadcast({
      ...lastStatus,
      state: "failed",
      failure: { errorClass: "providerMissing", message: "No provider configured" },
    });
    return;
  }

  const provider = current.providers.find((candidate) => candidate.id === decision.providerId);
  if (!provider) {
    slot.settle("failed");
    return;
  }

  // FR-027: the guard pins the reader's place around every mutation that can change page height.
  const anchor = new ScrollAnchor({ view: window });

  const budget = new VolumeBudget({
    sessionCapSegments: current.limits.sessionCapSegments,
    sessionCapChars: current.limits.sessionCapChars,
    siteCapSegments: current.limits.siteCaps[location.hostname] ?? 0,
  });

  const runJob = new TranslationJob({
    document,
    root: document.body,
    settings: current,
    providerId: provider.id,
    displayMode: displayModeFor(current),
    displayStyle: displayStyleFor(current),
    typography: resolveTypography(current),
    targetLang,
    sourceLang: current.ui.sourceLang,
    caller: portClient,
    budget,
    limiter: new RequestLimiter({ maxConcurrency: provider.maxConcurrency }),
    onProgress: (status) => {
      broadcast({ ...status, brokenRules: decision.brokenRules });
    },
    view: window,
    beforeMutation: () => anchor.capture(),
    afterMutation: () => anchor.restore(),
  });
  job = runJob;
  slot.markRunning();

  // A page run needs the whole document segmented so the demand window can filter it. A selection
  // is its own scope: collecting the page there would translate everything, not the selection.
  if (requested.kind === "page") runJob.collect();

  startObserver();

  let outcome: RunOutcome = "failed";
  try {
    if (requested.kind === "selection" && options.elements && options.elements.length > 0) {
      // A selection is an explicit target: it is its own window, whatever its visibility (FR-035).
      const result: JobResult = await runJob.translateElements(options.elements);
      outcome = result.state === "cancelled" ? "cancelled" : result.failure ? "failed" : "completed";
    } else {
      // A page run stays open: this resolves when the demand the reader has reached is drained.
      const run = new PageRun({
        job: runJob,
        document,
        view: window,
        ceiling: provider.maxConcurrency,
        pageVisible: () => watcher?.pageVisible() ?? true,
      });
      pageRun = run;
      const viewportWatcher = new ViewportWatcher({
        document,
        view: window,
        onChange: () => {
          // The round defers itself while the page is hidden (FR-016) and runs when it returns.
          if (pageRun === run && !run.stopped) void run.round();
        },
        lookaheadPx: () => window.innerHeight,
      });
      watcher = viewportWatcher;
      viewportWatcher.start();
      await run.start();
      if (runJob.state === "cancelled") outcome = "cancelled";
      else outcome = runJob.result().failure ? "failed" : "completed";
      viewportWatcher.observe(Array.from(document.querySelectorAll(PASSAGE_SELECTOR)));
    }
  } finally {
    slot.settle(outcome);
  }
}

/**
 * Late content (FR-018): arriving is not a reason to pay for a translation. New passages are
 * collected, and the demand window decides — on screen means now, further down means when the
 * reader gets there.
 */
function startObserver(): void {
  observer?.stop();
  observer = new PageObserver({
    root: document.body,
    onNewContent: (elements: Element[]) => {
      if (!job) return;
      if (job.state === "cancelled") return;
      const run = pageRun;
      if (!run || run.stopped) {
        // No open page run (a selection was translated): keep the old whole-target behaviour.
        void job.translateElements(elements);
        return;
      }
      for (const element of elements) job.collect(element);
      watcher?.observe(elements);
      void run.round();
    },
  });
  observer.start();
}

function restore(): void {
  observer?.stop();
  observer = null;
  watcher?.stop();
  watcher = null;
  pageRun?.stop();
  pageRun = null;
  if (job) {
    // Stop the run before replaying: a reply still on the wire must not render into a restored page
    // (FR-011). The journal is the only restoration mechanism (FR-010).
    job.cancel();
    portClient.cancelPending();
    job.restore();
    job = null;
  }
  // The slot describes a page that no longer holds a translation: the next activation starts clean
  // (data-model I4).
  slot.reset();
  claimedTarget = null;
  // Feature 008 FR-019: the run's record, spend included, belongs to the run. A restored page has
  // none of it, so the idle status carries no counts, no provider and no usage forward.
  broadcast({
    ...lastStatus,
    jobId: null,
    providerId: null,
    state: "idle",
    counts: { total: 0, translated: 0, failed: 0, skipped: 0, reused: 0 },
    capReached: false,
    skipped: 0,
    failure: undefined,
    usage: undefined,
  });
}

/**
 * The reply of an activation. `absorbed` is diagnostic: no shipped surface displays it, and the status
 * broadcast stays the only state the reader sees (contracts/activation-lifecycle.md §5).
 */
function replyFor(activation: Activation): { ok: true; absorbed?: true; reason?: "running" | "repeat" } {
  if (!activation.absorbed) return { ok: true };
  return {
    ok: true,
    absorbed: true,
    ...(activation.reason ? { reason: activation.reason } : {}),
  };
}

function handleCommand(command: CommandMessage, sendResponse: (reply: unknown) => void): void {
  switch (command.type) {
    case "translatePage": {
      const activation = activate({
        ...(command.providerOverrideId ? { providerOverrideId: command.providerOverrideId } : {}),
      });
      sendResponse(replyFor(activation));
      return;
    }
    case "toggleTranslation":
      if (job) {
        restore();
        sendResponse({ ok: true });
        return;
      }
      sendResponse(replyFor(activate()));
      return;
    case "translateSelection": {
      const blocks = selectedBlocks(document);
      if (blocks.length === 0) {
        sendResponse({ ok: false, errorClass: "selectionEmpty" });
        return;
      }
      sendResponse(replyFor(activate({ elements: blocks })));
      return;
    }
    case "cancelJob":
      // FR-024: stopping drops queued rounds and removes every mark; rendered text stays restorable.
      pageRun?.stop();
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
    case "setTypography":
      // Feature 004 FR-019: restyle what is already on the page, never request a translation.
      cachedSettings = null;
      job?.setTypography(command.typography);
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