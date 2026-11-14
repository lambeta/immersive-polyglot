import type { DisplayStyleId } from "./types.js";
import { matchSite } from "./routing.js";

/**
 * The fifteen translation display styles (FR-001), reproduced as behaviour from observation
 * (research R2). Ids are stable and never localised; names come from the translation catalogue.
 * This module is the single source read by the renderer, the stylesheet's icon generator and both
 * pickers, so the catalogue cannot drift between them.
 */

export type DisplayStyleTreatment =
  | "none"
  | "underline"
  | "border"
  | "divider"
  | "marking"
  | "quote"
  | "foreground";

export type DisplayStyleForegroundPolicy = "inherit" | "hue-blend" | "neutral";

export type DisplayStyleIconMark =
  | "none"
  | "underline"
  | "border"
  | "rule"
  | "fill"
  | "band"
  | "band-slanted"
  | "bar"
  | "blur"
  | "dim"
  | "fade"
  | "hatch";

export type DisplayStyleIconPattern = "solid" | "dashed" | "dotted";

export interface DisplayStyleIcon {
  /** The decorative mark drawn next to the abstract text bars. */
  readonly mark: DisplayStyleIconMark;
  /** Stroke pattern for line-based marks (underline, border). */
  readonly pattern?: DisplayStyleIconPattern;
}

export interface DisplayStyle {
  readonly id: DisplayStyleId;
  /** Contiguous 0-14, matching the reference list order. */
  readonly order: number;
  readonly nameKey: string;
  readonly treatment: DisplayStyleTreatment;
  /** True only for blur, transparency and weakened (FR-012). */
  readonly concealment: boolean;
  readonly foregroundPolicy: DisplayStyleForegroundPolicy;
  readonly icon: DisplayStyleIcon;
}

export const DISPLAY_STYLES: readonly DisplayStyle[] = [
  { id: "none", order: 0, nameKey: "displayStyleNone", treatment: "none", concealment: false, foregroundPolicy: "inherit", icon: { mark: "none" } },
  { id: "underline-dashed", order: 1, nameKey: "displayStyleUnderlineDashed", treatment: "underline", concealment: false, foregroundPolicy: "inherit", icon: { mark: "underline", pattern: "dashed" } },
  { id: "underline-solid", order: 2, nameKey: "displayStyleUnderlineSolid", treatment: "underline", concealment: false, foregroundPolicy: "inherit", icon: { mark: "underline", pattern: "solid" } },
  { id: "border-dashed", order: 3, nameKey: "displayStyleBorderDashed", treatment: "border", concealment: false, foregroundPolicy: "inherit", icon: { mark: "border", pattern: "dashed" } },
  { id: "border-solid", order: 4, nameKey: "displayStyleBorderSolid", treatment: "border", concealment: false, foregroundPolicy: "inherit", icon: { mark: "border", pattern: "solid" } },
  { id: "blur", order: 5, nameKey: "displayStyleBlur", treatment: "foreground", concealment: true, foregroundPolicy: "inherit", icon: { mark: "blur" } },
  { id: "transparency", order: 6, nameKey: "displayStyleTransparency", treatment: "foreground", concealment: true, foregroundPolicy: "inherit", icon: { mark: "dim" } },
  { id: "underline-dotted", order: 7, nameKey: "displayStyleUnderlineDotted", treatment: "underline", concealment: false, foregroundPolicy: "inherit", icon: { mark: "underline", pattern: "dotted" } },
  { id: "divider", order: 8, nameKey: "displayStyleDivider", treatment: "divider", concealment: false, foregroundPolicy: "inherit", icon: { mark: "rule" } },
  { id: "highlight", order: 9, nameKey: "displayStyleHighlight", treatment: "marking", concealment: false, foregroundPolicy: "inherit", icon: { mark: "fill" } },
  { id: "marker", order: 10, nameKey: "displayStyleMarker", treatment: "marking", concealment: false, foregroundPolicy: "inherit", icon: { mark: "band" } },
  { id: "marker-2", order: 11, nameKey: "displayStyleMarker2", treatment: "marking", concealment: false, foregroundPolicy: "inherit", icon: { mark: "band-slanted" } },
  { id: "quote", order: 12, nameKey: "displayStyleQuote", treatment: "quote", concealment: false, foregroundPolicy: "inherit", icon: { mark: "bar" } },
  { id: "weakened", order: 13, nameKey: "displayStyleWeakened", treatment: "foreground", concealment: true, foregroundPolicy: "hue-blend", icon: { mark: "fade" } },
  { id: "gray", order: 14, nameKey: "displayStyleGray", treatment: "foreground", concealment: false, foregroundPolicy: "neutral", icon: { mark: "hatch" } },
];

export const DEFAULT_DISPLAY_STYLE: DisplayStyleId = "none";

const BY_ID: ReadonlyMap<string, DisplayStyle> = new Map(
  DISPLAY_STYLES.map((style) => [style.id, style]),
);

/** Throws only on a programming error: pass a known id, or use `resolveDisplayStyle`. */
export function displayStyleById(id: DisplayStyleId): DisplayStyle {
  const style = BY_ID.get(id);
  if (!style) throw new Error(`Unknown display style: ${id}`);
  return style;
}

export function isDisplayStyleId(value: unknown): value is DisplayStyleId {
  return typeof value === "string" && BY_ID.has(value);
}

/** FR-020: an unknown identifier is not an error; it is simply "none". */
export function resolveDisplayStyle(value: unknown): DisplayStyleId {
  return isDisplayStyleId(value) ? value : DEFAULT_DISPLAY_STYLE;
}

export type DisplayStyleSource = "site" | "global" | "default";

export interface ResolvedDisplayStyle {
  styleId: DisplayStyleId;
  source: DisplayStyleSource;
}

export interface DisplayStylePreferenceSource {
  ui: { displayStyle?: unknown };
  sites: readonly { sitePattern: string; displayStyle?: unknown }[];
}

/**
 * Resolution order (data-model.md): matching site override -> device-wide default -> none.
 * Site matching reuses feature 001's matcher, so language, mode and style agree about a site.
 */
export function resolveDisplayStyleForHost(
  settings: DisplayStylePreferenceSource,
  host: string,
): ResolvedDisplayStyle {
  const site = settings.sites.find((preference) => matchSite(preference.sitePattern, host));
  if (site && isDisplayStyleId(site.displayStyle)) {
    return { styleId: site.displayStyle, source: "site" };
  }
  if (isDisplayStyleId(settings.ui.displayStyle)) {
    return { styleId: settings.ui.displayStyle, source: "global" };
  }
  return { styleId: DEFAULT_DISPLAY_STYLE, source: "default" };
}
