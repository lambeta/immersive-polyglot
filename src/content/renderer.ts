import { Journal } from "./restorer.js";
import type { DisplayMode } from "../shared/types.js";

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
}

export interface RenderOptions {
  displayMode: DisplayMode;
  targetLang: string;
  /** Injected for tests; defaults to the element's own window. */
  view?: Window | null;
}

export class Renderer {
  readonly #journal: Journal;
  readonly #view: Window | null;
  #mode: DisplayMode;
  #targetLang: string;
  readonly #rendered = new Map<Element, RenderedRecord>();

  constructor(journal: Journal, options: RenderOptions) {
    this.#journal = journal;
    this.#view = options.view ?? null;
    this.#mode = options.displayMode;
    this.#targetLang = options.targetLang;
  }

  get displayMode(): DisplayMode {
    return this.#mode;
  }

  get targetLang(): string {
    return this.#targetLang;
  }

  count(): number {
    return this.#rendered.size;
  }

  setTargetLang(lang: string): void {
    this.#targetLang = lang;
    for (const record of this.#rendered.values()) {
      this.#journal.recordAttribute(record.container, "lang");
      record.container.setAttribute("lang", lang);
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

    this.removeUnit(source);

    const doc = source.ownerDocument;
    const container = doc.createElement("div");
    const lang = unit.targetLang ?? this.#targetLang;

    this.#journal.recordAttribute(container, "data-ipt");
    this.#journal.recordAttribute(container, "data-ipt-unit");
    this.#journal.recordAttribute(container, "lang");
    container.setAttribute("data-ipt", TARGET_MARKER);
    container.setAttribute("data-ipt-unit", unit.id);
    container.setAttribute("lang", lang);
    container.textContent = clean;

    this.#journal.recordAttribute(source, "data-ipt");
    this.#journal.recordAttribute(source, "data-ipt-unit");
    source.setAttribute("data-ipt", SOURCE_MARKER);
    source.setAttribute("data-ipt-unit", unit.id);

    this.#inheritTypography(source, container);
    this.#place(container, source);
    this.#journal.recordInsert(container, container.parentNode ?? source, container.nextSibling);

    const record: RenderedRecord = { container, source, hidden: false };
    this.#hideSource(record, this.#mode === "only");
    this.#rendered.set(source, record);
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
