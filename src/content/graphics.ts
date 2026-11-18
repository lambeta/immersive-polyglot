/**
 * The domain vocabulary for a drawing's text (feature 010).
 *
 * A rendered drawing is not prose, but the words it draws can be. This module answers four questions
 * for the segmenter, the renderer, the job, the observer and selection:
 *
 * 1. Is this element a graphic root (and is it opaque)?
 * 2. Which of its text elements are label roots?
 * 3. What do those labels say, run by run?
 * 4. Is the text a phrase (eligible) or a lone token (an identifier)?
 *
 * It reads the DOM and never mutates it. The product's output markers are not its business; the
 * segmenter prunes those before it gets here.
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const GRAPHIC_SELECTOR = "svg, math, canvas, iframe, object, embed, video, audio";

const GRAPHIC_TAGS = new Set([
  "SVG",
  "MATH",
  "CANVAS",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "VIDEO",
  "AUDIO",
]);

/**
 * SVG subtrees that never render their own text, or render it only through a reference. A label is
 * what a reader sees; these are the drawing's plumbing.
 */
const NON_RENDERED_SVG_TAGS = new Set([
  "STYLE",
  "SCRIPT",
  "TITLE",
  "DESC",
  "DEFS",
  "METADATA",
  "SYMBOL",
  "CLIPPATH",
  "MASK",
  "PATTERN",
  "MARKER",
  "LINEARGRADIENT",
  "RADIALGRADIENT",
  "FILTER",
]);

const NON_LABEL_HTML_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

export interface LabelBox {
  width: number;
  height: number;
}

function tagOf(element: Element): string {
  return element.tagName.toUpperCase();
}

function elementOf(node: Node | null): Element | null {
  if (!node) return null;
  if (node.nodeType === 1) return node as Element;
  if (node.nodeType === 3) return node.parentElement;
  return null;
}

/** True for an SVG, MathML, canvas, frame or media root. Never true for a descendant. */
export function isGraphicRoot(element: Element): boolean {
  return GRAPHIC_TAGS.has(tagOf(element));
}

/** A graphic whose text is not prose (everything except SVG). Preserved, never translated. */
export function isOpaqueGraphic(element: Element): boolean {
  return isGraphicRoot(element) && tagOf(element) !== "SVG";
}

/** The nearest graphic root containing a node, including the root itself. */
export function graphicRootOf(node: Node | null): Element | null {
  const element = elementOf(node);
  if (!element) return null;
  return element.closest(GRAPHIC_SELECTOR);
}

/**
 * True when an element is inside an SVG drawing but is not the drawing's root. Such an element is a
 * label root (a `<text>` or an HTML label inside `<foreignObject>`) or one of its runs.
 */
export function isGraphicLabel(element: Element | null): boolean {
  if (!element) return false;
  const root = graphicRootOf(element);
  return root !== null && root !== element && tagOf(root) === "SVG";
}

function isHiddenOrOptedOut(element: Element, stop: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute("hidden")) return true;
    if ((current.getAttribute("aria-hidden") ?? "").trim().toLowerCase() === "true") return true;
    if ((current.getAttribute("translate") ?? "").trim().toLowerCase() === "no") return true;
    const className = current.getAttribute("class") ?? "";
    if (className.split(/\s+/u).includes("notranslate")) return true;
    const style = (current.getAttribute("style") ?? "").toLowerCase();
    if (/(?:^|;)\s*display\s*:\s*none\b/u.test(style)) return true;
    if (/(?:^|;)\s*visibility\s*:\s*hidden\b/u.test(style)) return true;
    if (current === stop) break;
    current = current.parentElement;
  }
  return false;
}

function isInNonRenderedSubtree(element: Element, stop: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (NON_RENDERED_SVG_TAGS.has(tagOf(current))) return true;
    if (current === stop) break;
    current = current.parentElement;
  }
  return false;
}

/**
 * Every label root the drawing can render, in document order: SVG `<text>` elements and the element
 * child of a `<foreignObject>` (an HTML label). Hidden, opted-out, non-rendered and metadata text is
 * not a label.
 */
export function labelRootsInGraphic(root: Element): Element[] {
  if (tagOf(root) !== "SVG") return [];
  const found: Element[] = [];
  const seen = new Set<Element>();

  for (const text of Array.from(root.querySelectorAll("text"))) {
    if (isInNonRenderedSubtree(text, root)) continue;
    if (isHiddenOrOptedOut(text, root)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    found.push(text);
  }

  for (const object of Array.from(root.querySelectorAll("foreignObject"))) {
    const child = object.firstElementChild;
    if (!child || seen.has(child)) continue;
    if (NON_LABEL_HTML_TAGS.has(tagOf(child))) continue;
    if (isHiddenOrOptedOut(child, root)) continue;
    seen.add(child);
    found.push(child);
  }

  return found;
}

/** The text nodes inside a label root, in document order, excluding script/style subtrees. */
export function labelRuns(root: Element): CharacterData[] {
  const runs: CharacterData[] = [];
  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        runs.push(child as CharacterData);
        continue;
      }
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      if (NON_LABEL_HTML_TAGS.has(tagOf(element))) continue;
      visit(element);
    }
  };
  visit(root);
  return runs;
}

function normalize(raw: string): string {
  return raw.replace(/\s+/gu, " ").trim();
}

/**
 * A label's text, with a space where the drawing broke a line and a plain concatenation where it did
 * not. This keeps a wrapped phrase one phrase while an inline styled word ("A" + "gent") stays one
 * word.
 */
export function labelText(root: Element): string {
  let out = "";
  for (const run of labelRuns(root)) {
    const value = run.nodeValue ?? "";
    if (value.length === 0) continue;
    const parent = run.parentElement;
    const lineBoundary =
      parent !== null &&
      tagOf(parent) === "TSPAN" &&
      (parent.hasAttribute("x") || parent.hasAttribute("dy"));
    if (out.length > 0 && lineBoundary && !/\s$/u.test(out) && !/^\s/u.test(value)) {
      out += " ";
    }
    out += value;
  }
  return normalize(out);
}

/**
 * The owner's phrase rule (FR-003): a phrase has at least two whitespace-separated words, or clause
 * punctuation. A single token is an identifier and stays as drawn.
 */
export function isLabelPhrase(text: string): boolean {
  if (!/\p{L}/u.test(text)) return false;
  const words = text
    .trim()
    .split(/\s+/u)
    .filter((word) => /\p{L}/u.test(word));
  if (words.length >= 2) return true;
  return /[,;:()\[\]?!]/u.test(text);
}

/** The SVG namespace is exported for tests that build markup by hand. */
export const GRAPHIC_SVG_NAMESPACE = SVG_NAMESPACE;
