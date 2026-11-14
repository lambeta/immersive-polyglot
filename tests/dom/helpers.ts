import { JSDOM } from "jsdom";
import { domHash, Journal } from "../../src/content/restorer.js";

/**
 * jsdom page builders for the DOM-shaped tests. They are never used to claim real-browser
 * behaviour: layout, CSP and extension APIs are covered by the Playwright suite (research R5).
 */

export interface TestPage {
  dom: JSDOM;
  window: Window & typeof globalThis;
  document: Document;
  body: HTMLElement;
}

export function buildPage(html: string): TestPage {
  const dom = new JSDOM(`<!doctype html><html lang="en"><head><title>t</title></head><body>${html}</body></html>`, {
    url: "https://news.example.test/article",
    pretendToBeVisual: true,
  });
  const window = dom.window as unknown as Window & typeof globalThis;
  // jsdom does not implement scrolling; the tests assert that we tried, not that pixels moved.
  window.scrollTo = (() => undefined) as unknown as typeof window.scrollTo;
  return { dom, window, document: dom.window.document, body: dom.window.document.body };
}

export function nodesIn(root: Node): number {
  let count = 0;
  const walk = (node: Node): void => {
    count += 1;
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(root);
  return count;
}

export interface JournalSnapshot {
  size: number;
  attributes: number;
  styles: number;
  inserts: number;
}

/** Journal assertion helper: what will be unwound, and how much of it is each kind of write. */
export function snapshotJournal(journal: Journal): JournalSnapshot {
  const entries = journal.entries();
  return {
    size: entries.length,
    inserts: entries.filter((entry) => entry.kind === "insert").length,
    attributes: entries.filter((entry) => entry.kind === "attribute").length,
    styles: entries.filter((entry) => entry.kind === "style").length,
  };
}

export function hashOf(element: Element): string {
  return domHash(element);
}
