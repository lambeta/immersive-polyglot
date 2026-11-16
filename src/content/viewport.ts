/**
 * Turns "the page moved" into one coalesced notification (feature 007, contracts/demand-window.md §4).
 *
 * IntersectionObserver does the per-element bookkeeping the browser is built for, so the work per
 * scroll frame is proportional to what entered or left the window rather than to the number of
 * passages on the page. Scroll, resize and visibility changes notify as well, because a fixed
 * observer root margin does not follow a zoom change or a tab switch.
 */

export interface ViewportWatcherOptions {
  document: Document;
  /** Called at most once per animation frame when the reader's window may have moved. */
  onChange(): void;
  view?: Window | null;
  /** How far below the fold still counts, in pixels. Matches the demand window's lookahead. */
  lookaheadPx?(): number;
}

export class ViewportWatcher {
  readonly #options: ViewportWatcherOptions;
  #observer: IntersectionObserver | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #frame: number | null = null;
  #active = false;
  #listeners: Array<() => void> = [];

  constructor(options: ViewportWatcherOptions) {
    this.#options = options;
  }

  get active(): boolean {
    return this.#active;
  }

  /** Whether the reader can see the page at all. A background tab requests nothing new (FR-016). */
  pageVisible(): boolean {
    const doc = this.#options.document;
    if (typeof doc.visibilityState === "string") return doc.visibilityState !== "hidden";
    return true;
  }

  start(): void {
    if (this.#active) return;
    const view = this.#view();
    const onEvent = (): void => this.notify();
    const types = ["scroll", "resize", "visibilitychange"] as const;
    for (const type of types) {
      const target = type === "visibilitychange" ? (this.#options.document as EventTarget) : (view as EventTarget | null);
      if (!target || typeof target.addEventListener !== "function") continue;
      target.addEventListener(type, onEvent, { passive: true });
      this.#listeners.push(() => target.removeEventListener(type, onEvent));
    }
    this.#active = true;
  }

  /** Observes passages so the browser reports only the ones entering or leaving the window. */
  observe(elements: readonly Element[]): void {
    if (elements.length === 0) return;
    const view = this.#view();
    const Observer = (view as { IntersectionObserver?: typeof IntersectionObserver } | null)?.IntersectionObserver;
    if (!Observer) return;
    this.#observer ??= new Observer(
      () => this.notify(),
      { rootMargin: `0px 0px ${this.#lookahead()}px 0px` },
    );
    for (const element of elements) this.#observer.observe(element);
  }

  /**
   * Coalesced: several events in one frame produce one notification.
   *
   * A hidden tab is why this is not `requestAnimationFrame` alone: a frame callback scheduled just
   * before the reader switched tabs never runs, and a "there is a frame pending" flag left set would
   * swallow every later notification — the page would stop reacting even after the reader returned.
   * So alignment to a frame is used only while the tab is visible; otherwise a timer does it.
   */
  notify(): void {
    if (!this.#active) return;
    if (this.#frame !== null || this.#timer !== null) return;
    const view = this.#view();
    const raf = (view as { requestAnimationFrame?: (cb: FrameRequestCallback) => number } | null)
      ?.requestAnimationFrame;
    if (this.pageVisible() && typeof raf === "function") {
      this.#frame = raf.call(view, () => {
        this.#frame = null;
        this.#options.onChange();
      });
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#options.onChange();
    }, 16);
  }

  stop(): void {
    for (const remove of this.#listeners) remove();
    this.#listeners = [];
    this.#observer?.disconnect();
    this.#observer = null;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    if (this.#frame !== null) {
      const view = this.#view();
      const cancel = (view as { cancelAnimationFrame?: (handle: number) => void } | null)?.cancelAnimationFrame;
      if (typeof cancel === "function") cancel.call(view, this.#frame);
    }
    this.#frame = null;
    this.#active = false;
  }

  #view(): Window | null {
    return this.#options.view ?? this.#options.document.defaultView ?? null;
  }

  #lookahead(): number {
    return this.#options.lookaheadPx?.() ?? 0;
  }
}
