import type { JobStatusPayload } from "../shared/messages.js";

/**
 * The toolbar check (feature 009). The page is the authority on whether translation is on for its
 * tab; this module is only the mark and the writer.
 *
 * The mark is composed into the icon itself (owner feedback 2026-11-16): the browser's text badge
 * is sized by the browser and could not be kept inside the icon's corner, so the product ships a
 * checked variant of the same vector master. Its geometry and colours are therefore the product's,
 * and are measured on the rendered rasters by tests/unit/badge-contrast.test.ts and
 * tests/e2e/badge-icon.spec.ts.
 */

export interface BadgeMark {
  /** 4.43:1 against the icon's ground #13501B (FR-010). One flat colour, no second ring. */
  fill: string;
  /** White, as the owner asked; 2.16:1 against the pink, an accepted trade-off (FR-011). */
  tick: string;
  /** Outer diameter as a fraction of the icon canvas: 8 of 16 px, at the lower-right corner. */
  widthRatio: number;
  /** The tile keeps the plain icon's full size: the icon must not shrink when the mark appears. */
  tileRatio: number;
}

export const BADGE_MARK: BadgeMark = {
  fill: "#F692B7",
  tick: "#FFFFFF",
  widthRatio: 8 / 16,
  tileRatio: 1,
};

/** The sizes the shipped rasters cover; the browser picks the one its display needs. */
export const ICON_SIZES = [16, 32, 48, 128] as const;

export interface BadgeAction {
  setIcon(details: { tabId?: number; path: Record<string, string> }): Promise<void>;
}

export interface BadgePainterOptions {
  /** The action API, or null in a context that has none; defaults to the real one. */
  action?: BadgeAction | null;
  /** Turns a shipped path into a URL the browser can load; defaults to chrome.runtime.getURL. */
  resolve?: (path: string) => string;
  onError?: (message: string) => void;
}

function iconPaths(
  suffix: string,
  resolve: (path: string) => string,
): Record<string, string> {
  const paths: Record<string, string> = {};
  for (const size of ICON_SIZES) paths[String(size)] = resolve(`icons/icon-${size}${suffix}.png`);
  return paths;
}

/**
 * Whether the check is on (data-model §1). A run that has started and not been restored claims the
 * page; a run that rendered nothing does not. It is total over the status the page already sends.
 */
export function badgeOn(status: Pick<JobStatusPayload, "state" | "counts">): boolean {
  if (status.state === "idle") return false;
  return (
    status.counts.translated > 0 ||
    status.state === "segmenting" ||
    status.state === "translating"
  );
}

/** The tab a message came from, or null for a sender that is not a content script (FR-004). */
export function tabIdOf(sender: { tab?: { id?: number } } | undefined): number | null {
  const id = sender?.tab?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/**
 * Swaps the tab's icon between the plain and the checked raster. The last written value per tab is
 * remembered only to suppress redundant browser calls on every progress tick; it is never a source
 * of truth and is never persisted (research R11, R13).
 */
export class BadgePainter {
  readonly #action: BadgeAction | null;
  readonly #onError: (message: string) => void;
  readonly #checked: Record<string, string>;
  readonly #plain: Record<string, string>;
  readonly #written = new Map<number, boolean>();

  constructor(options: BadgePainterOptions = {}) {
    this.#action =
      options.action === undefined
        ? typeof chrome !== "undefined" && chrome.action
          ? (chrome.action as unknown as BadgeAction)
          : null
        : options.action;
    const resolve =
      options.resolve ??
      ((path: string) =>
        typeof chrome !== "undefined" && chrome.runtime?.getURL
          ? chrome.runtime.getURL(path)
          : path);
    this.#checked = iconPaths("-check", resolve);
    this.#plain = iconPaths("", resolve);
    this.#onError = options.onError ?? (() => undefined);
  }

  async apply(tabId: number, on: boolean): Promise<void> {
    if (this.#written.get(tabId) === on) return;
    const action = this.#action;
    if (!action) return;

    try {
      await action.setIcon({ tabId, path: on ? this.#checked : this.#plain });
      this.#written.set(tabId, on);
    } catch (error) {
      // A tab that closed between the message and the write is not a failure of the run.
      this.#onError(`icon write failed for tab ${tabId}: ${(error as Error).message}`);
    }
  }

  /**
   * The page navigated: put the plain icon back. A tab this painter already knows to be plain is
   * skipped; an unknown one is cleared anyway, because a restarted worker has no memory of it.
   */
  async clearTab(tabId: number): Promise<void> {
    if (this.#written.get(tabId) === false) return;
    await this.apply(tabId, false);
  }

  /** Clears every tab's icon, for install and update: no old check survives a reload. */
  async clearAll(): Promise<void> {
    this.#written.clear();
    const action = this.#action;
    if (!action) return;
    try {
      await action.setIcon({ path: this.#plain });
    } catch (error) {
      this.#onError(`icon clear failed: ${(error as Error).message}`);
    }
  }
}
