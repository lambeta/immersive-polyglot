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
  /**
   * 0-based position of this part within its source block. Concatenating a block's parts in this
   * order is its complete translation. Ephemeral: never persisted and re-derived on segmentation.
   */
  partIndex: number;
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
  /** Optional; must be a catalogued id when present (FR-019). */
  displayStyle?: DisplayStyleId;
  providerId?: ProviderId | null;
  autoTranslate: boolean;
}

export type DisplayMode = "bilingual" | "above" | "only";

/** The fifteen visual treatments a translation can take (FR-001). */
export type DisplayStyleId =
  | "none"
  | "underline-dashed"
  | "underline-solid"
  | "border-dashed"
  | "border-solid"
  | "blur"
  | "transparency"
  | "underline-dotted"
  | "divider"
  | "highlight"
  | "marker"
  | "marker-2"
  | "quote"
  | "weakened"
  | "gray";

export interface GlossaryEntry {
  sourceTerm: string;
  targetTerm: string;
  sourceLang: string;
  targetLang: string;
  caseSensitive: boolean;
}

/** What one provider response says it consumed (feature 008, data-model §1). */
export interface UsageReport {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

/** The parts the price is computed from, per tier (feature 008, data-model §2). */
export interface TokenParts {
  hit: number;
  miss: number;
  out: number;
}

export type Currency = "CNY" | "USD";

/** Why a run cannot be priced (feature 008, data-model §5). One reason, in this precedence. */
export type SpendUnavailable = "noPriceList" | "modelNotPriced" | "usageIncomplete";

export interface SpendPrice {
  amount: number;
  currency: Currency;
  /** The snapshot's month, e.g. "2026-11"; shown beside the amount (FR-009, FR-025). */
  snapshot: string;
  /** The provider whose published list was used, e.g. "DeepSeek". */
  provider: string;
}

/** The run's measured spend and its estimate (feature 008, data-model §6). */
export interface SpendRecord {
  tokens: { total: number; prompt: number; completion: number; hit: number; miss: number };
  price: SpendPrice | null;
  unavailable?: SpendUnavailable;
  /** The model the run used, so an unpriced model can be named in the note (FR-026). */
  model?: string;
}

export interface SessionUsageRecord {
  segmentsTranslated: number;
  approxChars: number;
  perProvider: Record<ProviderId, number>;
  reusedSegments: number;
  /** Absent — never zero — when no response reported usage (FR-004). */
  spend?: SpendRecord;
}

export interface StyleSettings {
  instruction: string;
  temperature: number;
}

/** The reader's device-wide translation typography (feature 004). */
export interface TranslationTypography {
  /** Trimmed family list, or "" to inherit the page's font. */
  fontFamily: string;
  /** Integer percentage 50-200, multiple of 5; 100 means "do not override size". */
  fontScale: number;
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
  /** Optional in storage; missing or unknown resolves to `none` (FR-004, FR-020). */
  displayStyle?: DisplayStyleId;
  /** Optional; missing or empty means "inherit the page's font" (FR-009). */
  translationFontFamily?: string;
  /** Optional; missing or invalid resolves to 100 (FR-010). */
  translationFontScale?: number;
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
