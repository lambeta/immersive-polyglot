/**
 * Entities shared by the three execution contexts. Field lists mirror
 * specs/001-llm-web-translator/data-model.md; the persisted shape lives in
 * contracts/storage-schema.md.
 */

export type ProviderId = string;
export type UnitId = string;
export type RuleId = string;

export interface LastVerification {
  at: string;
  ok: boolean;
  errorClass?: ErrorClass;
}

export interface TranslationProvider {
  id: ProviderId;
  name: string;
  endpoint: string;
  model: string;
  extraHeaders: Record<string, string>;
  enabled: boolean;
  timeoutMs: number;
  maxConcurrency: number;
  lastVerification?: LastVerification;
}

/** Stored beside the provider; the secret is read only inside the service worker. */
export interface ProviderCredential {
  providerId: ProviderId;
  secret: string;
  masked: string;
  updatedAt: string;
}

export interface LanguagePairMatch {
  sourceLang: string;
  targetLang: string;
}

export interface SiteRoutingRule {
  id: RuleId;
  kind: "site";
  match: string;
  providerId: ProviderId;
  enabled: boolean;
}

export interface LanguagePairRoutingRule {
  id: RuleId;
  kind: "languagePair";
  match: LanguagePairMatch;
  providerId: ProviderId;
  enabled: boolean;
}

export type RoutingRule = SiteRoutingRule | LanguagePairRoutingRule;

export type UnitState = "queued" | "translating" | "translated" | "failed" | "skipped" | "cancelled";

export type SkipReason =
  | "editable"
  | "code"
  | "hidden"
  | "nav"
  | "sameLanguage"
  | "siteOptOut"
  | "capReached"
  | "empty";

/** The provider failure taxonomy of contracts/provider-adapter.md section 4. */
export type ProviderErrorClass =
  | "unreachable"
  | "timeout"
  | "authRejected"
  | "rateLimited"
  | "quotaExhausted"
  | "modelUnavailable"
  | "malformedResponse"
  | "emptyTranslation"
  | "serverError"
  | "invalidRequest"
  | "cancelled";

/** Provider failures plus the product-level failures a user can meet. */
export type ErrorClass =
  | ProviderErrorClass
  | "workerUnavailable"
  | "providerMissing"
  | "unsupportedPage"
  | "restrictedPage"
  | "strictCsp"
  | "sameLanguage"
  | "selectionEmpty"
  | "storageQuota"
  | "newerSchema"
  | "migrationFailed"
  | "capReached"
  | "invalidConfiguration";

export interface TranslationUnit {
  id: UnitId;
  sourceText: string;
  sourceLang: string;
  targetLang: string;
  translatedText?: string;
  state: UnitState;
  skipReason?: SkipReason;
  errorClass?: ErrorClass;
  attempts: number;
  reusedFrom?: UnitId;
  /** Ephemeral element handle; never persisted, dropped on restore. */
  domRef?: Element | null;
}

export type JobState =
  | "idle"
  | "segmenting"
  | "translating"
  | "completed"
  | "cancelled"
  | "failed";

export interface JobCounts {
  total: number;
  translated: number;
  failed: number;
  skipped: number;
  reused: number;
}

export interface CapState {
  cap: number;
  consumed: number;
  reached: boolean;
}

export interface TranslationJob {
  jobId: string;
  pageKey: string;
  providerId: ProviderId | null;
  units: TranslationUnit[];
  state: JobState;
  counts: JobCounts;
  capState: CapState;
  startedAt: number;
  endedAt?: number;
}

export interface SitePreference {
  sitePattern: string;
  targetLang?: string;
  displayMode?: DisplayMode;
  providerId?: ProviderId | null;
  autoTranslate: boolean;
}

export type DisplayMode = "bilingual" | "above" | "only";

export interface GlossaryEntry {
  sourceTerm: string;
  targetTerm: string;
  sourceLang: string;
  targetLang: string;
  caseSensitive: boolean;
}

export interface SessionUsageRecord {
  segmentsTranslated: number;
  approxChars: number;
  perProvider: Record<ProviderId, number>;
  reusedSegments: number;
}

export interface StyleSettings {
  instruction: string;
  temperature: number;
}

export interface LimitSettings {
  maxConcurrency: number;
  sessionCapSegments: number;
  sessionCapChars: number;
  siteCaps: Record<string, number>;
}

export interface UiSettings {
  targetLang: string;
  sourceLang: string;
  displayMode: DisplayMode;
}

export interface RoutingSettings {
  defaultProviderId: ProviderId | null;
  rules: RoutingRule[];
}

/** The complete persisted configuration. Never holds page content (FR-025). */
export interface Settings {
  schemaVersion: number;
  providers: TranslationProvider[];
  credentials: Record<ProviderId, ProviderCredential>;
  routing: RoutingSettings;
  sites: SitePreference[];
  glossary: GlossaryEntry[];
  style: StyleSettings;
  limits: LimitSettings;
  ui: UiSettings;
}

export const DISPLAY_MODES: readonly DisplayMode[] = ["bilingual", "above", "only"];
