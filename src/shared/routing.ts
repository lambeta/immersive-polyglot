import type {
  LanguagePairRoutingRule,
  RoutingRule,
  Settings,
  SiteRoutingRule,
  TranslationProvider,
} from "./types.js";

/**
 * Deterministic provider resolution (FR-005, FR-032). The order is fixed and tested:
 * page override -> language-pair rule -> site rule -> global default. A rule that cannot be
 * honoured is never a hard failure: it is reported and evaluation continues, because a stale
 * rule must not stop a user from reading a page (US3 scenario 4).
 */

export type RouteReason = "pageOverride" | "languagePair" | "site" | "default" | "fallback" | "none";

export interface RouteRequest {
  pageUrl: string;
  sourceLang: string;
  targetLang: string;
  /** One-page override; it is never written back to settings. */
  pageOverrideProviderId?: string | null;
}

export interface BrokenRule {
  rule: string;
  provider: string;
  using: string;
}

export interface RouteDecision {
  providerId: string | null;
  reason: RouteReason;
  brokenRules: BrokenRule[];
}

const WILDCARD_LABEL = "*.";
const ANY_HOST = "*";
/** Diagnostic names for decisions that have no match string of their own. */
const OVERRIDE_LABEL = "pageOverride";
const DEFAULT_LABEL = "default";

function normaliseHost(value: string): string {
  const lower = value.trim().toLowerCase();
  const withoutWww = lower.startsWith("www.") ? lower.slice(4) : lower;
  return withoutWww.replace(/\.+$/, "");
}

function normalisePath(value: string): string {
  const lower = value.trim().toLowerCase();
  return lower.length > 1 ? lower.replace(/\/+$/, "") : lower;
}

interface SiteTarget {
  host: string;
  path: string;
}

function splitSiteTarget(value: string): SiteTarget {
  const slash = value.trim().indexOf("/");
  if (slash < 0) return { host: normaliseHost(value), path: "" };
  return { host: normaliseHost(value.slice(0, slash)), path: normalisePath(value.slice(slash)) };
}

function hostMatches(patternHost: string, host: string): boolean {
  if (!patternHost || !host) return false;
  if (patternHost === ANY_HOST) return true;
  if (!patternHost.startsWith(WILDCARD_LABEL)) return patternHost === host;
  const base = patternHost.slice(WILDCARD_LABEL.length);
  // The wildcard stands for at least one label, so "*.example" never covers "example" itself.
  return base.length > 0 && host.endsWith(`.${base}`);
}

function pathMatches(patternPath: string, path: string): boolean {
  if (!patternPath) return true;
  // A segment boundary is required so "news.example/section" cannot claim "/sections".
  return path === patternPath || path.startsWith(`${patternPath}/`);
}

/**
 * Matches a stored site pattern against a host, or a host plus path when the pattern
 * carries a path of its own.
 */
export function matchSite(pattern: string, host: string): boolean {
  const site = splitSiteTarget(pattern);
  const target = splitSiteTarget(host);
  return hostMatches(site.host, target.host) && pathMatches(site.path, target.path);
}

/** Host used for per-site preferences and matching: lowercase, no leading "www.", no path. */
export function siteHostOf(url: string): string {
  try {
    return normaliseHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function siteTargetOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "";
  }
}

function hasPath(pattern: string): boolean {
  return pattern.includes("/");
}

function pairMatches(rule: LanguagePairRoutingRule, request: RouteRequest): boolean {
  const { sourceLang, targetLang } = rule.match;
  if (targetLang !== request.targetLang) return false;
  // "auto" on the rule side means "any source language"; on the request side it means the page
  // language is not known yet, so a concrete pair cannot be claimed.
  return sourceLang === "auto" || sourceLang === request.sourceLang;
}

function pairLabel(rule: LanguagePairRoutingRule): string {
  return `${rule.match.sourceLang}\u2192${rule.match.targetLang}`;
}

/** Matching site rules, most specific first: longer pattern, then one with a path, then newest. */
function matchingSiteRules(rules: RoutingRule[], pageUrl: string): SiteRoutingRule[] {
  const target = siteTargetOf(pageUrl);
  const matching: { rule: SiteRoutingRule; index: number }[] = [];
  rules.forEach((rule, index) => {
    if (rule.kind !== "site" || !rule.enabled || !matchSite(rule.match, target)) return;
    matching.push({ rule, index });
  });
  matching.sort((a, b) => {
    const byLength = b.rule.match.length - a.rule.match.length;
    if (byLength !== 0) return byLength;
    const byPath = Number(hasPath(b.rule.match)) - Number(hasPath(a.rule.match));
    if (byPath !== 0) return byPath;
    return b.index - a.index;
  });
  return matching.map((entry) => entry.rule);
}

export function resolveProvider(settings: Settings, request: RouteRequest): RouteDecision {
  const byId = new Map<string, TranslationProvider>(
    settings.providers.map((provider) => [provider.id, provider]),
  );
  const usable = (providerId: string): TranslationProvider | null => {
    const found = byId.get(providerId);
    return found && found.enabled ? found : null;
  };
  const reported: { rule: string; provider: string }[] = [];
  const report = (rule: string, provider: string): void => {
    reported.push({ rule, provider });
  };
  const decide = (providerId: string | null, reason: RouteReason): RouteDecision => ({
    providerId,
    reason,
    // "using" is only knowable once the whole chain has been walked.
    brokenRules: reported.map((entry) => ({ ...entry, using: providerId ?? "" })),
  });

  const overrideId = request.pageOverrideProviderId ?? null;
  if (overrideId) {
    if (usable(overrideId)) return decide(overrideId, "pageOverride");
    report(OVERRIDE_LABEL, overrideId);
  }

  const { rules } = settings.routing;
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index];
    if (!rule || rule.kind !== "languagePair" || !rule.enabled) continue;
    if (!pairMatches(rule, request)) continue;
    if (usable(rule.providerId)) return decide(rule.providerId, "languagePair");
    report(pairLabel(rule), rule.providerId);
  }

  for (const rule of matchingSiteRules(rules, request.pageUrl)) {
    if (usable(rule.providerId)) return decide(rule.providerId, "site");
    report(rule.match, rule.providerId);
  }

  const defaultId = settings.routing.defaultProviderId;
  if (defaultId) {
    if (usable(defaultId)) return decide(defaultId, "default");
    report(DEFAULT_LABEL, defaultId);
  }

  const fallback = settings.providers.find((provider) => provider.enabled);
  return fallback ? decide(fallback.id, "fallback") : decide(null, "none");
}
