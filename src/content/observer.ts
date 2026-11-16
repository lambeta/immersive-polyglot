/**
 * Late content (infinite scroll, single-page apps, collapsed comments) must be picked up without
 * re-translating the page and without looping on our own mutations (edge cases; FR-008).
 *
 * Feature 007 changed this module's duty: it *reports* new content and no longer decides to
 * translate it. Arriving is not a reason to spend the reader's provider quota — the demand window
 * decides, so a comment thread that expands far below the fold waits until the reader gets there
 * (FR-018). The page agent collects what arrives and asks the open run to re-evaluate.
 */

import { MARKER_ATTRIBUTE } from "./markers.js";

export interface PageObserverOptions {
  root: ParentNode;
  /** Called with elements that arrived after the initial pass, debounced and de-duplicated. */
  onNewContent(elements: Element[]): void;
  debounceMs?: number;
  /** Exposed for tests: the view whose MutationObserver to use. */
  view?: { MutationObserver?: typeof MutationObserver } | null;
}

const IGNORED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "LINK", "META"]);

export class PageObserver {
  readonly #options: PageObserverOptions;
  #observer: MutationObserver | null = null;
  #pending = new Set<Element>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  #seen = new WeakSet<Element>();
  #active = false;

  constructor(options: PageObserverOptions) {
    this.#options = options;
  }

  get active(): boolean {
    return this.#active;
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  start(): void {
    if (this.#active) return;
    const root = this.#options.root;
    const view = this.#options.view ?? (root as unknown as { defaultView?: Window | null }).defaultView ?? globalThis;
    const Observer = (view as { MutationObserver?: typeof MutationObserver }).MutationObserver;
    if (!Observer) return;
    this.#observer = new Observer((records) => this.#collect(records));
    this.#observer.observe(root as Node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "style", "class"],
    });
    this.#active = true;
  }

  stop(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#pending.clear();
    this.#active = false;
  }

  #collect(records: MutationRecord[]): void {
    for (const record of records) {
      if (record.type === "attributes") {
        const target = record.target as Element;
        if (this.#isOurs(target)) continue;
        if (this.#seen.has(target)) continue;
        this.#queue(target);
        continue;
      }
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType !== 1) continue;
        const element = node as Element;
        if (IGNORED_TAGS.has(element.tagName)) continue;
        // Our own injection: never a reason to translate again.
        if (this.#isOurs(element) || element.closest(`[${MARKER_ATTRIBUTE}]`)) continue;
        if (this.#seen.has(element)) continue;
        this.#queue(element);
      }
    }
  }

  #isOurs(element: Element): boolean {
    return (
      element.hasAttribute(MARKER_ATTRIBUTE) ||
      element.closest(`[${MARKER_ATTRIBUTE}]`) !== null
    );
  }

  #queue(element: Element): void {
    this.#pending.add(element);
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#flush(), this.#options.debounceMs ?? 150);
  }

  #flush(): void {
    this.#timer = null;
    if (this.#pending.size === 0) return;
    const elements = Array.from(this.#pending).filter((element) => element.isConnected);
    this.#pending.clear();
    if (elements.length === 0) return;
    for (const element of elements) this.#seen.add(element);
    this.#options.onNewContent(elements);
  }
}
