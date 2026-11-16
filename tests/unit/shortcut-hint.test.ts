import { describe, expect, it } from "vitest";
import { shortcutFor } from "../../src/ui/popup/shortcut-hint.js";
import {
  MAC_DEFAULT,
  MISSING,
  REBOUND,
  UNBOUND,
  WINDOWS_DEFAULT,
} from "../support/command-fixtures.js";

/**
 * The panel must name the key the browser actually bound, verbatim (feature 009 FR-018–FR-021,
 * FR-027). The macOS probe returned ⌥A for the declared Alt+A, which is why nothing here translates
 * or re-spells the string.
 */

describe("shortcutFor (FR-018, FR-020, FR-021, FR-027)", () => {
  it("returns the browser's string verbatim, platform notation included", () => {
    expect(shortcutFor(MAC_DEFAULT)).toBe("⌥A");
    expect(shortcutFor(WINDOWS_DEFAULT)).toBe("Alt+A");
  });

  it("follows a rebind without any other change", () => {
    expect(shortcutFor(REBOUND)).toBe("Ctrl+Shift+Y");
  });

  it("returns null when nothing is bound, whatever the reason", () => {
    expect(shortcutFor(UNBOUND)).toBeNull();
    expect(shortcutFor(MISSING)).toBeNull();
    expect(shortcutFor([])).toBeNull();
  });

  it("selects the command by name, never by index, and ignores Chrome's own entry", () => {
    const shuffled = [...MISSING, { name: "toggle-translation", shortcut: "Alt+A" }];
    expect(shortcutFor(shuffled)).toBe("Alt+A");
    expect(shortcutFor(MISSING)).toBeNull();
  });

  it("trims a padded shortcut and refuses one that is only whitespace", () => {
    expect(shortcutFor([{ name: "toggle-translation", shortcut: "  Alt+A  " }])).toBe("Alt+A");
    expect(shortcutFor([{ name: "toggle-translation", shortcut: "   " }])).toBeNull();
  });

  it("returns null when the entry has no shortcut member at all", () => {
    expect(shortcutFor([{ name: "toggle-translation" }])).toBeNull();
  });

  it("can be asked for another command's binding", () => {
    expect(shortcutFor(REBOUND, "toggle-translation")).toBe("Ctrl+Shift+Y");
    expect(shortcutFor(REBOUND, "something-else")).toBeNull();
  });
});
