/**
 * In-place label rendering (feature 010, FR-009/FR-010/FR-014).
 *
 * The drawing's shapes are the page's; only a label's own text runs and, when the translation does
 * not fit its own footprint, that label's type size may change. Every write is journalled so the
 * restore path is the same inverse replay as prose.
 */

import { isRtlLanguage } from "../shared/direction.js";
import { labelRuns, type LabelBox } from "./graphics.js";
import type { Journal } from "./restorer.js";

export type LabelMeasure = (root: Element) => LabelBox | null;

export interface LabelRenderOptions {
  targetLang: string;
  measure?: LabelMeasure;
  view?: Window | null;
}

export interface LabelRenderResult {
  applied: boolean;
}

interface StyledElement extends Element {
  style: CSSStyleDeclaration;
}

/**
 * Write one translation into one label root. Returns false when no run exists or the translation
 * cannot fit at the readability floor; in that case the original runs and the original inline style
 * are put back before returning.
 */
export function renderLabel(
  journal: Journal,
  root: Element,
  text: string,
  options: LabelRenderOptions,
): LabelRenderResult {
  const clean = text.trim();
  if (clean.length === 0) return { applied: false };

  const runs = labelRuns(root);
  const target = runs.find((run) => (run.nodeValue ?? "").trim().length > 0);
  if (!target) return { applied: false };

  const view = options.view ?? root.ownerDocument?.defaultView ?? null;
  const measure = options.measure ?? ((element: Element) => measureElement(element, view));
  const original = runs.map((run) => run.nodeValue ?? "");
  const originalBox = measure(root);
  const styled = root as StyledElement;
  const originalFontSize = styled.style.getPropertyValue("font-size");
  const originalFontPriority = styled.style.getPropertyPriority("font-size");
  const originalDirection = styled.style.getPropertyValue("direction");
  const originalDirectionPriority = styled.style.getPropertyPriority("direction");

  for (const run of runs) journal.recordText(run);
  journal.recordStyle(root);

  for (const run of runs) run.nodeValue = run === target ? clean : "";

  const size = fontSizeOf(root, view);
  if (originalBox && !fits(measure(root), originalBox, root)) {
    const floor = Math.max(size * 0.75, 10);
    let applied = false;
    for (let next = size - 1; next >= floor - 0.01; next -= 1) {
      styled.style.setProperty("font-size", formatPx(next));
      if (fits(measure(root), originalBox, root)) {
        applied = true;
        break;
      }
    }
    if (!applied) {
      for (let index = 0; index < runs.length; index += 1) {
        const run = runs[index];
        if (run) run.nodeValue = original[index] ?? "";
      }
      restoreProperty(styled, "font-size", originalFontSize, originalFontPriority);
      restoreProperty(styled, "direction", originalDirection, originalDirectionPriority);
      return { applied: false };
    }
  }

  if (isRtlLanguage(options.targetLang)) {
    styled.style.setProperty("direction", "rtl");
  }
  return { applied: true };
}

function fits(box: LabelBox | null, original: LabelBox, root: Element): boolean {
  if (!box) return true;
  if (box.width > original.width + 0.5) return false;
  // An SVG text label is a single line; an HTML label can wrap, so it must not grow taller either.
  if (root.tagName.toUpperCase() !== "TEXT" && box.height > original.height + 0.5) return false;
  return true;
}

function measureElement(element: Element, view: Window | null): LabelBox | null {
  const candidate = element as Element & { getBBox?: () => DOMRect };
  if (typeof candidate.getBBox === "function") {
    try {
      const box = candidate.getBBox();
      if (
        Number.isFinite(box.width) &&
        Number.isFinite(box.height) &&
        (box.width > 0 || box.height > 0)
      ) {
        return { width: box.width, height: box.height };
      }
    } catch {
      // Not laid out (display: none, jsdom); fall through to the rectangle.
    }
  }
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) return { width: rect.width, height: rect.height };
  // A view is only read so a caller can pass a measuring window; the value is not otherwise needed.
  void view;
  return null;
}

function fontSizeOf(root: Element, view: Window | null): number {
  if (view && typeof view.getComputedStyle === "function") {
    try {
      const size = Number.parseFloat(view.getComputedStyle(root).getPropertyValue("font-size"));
      if (Number.isFinite(size) && size > 0) return size;
    } catch {
      // Fall through to the inline declaration.
    }
  }
  const inline = Number.parseFloat((root as StyledElement).style.getPropertyValue("font-size"));
  return Number.isFinite(inline) && inline > 0 ? inline : 16;
}

function restoreProperty(
  element: StyledElement,
  name: string,
  value: string,
  priority: string,
): void {
  if (value.length > 0) element.style.setProperty(name, value, priority);
  else element.style.removeProperty(name);
}

function formatPx(value: number): string {
  return String(Math.round(value * 100) / 100) + "px";
}
