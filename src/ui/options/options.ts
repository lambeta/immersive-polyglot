import { localize, t } from "../shared/i18n.js";
import { clear, el, formatDate, qs } from "../shared/dom.js";
import { CredentialField } from "../shared/credential-field.js";
import { StylePicker } from "../shared/style-picker.js";
import { previewIcon } from "../shared/style-preview.js";
import { DISPLAY_STYLES, displayStyleById, isDisplayStyleId, resolveDisplayStyle } from "../../shared/display-styles.js";
import { createSettingsStore, defaultSettings, sanitiseTypography } from "../../shared/settings.js";
import { deleteProviderCascade, saveProvider } from "../../shared/providers.js";
import { addEntry } from "../../shared/glossary.js";
import { DEEPSEEK_PRESET } from "./presets.js";
import {
  validateGlossaryEntry,
  validateLanguageCode,
  validateProvider,
  validateSitePattern,
  validateTypography,
} from "../../shared/validation.js";
import type {
  DisplayMode,
  DisplayStyleId,
  GlossaryEntry,
  RoutingRule,
  Settings,
  TranslationProvider,
  TranslationTypography,
} from "../../shared/types.js";
import type { CredentialMaskReply } from "../../shared/messages.js";

/**
 * The configuration surface. Every string here is resolved through the catalog (principle V),
 * every write goes through the settings store's guards, and the credential is write-only: it is
 * sent to storage on save and read back only as a mask through the service worker (FR-021).
 */

const store = createSettingsStore();
let settings: Settings;
let stylePicker: StylePicker | null = null;
let editingProviderId: string | null = null;
let credentialField: CredentialField;

function value(id: string): string {
  return qs<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(document, `#${id}`).value.trim();
}

function checked(id: string): boolean {
  return qs<HTMLInputElement>(document, `#${id}`).checked;
}

function setValue(id: string, next: string | number): void {
  const element = qs<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(document, `#${id}`);
  element.value = String(next);
}

function feedback(id: string, message: string): void {
  qs<HTMLElement>(document, `#${id}`).textContent = message;
}

function clearErrors(form: ParentNode): void {
  for (const node of form.querySelectorAll<HTMLElement>("[data-field-error]")) node.textContent = "";
  for (const input of form.querySelectorAll<HTMLElement>("input, textarea, select")) {
    input.setAttribute("aria-invalid", "false");
  }
}

function showFieldErrors(form: ParentNode, issues: { field: string; messageKey: string }[]): void {
  let first: HTMLElement | null = null;
  for (const issue of issues) {
    const slot = form.querySelector<HTMLElement>(`#error-${issue.field}`);
    if (slot) slot.textContent = t(issue.messageKey);
    const input = form.querySelector<HTMLElement>(`[name="${issue.field}"]`);
    if (input) {
      input.setAttribute("aria-invalid", "true");
      first ??= input;
    }
  }
  first?.focus();
}

async function notifyContent(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "providerChanged" });
  } catch {
    // No receiver is not a failure: the content script reloads settings on its own next command.
  }
}

/* ---------------------------------------------------------------- providers */

function providerListRow(provider: TranslationProvider): HTMLElement {
  const status = provider.lastVerification
    ? provider.lastVerification.ok
      ? t("providerTestOk")
      : t("providerTestFailed", { reason: provider.lastVerification.errorClass ?? "" })
    : t("providerNotVerified");

  const meta = el("div", { class: "meta" }, [
    el("strong", { text: provider.name }),
    el("small", {
      text: [provider.endpoint, provider.model, status].join(" · "),
    }),
    ...(provider.lastVerification
      ? [el("small", { text: t("providerLastVerified", { at: formatDate(provider.lastVerification.at) }) })]
      : []),
    ...(provider.enabled ? [] : [el("small", { text: t("providerEntriesDisabled") })]),
  ]);

  const actions = el("div", { class: "row" }, [
    el("button", { type: "button", "data-action": "edit", "data-id": provider.id }, [t("providerEdit")]),
    el("button", {
      type: "button",
      class: "danger",
      "data-action": "delete",
      "data-id": provider.id,
    }, [t("providerDelete")]),
  ]);

  return el("li", {}, [meta, actions]);
}

async function renderProviders(): Promise<void> {
  const list = qs<HTMLElement>(document, "#provider-list");
  clear(list);
  if (settings.providers.length === 0) {
    list.append(el("li", { text: t("providerListEmpty") }));
    return;
  }
  for (const provider of settings.providers) list.append(providerListRow(provider));
}

async function maskFor(providerId: string): Promise<string | null> {
  try {
    const reply = (await chrome.runtime.sendMessage({
      type: "getCredentialMask",
      providerId,
    })) as CredentialMaskReply | undefined;
    return reply?.masked ?? null;
  } catch {
    return null;
  }
}

async function startEdit(providerId: string): Promise<void> {
  const provider = settings.providers.find((candidate) => candidate.id === providerId);
  if (!provider) return;
  editingProviderId = providerId;
  setValue("provider-id", provider.id);
  setValue("provider-name", provider.name);
  setValue("provider-endpoint", provider.endpoint);
  setValue("provider-model", provider.model);
  setValue("provider-timeout", provider.timeoutMs);
  setValue("provider-concurrency", provider.maxConcurrency);
  setValue(
    "provider-headers",
    Object.entries(provider.extraHeaders)
      .map(([name, headerValue]) => `${name}: ${headerValue}`)
      .join("\n"),
  );
  qs<HTMLInputElement>(document, "#provider-enabled").checked = provider.enabled;
  credentialField.setStoredMask(await maskFor(provider.id));
  qs<HTMLButtonElement>(document, "#provider-cancel").hidden = false;
  qs<HTMLInputElement>(document, "#provider-name").focus();
}

function resetProviderForm(): void {
  editingProviderId = null;
  setValue("provider-id", "");
  setValue("provider-name", "");
  setValue("provider-endpoint", "");
  setValue("provider-model", "");
  setValue("provider-timeout", 60000);
  setValue("provider-concurrency", 3);
  setValue("provider-headers", "");
  qs<HTMLInputElement>(document, "#provider-enabled").checked = true;
  credentialField.clear();
  qs<HTMLButtonElement>(document, "#provider-cancel").hidden = true;
  clearErrors(qs<HTMLElement>(document, "#provider-form"));
}

/**
 * Applies the DeepSeek prefill. Only the three identification fields are touched: the credential
 * is never prefilled, because the user must enter their own and must have acknowledged the
 * disclosure before they can (FR-021, FR-023).
 */
function applyPreset(): void {
  setValue("provider-name", DEEPSEEK_PRESET.draft.name);
  setValue("provider-endpoint", DEEPSEEK_PRESET.draft.endpoint);
  setValue("provider-model", DEEPSEEK_PRESET.draft.model);
  qs<HTMLInputElement>(document, "#provider-credential").focus();
}

function parseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const separator = trimmed.indexOf(":");
    if (separator <= 0) continue;
    headers[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return headers;
}

async function submitProvider(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = qs<HTMLElement>(document, "#provider-form");
  clearErrors(form);
  feedback("provider-feedback", "");

  const draft = {
    name: value("provider-name"),
    endpoint: value("provider-endpoint"),
    model: value("provider-model"),
    extraHeaders: parseHeaders(value("provider-headers")),
    timeoutMs: Number(value("provider-timeout")),
    maxConcurrency: Number(value("provider-concurrency")),
    enabled: checked("provider-enabled"),
  };

  const issues = validateProvider(draft, settings.providers, editingProviderId ?? undefined);
  const secret = credentialField.value;
  if (!editingProviderId && secret.length === 0) {
    issues.push({ field: "credential", messageKey: "providerSecretNotStored" });
  }
  if (issues.length > 0) {
    showFieldErrors(form, issues);
    return;
  }

  const saved = await saveProvider(
    store,
    draft,
    editingProviderId
      ? { id: editingProviderId, ...(secret.length > 0 ? { secret } : {}) }
      : { secret },
  );
  await notifyContent();
  settings = await store.load();
  await renderProviders();
  await renderRouting();
  // Stay on the saved provider so "Test connection" is the obvious next step, and so the
  // credential field keeps showing only its mask.
  await startEdit(saved.id);
  feedback("provider-feedback", `${t("commonSaved")} — ${saved.name}`);
}

async function verifyConnected(providerId: string): Promise<{ ok: boolean; errorClass?: string }> {
  const port = chrome.runtime.connect({ name: "translate" });
  const requestId = `verify_${Date.now()}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      port.disconnect();
      resolve({ ok: false, errorClass: "timeout" });
    }, 30_000);
    port.onMessage.addListener((raw: unknown) => {
      const message = raw as { type?: string; requestId?: string; ok?: boolean; errorClass?: string };
      if (message.type !== "verifyResult" || message.requestId !== requestId) return;
      clearTimeout(timer);
      port.disconnect();
      resolve({ ok: message.ok === true, ...(message.errorClass ? { errorClass: message.errorClass } : {}) });
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(timer);
      resolve({ ok: false, errorClass: "workerUnavailable" });
    });
    port.postMessage({ type: "verifyProvider", requestId, providerId });
  });
}

async function testConnection(): Promise<void> {
  const providerId = editingProviderId ?? settings.providers[0]?.id ?? null;
  if (!providerId) {
    feedback("provider-feedback", t("providerTestNeedsSave"));
    return;
  }
  feedback("provider-feedback", t("popupStatusTranslating"));
  const result = await verifyConnected(providerId);
  settings = await store.load();
  await renderProviders();
  feedback(
    "provider-feedback",
    result.ok ? t("providerTestOk") : t("providerTestFailed", { reason: t(`error${capitalise(result.errorClass ?? "unreachable")}`) }),
  );
}

function capitalise(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

async function deleteProvider(providerId: string): Promise<void> {
  const provider = settings.providers.find((candidate) => candidate.id === providerId);
  if (!provider) return;
  if (!window.confirm(t("providerDeletedConfirm", { name: provider.name }))) return;

  const referenced = settings.routing.rules.filter((rule) => rule.providerId === providerId);
  await deleteProviderCascade(store, providerId);
  await notifyContent();
  settings = await store.load();
  await renderProviders();
  await renderRouting();
  if (referenced.length > 0) {
    feedback(
      "provider-feedback",
      t("providerDeletedRoutes", {
        rules: referenced.map((rule) => (rule.kind === "site" ? rule.match : `${rule.match.sourceLang}→${rule.match.targetLang}`)).join(", "),
      }),
    );
  }
}

/* ---------------------------------------------------------------- routing */

async function renderRouting(): Promise<void> {
  const defaultSelect = qs<HTMLSelectElement>(document, "#routing-default");
  const previous = settings.routing.defaultProviderId ?? "";
  clear(defaultSelect);
  defaultSelect.append(el("option", { value: "", text: t("popupProviderAuto") }));
  for (const provider of settings.providers) {
    defaultSelect.append(el("option", { value: provider.id, text: provider.name }));
  }
  defaultSelect.value = previous;

  const ruleProvider = qs<HTMLSelectElement>(document, "#rule-provider");
  clear(ruleProvider);
  for (const provider of settings.providers.filter((candidate) => candidate.enabled)) {
    ruleProvider.append(el("option", { value: provider.id, text: provider.name }));
  }

  const siteProvider = qs<HTMLSelectElement>(document, "#site-provider");
  clear(siteProvider);
  siteProvider.append(el("option", { value: "", text: t("sitesInherit") }));
  for (const provider of settings.providers.filter((candidate) => candidate.enabled)) {
    siteProvider.append(el("option", { value: provider.id, text: provider.name }));
  }

  const list = qs<HTMLElement>(document, "#rule-list");
  clear(list);
  if (settings.routing.rules.length === 0) {
    list.append(el("li", { text: t("routingEmpty") }));
  }
  for (const rule of settings.routing.rules) {
    list.append(ruleRow(rule));
  }
}

function ruleRow(rule: RoutingRule): HTMLElement {
  const provider = settings.providers.find((candidate) => candidate.id === rule.providerId);
  const broken = !provider || !provider.enabled;
  const label = rule.kind === "site" ? rule.match : `${rule.match.sourceLang} → ${rule.match.targetLang}`;
  const meta = el("div", { class: "meta" }, [
    el("strong", { text: `${t(rule.kind === "site" ? "routingKindSite" : "routingKindPair")}: ${label}` }),
    el("small", { text: provider ? provider.name : t("routingBroken", { provider: rule.providerId }) }),
    ...(broken ? [el("small", { class: "broken", text: t("routingBroken", { provider: rule.providerId }) })] : []),
    ...(rule.enabled ? [] : [el("small", { text: t("providerEntriesDisabled") })]),
  ]);
  const actions = el("div", { class: "row" }, [
    el("button", { type: "button", "data-action": "delete-rule", "data-id": rule.id }, [t("routingDelete")]),
  ]);
  return el("li", {}, [meta, actions]);
}

async function addRule(): Promise<void> {
  feedback("rule-feedback", "");
  const kind = value("rule-kind") as "site" | "languagePair";
  const providerId = value("rule-provider");
  if (providerId.length === 0) {
    feedback("rule-feedback", t("commonInvalidProviderRef"));
    return;
  }

  let rule: RoutingRule;
  if (kind === "site") {
    const issue = validateSitePattern(value("rule-site"));
    if (issue) {
      feedback("rule-feedback", t(issue.messageKey));
      return;
    }
    rule = {
      id: `r_${crypto.randomUUID().slice(0, 8)}`,
      kind: "site",
      match: value("rule-site"),
      providerId,
      enabled: true,
    };
  } else {
    const sourceIssue = validateLanguageCode(value("rule-source"), "rule-source");
    const targetIssue = validateLanguageCode(value("rule-target"), "rule-target");
    if (sourceIssue || targetIssue) {
      feedback("rule-feedback", t("commonInvalidLang"));
      return;
    }
    rule = {
      id: `r_${crypto.randomUUID().slice(0, 8)}`,
      kind: "languagePair",
      match: { sourceLang: value("rule-source"), targetLang: value("rule-target") },
      providerId,
      enabled: true,
    };
  }

  await store.save((current) => {
    current.routing.rules.push(rule);
    return current;
  });
  await notifyContent();
  settings = await store.load();
  await renderRouting();
}

/* ---------------------------------------------------------------- sites */

async function renderSites(): Promise<void> {
  const list = qs<HTMLElement>(document, "#site-list");
  clear(list);
  if (settings.sites.length === 0) list.append(el("li", { text: t("sitesEmpty") }));
  for (const site of settings.sites) {
    const meta = el("div", { class: "meta" }, [
      el("strong", { text: site.sitePattern }),
      el("small", {
        text: [
          site.targetLang ? `→ ${site.targetLang}` : "",
          site.displayMode ? t(`popupMode${capitalise(site.displayMode)}`) : "",
          site.displayStyle ? t(displayStyleById(resolveDisplayStyle(site.displayStyle)).nameKey) : "",
          site.autoTranslate ? t("sitesAuto") : "",
        ]
          .filter(Boolean)
          .join(" · "),
      }),
    ]);
    const actions = el("div", { class: "row" }, [
      el("button", { type: "button", "data-action": "delete-site", "data-id": site.sitePattern }, [t("sitesDelete")]),
    ]);
    list.append(el("li", {}, [meta, actions]));
  }

  const styleSelect = qs<HTMLSelectElement>(document, "#site-style");
  const previousStyle = styleSelect.value;
  clear(styleSelect);
  styleSelect.append(el("option", { value: "", text: t("displayStyleInherit") }));
  for (const style of DISPLAY_STYLES) {
    styleSelect.append(el("option", { value: style.id, text: t(style.nameKey) }));
  }
  styleSelect.value = isDisplayStyleId(previousStyle) ? previousStyle : "";

  setValue("ui-source", settings.ui.sourceLang);
  setValue("ui-target", settings.ui.targetLang);
  qs<HTMLSelectElement>(document, "#ui-mode").value = settings.ui.displayMode;
}

async function saveSite(): Promise<void> {
  feedback("site-feedback", "");
  const pattern = value("site-pattern");
  const issue = validateSitePattern(pattern);
  if (issue) {
    feedback("site-feedback", t(issue.messageKey));
    return;
  }
  const target = value("site-target");
  if (target.length > 0) {
    const langIssue = validateLanguageCode(target, "site-target");
    if (langIssue) {
      feedback("site-feedback", t("commonInvalidLang"));
      return;
    }
  }

  const chosenStyle = value("site-style");
  await store.save((current) => {
    const existing = current.sites.find((preference) => preference.sitePattern === pattern);
    const next = {
      sitePattern: pattern,
      ...(target.length > 0 ? { targetLang: target } : {}),
      displayMode: value("site-mode") as DisplayMode,
      providerId: value("site-provider") || null,
      autoTranslate: checked("site-auto"),
      ...(isDisplayStyleId(chosenStyle) ? { displayStyle: chosenStyle } : {}),
    };
    if (existing) {
      Object.assign(existing, next);
      if (!isDisplayStyleId(chosenStyle)) delete existing.displayStyle;
    } else {
      current.sites.push(next);
    }
    return current;
  });
  await notifyContent();
  settings = await store.load();
  await renderSites();
  feedback("site-feedback", t("commonSaved"));
}

/* ---------------------------------------------------------------- glossary */

async function renderGlossary(): Promise<void> {
  const list = qs<HTMLElement>(document, "#glossary-list");
  clear(list);
  if (settings.glossary.length === 0) list.append(el("li", { text: t("glossaryEmpty") }));
  for (const entry of settings.glossary) {
    const meta = el("div", { class: "meta" }, [
      el("strong", { text: `${entry.sourceTerm} → ${entry.targetTerm}` }),
      el("small", {
        text: `${entry.sourceLang} → ${entry.targetLang}${entry.caseSensitive ? " · " + t("glossaryCaseSensitive") : ""}`,
      }),
    ]);
    const actions = el("div", { class: "row" }, [
      el("button", { type: "button", "data-action": "delete-glossary", "data-term": entry.sourceTerm, "data-source": entry.sourceLang, "data-target": entry.targetLang }, [t("glossaryDelete")]),
    ]);
    list.append(el("li", {}, [meta, actions]));
  }
}

async function addGlossary(): Promise<void> {
  feedback("glossary-feedback", "");
  const entry: GlossaryEntry = {
    sourceTerm: value("glossary-source-term"),
    targetTerm: value("glossary-target-term"),
    sourceLang: value("glossary-source-lang") || settings.ui.sourceLang,
    targetLang: value("glossary-target-lang") || settings.ui.targetLang,
    caseSensitive: checked("glossary-case"),
  };

  const issues = validateGlossaryEntry(entry, settings.glossary);
  if (issues.length > 0) {
    feedback(
      "glossary-feedback",
      issues[0]?.messageKey === "glossaryConflict"
        ? t("glossaryConflict", { term: entry.sourceTerm })
        : t(issues[0]?.messageKey ?? "commonRequired"),
    );
    return;
  }

  try {
    const result = addEntry(settings.glossary, entry);
    await store.save((current) => {
      current.glossary = result.entries;
      return current;
    });
  } catch (error) {
    feedback("glossary-feedback", t("commonRequired"));
    void error;
    return;
  }
  settings = await store.load();
  await renderGlossary();
  setValue("glossary-source-term", "");
  setValue("glossary-target-term", "");
}

/* ---------------------------------------------------------------- privacy, limits, diagnostics */

async function deleteAllData(): Promise<void> {
  if (!window.confirm(t("privacyDeleteAllConfirm"))) return;
  const remaining = await store.deleteAll();
  if (remaining.length === 0) {
    feedback("privacy-feedback", t("privacyDeleteAllDone"));
    // Render from defaults rather than reloading: a read would legitimately re-write the schema
    // version and the profile would no longer be empty (FR-024).
    settings = defaultSettings();
    await renderAll();
    return;
  }
  feedback("privacy-feedback", t("privacyDeleteAllFailed", { keys: remaining.join(", ") }));
  settings = await store.load();
  await renderAll();
}

async function clearLog(): Promise<void> {
  await chrome.runtime.sendMessage({ type: "clearLogs" });
  feedback("privacy-feedback", t("privacyClearLogDone"));
}

async function saveLimits(): Promise<void> {
  await store.save((current) => {
    current.limits.sessionCapSegments = Math.max(0, Math.floor(Number(value("session-cap")) || 0));
    current.limits.sessionCapChars = Math.max(0, Math.floor(Number(value("char-cap")) || 0));
    return current;
  });
  settings = await store.load();
  feedback("limits-feedback", t("commonSaved"));
}

async function renderSiteCaps(): Promise<void> {
  const list = qs<HTMLElement>(document, "#site-cap-list");
  clear(list);
  for (const [pattern, cap] of Object.entries(settings.limits.siteCaps)) {
    const meta = el("div", { class: "meta" }, [
      el("strong", { text: pattern }),
      el("small", { text: t("limitsSite") + ": " + cap }),
    ]);
    const actions = el("div", { class: "row" }, [
      el("button", { type: "button", "data-action": "delete-sitecap", "data-id": pattern }, [t("commonDelete")]),
    ]);
    list.append(el("li", {}, [meta, actions]));
  }
}

async function saveSiteCap(): Promise<void> {
  const pattern = value("site-cap-pattern");
  const issue = validateSitePattern(pattern);
  if (issue) {
    feedback("limits-feedback", t(issue.messageKey));
    return;
  }
  await store.save((current) => {
    current.limits.siteCaps[pattern] = Math.max(0, Math.floor(Number(value("site-cap-value")) || 0));
    return current;
  });
  settings = await store.load();
  await renderSiteCaps();
  feedback("limits-feedback", t("commonSaved"));
}

async function renderDiagnostics(): Promise<void> {
  const list = qs<HTMLElement>(document, "#diagnostics-list");
  clear(list);
  const raw = await store.readRaw();
  const keys = Object.keys(raw).sort();
  if (keys.length === 0) {
    list.append(el("dt", { text: t("diagnosticsEmpty") }), el("dd", { text: "" }));
    return;
  }
  for (const key of keys) {
    let shown: unknown = raw[key];
    if (key === "credentials") {
      const masks: Record<string, string> = {};
      for (const providerId of Object.keys(settings.credentials)) {
        const mask = await maskFor(providerId);
        if (mask) masks[providerId] = mask;
      }
      shown = masks;
    }
    list.append(el("dt", { text: key }), el("dd", { text: JSON.stringify(shown) }));
  }
}

/* ---------------------------------------------------------------- boot */

async function renderAll(): Promise<void> {
  await renderProviders();
  await renderRouting();
  await renderSites();
  await renderGlossary();
  await renderSiteCaps();
  renderDisplayPanel();
  setValue("style-instruction", settings.style.instruction);
  setValue("style-temperature", settings.style.temperature);
  setValue("session-cap", settings.limits.sessionCapSegments);
  setValue("char-cap", settings.limits.sessionCapChars);
  await renderDiagnostics();
}

/* ---------------------------------------------------------------- display style */

function renderDisplayPanel(): void {
  const host = qs<HTMLElement>(document, "#display-style-picker");
  if (!stylePicker) {
    stylePicker = new StylePicker({
      name: "display-style",
      legend: t("displayStyleLabel"),
      showSample: true,
      sampleText: t("displayStyleSample"),
      showIcons: true,
      iconFor: previewIcon,
    });
    clear(host);
    host.append(stylePicker.element);
  }
  stylePicker.setValue(settings.ui.displayStyle);
  setValue("translation-font-family", settings.ui.translationFontFamily ?? "");
  setValue("translation-font-scale", settings.ui.translationFontScale ?? 100);
  applySampleTypography();
}

/** The sample line inside the picker; the same element pairs style with typography (FR-022). */
function sampleElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".ipt-style-sample");
}

function currentTypography(): TranslationTypography {
  const scale = qs<HTMLInputElement>(document, "#translation-font-scale").valueAsNumber;
  return {
    fontFamily: value("translation-font-family"),
    fontScale: Number.isFinite(scale) ? scale : Number.NaN,
  };
}

/** FR-022: the sample shows the entered family and size before anything is saved. */
function applySampleTypography(): void {
  const sample = sampleElement();
  if (!sample) return;
  const { fontFamily, fontScale } = currentTypography();
  const family = sanitiseTypography({ fontFamily, fontScale }).fontFamily;
  if (family.length === 0) sample.style.removeProperty("font-family");
  else sample.style.setProperty("font-family", family);
  if (Number.isFinite(fontScale) && fontScale !== 100) {
    sample.style.setProperty("font-size", `${fontScale}%`);
  } else {
    sample.style.removeProperty("font-size");
  }
}

async function notifyStyleChanged(style: DisplayStyleId): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "styleChanged", style });
  } catch {
    // No receiver is not a failure: the next render resolves the style from storage.
  }
}

async function notifyTypographyChanged(typography: TranslationTypography): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "typographyChanged", typography });
  } catch {
    // No receiver is not a failure: the next render resolves the value from storage.
  }
}

/** FR-017/FR-018/FR-019/FR-021: one save path for the style, the family, the size and Reset. */
async function saveDisplaySettings(): Promise<void> {
  const panel = qs<HTMLElement>(document, "#panel-display");
  const entered = currentTypography();
  const issues = validateTypography(entered);
  clearErrors(panel);
  if (issues.length > 0) {
    showFieldErrors(panel, issues);
    feedback("display-style-feedback", t(issues[0]?.messageKey ?? "displayFontInvalid"));
    return;
  }

  const style = stylePicker?.value ?? "none";
  const previous = settings.ui;
  const typography = sanitiseTypography(entered);
  await store.save((current) => {
    current.ui.displayStyle = style;
    current.ui.translationFontFamily = typography.fontFamily;
    current.ui.translationFontScale = typography.fontScale;
    return current;
  });
  settings = await store.load();

  const typographyChanged =
    previous.translationFontFamily !== typography.fontFamily ||
    previous.translationFontScale !== typography.fontScale;
  await notifyStyleChanged(style);
  await notifyTypographyChanged(typography);
  setValue("translation-font-family", typography.fontFamily);
  setValue("translation-font-scale", typography.fontScale);
  applySampleTypography();
  feedback(
    "display-style-feedback",
    t(typographyChanged ? "displayTypographySaved" : "displayStyleSaved"),
  );
}

function resetTypography(): void {
  setValue("translation-font-family", "");
  setValue("translation-font-scale", 100);
  applySampleTypography();
  void saveDisplaySettings();
}

function wireTabs(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".tabs button"));
  for (const button of buttons) {
    button.addEventListener("click", () => {
      for (const other of buttons) {
        const expanded = other === button;
        other.setAttribute("aria-expanded", String(expanded));
        const panel = document.getElementById(other.getAttribute("aria-controls") ?? "");
        if (panel) panel.hidden = !expanded;
      }
      if (button.getAttribute("aria-controls") === "panel-diagnostics") void renderDiagnostics();
    });
  }
}

function wireForms(): void {
  const acknowledge = qs<HTMLInputElement>(document, "#acknowledge");
  const credentialInput = qs<HTMLInputElement>(document, "#provider-credential");
  credentialField = new CredentialField({ input: credentialInput, acknowledgement: acknowledge });

  qs<HTMLElement>(document, "#provider-form").addEventListener("submit", (event) => {
    void submitProvider(event as SubmitEvent);
  });
  qs<HTMLButtonElement>(document, "#provider-test").addEventListener("click", () => void testConnection());
  qs<HTMLButtonElement>(document, "#provider-cancel").addEventListener("click", () => resetProviderForm());
  qs<HTMLButtonElement>(document, "#provider-preset").addEventListener("click", () => applyPreset());

  qs<HTMLElement>(document, "#provider-list").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");
    if (!action || !id) return;
    if (action === "edit") void startEdit(id);
    if (action === "delete") void deleteProvider(id);
  });

  qs<HTMLElement>(document, "#routing-default").addEventListener("change", async (event) => {
    const providerId = (event.target as HTMLSelectElement).value || null;
    await store.save((current) => {
      current.routing.defaultProviderId = providerId;
      return current;
    });
    await notifyContent();
    settings = await store.load();
  });

  qs<HTMLElement>(document, "#rule-kind").addEventListener("change", (event) => {
    const kind = (event.target as HTMLSelectElement).value;
    qs<HTMLElement>(document, "#rule-site-field").hidden = kind !== "site";
    qs<HTMLElement>(document, "#rule-pair-fields").hidden = kind === "site";
  });

  qs<HTMLElement>(document, "#rule-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void addRule();
  });

  qs<HTMLElement>(document, "#rule-list").addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute("data-action") !== "delete-rule") return;
    const id = target.getAttribute("data-id");
    if (!id) return;
    await store.save((current) => {
      current.routing.rules = current.routing.rules.filter((rule) => rule.id !== id);
      return current;
    });
    await notifyContent();
    settings = await store.load();
    await renderRouting();
  });

  qs<HTMLElement>(document, "#site-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSite();
  });

  qs<HTMLElement>(document, "#site-list").addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute("data-action") !== "delete-site") return;
    const pattern = target.getAttribute("data-id");
    if (!pattern) return;
    await store.save((current) => {
      current.sites = current.sites.filter((preference) => preference.sitePattern !== pattern);
      return current;
    });
    await notifyContent();
    settings = await store.load();
    await renderSites();
  });

  qs<HTMLButtonElement>(document, "#ui-save").addEventListener("click", async () => {
    const sourceIssue = validateLanguageCode(value("ui-source") || "auto", "ui-source");
    const targetIssue = validateLanguageCode(value("ui-target") || "zh", "ui-target");
    if (sourceIssue || targetIssue) {
      feedback("ui-feedback", t("commonInvalidLang"));
      return;
    }
    await store.save((current) => {
      current.ui.sourceLang = value("ui-source") || "auto";
      current.ui.targetLang = value("ui-target") || "zh";
      current.ui.displayMode = value("ui-mode") as DisplayMode;
      return current;
    });
    await notifyContent();
    settings = await store.load();
    feedback("ui-feedback", t("commonSaved"));
  });

  qs<HTMLElement>(document, "#glossary-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void addGlossary();
  });

  qs<HTMLElement>(document, "#glossary-list").addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute("data-action") !== "delete-glossary") return;
    const term = target.getAttribute("data-term");
    const source = target.getAttribute("data-source");
    const targetLang = target.getAttribute("data-target");
    await store.save((current) => {
      current.glossary = current.glossary.filter(
        (entry) =>
          !(entry.sourceTerm === term && entry.sourceLang === source && entry.targetLang === targetLang),
      );
      return current;
    });
    settings = await store.load();
    await renderGlossary();
  });

  qs<HTMLButtonElement>(document, "#display-style-save").addEventListener("click", () => {
    void saveDisplaySettings();
  });
  qs<HTMLButtonElement>(document, "#display-typography-reset").addEventListener("click", () => {
    resetTypography();
  });
  for (const id of ["translation-font-family", "translation-font-scale"]) {
    qs<HTMLInputElement>(document, `#${id}`).addEventListener("input", () => applySampleTypography());
  }

  qs<HTMLButtonElement>(document, "#style-save").addEventListener("click", async () => {
    await store.save((current) => {
      current.style.instruction = value("style-instruction");
      current.style.temperature = Math.min(1, Math.max(0, Number(value("style-temperature")) || 0));
      return current;
    });
    settings = await store.load();
    feedback("style-feedback", t("styleSaved"));
  });

  qs<HTMLButtonElement>(document, "#delete-all").addEventListener("click", () => void deleteAllData());
  qs<HTMLButtonElement>(document, "#clear-log").addEventListener("click", () => void clearLog());
  qs<HTMLButtonElement>(document, "#limits-save").addEventListener("click", () => void saveLimits());
  qs<HTMLButtonElement>(document, "#site-cap-save").addEventListener("click", () => void saveSiteCap());
  qs<HTMLButtonElement>(document, "#diagnostics-refresh").addEventListener("click", () => void renderDiagnostics());

  qs<HTMLElement>(document, "#site-cap-list").addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute("data-action") !== "delete-sitecap") return;
    const pattern = target.getAttribute("data-id");
    if (!pattern) return;
    await store.save((current) => {
      delete current.limits.siteCaps[pattern];
      return current;
    });
    settings = await store.load();
    await renderSiteCaps();
  });
}

async function boot(): Promise<void> {
  localize(document);
  settings = await store.load();
  wireTabs();
  wireForms();
  await renderAll();

  // FR-005: a change made in the page control is reflected here without a reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    // A key that was removed (delete-all) is not a new value to load: reloading here would write
    // the schema version straight back and make the wipe look partial (FR-021, SC-013).
    const uiChanged = changes["ui"]?.newValue !== undefined;
    const sitesChanged = changes["sites"]?.newValue !== undefined;
    if (!uiChanged && !sitesChanged) return;
    void store.load().then((next) => {
      settings = next;
      stylePicker?.setValue(next.ui.displayStyle);
      setValue("translation-font-family", next.ui.translationFontFamily ?? "");
      setValue("translation-font-scale", next.ui.translationFontScale ?? 100);
      applySampleTypography();
    });
  });

  // A fresh profile starts on the product's expected default provider (DeepSeek), with the
  // credential still blank. The user can overwrite any field or pick another endpoint entirely.
  if (settings.providers.length === 0 && editingProviderId === null) applyPreset();
}

void boot();
