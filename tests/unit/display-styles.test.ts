import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY_STYLE,
  DISPLAY_STYLES,
  displayStyleById,
  isDisplayStyleId,
  resolveDisplayStyle,
  resolveDisplayStyleForHost,
} from "../../src/shared/display-styles.js";
import type { DisplayStyleId } from "../../src/shared/types.js";

const CATALOG = JSON.parse(
  readFileSync(join(import.meta.dirname, "../..", "src/_locales/en/messages.json"), "utf8"),
) as Record<string, { message: string }>;

const EXPECTED_ORDER: DisplayStyleId[] = [
  "none",
  "underline-dashed",
  "underline-solid",
  "border-dashed",
  "border-solid",
  "blur",
  "transparency",
  "underline-dotted",
  "divider",
  "highlight",
  "marker",
  "marker-2",
  "quote",
  "weakened",
  "gray",
];

describe("display style catalogue", () => {
  it("offers exactly the fifteen styles in the reference order (FR-001)", () => {
    expect(DISPLAY_STYLES).toHaveLength(15);
    expect(DISPLAY_STYLES.map((style) => style.id)).toEqual(EXPECTED_ORDER);
    expect(DISPLAY_STYLES.map((style) => style.order)).toEqual(
      Array.from({ length: 15 }, (_value, index) => index),
    );
  });

  it("keeps ids stable and unique", () => {
    expect(new Set(DISPLAY_STYLES.map((style) => style.id)).size).toBe(15);
    for (const id of EXPECTED_ORDER) expect(isDisplayStyleId(id)).toBe(true);
  });

  it("resolves every name through the translation catalogue (FR-022)", () => {
    for (const style of DISPLAY_STYLES) {
      expect(CATALOG[style.nameKey]?.message.trim().length ?? 0, style.id).toBeGreaterThan(0);
    }
  });

  it("marks only blur, transparency and weakened as concealment styles (FR-012)", () => {
    const concealed = DISPLAY_STYLES.filter((style) => style.concealment).map((style) => style.id);
    expect(concealed).toEqual(["blur", "transparency", "weakened"]);
  });

  it("uses the neutral foreground for gray and the hue blend for weakened (FR-013)", () => {
    expect(displayStyleById("gray").foregroundPolicy).toBe("neutral");
    expect(displayStyleById("weakened").foregroundPolicy).toBe("hue-blend");
    for (const style of DISPLAY_STYLES.filter((candidate) => candidate.treatment !== "foreground")) {
      expect(style.foregroundPolicy).toBe("inherit");
    }
  });

  it("resolves an unknown or missing identifier to none instead of failing (FR-020)", () => {
    expect(resolveDisplayStyle("not-a-style")).toBe(DEFAULT_DISPLAY_STYLE);
    expect(resolveDisplayStyle(undefined)).toBe("none");
    expect(resolveDisplayStyle(null)).toBe("none");
    expect(resolveDisplayStyle(42)).toBe("none");
    expect(resolveDisplayStyle("marker")).toBe("marker");
    expect(isDisplayStyleId("not-a-style")).toBe(false);
  });

  it("throws only when a known id is required", () => {
    expect(() => displayStyleById("nope" as DisplayStyleId)).toThrowError(/Unknown display style/);
    expect(displayStyleById("quote").nameKey).toBe("displayStyleQuote");
  });
});

describe("display style resolution for a host", () => {
  it("prefers a catalogued site override over the global default (FR-019)", () => {
    const resolved = resolveDisplayStyleForHost(
      {
        ui: { displayStyle: "highlight" },
        sites: [{ sitePattern: "news.example", displayStyle: "quote" }],
      },
      "news.example",
    );
    expect(resolved).toEqual({ styleId: "quote", source: "site" });
  });

  it("falls back to the global default on another site", () => {
    const resolved = resolveDisplayStyleForHost(
      {
        ui: { displayStyle: "highlight" },
        sites: [{ sitePattern: "news.example", displayStyle: "quote" }],
      },
      "docs.example",
    );
    expect(resolved).toEqual({ styleId: "highlight", source: "global" });
  });

  it("ignores an unknown override instead of propagating it (FR-020)", () => {
    const resolved = resolveDisplayStyleForHost(
      {
        ui: { displayStyle: "marker" },
        sites: [{ sitePattern: "news.example", displayStyle: "gone" }],
      },
      "news.example",
    );
    expect(resolved).toEqual({ styleId: "marker", source: "global" });
  });

  it("reports the default source when nothing is stored", () => {
    expect(resolveDisplayStyleForHost({ ui: {}, sites: [] }, "news.example")).toEqual({
      styleId: "none",
      source: "default",
    });
  });

  it("ignores an unknown global default (FR-020)", () => {
    expect(resolveDisplayStyleForHost({ ui: { displayStyle: "unknown" }, sites: [] }, "x")).toEqual({
      styleId: "none",
      source: "default",
    });
  });
});
