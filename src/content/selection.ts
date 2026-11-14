/**
 * Translate-selection and single-block translation (FR-013). Both reuse the renderer and the
 * restorer rather than introducing a second rendering path.
 */

const BLOCK_SELECTOR = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "td",
  "th",
  "dd",
  "dt",
  "figcaption",
  "caption",
  "summary",
  "div",
  "span",
].join(",");

function closestBlock(node: Node | null): Element | null {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === 1) {
      const element = current as Element;
      if (element.matches(BLOCK_SELECTOR) && (element.textContent ?? "").trim().length > 0) {
        return element;
      }
    }
    current = current.parentNode;
  }
  return null;
}

/** Every block the current selection touches, in document order, without duplicates. */
export function selectedBlocks(doc: Document): Element[] {
  const selection = doc.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];
  const range = selection.getRangeAt(0);
  const start = closestBlock(range.startContainer);
  const end = closestBlock(range.endContainer);
  if (!start || !end) return [];
  if (start === end) return [start];

  const blocks: Element[] = [];
  const walker = doc.createTreeWalker(range.commonAncestorContainer, 1 /* NodeFilter.SHOW_ELEMENT */);
  let node = walker.nextNode();
  while (node) {
    const element = node as Element;
    if (element.matches(BLOCK_SELECTOR) && range.intersectsNode(element)) {
      const text = (element.textContent ?? "").trim();
      if (text.length > 0 && !blocks.some((existing) => existing.contains(element))) blocks.push(element);
    }
    node = walker.nextNode();
  }
  if (blocks.length === 0) return [start];
  return blocks;
}

/** The single block under the pointer, for a hover-then-translate action. */
export function blockFromPoint(doc: Document, x: number, y: number): Element | null {
  const hit = doc.elementFromPoint(x, y);
  if (!hit) return null;
  if ((hit as Element).closest("[data-ipt]")) return null;
  return closestBlock(hit);
}

/** Restricts a set of blocks to those that are still in the document. */
export function connected(blocks: Element[]): Element[] {
  return blocks.filter((block) => block.isConnected);
}
