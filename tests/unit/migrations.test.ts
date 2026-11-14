import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, SettingsStore, type Migration } from "../../src/shared/settings.js";
import { MemoryStorageArea } from "../support/memory-storage.js";

/**
 * T087: every schemaVersion path starts from a stored fixture of the old shape, not from an
 * object the test invented (contracts/storage-schema.md section 3, constitution principle IV).
 */

const V1_FIXTURE = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/storage/v1.json"), "utf8"),
) as Record<string, unknown>;

describe("migration paths", () => {
  it("loads the v1 fixture unchanged at the current version", async () => {
    const area = new MemoryStorageArea(V1_FIXTURE);
    const loaded = await new SettingsStore(area).load();

    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.providers[0]?.name).toBe("Legacy provider");
    expect(loaded.glossary[0]?.targetTerm).toBe("潮汐");
    expect(loaded.routing.defaultProviderId).toBe("p_legacy");
    expect(await area.get(["schemaVersion"])).toEqual({ schemaVersion: CURRENT_SCHEMA_VERSION });
  });

  it("upgrades the v1 fixture through an ordered chain and writes once", async () => {
    const area = new MemoryStorageArea(V1_FIXTURE);
    const steps: string[] = [];
    const migrations: Migration[] = [
      {
        to: 2,
        name: "add-sites",
        apply(raw) {
          steps.push("add-sites");
          return { ...raw, sites: Array.isArray(raw["sites"]) ? raw["sites"] : [] };
        },
      },
      {
        to: 3,
        name: "add-session-char-cap",
        apply(raw) {
          steps.push("add-session-char-cap");
          const limits = (raw["limits"] ?? {}) as Record<string, unknown>;
          return { ...raw, limits: { ...limits, sessionCapChars: 0 } };
        },
      },
    ];

    const loaded = await new SettingsStore(area, { migrations, currentVersion: 3 }).load();

    expect(steps).toEqual(["add-sites", "add-session-char-cap"]);
    expect(loaded.schemaVersion).toBe(3);
    expect(loaded.limits.sessionCapChars).toBe(0);
    expect(await area.get(["schemaVersion"])).toEqual({ schemaVersion: 3 });
  });

  it("refuses a fixture written by a newer build and leaves it untouched", async () => {
    const newer = { ...V1_FIXTURE, schemaVersion: 99 };
    const area = new MemoryStorageArea(newer);
    const store = new SettingsStore(area);
    const loaded = await store.load();

    expect(loaded.schemaVersion).toBe(99);
    await expect(store.save((current) => current)).rejects.toMatchObject({ code: "newerSchema" });
    expect(await area.get(null)).toEqual(newer);
  });

  it("refuses to persist a half-migrated fixture", async () => {
    const area = new MemoryStorageArea(V1_FIXTURE);
    const migrations: Migration[] = [
      { to: 2, name: "first", apply: (raw) => ({ ...raw, providers: [] }) },
      {
        to: 3,
        name: "second",
        apply: () => {
          throw new Error("cannot read limits");
        },
      },
    ];

    await expect(
      new SettingsStore(area, { migrations, currentVersion: 3 }).load(),
    ).rejects.toMatchObject({
      code: "migrationFailed",
      step: "second",
    });
    expect(await area.get(null)).toEqual(V1_FIXTURE);
  });

  it("treats a fixture with no schemaVersion as v1", async () => {
    const { schemaVersion: _dropped, ...withoutVersion } = V1_FIXTURE;
    const area = new MemoryStorageArea(withoutVersion);
    const loaded = await new SettingsStore(area).load();
    expect(loaded.schemaVersion).toBe(1);
    expect(await area.get(["schemaVersion"])).toEqual({ schemaVersion: 1 });
  });
});
