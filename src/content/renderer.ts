import { Journal } from "./restorer.js";
import { isRtlLanguage } from "../shared/direction.js";
import { displayStyleById, resolveDisplayStyle } from "../shared/display-styles.js";
import { sanitiseTypography } from "../shared/settings.js";
import {
  BLACK,
  effectiveBackdrop,
  isLargeText,
  parseColor,
  safeForeground,
  toCss,
} from "../shared/contrast.js";
import type { DisplayMode, DisplayStyleId, TranslationTypography } from "../shared/types.js";

/**
 * Reproduces the rendering behaviour pinned by contracts/rendering-dom.md section 1: each
 * translation is a block-level sibling of exactly one source block, carries the target
 * language, inherits the source typography through CSSOM, and is written through the journal so
 * it can be removed exactly.
 *
 * Nothing here copies Immersive Translate code; the behaviour was specified from observation
 * (research R2).
 */

export const TARGET_MARKER = "target";
export const SOURCE_MARKER = "source";

const INHERITED_PROPERTIES = [
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "line-height",
  "text-align",
  "letter-spacing",
  "word-spacing",
  "direction",
  "color",
] as const;

/** Elements whose content is inline-ish: a sibling block would break their layout tree. */
const CONTAINER_TAGS = new Set(["LI", "TD", "TH", "DD", "DT", "CAPTION", "SUMMARY"]);

interface RenderedRecord {
  container: HTMLElement;
  source: Element;
  hidden: boolean;
  /** The inherited colour written by #inheritTypography, restored when a foreground style ends. */
  baseColor: string;
  /** Feature 004: the source typography captured once, so restyling never re-reads a hidden source. */
  baseFontFamily: string;
  baseFontSizePx: number | null;
  baseLineHeight: string;
}

export interface RenderOptions {
  displayMode: DisplayMode;
  targetLang: string;
  /** FR-001: the resolved display style. Unknown values resolve to "none" (FR-020). */
  displayStyle?: DisplayStyleId;
  /** Feature 004 FR-009/FR-010: the reader's translation typography. */
  typography?: TranslationTypography;
  /** Injected for tests; defaults to the element's own window. */
  view?: Window | null;
}

export class Renderer {
  readonly #journal: Journal;
  readonly #view: Window | null;
  #mode: DisplayMode;
  #targetLang: string;
  #style: DisplayStyleId;
  #typography: TranslationTypography;
  readonly #rendered = new Map<Element, RenderedRecord>();

  constructor(journal: Journal, options: RenderOptions) {
    this.#journal = journal;
    this.#view = options.view ?? null;
    this.#mode = options.displayMode;
    this.#targetLang = options.targetLang;
    this.#style = resolveDisplayStyle(options.displayStyle);
    this.#typography = sanitiseTypography(options.typography ?? {});
  }

  get displayStyle(): DisplayStyleId {
    return this.#style;
  }

  get displayMode(): DisplayMode {
    return this.#mode;
  }

  get targetLang(): string {
    return this.#targetLang;
  }

  get typography(): TranslationTypography {
    return { ...this.#typography };
  }

  count(): number {
    return this.#rendered.size;
  }

  setTargetLang(lang: string): void {
    this.#targetLang = lang;
    for (const record of this.#rendered.values()) {
      this.#journal.recordAttributeOnce(record.container, "lang");
      record.container.setAttribute("lang", lang);
      this.#applyDirection(record.container, lang);
    }
  }

  /**
   * FR-002/FR-003: restyle every rendered block in place. This never creates, moves or detaches
   * a node, never touches unit state, and issues no request.
   */
  setDisplayStyle(style: DisplayStyleId | string): void {
    const next = resolveDisplayStyle(style);
    if (next === this.#style) return;
    this.#style = next;
    for (const record of this.#rendered.values()) {
      this.#journal.recordAttributeOnce(record.container, "data-ipt-style");
      record.container.setAttribute("data-ipt-style", next);
      this.#applyPresentation(record);
    }
  }

  /**
   * Feature 004 FR-019: apply the reader's typography to every block already on the page, without
   * creating a node, re-segmenting or requesting a translation.
   */
  setTypography(typography: TranslationTypography): void {
    const next = sanitiseTypography(typography);
    if (next.fontFamily === this.#typography.fontFamily && next.fontScale === this.#typography.fontScale) {
      return;
    }
    this.#typography = next;
    for (const record of this.#rendered.values()) {
      this.#applyTypography(record);
      // The contrast rule classifies large text by computed size, so the colour follows the type.
      this.#applyForeground(record);
    }
  }

  setDisplayMode(mode: DisplayMode): void {
    if (mode === this.#mode) return;
    this.#mode = mode;
    for (const record of this.#rendered.values()) {
      this.#place(record.container, record.source);
      this.#hideSource(record, mode === "only");
    }
  }

  /** FR-020: only a real translation may be rendered, and only as text. */
  renderUnit(unit: { id: string; targetLang?: string }, text: string, source: Element): HTMLElement {
    const clean = text.trim();
    if (clean.length === 0) throw new Error("Refusing to render an empty translation (FR-020)");

    const lang = unit.targetLang ?? this.#targetLang;
    // FR-001/FR-002: a block owns one container. A later part (or a re-render) rewrites the text of
    // the container already attached to this source instead of detaching it and building another.
    const rendered = this.#rendered.get(source);
    if (rendered) {
      rendered.container.textContent = clean;
      this.#journal.recordAttributeOnce(rendered.container, "lang");
      rendered.container.setAttribute("lang", lang);
      rendered.container.setAttribute("data-ipt-unit", unit.id);
      this.#applyDirection(rendered.container, lang);
      return rendered.container;
    }

    const doc = source.ownerDocument;
    const container = doc.createElement("div");

    this.#journal.recordAttribute(container, "data-ipt");
    this.#journal.recordAttribute(container, "data-ipt-unit");
    // Once: a later target-language switch rewrites the same attribute (FR-016).
    this.#journal.recordAttributeOnce(container, "lang");
    this.#journal.recordAttributeOnce(container, "data-ipt-style");
    container.setAttribute("data-ipt", TARGET_MARKER);
    container.setAttribute("data-ipt-unit", unit.id);
    container.setAttribute("lang", lang);
    container.setAttribute("data-ipt-style", this.#style);
    container.textContent = clean;
    this.#applyDirection(container, lang);

    this.#journal.recordAttribute(source, "data-ipt");
    this.#journal.recordAttribute(source, "data-ipt-unit");
    source.setAttribute("data-ipt", SOURCE_MARKER);
    source.setAttribute("data-ipt-unit", unit.id);

    this.#inheritTypography(source, container);

    const record: RenderedRecord = {
      container,
      source,
      hidden: false,
      baseColor: container.style.getPropertyValue("color"),
      baseFontFamily: "",
      baseFontSizePx: null,
      baseLineHeight: "",
    };
    this.#captureBaseTypography(record);
    this.#applyTypography(record);

    this.#place(container, source);
    this.#journal.recordInsert(container, container.parentNode ?? source, container.nextSibling);
    this.#hideSource(record, this.#mode === "only");
    this.#rendered.set(source, record);
    this.#applyPresentation(record);
    return container;
  }

  removeUnit(source: Element): boolean {
    const record = this.#rendered.get(source);
    if (!record) return false;
    record.container.remove();
    this.#hideSource(record, false);
    this.#rendered.delete(source);
    return true;
  }

  renderedElement(source: Element): HTMLElement | undefined {
    return this.#rendered.get(source)?.container;
  }

  #place(container: HTMLElement, source: Element): void {
    const inContainer = CONTAINER_TAGS.has(source.tagName);
    const before = this.#mode === "above";

    this.#journal.recordAttribute(container, "data-ipt-position");
    if (before) container.setAttribute("data-ipt-position", "before");
    else container.removeAttribute("data-ipt-position");

    if (inContainer) {
      if (before) source.insertBefore(container, source.firstChild);
      else source.appendChild(container);
      return;
    }

    const parent = source.parentNode;
    if (!parent) {
      source.appendChild(container);
      return;
    }
    if (before) parent.insertBefore(container, source);
    else parent.insertBefore(container, source.nextSibling);
  }

  #hideSource(record: RenderedRecord, hidden: boolean): void {
    const element = record.source as HTMLElement;
    if (hidden && !record.hidden) {
      record.hidden = true;
      this.#journal.recordAttribute(element, "hidden");
      this.#journal.recordStyle(element);
      element.setAttribute("hidden", "");
      element.style.setProperty("display", "none");
    } else if (!hidden && record.hidden) {
      record.hidden = false;
      this.#journal.recordAttribute(element, "hidden");
      this.#journal.recordStyle(element);
      element.removeAttribute("hidden");
      element.style.removeProperty("display");
    }
  }

  /**
   * FR-001/FR-005 (feature 004): an RTL target carries `dir="rtl"` so logical properties mirror and
   * the text lays out right-to-left; every other target drops the attribute and inherits the page.
   * Journalled once per container, so repeated language changes cannot grow the journal.
   */
  #applyDirection(container: HTMLElement, lang: string): void {
    this.#journal.recordAttributeOnce(container, "dir");
    if (isRtlLanguage(lang)) container.setAttribute("dir", "rtl");
    else container.removeAttribute("dir");
  }

  /** Captures the source typography once; restyling must not re-read a hidden source. */
  #captureBaseTypography(record: RenderedRecord): void {
    const view = this.#view ?? record.source.ownerDocument.defaultView;
    if (!view || typeof view.getComputedStyle !== "function") return;
    try {
      const computed = view.getComputedStyle(record.source);
      record.baseFontFamily = computed.getPropertyValue("font-family").trim();
      const size = Number.parseFloat(computed.getPropertyValue("font-size"));
      if (Number.isFinite(size) && size > 0) record.baseFontSizePx = size;
      record.baseLineHeight = computed.getPropertyValue("line-height").trim();
    } catch {
      // Keep the defaults; a hostile page must not stop a render.
    }
  }

  /**
   * Feature 004 FR-009/FR-010/FR-011/FR-014/FR-015: the family stack with the source family as
   * the final fallback, and a size scale relative to this block's own source size.
   */
  #applyTypography(record: RenderedRecord): void {
    const style = record.container.style;
    this.#journal.recordStyle(record.container);
    const { fontFamily, fontScale } = this.#typography;

    if (fontFamily.length === 0) style.removeProperty("font-family");
    else style.setProperty("font-family", composeFontFamily(fontFamily, record.baseFontFamily));

    if (fontScale === 100 || record.baseFontSizePx === null) {
      style.removeProperty("font-size");
      style.removeProperty("line-height");
      return;
    }

    style.setProperty("font-size", formatPx((record.baseFontSizePx * fontScale) / 100));
    const lineHeight = Number.parseFloat(record.baseLineHeight);
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
      style.setProperty("line-height", formatPx((lineHeight * fontScale) / 100));
    } else if (record.baseLineHeight === "normal" || record.baseLineHeight.length === 0) {
      // An unset computed line-height is the initial value, "normal"; scaling must keep that.
      style.setProperty("line-height", "normal");
    } else {
      style.removeProperty("line-height");
    }
  }

  /** Concealment attributes and the contrast-safe foreground for the current style. */
  #applyPresentation(record: RenderedRecord): void {
    this.#applyConcealment(record);
    this.#applyForeground(record);
  }

  #applyConcealment(record: RenderedRecord): void {
    const concealed = displayStyleById(this.#style).concealment;
    this.#journal.recordAttributeOnce(record.container, "data-ipt-conceal");
    this.#journal.recordAttributeOnce(record.container, "tabindex");
    if (concealed) {
      record.container.setAttribute("data-ipt-conceal", "true");
      record.container.setAttribute("tabindex", "0");
    } else {
      record.container.removeAttribute("data-ipt-conceal");
      record.container.removeAttribute("tabindex");
    }
  }

  #applyForeground(record: RenderedRecord): void {
    const style = displayStyleById(this.#style);
    const view = this.#view ?? record.container.ownerDocument.defaultView;
    if (!view) return;
    this.#journal.recordStyle(record.container);

    if (style.foregroundPolicy === "inherit") {
      record.container.style.removeProperty("--ipt-style-fg");
      record.container.style.removeProperty("--ipt-style-base");
      if (record.baseColor.length > 0) record.container.style.setProperty("color", record.baseColor);
      else record.container.style.removeProperty("color");
      return;
    }

    const backdrop = effectiveBackdrop(record.container, view);
    let inherited = BLACK;
    let fontSize = 16;
    let fontWeight = 400;
    try {
      const computed = view.getComputedStyle(record.container);
      inherited = parseColor(computed.getPropertyValue("color")) ?? BLACK;
      fontSize = Number.parseFloat(computed.getPropertyValue("font-size")) || 16;
      const sourceComputed = view.getComputedStyle(record.source);
      fontWeight = Number.parseInt(sourceComputed.getPropertyValue("font-weight"), 10) || 400;
    } catch {
      // Keep the defaults; a hostile page must not stop a render.
    }

    const foreground = safeForeground(backdrop, style.foregroundPolicy, inherited, {
      largeText: isLargeText(fontSize, fontWeight),
    });
    // The stylesheet owns the colour for these styles (so :hover/:focus can reveal it), which
    // means the inline inherited colour from #inheritTypography must be removed rather than
    // overridden: inline declarations beat every author rule. The base colour travels in a custom
    // property for the reveal rule.
    record.container.style.removeProperty("color");
    // Normalise whatever the platform reports (a browser yields rgb(), jsdom may yield a system
    // colour such as canvastext) so the custom property is always a concrete colour.
    const baseColor = parseColor(record.baseColor) ?? inherited;
    record.container.style.setProperty("--ipt-style-fg", toCss(foreground));
    record.container.style.setProperty("--ipt-style-base", toCss(baseColor));
  }

  #inheritTypography(source: Element, container: HTMLElement): void {
    const view = this.#view ?? source.ownerDocument.defaultView;
    if (!view || typeof view.getComputedStyle !== "function") return;
    let computed: CSSStyleDeclaration;
    try {
      computed = view.getComputedStyle(source);
    } catch {
      return;
    }
    this.#journal.recordStyle(container);
    for (const property of INHERITED_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (!value) continue;
      container.style.setProperty(property, value);
    }
  }
}
/** Formats a scaled length the way a declaration would report it, without float noise. */
function formatPx(value: number): string {
  return String(Math.round(value * 100) / 100) + "px";
}

/** Strips the quotes from one family entry so equality ignores a quoted and an unquoted name. */
function unquoteFamily(entry: string): string {
  return entry.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
}

/**
 * Feature 004 FR-014: the reader's stack, with the source family appended as the final fallback
 * unless the stack already ends with it. Keeps missing glyphs readable in the page's own face.
 */
function composeFontFamily(stack: string, sourceFamily: string): string {
  const source = sourceFamily.trim();
  if (source.length === 0) return stack;
  const entries = stack.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const last = unquoteFamily(entries[entries.length - 1] ?? "");
  const firstSource = unquoteFamily(source.split(",")[0] ?? "");
  if (last.length > 0 && last === firstSource) return stack;
  return stack + ", " + source;
}
