import en from "../../_locales/en/messages.json";

/**
 * Every user-visible string is resolved through the catalog (constitution principle V).
 * In an extension page chrome.i18n resolves the active locale; in tests and in any context
 * without the API the source-locale catalog is used, so no string is ever hardcoded at a call
 * site and no string silently disappears.
 */
type Catalog = Record<string, { message: string }>;
type Substitutions = Record<string, string | number>;

const catalog = en as Catalog;

function interpolate(message: string, values: Substitutions): string {
  return message.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export function t(key: string, values: Substitutions = {}): string {
  const runtime = typeof chrome !== "undefined" && chrome.i18n ? chrome.i18n : undefined;
  const fromRuntime = runtime?.getMessage(key, Object.values(values).map(String)) ?? "";
  const raw = fromRuntime || catalog[key]?.message || key;
  return interpolate(raw, values);
}

/** Translate a DOM subtree's data-i18n and data-i18n-* attributes. */
export function localize(root: ParentNode): void {
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = node.dataset["i18n"];
    if (key) node.textContent = t(key);
  }
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    const key = node.dataset["i18nTitle"];
    if (key) node.title = t(key);
  }
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]")) {
    const key = node.dataset["i18nAriaLabel"];
    if (key) node.setAttribute("aria-label", t(key));
  }
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    const key = node.dataset["i18nPlaceholder"];
    if (!key) continue;
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      node.placeholder = t(key);
    }
  }
}
