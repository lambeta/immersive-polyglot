import { describe, expect, it } from "vitest";
import { CredentialVault, publicCredentialView, redact, RedactingLogger } from "../../src/background/credentials.js";
import { deleteProviderCascade, saveProvider } from "../../src/shared/providers.js";
import { SettingsStore, maskSecret } from "../../src/shared/settings.js";
import { MemoryStorageArea } from "../support/memory-storage.js";

const draft = {
  name: "Home server",
  endpoint: "https://models.example.test/v1/chat/completions",
  model: "qwen2.5",
  timeoutMs: 60_000,
  maxConcurrency: 3,
};

async function setup() {
  const area = new MemoryStorageArea();
  const store = new SettingsStore(area);
  const vault = new CredentialVault(store);
  const provider = await saveProvider(store, draft, { secret: "sk-live-abcdef123456" });
  return { area, store, vault, provider };
}

describe("credential accessors", () => {
  it("hands the secret only to the vault, and masks everywhere else", async () => {
    const { store, vault, provider } = await setup();

    expect(await vault.secret(provider.id)).toBe("sk-live-abcdef123456");
    const view = await publicCredentialView(store);
    expect(view[provider.id]?.masked).toBe(maskSecret("sk-live-abcdef123456"));
    expect(JSON.stringify(view)).not.toContain("abcdef123456");
    expect(JSON.stringify(await vault.masks())).not.toContain("abcdef123456");
  });

  it("exposes only the last four characters when masking", () => {
    expect(maskSecret("sk-live-abcdef123456")).toBe("••••3456");
    expect(maskSecret("abc")).toBe("••••");
    expect(maskSecret("  spaced-token-99  ")).toBe("••••n-99");
  });

  it("refuses to store a blank credential", async () => {
    const { vault, provider } = await setup();
    await expect(vault.put(provider.id, "   ")).rejects.toThrowError(/blank/);
  });

  it("deletes the provider and its credential in one operation", async () => {
    const { store, vault, provider } = await setup();
    await deleteProviderCascade(store, provider.id);

    const settings = await store.load();
    expect(settings.providers).toHaveLength(0);
    expect(settings.credentials).toEqual({});
    expect(await vault.secret(provider.id)).toBeNull();
  });

  it("leaves rules broken rather than silently repointing them", async () => {
    const { store, provider } = await setup();
    await store.save((current) => {
      current.routing.rules.push({
        id: "r_1",
        kind: "site",
        match: "news.example",
        providerId: provider.id,
        enabled: true,
      });
      return current;
    });

    await deleteProviderCascade(store, provider.id);
    const settings = await store.load();
    expect(settings.routing.rules).toHaveLength(1);
    expect(settings.routing.rules[0]?.providerId).toBe(provider.id);
  });

  it("reports and cleans a credential whose provider is gone", async () => {
    const { store, vault, provider } = await setup();
    await store.save((current) => {
      current.providers = [];
      return current;
    });

    expect(await vault.reconcile([])).toEqual([provider.id]);
    expect(await store.load()).toMatchObject({ credentials: {} });
    expect(publicCredentialView).toBeTypeOf("function");
  });
});

describe("redaction", () => {
  it("redacts credentials in logs and error strings", () => {
    expect(redact("Authorization: Bearer sk-live-abcdef123456")).not.toContain("abcdef123456");
    expect(redact({ secret: "sk-live-abcdef123456" })).not.toContain("abcdef123456");
    expect(redact("request failed for key sk-live-abcdef123456")).toContain("[redacted]");
  });

  it("keeps a bounded log the user can clear", () => {
    const logger = new RedactingLogger(3);
    for (let index = 0; index < 6; index += 1) logger.info(`line ${index} key=sk-live-abcdef123456`);
    expect(logger.entries()).toHaveLength(3);
    expect(JSON.stringify(logger.entries())).not.toContain("abcdef123456");
    logger.clear();
    expect(logger.entries()).toEqual([]);
  });
});
