import type { BadgeAction } from "../../src/background/status-badge.js";

/**
 * The action API as a recording double (research R9: the browser's own chrome is a boundary no
 * harness screenshots). It records what the painter asked the browser to draw, in order, so a
 * foreground test can assert the mark without a toolbar.
 */

export interface BadgeWrite {
  tabId?: number;
  path: Record<string, string>;
}

export class RecordingBadgeAction implements BadgeAction {
  readonly calls: BadgeWrite[] = [];
  #rejectNext = false;

  /** Makes the next single call reject, as a closed tab does. */
  rejectNext(): void {
    this.#rejectNext = true;
  }

  reset(): void {
    this.calls.length = 0;
    this.#rejectNext = false;
  }

  setIcon(details: { tabId?: number; path: Record<string, string> }): Promise<void> {
    this.calls.push({ tabId: details.tabId, path: details.path });
    if (this.#rejectNext) {
      this.#rejectNext = false;
      return Promise.reject(new Error("No tab with id"));
    }
    return Promise.resolve();
  }
}
