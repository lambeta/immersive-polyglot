/**
 * Keeps the passage under the reader's eye where it is while translations land above it
 * (feature 007, research R8, FR-027).
 *
 * The browser's own scroll anchoring usually does this, and relying on it costs nothing — but it is
 * suppressed on pages that set `overflow-anchor: none` (this product sets it during restore) and it
 * can pick a different anchor after a large insert. So the guard measures one element before a round
 * and corrects after it, and only when the browser did not already compensate. One measurement per
 * batch, never per frame.
 */

const PASSAGE_TAGS =
  "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt, figcaption, caption, summary";

export interface ScrollAnchorOptions {
  view: Window | null;
  /** The passage nearest the top of the reader's viewport, or null when there is none. */
  pick?(): Element | null;
  /** The element's top edge in viewport coordinates. */
  measure?(element: Element): number;
  /** Moves the reader by a pixel delta. */
  scrollBy?(delta: number): void;
  /** The current scroll offset; injected by tests. */
  scrollY?(): number;
  /** Movement below this many pixels is treated as "the browser already handled it". */
  tolerance?: number;
}

export class ScrollAnchor {
  readonly #options: ScrollAnchorOptions;
  readonly #pick: () => Element | null;
  #captured: { element: Element; top: number; scrolled: number } | null = null;
  #lastPicked: Element | null = null;
  #lastDelta = 0;

  constructor(options: ScrollAnchorOptions) {
    this.#options = options;
    this.#pick = options.pick ?? defaultPick(options.view);
  }

  /** The correction applied by the last `restore`, for tests and for diagnostics. */
  get lastDelta(): number {
    return this.#lastDelta;
  }

  capture(): void {
    const element = this.#visiblePin() ?? this.#pick();
    this.#lastPicked = element;
    this.#captured = element ? { element, top: this.#measure(element), scrolled: this.#scroll()} : null;
  }

  /** The previous pin, when it still begins on screen: avoids rescanning per mutation. */
  #visiblePin(): Element | null {
    const previous = this.#lastPicked;
    if (!previous || !previous.isConnected) return null;
    const rect = previous.getBoundingClientRect();
    const height = this.#options.view?.innerHeight ?? 0;
    return rect.top >= 0 && rect.bottom > 0 && rect.top < height ? previous : null;
  }

  restore(): void {
    const captured = this.#captured;
    this.#captured = null;
    this.#lastDelta = 0;
    if (!captured) return;

    // How far the pinned passage really moved in the document...
    const moved = this.#measure(captured.element) - captured.top;
    // ...and how much of that the browser already compensated for by moving the scroll itself. On a
    // page with scroll anchoring enabled those two cancel out, and correcting again would push the
    // reader by exactly the amount the browser just saved them.
    const drift = this.#scroll() - captured.scrolled;
    const residual = moved - drift;
    if (Math.abs(residual) <= (this.#options.tolerance ?? 2)) return;
    this.#lastDelta = residual;
    (this.#options.scrollBy ?? defaultScrollBy(this.#options.view))(residual);
  }

  #scroll(): number {
    const custom = this.#options.scrollY;
    if (custom) return custom();
    return (this.#options.view as Window | null)?.scrollY ?? 0;
  }

  /**
   * Measured in **document** coordinates, not viewport coordinates.
   *
   * Viewport coordinates make the reader's own scrolling look like a layout shift: capture before a
   * batch, the reader scrolls 1900px, restore afterwards, and the guard "corrects" by 1900px — it
   * fights the person it exists to protect. In document coordinates a scroll changes nothing and
   * only content that moved really moved.
   */
  #measure(element: Element): number {
    const custom = this.#options.measure;
    if (custom) return custom(element);
    return element.getBoundingClientRect().top + this.#scroll();
  }
}

/**
 * The topmost passage still on screen: the line of text the reader's eye is nearest to.
 *
 * A hit test at the viewport's top edge is not enough — that row is often the page's own padding,
 * and a guard that picks nothing never corrects anything. Scanning in document order costs a few
 * rectangle reads per batch and always finds an answer when there is text on screen at all.
 */
function defaultPick(view: Window | null): () => Element | null {
  return () => {
    const doc = view?.document;
    if (!doc) return null;
    const passages = Array.from(doc.querySelectorAll(PASSAGE_TAGS));
    const height = view?.innerHeight ?? 0;
    // The first passage that *begins* on screen: anything inserted above that line shifts it, so its
    // movement is the reader's movement. A passage that starts above the viewport would never move.
    for (const passage of passages) {
      const rect = passage.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > 0 && rect.top >= 0 && rect.top < height) return passage;
    }
    // A passage taller than the screen has no such line; pin the one covering it.
    for (const passage of passages) {
      const rect = passage.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > 0 && rect.top < height) return passage;
    }
    return null;
  };
}

function defaultScrollBy(view: Window | null): (delta: number) => void {
  return (delta: number) => {
    view?.scrollBy?.(0, delta);
  };
}
