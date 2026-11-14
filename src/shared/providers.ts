import { maskSecret, type SettingsStore } from "./settings.js";
import type { ProviderCredential, Settings, TranslationProvider } from "./types.js";

/**
 * Provider writes that must be atomic with their credential. Kept out of the background-only
 * module so the options surface can call it without importing a secret reader (FR-021).
 */

export interface ProviderDraft {
  name: string;
  endpoint: string;
  model: string;
  extraHeaders?: Record<string, string>;
  enabled?: boolean;
  timeoutMs: number;
  maxConcurrency: number;
}

export async function saveProvider(
  store: SettingsStore,
  draft: ProviderDraft,
  options: { id?: string; secret?: string } = {},
): Promise<TranslationProvider> {
  const settings = await store.load();
  const id = options.id ?? `p_${crypto.randomUUID().slice(0, 8)}`;
  const existing = settings.providers.find((provider) => provider.id === id);

  const provider: TranslationProvider = {
    id,
    name: draft.name.trim(),
    endpoint: draft.endpoint.trim(),
    model: draft.model.trim(),
    extraHeaders: draft.extraHeaders ?? existing?.extraHeaders ?? {},
    enabled: draft.enabled ?? existing?.enabled ?? true,
    timeoutMs: draft.timeoutMs,
    maxConcurrency: draft.maxConcurrency,
    ...(existing?.lastVerification ? { lastVerification: existing.lastVerification } : {}),
  };

  const secret = options.secret?.trim();
  await store.save((current) => {
    const index = current.providers.findIndex((candidate) => candidate.id === id);
    if (index >= 0) current.providers[index] = provider;
    else current.providers.push(provider);

    if (secret !== undefined && secret.length > 0) {
      current.credentials[id] = {
        providerId: id,
        secret,
        masked: maskSecret(secret),
        updatedAt: new Date().toISOString(),
      };
    }
    if (current.routing.defaultProviderId === null && provider.enabled) {
      current.routing.defaultProviderId = id;
    }
    return current;
  });

  return provider;
}

/**
 * FR-001/FR-024: the provider and its credential leave together. Rules that pointed at it are
 * deliberately left in place so the UI can report them as broken (US3 scenario 4) instead of
 * silently repointing the user's traffic.
 */
export async function deleteProviderCascade(
  store: SettingsStore,
  providerId: string,
): Promise<Settings> {
  return store.save((current) => {
    current.providers = current.providers.filter((provider) => provider.id !== providerId);
    delete current.credentials[providerId];
    for (const site of current.sites) {
      if (site.providerId === providerId) site.providerId = null;
    }
    return current;
  });
}

export function findProvider(
  settings: Settings,
  providerId: string | null,
): TranslationProvider | null {
  if (!providerId) return null;
  return settings.providers.find((provider) => provider.id === providerId) ?? null;
}

export function credentialOf(
  settings: Settings,
  providerId: string,
): ProviderCredential | undefined {
  return settings.credentials[providerId];
}
