import { localize, t } from "../shared/i18n.js";
import { clear, el, qs } from "../shared/dom.js";
import { createSettingsStore } from "../../shared/settings.js";
import { matchSite } from "../../shared/routing.js";
import type { DisplayMode, Settings } from "../../shared/types.js";
import type { CommandMessage, JobStatusPayload } from "../../shared/messages.js";

/**
 * Current-page control: trigger, cancel, restore, provider override, display mode and the
 * session's volume record (FR-006, FR-017, FR-028, FR-032).
 */

const store = createSettingsStore();
let settings: Settings;
let status: JobStatusPayload | null = null;
let tabId: number | undefined;
let host = "";
let providerOverride: string | null = null;

const IDLE: JobStatusPayload = {
  jobId: null,
  pageKey: "",
  providerId: null,
  state: "idle",
  counts: { total: 0, translated: 0, failed: 0, skipped: 0, reused: 0 },
  capReached: false,
  skipped: 0,
};

const STATUS_KEY: Record<string, string> = {
  idle: "popupStatusIdle",
  segmenting: "popupStatusSegmenting",
  translating: "popupStatusTranslating",
  completed: "popupStatusCompleted",
  cancelled: "popupStatusCancelled",
  failed: "popupStatusFailed",
};

function errorMessage(errorClass: string): string {
  const key = `error${errorClass.charAt(0).toUpperCase()}${errorClass.slice(1)}`;
  const translated = t(key);
  return translated === key ? t("popupStatusFailed") : translated;
}

async function sendCommand(command: CommandMessage): Promise<unknown> {
  if (tabId === undefined) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, command);
  } catch {
    return null;
  }
}

function displayModeForSite(): DisplayMode {
  const site = settings.sites.find((preference) => matchSite(preference.sitePattern, host));
  return site?.displayMode ?? settings.ui.displayMode;
}

function buildProviderSelect(): void {
  const select = qs<HTMLSelectElement>(document, "#provider");
  clear(select);
  select.append(el("option", { value: "", text: t("popupProviderAuto") }));
  for (const provider of settings.providers.filter((candidate) => candidate.enabled)) {
    select.append(el("option", { value: provider.id, text: provider.name }));
  }
  select.value = "";
}

function buildModeSelect(): void {
  const select = qs<HTMLSelectElement>(document, "#mode");
  select.value = displayModeForSite();
}

function render(): void {
  const current = status ?? IDLE;
  const translateButton = qs<HTMLButtonElement>(document, "#translate");
  const cancelButton = qs<HTMLButtonElement>(document, "#cancel");
  const statusLine = qs<HTMLElement>(document, "#status");
  const failure = qs<HTMLElement>(document, "#failure");
  const broken = qs<HTMLElement>(document, "#broken-rule");
  const cap = qs<HTMLElement>(document, "#cap");
  const usage = qs<HTMLElement>(document, "#usage");

  const active = current.state !== "idle";
  translateButton.textContent = active ? t("popupRestore") : t("popupTranslate");
  translateButton.disabled = settings.providers.filter((provider) => provider.enabled).length === 0 && !active;
  cancelButton.hidden = !(current.state === "translating" || current.state === "segmenting");

  const counts = current.counts;
  statusLine.textContent =
    current.state === "completed"
      ? `${t(STATUS_KEY["completed"] ?? "popupStatusIdle")} · ${counts.translated}`
      : t(STATUS_KEY[current.state] ?? "popupStatusIdle");

  if (current.failure) {
    failure.hidden = false;
    failure.textContent =
      current.failure.errorClass === "providerMissing"
        ? t("popupNoProvider")
        : errorMessage(current.failure.errorClass);
  } else {
    failure.hidden = true;
    failure.textContent = "";
  }

  const brokenRule = current.brokenRules?.[0];
  if (brokenRule) {
    broken.hidden = false;
    broken.textContent = t("popupBrokenRule", {
      rule: brokenRule.rule,
      provider: brokenRule.using || t("popupProviderAuto"),
    });
  } else {
    broken.hidden = true;
    broken.textContent = "";
  }

  if (current.capReached) {
    cap.hidden = false;
    cap.textContent = t("popupCapReached", { count: current.skipped });
  } else {
    cap.hidden = true;
    cap.textContent = "";
  }

  clear(usage);
  const record = current.usage;
  if (record) {
    usage.append(el("li", { text: t("popupUsageSegments", { count: record.segmentsTranslated }) }));
    usage.append(el("li", { text: t("popupUsageCharacters", { count: record.approxChars }) }));
    if (record.reusedSegments > 0) {
      usage.append(el("li", { text: t("popupUsageReused", { count: record.reusedSegments }) }));
    }
  }
  if (counts.skipped > 0) {
    usage.append(el("li", { text: t("popupSkipped", { count: counts.skipped }) }));
  }
  if (counts.failed > 0) {
    usage.append(el("li", { text: t("popupFailedCount", { count: counts.failed }) }));
  }

}

async function persistSitePreference(mode: DisplayMode): Promise<void> {
  await store.save((current) => {
    const existing = current.sites.find((preference) => matchSite(preference.sitePattern, host));
    if (existing) {
      existing.displayMode = mode;
    } else {
      current.sites.push({ sitePattern: host, displayMode: mode, autoTranslate: false });
    }
    current.ui.displayMode = mode;
    return current;
  });
  settings = await store.load();
}

async function boot(): Promise<void> {
  localize(document);

  const query = await chrome.tabs.query({ active: true, currentWindow: true });
  // The panel is normally not a tab at all. When it is opened as one (tests, debugging), it must
  // still act on the page the reader is looking at rather than on itself.
  const tab =
    query.find((candidate) => candidate.url?.startsWith("http")) ??
    query.find((candidate) => !candidate.url?.startsWith("chrome-extension://")) ??
    query[0];
  tabId = tab?.id;
  host = tab?.url ? new URL(tab.url).hostname : "";

  settings = await store.load();
  buildProviderSelect();
  buildModeSelect();

  const reply = (await sendCommand({ type: "getJobStatus" })) as JobStatusPayload | null;
  status = reply ?? null;
  render();

  qs<HTMLSelectElement>(document, "#provider").addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;
    providerOverride = value.length > 0 ? value : null;
  });

  qs<HTMLSelectElement>(document, "#mode").addEventListener("change", (event) => {
    const mode = (event.target as HTMLSelectElement).value as DisplayMode;
    void persistSitePreference(mode).then(() => sendCommand({ type: "setDisplayMode", mode }));
  });

  qs<HTMLButtonElement>(document, "#translate").addEventListener("click", () => {
    if (status && status.state !== "idle") {
      void sendCommand({ type: "toggleTranslation" }).then(() => refreshStatus());
      return;
    }
    void sendCommand({
      type: "translatePage",
      ...(providerOverride ? { providerOverrideId: providerOverride } : {}),
    }).then(() => refreshStatus());
  });

  qs<HTMLButtonElement>(document, "#cancel").addEventListener("click", () => {
    void sendCommand({ type: "cancelJob" }).then(() => refreshStatus());
  });

  qs<HTMLButtonElement>(document, "#settings").addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
  });

  chrome.runtime.onMessage.addListener((raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const command = raw as CommandMessage;
    if (command.type !== "jobUpdated") return;
    status = command.status;
    render();
  });
}

async function refreshStatus(): Promise<void> {
  const reply = (await sendCommand({ type: "getJobStatus" })) as JobStatusPayload | null;
  if (reply) {
    status = reply;
    render();
  }
}

void boot();
