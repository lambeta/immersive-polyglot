import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The manifest is the one place a tooltip, a permission or a shortcut could sneak in unnoticed
 * (feature 009 T22, plan T15). This guard pins what the feature was allowed to change — the
 * suggested key — and what it must not: the permission set and the icon declaration.
 */

const ROOT = join(import.meta.dirname, "../..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "src/manifest.json"), "utf8")) as {
  manifest_version?: number;
  permissions?: unknown;
  host_permissions?: unknown;
  optional_permissions?: unknown;
  optional_host_permissions?: unknown;
  commands?: Record<string, { suggested_key?: { default?: string }; description?: string }>;
  icons?: Record<string, string>;
  action?: { default_icon?: Record<string, string>; default_title?: string };
};

const SIZES = [16, 32, 48, 128];

describe("the manifest after feature 009", () => {
  it("still asks for exactly the permission set it had (spec Assumptions)", () => {
    expect(MANIFEST.manifest_version).toBe(3);
    expect(MANIFEST.permissions).toEqual(["storage"]);
    expect(MANIFEST.host_permissions).toEqual(["<all_urls>"]);
    expect(MANIFEST.optional_permissions).toBeUndefined();
    expect(MANIFEST.optional_host_permissions).toBeUndefined();
  });

  it("suggests Alt+A for the one command, and declares no second command (FR-017)", () => {
    expect(Object.keys(MANIFEST.commands ?? {})).toEqual(["toggle-translation"]);
    const command = MANIFEST.commands?.["toggle-translation"];
    expect(command?.suggested_key?.default).toBe("Alt+A");
    expect(command?.description).toBe("__MSG_commandToggleTranslation__");
  });

  it("keeps the icon declaration aimed at the ratified rasters (FR-016)", () => {
    for (const size of SIZES) {
      expect(MANIFEST.icons?.[String(size)]).toBe("icons/icon-" + size + ".png");
      expect(MANIFEST.action?.default_icon?.[String(size)]).toBe("icons/icon-" + size + ".png");
    }
    expect(MANIFEST.action?.default_title).toBe("__MSG_actionTitle__");
  });
});
