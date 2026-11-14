/**
 * Restoration by journaled inverse mutation (research R8). Every write the product makes to the
 * page is recorded at the moment it is made, and toggling off replays the journal in reverse.
 * Reconstructing "the original" by querying for our own markers fails when the page or a
 * framework rewrote the surrounding DOM; replaying what we did cannot leave residue
 * (FR-019, SC-008).
 */

export type JournalEntry =
  | { kind: "insert"; node: Node; parent: Node; next: Node | null }
  | { kind: "attribute"; element: Element; name: string; previous: string | null }
  | { kind: "style"; element: HTMLElement; previous: string | null };

export class Journal {
  readonly #entries: JournalEntry[] = [];
  /** The style attribute is journalled whole, once per element: property-level undo leaves an
   * empty style="" behind, which is visible residue to a hash comparison (FR-019). */
  readonly #styled = new Set<Element>();
  /** Attributes whose original value is already recorded, so repeated writes (style switching)
   * do not grow the journal (FR-016). */
  #attributes = new WeakMap<Element, Set<string>>();

  get size(): number {
    return this.#entries.length;
  }

  entries(): readonly JournalEntry[] {
    return this.#entries;
  }

  recordInsert(node: Node, parent: Node, next: Node | null): void {
    this.#entries.push({ kind: "insert", node, parent, next });
  }

  recordAttribute(element: Element, name: string): void {
    this.#entries.push({
      kind: "attribute",
      element,
      name,
      previous: element.getAttribute(name),
    });
  }

  /** FR-016: a value that will be rewritten many times is journalled once, with its original. */
  recordAttributeOnce(element: Element, name: string): void {
    const names = this.#attributes.get(element) ?? new Set<string>();
    if (names.has(name)) return;
    names.add(name);
    this.#attributes.set(element, names);
    this.recordAttribute(element, name);
  }

  recordStyle(element: HTMLElement): void {
    if (this.#styled.has(element)) return;
    this.#styled.add(element);
    this.#entries.push({
      kind: "style",
      element,
      previous: element.getAttribute("style"),
    });
  }

  clear(): void {
    this.#entries.length = 0;
    this.#attributes = new WeakMap<Element, Set<string>>();
  }

  /** Replay in reverse: the last write is undone first, so overlapping writes unwind exactly. */
  replay(): number {
    let replayed = 0;
    for (let index = this.#entries.length - 1; index >= 0; index -= 1) {
      const entry = this.#entries[index];
      if (!entry) continue;
      replayed += 1;
      if (entry.kind === "insert") {
        if (entry.node.parentNode === entry.parent) entry.parent.removeChild(entry.node);
        else entry.node.parentNode?.removeChild(entry.node);
      } else if (entry.kind === "attribute") {
        if (entry.previous === null) entry.element.removeAttribute(entry.name);
        else entry.element.setAttribute(entry.name, entry.previous);
      } else if (entry.previous === null) {
        entry.element.removeAttribute("style");
      } else {
        entry.element.setAttribute("style", entry.previous);
      }
    }
    this.#entries.length = 0;
    this.#styled.clear();
    this.#attributes = new WeakMap<Element, Set<string>>();
    return replayed;
  }
}

export interface RestoreResult {
  replayed: number;
  scrollY: number;
  residue: number;
}

/**
 * Restores the page and verifies there is nothing left behind. The residue count is the
 * observable outcome of FR-019, so it is returned rather than merely logged.
 */
export function restorePage(journal: Journal, options: { document?: Document; scrollY?: number } = {}): RestoreResult {
  const doc = options.document ?? document;
  const targetScroll = options.scrollY ?? doc.defaultView?.scrollY ?? 0;
  const replayed = journal.replay();

  const residue = doc.querySelectorAll("[data-ipt]").length;
  if (residue > 0) {
    // A marker we did not journal (for example a site cloned our node). Remove it, because a
    // leftover translation is worse than a lost clone.
    for (const node of Array.from(doc.querySelectorAll("[data-ipt]"))) node.remove();
  }

  if (doc.defaultView && Math.abs((doc.defaultView.scrollY ?? 0) - targetScroll) > 1) {
    doc.defaultView.scrollTo(0, targetScroll);
  }

  return { replayed, scrollY: targetScroll, residue };
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashString(input: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * A structural fingerprint of a subtree: tag names, attributes and text, in document order.
 * Comparing it before translation and after restoration is how SC-008 and the capture contract
 * become decidable instead of impressionistic.
 */
export function domHash(root: Element): string {
  const parts: string[] = [];

  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? "";
      if (text.trim().length > 0) parts.push(`#text:${text.replace(/\s+/g, " ").trim()}`);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const attributes: string[] = [];
    for (const attribute of Array.from(element.attributes)) {
      attributes.push(`${attribute.name}=${attribute.value}`);
    }
    attributes.sort();
    parts.push(`<${element.tagName.toLowerCase()}${attributes.length ? " " + attributes.join(" ") : ""}>`);
    for (const child of Array.from(element.childNodes)) walk(child);
    parts.push(`</${element.tagName.toLowerCase()}>`);
  };

  walk(root);
  return hashString(parts.join("|"));
}
