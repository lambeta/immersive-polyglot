import { t } from "../shared/i18n.js";
import { formatAmount, formatTokens } from "../../shared/pricing.js";
import type { SpendRecord } from "../../shared/types.js";

/**
 * Feature 008, panel contract §1–§4: the run's spend as one row of the existing session record —
 * tokens, price and basis together — plus, when no price exists, one muted line naming the reason.
 * Pure DOM: no chrome API, no state, and no live region (a rising figure must not announce itself).
 */

function uiLocale(): string {
  if (typeof chrome !== "undefined" && typeof chrome.i18n?.getUILanguage === "function") {
    return chrome.i18n.getUILanguage();
  }
  return "en";
}

function noteText(spend: SpendRecord): string {
  switch (spend.unavailable) {
    case "noPriceList":
      return t("popupSpendNoPriceList");
    case "modelNotPriced":
      return t("popupSpendModelNotPriced", { model: spend.model ?? "" });
    case "usageIncomplete":
    default:
      return t("popupSpendUsageIncomplete");
  }
}

function element(doc: Document, tag: "li" | "span", className: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  return node;
}

export function renderSpendRow(
  doc: Document,
  spend: SpendRecord | undefined,
  locale: string = uiLocale(),
): HTMLElement[] {
  if (!spend) return [];

  const row = element(doc, "li", "usage__spend");
  const facts = element(doc, "span", "usage__spend-facts");
  const tokens = element(doc, "span", "usage__tokens");
  tokens.textContent = t("popupSpendTokens", { count: formatTokens(spend.tokens.total, locale) });
  facts.append(tokens);

  const price = spend.price;
  if (price) {
    const separator = element(doc, "span", "usage__sep");
    separator.setAttribute("aria-hidden", "true");
    separator.textContent = "·";

    const amount = element(doc, "span", "usage__price");
    const formatted = formatAmount(price.amount, locale);
    amount.textContent =
      price.currency === "CNY"
        ? t("popupSpendPriceCny", { amount: formatted })
        : t("popupSpendPriceUsd", { amount: formatted });

    facts.append(separator, amount);
    row.append(facts);

    const basis = element(doc, "span", "usage__basis");
    basis.textContent = t("popupSpendBasis", {
      provider: price.provider,
      snapshot: price.snapshot,
    });
    row.append(basis);
    return [row];
  }

  const note = element(doc, "span", "usage__note");
  note.textContent = noteText(spend);
  row.append(facts, note);
  return [row];
}
