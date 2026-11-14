import type {
  GlossaryEntry,
  LimitSettings,
  ProviderCredential,
  RoutingSettings,
  Settings,
  SitePreference,
  StyleSettings,
  TranslationProvider,
  TranslationTypography,
  UiSettings,
} from "./types.js";
import { isDisplayStyleId } from "./display-styles.js";
import { MIGRATIONS } from "./migrations.js";
import { validateFontFamily } from "./validation.js";

/**
 * Persisted configuration access. Implements contracts/storage-schema.md: defaults, the
 * write-on-save schemaVersion, an ordered migration chain that never persists a partial
 * result, and the refusal to write over a profile produced by a newer build.
 */

export const CURRENT_SCHEMA_VERSION = 2;

export const STORAGE_KEYS = [
  "schemaVersion",
  "providers",
  "credentials",
  "routing",
  "sites",
  "glossary",
  "style",
  "limits",
  "ui",
] as const;

export type StorageKey = (typeof STORAGE_KEYS)[number];

/** The minimum a storage backend has to provide; chrome.storage.local satisfies it. */
export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export type SettingsErrorCode =
  | "newerSchema"
  | "migrationFailed"
  | "invalidShape"
  | "pageContent"
  | "storageQuota";

export class SettingsError extends Error {
  readonly code: SettingsErrorCode;
  readonly step?: string;

  constructor(code: SettingsErrorCode, message: string, step?: string) {
    super(message);
    this.name = "SettingsError";
    this.code = code;
    if (step !== undefined) this.step = step;
  }
}

export interface Migration {
  /** Schema version this step produces. */
  to: number;
  /** Name used when reporting a failed step. */
  name: string;
  apply(raw: Record<string, unknown>): Record<string, unknown>;
}

export function defaultSettings(): Settings {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    providers: [],
    credentials: {},
    routing: { defaultProviderId: null, rules: [] },
    sites: [],
    glossary: [],
    style: { instruction: "", temperature: 0 },
    limits: { maxConcurrency: 3, sessionCapSegments: 0, sessionCapChars: 0, siteCaps: {} },
    ui: {
      targetLang: "zh",
      sourceLang: "auto",
      displayMode: "bilingual",
      displayStyle: "none",
      translationFontFamily: "",
      translationFontScale: 100,
    },
  };
}

/** Field names that would mean page content leaked into configuration (FR-025). */
const PAGE_CONTENT_KEYS = /^(sourceText|translatedText|units|domRef|pageText|content|job)$/;

function assertNoPageContent(value: unknown, path = "settings"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPageContent(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (PAGE_CONTENT_KEYS.test(key)) {
        throw new SettingsError(
          "pageContent",
          `Page content must never be persisted: "${key}" at ${path} (FR-025)`,
        );
      }
      assertNoPageContent(child, `${path}.${key}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeDefaults(stored: Record<string, unknown>): Settings {
  const base = defaultSettings();
  const merged: Settings = {
    schemaVersion:
      typeof stored["schemaVersion"] === "number" ? stored["schemaVersion"] : CURRENT_SCHEMA_VERSION,
    providers: Array.isArray(stored["providers"])
      ? (stored["providers"] as TranslationProvider[])
      : base.providers,
    credentials: isRecord(stored["credentials"])
      ? (stored["credentials"] as Record<string, ProviderCredential>)
      : base.credentials,
    routing: isRecord(stored["routing"])
      ? {
          defaultProviderId:
            typeof stored["routing"]["defaultProviderId"] === "string"
              ? stored["routing"]["defaultProviderId"]
              : null,
          rules: Array.isArray(stored["routing"]["rules"])
            ? (stored["routing"]["rules"] as RoutingSettings["rules"])
            : [],
        }
      : base.routing,
    sites: Array.isArray(stored["sites"]) ? (stored["sites"] as SitePreference[]) : base.sites,
    glossary: Array.isArray(stored["glossary"])
      ? (stored["glossary"] as GlossaryEntry[])
      : base.glossary,
    style: isRecord(stored["style"])
      ? {
          instruction:
            typeof stored["style"]["instruction"] === "string" ? stored["style"]["instruction"] : "",
          temperature:
            typeof stored["style"]["temperature"] === "number" ? stored["style"]["temperature"] : 0,
        }
      : base.style,
    limits: isRecord(stored["limits"])
      ? {
          maxConcurrency:
            typeof stored["limits"]["maxConcurrency"] === "number"
              ? stored["limits"]["maxConcurrency"]
              : 3,
          sessionCapSegments:
            typeof stored["limits"]["sessionCapSegments"] === "number"
              ? stored["limits"]["sessionCapSegments"]
              : 0,
          sessionCapChars:
            typeof stored["limits"]["sessionCapChars"] === "number"
              ? stored["limits"]["sessionCapChars"]
              : 0,
          siteCaps: isRecord(stored["limits"]["siteCaps"])
            ? (stored["limits"]["siteCaps"] as Record<string, number>)
            : {},
        }
      : base.limits,
    ui: isRecord(stored["ui"])
      ? {
          targetLang:
            typeof stored["ui"]["targetLang"] === "string" ? stored["ui"]["targetLang"] : "zh",
          sourceLang:
            typeof stored["ui"]["sourceLang"] === "string" ? stored["ui"]["sourceLang"] : "auto",
          displayMode:
            stored["ui"]["displayMode"] === "above" ||
            stored["ui"]["displayMode"] === "only" ||
            stored["ui"]["displayMode"] === "bilingual"
              ? stored["ui"]["displayMode"]
              : "bilingual",
          displayStyle: isDisplayStyleId(stored["ui"]["displayStyle"])
            ? stored["ui"]["displayStyle"]
            : "none",
          translationFontFamily: normaliseFontFamily(stored["ui"]["translationFontFamily"]),
          translationFontScale: normaliseFontScale(stored["ui"]["translationFontScale"]),
        }
      : base.ui,
  };
  return merged;
}

export interface SettingsStoreOptions {
  migrations?: Migration[];
  currentVersion?: number;
}

export class SettingsStore {
  readonly #area: StorageAreaLike;
  readonly #migrations: readonly Migration[];
  readonly #currentVersion: number;
  #newerSchema = false;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(area: StorageAreaLike, options: SettingsStoreOptions = {}) {
    this.#area = area;
    this.#migrations = options.migrations ?? MIGRATIONS;
    this.#currentVersion = options.currentVersion ?? CURRENT_SCHEMA_VERSION;
  }

  get newerSchemaDetected(): boolean {
    return this.#newerSchema;
  }

  /** Serializes read-modify-write so two UI panels cannot interleave a lost update. */
  #serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(work, work);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async readRaw(): Promise<Record<string, unknown>> {
    return this.#area.get(null);
  }

  async load(): Promise<Settings> {
    const raw = await this.#area.get(null);
    let working: Record<string, unknown> = { ...raw };
    const storedVersion = typeof raw["schemaVersion"] === "number" ? raw["schemaVersion"] : 1;

    if (storedVersion > this.#currentVersion) {
      this.#newerSchema = true;
      return mergeDefaults(working);
    }
    this.#newerSchema = false;

    let version = storedVersion;
    if (raw["schemaVersion"] === undefined) {
      // A profile written before versioning existed is version 1 and is recorded as such.
      working = { ...working, schemaVersion: 1 };
      await this.#area.set({ schemaVersion: 1 });
    }

    for (const migration of this.#migrations) {
      if (migration.to <= version) continue;
      let migrated: Record<string, unknown>;
      try {
        migrated = migration.apply({ ...working });
      } catch (error) {
        throw new SettingsError(
          "migrationFailed",
          `Migration step "${migration.name}" failed: ${(error as Error).message}`,
          migration.name,
        );
      }
      working = { ...migrated, schemaVersion: migration.to };
      version = migration.to;
    }

    if (version !== storedVersion) {
      // Nothing is persisted until every step has succeeded.
      await this.#area.set(working);
    }

    return mergeDefaults(working);
  }

  async save(mutator: (current: Settings) => Settings): Promise<Settings> {
    return this.#serial(async () => {
      if (this.#newerSchema) {
        throw new SettingsError(
          "newerSchema",
          "Stored settings were written by a newer build; refusing to overwrite them.",
        );
      }
      const current = await this.load();
      const next = mutator(structuredClone(current));
      next.schemaVersion = this.#currentVersion;

      assertNoPageContent(next);
      for (const key of Object.keys(next)) {
        if (!(STORAGE_KEYS as readonly string[]).includes(key)) {
          throw new SettingsError("invalidShape", `Unknown storage key: ${key}`);
        }
      }
      await this.#writeAll(next);
      return next;
    });
  }

  async #writeAll(settings: Settings): Promise<void> {
    const items: Record<string, unknown> = {};
    for (const key of STORAGE_KEYS) {
      items[key] = settings[key as keyof Settings];
    }
    try {
      await this.#area.set(items);
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      if (/quota/i.test(message)) {
        throw new SettingsError("storageQuota", "Extension storage is full; nothing was saved.");
      }
      throw error;
    }
  }

  /** FR-024: clear everything, then prove it by reading back. */
  async deleteAll(): Promise<string[]> {
    return this.#serial(async () => {
      await this.#area.clear();
      const remaining = await this.#area.get(null);
      return Object.keys(remaining);
    });
  }
}

/**
 * Feature 004: the device-wide translation typography, made safe to consume. A hand-edited or
 * newer profile resolves to the defaults instead of breaking a render (FR-009, FR-012, FR-020).
 */
function normaliseFontFamily(value: unknown): string {
  if (typeof value !== "string" || validateFontFamily(value) !== null) return "";
  return value.trim();
}

function normaliseFontScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100;
  const rounded = Math.round(value / 5) * 5;
  return Math.min(200, Math.max(50, rounded));
}

export function resolveTypography(settings: Settings): TranslationTypography {
  return {
    fontFamily: normaliseFontFamily(settings.ui.translationFontFamily),
    fontScale: normaliseFontScale(settings.ui.translationFontScale),
  };
}

/** The real backend. Only extension contexts have chrome.storage; tests inject their own area. */
export function chromeLocalArea(): StorageAreaLike {
  const area = chrome.storage.local;
  return {
    async get(keys) {
      const result = await area.get(keys === null ? null : (keys as string | string[] | undefined));
      return result as Record<string, unknown>;
    },
    async set(items) {
      await area.set(items);
    },
    async remove(keys) {
      await area.remove(keys);
    },
    async clear() {
      await area.clear();
    },
  };
}

export function createSettingsStore(options: SettingsStoreOptions = {}): SettingsStore {
  return new SettingsStore(chromeLocalArea(), options);
}

/** Displayable masks, derived only from a stored secret. */
export function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export type { StyleSettings, LimitSettings, UiSettings };
