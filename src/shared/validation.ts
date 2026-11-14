import type {
  GlossaryEntry,
  RoutingRule,
  TranslationProvider,
  TranslationTypography,
} from "./types.js";

/**
 * Validation rules shared by the options UI and the tests that prove the refused path
 * (constitution principle II: every rule gets an intended-path and a refused-path test).
 * Each issue carries a catalog key so the UI never invents its own wording.
 */

export interface ValidationIssue {
  field: string;
  messageKey: string;
}

export const LIMITS = {
  nameMin: 1,
  nameMax: 64,
  timeoutMin: 5000,
  timeoutMax: 300_000,
  concurrencyMin: 1,
  concurrencyMax: 10,
} as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost");
}

/** FR-001: absolute URL; https anywhere, http only for a loopback model server. */
export function validateEndpoint(endpoint: string): ValidationIssue | null {
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) return { field: "endpoint", messageKey: "commonInvalidEndpoint" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { field: "endpoint", messageKey: "commonInvalidEndpoint" };
  }
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && isLoopbackHost(url.hostname)) return null;
  return { field: "endpoint", messageKey: "commonInvalidEndpoint" };
}

/** A site rule matches a host or a wildcard host, optionally with a path. */
export function validateSitePattern(pattern: string): ValidationIssue | null {
  const trimmed = pattern.trim();
  if (trimmed.length === 0) return { field: "match", messageKey: "commonInvalidSite" };
  const host = trimmed.replace(/^\*\\./, "").split("/")[0] ?? "";
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d+)?$/i.test(host)) {
    return { field: "match", messageKey: "commonInvalidSite" };
  }
  return null;
}

const LANGUAGE_PATTERN = /^(auto|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$/;

export function validateLanguageCode(code: string, field = "lang"): ValidationIssue | null {
  if (!LANGUAGE_PATTERN.test(code.trim())) {
    return { field, messageKey: "commonInvalidLang" };
  }
  return null;
}

/**
 * Feature 004: the translation typography inputs. The font-family value reaches an inline
 * declaration the product owns, so it is allow-listed rather than block-listed (FR-017); the size
 * must be a whole 5% step inside 50-200 (FR-018).
 */

export const FONT_FAMILY_MAX = 200;
export const FONT_SCALE_MIN = 50;
export const FONT_SCALE_MAX = 200;
export const FONT_SCALE_STEP = 5;

const FONT_FORBIDDEN = /[;{}<>!@\\\u0000-\u001f\u007f-\u009f]/;
const FONT_UNQUOTED = /^[\p{L}_-][\p{L}\p{N} _.-]*$/u;

function isFontFamilyEntry(entry: string): boolean {
  const quote = entry.charAt(0);
  if (quote === '"' || quote === "'") {
    if (entry.length < 2 || entry.charAt(entry.length - 1) !== quote) return false;
    const inner = entry.slice(1, -1);
    if (inner.length === 0) return false;
    if (inner.includes(quote) || inner.includes("\\")) return false;
    return !FONT_FORBIDDEN.test(inner);
  }
  return FONT_UNQUOTED.test(entry);
}

export function validateFontFamily(value: string): ValidationIssue | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const issue: ValidationIssue = { field: "fontFamily", messageKey: "displayFontInvalid" };
  if (trimmed.length > FONT_FAMILY_MAX) return issue;
  if (FONT_FORBIDDEN.test(trimmed)) return issue;
  if (/url\(/i.test(trimmed)) return issue;

  let entries = 0;
  for (const raw of trimmed.split(",")) {
    const entry = raw.trim();
    if (entry.length === 0) continue;
    if (!isFontFamilyEntry(entry)) return issue;
    entries += 1;
  }
  return entries === 0 ? issue : null;
}

export function validateFontScale(value: number): ValidationIssue | null {
  const issue: ValidationIssue = { field: "fontScale", messageKey: "displayFontSizeInvalid" };
  if (typeof value !== "number" || !Number.isFinite(value)) return issue;
  if (value < FONT_SCALE_MIN || value > FONT_SCALE_MAX) return issue;
  if (value % FONT_SCALE_STEP !== 0) return issue;
  return null;
}

export function validateTypography(typography: TranslationTypography): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const familyIssue = validateFontFamily(typography.fontFamily);
  if (familyIssue) issues.push(familyIssue);
  const scaleIssue = validateFontScale(typography.fontScale);
  if (scaleIssue) issues.push(scaleIssue);
  return issues;
}

export interface ProviderInput {
  name: string;
  endpoint: string;
  model: string;
  timeoutMs: number;
  maxConcurrency: number;
  extraHeaders?: Record<string, string>;
}

export function validateProvider(
  input: ProviderInput,
  existing: TranslationProvider[],
  editingId?: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const name = input.name.trim();
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    issues.push({ field: "name", messageKey: "commonInvalidName" });
  } else if (
    existing.some(
      (provider) =>
        provider.id !== editingId && provider.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    issues.push({ field: "name", messageKey: "commonInvalidName" });
  }

  const endpointIssue = validateEndpoint(input.endpoint);
  if (endpointIssue) issues.push(endpointIssue);

  if (input.model.trim().length === 0) {
    issues.push({ field: "model", messageKey: "commonInvalidModel" });
  }
  if (
    !Number.isFinite(input.timeoutMs) ||
    input.timeoutMs < LIMITS.timeoutMin ||
    input.timeoutMs > LIMITS.timeoutMax
  ) {
    issues.push({ field: "timeoutMs", messageKey: "commonInvalidTimeout" });
  }
  if (
    !Number.isInteger(input.maxConcurrency) ||
    input.maxConcurrency < LIMITS.concurrencyMin ||
    input.maxConcurrency > LIMITS.concurrencyMax
  ) {
    issues.push({ field: "maxConcurrency", messageKey: "commonInvalidConcurrency" });
  }

  const headers = input.extraHeaders ?? {};
  if (Object.keys(headers).some((header) => header.toLowerCase() === "authorization")) {
    // The credential binding owns Authorization; overriding it hides where the secret goes.
    issues.push({ field: "extraHeaders", messageKey: "commonInvalidAuthOverride" });
  }
  return issues;
}

export function validateGlossaryEntry(
  input: GlossaryEntry,
  existing: GlossaryEntry[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.sourceTerm.trim().length === 0 || input.targetTerm.trim().length === 0) {
    issues.push({ field: "sourceTerm", messageKey: "glossaryConflict" });
  }
  const sourceIssue = validateLanguageCode(input.sourceLang, "sourceLang");
  if (sourceIssue) issues.push(sourceIssue);
  const targetIssue = validateLanguageCode(input.targetLang, "targetLang");
  if (targetIssue) issues.push(targetIssue);

  const normalize = (term: string, caseSensitive: boolean) =>
    caseSensitive ? term.trim() : term.trim().toLowerCase();
  const conflict = existing.some(
    (entry) =>
      normalize(entry.sourceTerm, entry.caseSensitive) ===
        normalize(input.sourceTerm, input.caseSensitive) &&
      entry.sourceLang === input.sourceLang &&
      entry.targetLang === input.targetLang,
  );
  if (conflict) {
    issues.push({ field: "sourceTerm", messageKey: "glossaryConflict" });
  }
  return issues;
}

export function validateRuleProvider(
  rule: Pick<RoutingRule, "providerId">,
  providers: TranslationProvider[],
): ValidationIssue[] {
  const provider = providers.find((candidate) => candidate.id === rule.providerId);
  if (!provider || !provider.enabled) {
    return [{ field: "providerId", messageKey: "commonInvalidProviderRef" }];
  }
  return [];
}
