import { maskSecret, type SettingsStore } from "../shared/settings.js";
import type { ProviderCredential, Settings } from "../shared/types.js";

/**
 * The one place a plaintext credential is read. Imported only by the service worker; the
 * options and popup surfaces go through `publicCredentialView`, which cannot return a secret
 * even if a caller asks (FR-021, SC-006).
 */
export class CredentialVault {
  readonly #store: SettingsStore;

  constructor(store: SettingsStore) {
    this.#store = store;
  }

  /** Service-worker use only. Never place the result in a message payload or a log. */
  async secret(providerId: string): Promise<string | null> {
    const settings = await this.#store.load();
    const credential: ProviderCredential | undefined = settings.credentials[providerId];
    return credential?.secret ?? null;
  }

  async mask(providerId: string): Promise<string | null> {
    const settings = await this.#store.load();
    const credential: ProviderCredential | undefined = settings.credentials[providerId];
    return credential?.masked ?? null;
  }

  async masks(): Promise<Record<string, string>> {
    const settings = await this.#store.load();
    const out: Record<string, string> = {};
    for (const [providerId, credential] of Object.entries(settings.credentials)) {
      out[providerId] = credential.masked;
    }
    return out;
  }

  async put(providerId: string, secret: string): Promise<void> {
    const trimmed = secret.trim();
    if (trimmed.length === 0) throw new Error("A credential cannot be blank");
    await this.#store.save((current) => {
      current.credentials[providerId] = {
        providerId,
        secret: trimmed,
        masked: maskSecret(trimmed),
        updatedAt: new Date().toISOString(),
      };
      return current;
    });
  }

  async remove(providerId: string): Promise<void> {
    await this.#store.save((current) => {
      delete current.credentials[providerId];
      return current;
    });
  }

  /**
   * A credential whose provider no longer exists is not usable and must not linger. Returns the
   * provider ids that were cleaned so the UI can report it rather than hide it.
   */
  async reconcile(providerIds: string[]): Promise<string[]> {
    const existing = new Set(providerIds);
    const settings = await this.#store.load();
    const orphans = Object.keys(settings.credentials).filter((id) => !existing.has(id));
    if (orphans.length === 0) return [];
    await this.#store.save((current) => {
      for (const id of orphans) delete current.credentials[id];
      return current;
    });
    return orphans;
  }
}

export interface PublicCredentialView {
  masked: string;
  updatedAt: string;
}

/**
 * The only credential-shaped thing a UI surface may hold: never the secret, not even a
 * truncated prefix.
 */
export async function publicCredentialView(
  store: SettingsStore,
): Promise<Record<string, PublicCredentialView>> {
  const settings: Settings = await store.load();
  const view: Record<string, PublicCredentialView> = {};
  for (const [providerId, credential] of Object.entries(settings.credentials)) {
    view[providerId] = { masked: credential.masked, updatedAt: credential.updatedAt };
  }
  return view;
}

/** Redacting logger wrapper: every log line passes through it before it exists. */
const SECRET_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, replacement: "$1[redacted]" },
  { pattern: /sk-[A-Za-z0-9_-]{6,}/g, replacement: "[redacted]" },
  {
    pattern: /("?(?:secret|apiKey|token|authorization)"?\s*[:=]\s*"?)[^",\s}]+/gi,
    replacement: "$1[redacted]",
  },
];

export function redact(value: unknown): string {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return SECRET_PATTERNS.reduce(
    (current, rule) => current.replace(rule.pattern, rule.replacement),
    text,
  );
}

export interface LogEntry {
  at: number;
  level: "info" | "warn" | "error";
  message: string;
}

/** A bounded, user-clearable log (FR-021 allows only logs the user can inspect and clear). */
export class RedactingLogger {
  readonly #entries: LogEntry[] = [];
  readonly #limit: number;

  constructor(limit = 200) {
    this.#limit = limit;
  }

  info(message: string): void {
    this.#push("info", message);
  }

  warn(message: string): void {
    this.#push("warn", message);
  }

  error(message: string): void {
    this.#push("error", message);
  }

  #push(level: LogEntry["level"], message: string): void {
    this.#entries.push({ at: Date.now(), level, message: redact(message) });
    if (this.#entries.length > this.#limit) this.#entries.splice(0, this.#entries.length - this.#limit);
  }

  entries(): LogEntry[] {
    return [...this.#entries];
  }

  clear(): void {
    this.#entries.length = 0;
  }
}
