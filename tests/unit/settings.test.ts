import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  SettingsError,
  SettingsStore,
  defaultSettings,
  type Migration,
} from "../../src/shared/settings.js";
import { MemoryStorageArea } from "../support/memory-storage.js";

function store(area: MemoryStorageArea, migrations: Migration[] = [], currentVersion?: number) {
  return new SettingsStore(area, {
    migrations,
    ...(currentVersion === undefined ? {} : { currentVersion }),
  });
}

describe("settings defaults", () => {
  it("applies defaults to an empty profile and records the schema version", async () => {
    const area = new MemoryStorageArea();
    const loaded = await store(area).load();

    expect(loaded.providers).toEqual([]);
    expect(loaded.routing.defaultProviderId).toBeNull();
    expect(loaded.ui.displayMode).toBe("bilingual");
    expect(loaded.limits.maxConcurrency).toBe(3);
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(await area.get(["schemaVersion"])).toEqual({ schemaVersion: CURRENT_SCHEMA_VERSION });
  });

  it("merges a partial old profile over the defaults instead of dropping the missing keys", async () => {
    const area = new MemoryStorageArea({
      schemaVersion: 1,
      providers: [{ id: "p_1", name: "Home", endpoint: "https://x.test/v1", model: "m", enabled: true, timeoutMs: 60000, maxConcurrency: 3 }],
      ui: { targetLang: "ja" },
    });
    const loaded = await store(area).load();
    expect(loaded.providers).toHaveLength(1);
    expect(loaded.ui.targetLang).toBe("ja");
    expect(loaded.ui.displayMode).toBe("bilingual");
    expect(loaded.limits.sessionCapSegments).toBe(0);
  });
});

describe("schema versioning", () => {
  it("treats a missing schemaVersion as version 1 and writes it back", async () => {
    const area = new MemoryStorageArea({ providers: [] });
    const loaded = await store(area).load();
    expect(loaded.schemaVersion).toBe(1);
    expect(await area.get(["schemaVersion"])).toEqual({ schemaVersion: 1 });
  });

  it("refuses to write when the stored profile is newer than this build", async () => {
    const area = new MemoryStorageArea({ schemaVersion: 99, providers: [] });
    const settingsStore = store(area);
    await settingsStore.load();
    expect(settingsStore.newerSchemaDetected).toBe(true);

    await expect(
      settingsStore.save((current) => {
        current.ui.targetLang = "fr";
        return current;
      }),
    ).rejects.toMatchObject({ code: "newerSchema" });

    // The refusal must not have changed anything on disk.
    expect(await area.get(null)).toMatchObject({ schemaVersion: 99 });
  });

  it("runs the migration chain in order and persists the new version once", async () => {
    const area = new MemoryStorageArea({ schemaVersion: 1, ui: { targetLang: "en" } });
    const applied: number[] = [];
    const migrations: Migration[] = [
      {
        to: 2,
        name: "add-display-mode",
        apply(raw) {
          applied.push(2);
          return { ...raw, ui: { ...(raw["ui"] as object), displayMode: "bilingual" } };
        },
      },
      {
        to: 3,
        name: "rename-target",
        apply(raw) {
          applied.push(3);
          return raw;
        },
      },
    ];

    const loaded = await store(area, migrations, 3).load();
    expect(applied).toEqual([2, 3]);
    expect(loaded.schemaVersion).toBe(3);
    expect(await area.get(["schemaVersion"])).toEqual({ schemaVersion: 3 });
  });

  it("persists nothing when a migration step fails, and names the step", async () => {
    const before = { schemaVersion: 1, providers: [], ui: { targetLang: "en" } };
    const area = new MemoryStorageArea(before);
    const migrations: Migration[] = [
      {
        to: 2,
        name: "good-step",
        apply: (raw) => ({ ...raw, providers: [{ id: "x" }] }),
      },
      {
        to: 3,
        name: "broken-step",
        apply: () => {
          throw new Error("unreadable value");
        },
      },
    ];

    await expect(store(area, migrations, 3).load()).rejects.toMatchObject({
      code: "migrationFailed",
      step: "broken-step",
    });
    expect(await area.get(null)).toEqual(before);
  });
});

describe("write guards", () => {
  it("writes every storage key together with the schema version", async () => {
    const area = new MemoryStorageArea();
    const settingsStore = store(area);
    const saved = await settingsStore.save((current) => {
      current.ui.targetLang = "de";
      return current;
    });
    expect(saved.ui.targetLang).toBe("de");

    const raw = await area.get(null);
    expect(Object.keys(raw).sort()).toEqual(
      ["credentials", "glossary", "limits", "providers", "routing", "schemaVersion", "sites", "style", "ui"].sort(),
    );
  });

  it("rejects page content so no translation can be persisted (FR-025)", async () => {
    const area = new MemoryStorageArea();
    const settingsStore = store(area);

    await expect(
      settingsStore.save((current) => {
        (current as unknown as Record<string, unknown>)["job"] = {
          units: [{ sourceText: "ZZPRIVACYZZ" }],
        };
        return current;
      }),
    ).rejects.toMatchObject({ code: "pageContent" });

    await expect(
      settingsStore.save((current) => {
        (current as unknown as Record<string, unknown>)["unitCache"] = [
          { translatedText: "rendered" },
        ];
        return current;
      }),
    ).rejects.toBeInstanceOf(SettingsError);
  });

  it("rejects a value that carries page text under a settings key", async () => {
    const area = new MemoryStorageArea();
    await expect(
      store(area).save((current) => {
        current.sites = [{ sitePattern: "news.example", autoTranslate: true, sourceText: "leak" } as never];
        return current;
      }),
    ).rejects.toMatchObject({ code: "pageContent" });
  });

  it("maps a storage quota failure to an actionable error and saves nothing", async () => {
    // Seeded so the load phase cannot be the write that fails.
    const area = new MemoryStorageArea({ schemaVersion: 1 });
    const settingsStore = store(area);
    area.failNextSet(new Error("QUOTA_BYTES quota exceeded"));

    await expect(
      settingsStore.save((current) => {
        current.ui.targetLang = "fr";
        return current;
      }),
    ).rejects.toMatchObject({ code: "storageQuota" });

    const raw = await area.get(null);
    expect(raw["ui"]).toBeUndefined();
  });

  it("defaults are a fresh object each time, so one store cannot mutate another", () => {
    const first = defaultSettings();
    first.ui.targetLang = "xx";
    expect(defaultSettings().ui.targetLang).toBe("zh");
  });
});

describe("delete all data (FR-024)", () => {
  it("clears everything and verifies emptiness by reading back", async () => {
    const area = new MemoryStorageArea({
      schemaVersion: 1,
      providers: [{ id: "p_1" }],
      credentials: { p_1: { secret: "sk-x" } },
      ui: { targetLang: "zh" },
    });
    const remaining = await store(area).deleteAll();
    expect(remaining).toEqual([]);
    expect(area.size).toBe(0);
  });
});
