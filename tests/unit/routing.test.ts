import { describe, expect, it } from "vitest";
import { matchSite, resolveProvider, siteHostOf } from "../../src/shared/routing.js";
import type { RouteRequest } from "../../src/shared/routing.js";
import { defaultSettings } from "../../src/shared/settings.js";
import type { RoutingRule, Settings, TranslationProvider } from "../../src/shared/types.js";

function provider(id: string, enabled = true): TranslationProvider {
  return {
    id,
    name: `Provider ${id}`,
    endpoint: `https://${id}.test/v1/chat/completions`,
    model: "m",
    extraHeaders: {},
    enabled,
    timeoutMs: 60000,
    maxConcurrency: 3,
  };
}

function siteRule(id: string, match: string, providerId: string, enabled = true): RoutingRule {
  return { id, kind: "site", match, providerId, enabled };
}

function pairRule(
  id: string,
  sourceLang: string,
  targetLang: string,
  providerId: string,
  enabled = true,
): RoutingRule {
  return { id, kind: "languagePair", match: { sourceLang, targetLang }, providerId, enabled };
}

interface Fixture {
  providers?: TranslationProvider[];
  rules?: RoutingRule[];
  defaultProviderId?: string | null;
}

function settingsOf(fixture: Fixture = {}): Settings {
  return {
    ...defaultSettings(),
    providers: fixture.providers ?? [],
    routing: { defaultProviderId: fixture.defaultProviderId ?? null, rules: fixture.rules ?? [] },
  };
}

function request(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    pageUrl: "https://news.example/section/article",
    sourceLang: "ja",
    targetLang: "zh",
    ...overrides,
  };
}

describe("site matching", () => {
  it("matches an exact host", () => {
    expect(matchSite("news.example", "news.example")).toBe(true);
    expect(matchSite("news.example", "other.example")).toBe(false);
  });

  it("matches a wildcard subdomain but not the bare domain", () => {
    expect(matchSite("*.example", "news.example")).toBe(true);
    expect(matchSite("*.example", "example")).toBe(false);
  });

  it("treats the wildcard as a label boundary, not a suffix", () => {
    expect(matchSite("*.example", "notexample")).toBe(false);
    expect(matchSite("*.example", "deep.news.example")).toBe(true);
  });

  it("requires the wildcard before a subdomain", () => {
    expect(matchSite("news.example", "a.news.example")).toBe(false);
  });

  it("ignores a leading www and case on both sides", () => {
    expect(matchSite("News.Example", "www.news.example")).toBe(true);
    expect(matchSite("www.news.example", "NEWS.EXAMPLE")).toBe(true);
  });

  it("requires the path prefix when the pattern carries a path", () => {
    expect(matchSite("news.example/section", "news.example/section/article")).toBe(true);
    expect(matchSite("news.example/section", "news.example/other")).toBe(false);
    expect(matchSite("news.example/section", "news.example")).toBe(false);
  });

  it("lets a host-only pattern ignore any path on the page", () => {
    expect(matchSite("news.example", "news.example/section/article")).toBe(true);
  });

  it("does not match a path prefix that cuts a segment in half", () => {
    expect(matchSite("news.example/section", "news.example/sections")).toBe(false);
  });

  it("returns false for a blank pattern or host", () => {
    expect(matchSite("", "news.example")).toBe(false);
    expect(matchSite("news.example", "")).toBe(false);
  });
});

describe("siteHostOf", () => {
  it("normalises the host and drops the path, query, port and credentials", () => {
    expect(siteHostOf("https://user:pw@WWW.News.Example:8443/a/b?c=1#d")).toBe("news.example");
  });

  it("returns an empty string for a value that is not a URL", () => {
    expect(siteHostOf("news.example/article")).toBe("");
    expect(siteHostOf("")).toBe("");
  });
});

describe("resolution order", () => {
  it("uses a page override before any saved rule", () => {
    const settings = settingsOf({
      providers: [provider("p_default"), provider("p_pair"), provider("p_site"), provider("p_override")],
      defaultProviderId: "p_default",
      rules: [
        siteRule("r_site", "news.example", "p_site"),
        pairRule("r_pair", "ja", "zh", "p_pair"),
      ],
    });

    const decision = resolveProvider(settings, request({ pageOverrideProviderId: "p_override" }));

    expect(decision).toEqual({ providerId: "p_override", reason: "pageOverride", brokenRules: [] });
  });

  it("applies the override to this page load only, without touching settings", () => {
    const settings = settingsOf({
      providers: [provider("p_default"), provider("p_override")],
      defaultProviderId: "p_default",
      rules: [siteRule("r_site", "news.example", "p_default")],
    });
    const before = structuredClone(settings);

    resolveProvider(settings, request({ pageOverrideProviderId: "p_override" }));

    expect(settings).toEqual(before);
    expect(settings.routing.rules).toHaveLength(1);
    expect(settings.routing.rules[0]).not.toHaveProperty("providerId", "p_override");
  });

  it("uses a language-pair rule before a site rule and the default", () => {
    const settings = settingsOf({
      providers: [provider("p_default"), provider("p_pair"), provider("p_site")],
      defaultProviderId: "p_default",
      rules: [
        siteRule("r_site", "news.example", "p_site"),
        pairRule("r_pair", "ja", "zh", "p_pair"),
      ],
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_pair",
      reason: "languagePair",
      brokenRules: [],
    });
  });

  it("uses a site rule before the global default", () => {
    const settings = settingsOf({
      providers: [provider("p_default"), provider("p_site")],
      defaultProviderId: "p_default",
      rules: [siteRule("r_site", "*.example", "p_site")],
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_site",
      reason: "site",
      brokenRules: [],
    });
  });

  it("falls back to the global default when no rule matches", () => {
    const settings = settingsOf({
      providers: [provider("p_default"), provider("p_other")],
      defaultProviderId: "p_other",
      rules: [
        siteRule("r_site", "elsewhere.example", "p_default"),
        pairRule("r_pair", "ko", "zh", "p_default"),
        pairRule("r_wrongTarget", "ja", "en", "p_default"),
      ],
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_other",
      reason: "default",
      brokenRules: [],
    });
  });

  it("lets a rule whose source language is auto match any requested source", () => {
    const settings = settingsOf({
      providers: [provider("p_any"), provider("p_default")],
      defaultProviderId: "p_default",
      rules: [pairRule("r_any", "auto", "zh", "p_any")],
    });

    expect(resolveProvider(settings, request({ sourceLang: "de" })).providerId).toBe("p_any");
  });

  it("does not claim a concrete language pair while the source is still auto", () => {
    const settings = settingsOf({
      providers: [provider("p_pair"), provider("p_default")],
      defaultProviderId: "p_default",
      rules: [pairRule("r_pair", "ja", "zh", "p_pair")],
    });

    expect(resolveProvider(settings, request({ sourceLang: "auto" }))).toEqual({
      providerId: "p_default",
      reason: "default",
      brokenRules: [],
    });
  });
});

describe("specificity inside the site kind", () => {
  it("prefers the longer pattern over a wildcard, whatever the array order", () => {
    const settings = settingsOf({
      providers: [provider("p_wild"), provider("p_exact"), provider("p_default")],
      defaultProviderId: "p_default",
      rules: [
        siteRule("r_wild", "*.example", "p_wild"),
        siteRule("r_exact", "news.example", "p_exact"),
      ],
    });

    expect(resolveProvider(settings, request()).providerId).toBe("p_exact");
  });

  it("prefers a pattern carrying a path over a host-only pattern", () => {
    const settings = settingsOf({
      providers: [provider("p_host"), provider("p_path"), provider("p_default")],
      defaultProviderId: "p_default",
      rules: [
        siteRule("r_host", "news.example", "p_host"),
        siteRule("r_path", "news.example/section", "p_path"),
      ],
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_path",
      reason: "site",
      brokenRules: [],
    });
  });

  it("prefers the most recently added rule when two patterns tie", () => {
    const settings = settingsOf({
      providers: [provider("p_old"), provider("p_new"), provider("p_default")],
      defaultProviderId: "p_default",
      rules: [
        siteRule("r_old", "news.example", "p_old"),
        siteRule("r_new", "news.example", "p_new"),
      ],
    });

    expect(resolveProvider(settings, request()).providerId).toBe("p_new");
  });

  it("falls through to the next specific site rule when the best one is broken", () => {
    const settings = settingsOf({
      providers: [provider("p_host"), provider("p_default")],
      defaultProviderId: "p_default",
      rules: [
        siteRule("r_host", "news.example", "p_host"),
        siteRule("r_path", "news.example/section", "p_deleted"),
      ],
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_host",
      reason: "site",
      brokenRules: [{ rule: "news.example/section", provider: "p_deleted", using: "p_host" }],
    });
  });
});

describe("broken rules", () => {
  it("reports a site rule whose provider is gone and resumes at the default", () => {
    const settings = settingsOf({
      providers: [provider("p_default")],
      defaultProviderId: "p_default",
      rules: [siteRule("r_site", "news.example", "p_deleted")],
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_default",
      reason: "default",
      brokenRules: [{ rule: "news.example", provider: "p_deleted", using: "p_default" }],
    });
  });

  it("skips a rule pointing at a disabled provider and names it", () => {
    const settings = settingsOf({
      providers: [provider("p_off", false), provider("p_default")],
      defaultProviderId: "p_default",
      rules: [siteRule("r_site", "news.example", "p_off")],
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_default",
      reason: "default",
      brokenRules: [{ rule: "news.example", provider: "p_off", using: "p_default" }],
    });
  });

  it("names a broken language-pair rule by its pair and resumes at the site rule", () => {
    const settings = settingsOf({
      providers: [provider("p_site")],
      rules: [
        siteRule("r_site", "news.example", "p_site"),
        pairRule("r_pair", "ja", "zh", "p_deleted"),
      ],
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_site",
      reason: "site",
      brokenRules: [{ rule: "ja\u2192zh", provider: "p_deleted", using: "p_site" }],
    });
  });

  it("never returns a disabled provider referenced by an override", () => {
    const settings = settingsOf({
      providers: [provider("p_off", false), provider("p_default")],
      defaultProviderId: "p_default",
    });

    expect(resolveProvider(settings, request({ pageOverrideProviderId: "p_off" }))).toEqual({
      providerId: "p_default",
      reason: "default",
      brokenRules: [{ rule: "pageOverride", provider: "p_off", using: "p_default" }],
    });
  });

  it("does not report a rule the user disabled", () => {
    const settings = settingsOf({
      providers: [provider("p_default")],
      defaultProviderId: "p_default",
      rules: [siteRule("r_site", "news.example", "p_deleted", false)],
    });

    expect(resolveProvider(settings, request()).brokenRules).toEqual([]);
  });

  it("reports a default pointing at a deleted provider and uses the first enabled one", () => {
    const settings = settingsOf({
      providers: [provider("p_off", false), provider("p_first"), provider("p_second")],
      defaultProviderId: "p_deleted",
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_first",
      reason: "fallback",
      brokenRules: [{ rule: "default", provider: "p_deleted", using: "p_first" }],
    });
  });

  it("reports a default pointing at a disabled provider", () => {
    const settings = settingsOf({
      providers: [provider("p_off", false), provider("p_first")],
      defaultProviderId: "p_off",
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_first",
      reason: "fallback",
      brokenRules: [{ rule: "default", provider: "p_off", using: "p_first" }],
    });
  });

  it("picks the first enabled provider when no default is configured", () => {
    const settings = settingsOf({
      providers: [provider("p_off", false), provider("p_first")],
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: "p_first",
      reason: "fallback",
      brokenRules: [],
    });
  });

  it("returns none with an empty fallback when nothing is usable", () => {
    const settings = settingsOf({
      providers: [provider("p_off", false)],
      defaultProviderId: "p_deleted",
    });

    expect(resolveProvider(settings, request())).toEqual({
      providerId: null,
      reason: "none",
      brokenRules: [{ rule: "default", provider: "p_deleted", using: "" }],
    });
  });

  it("returns none without diagnostics when no provider is configured at all", () => {
    expect(resolveProvider(settingsOf(), request())).toEqual({
      providerId: null,
      reason: "none",
      brokenRules: [],
    });
  });
});
