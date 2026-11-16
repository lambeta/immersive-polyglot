/**
 * The demand window (feature 007, contracts/demand-window.md): the set of passages the reader is
 * about to read — what is visible, plus one viewport height of lookahead below it.
 *
 * Pure geometry, deliberately: no DOM reads, no timers, no storage. That is what lets the boundary
 * cases — a passage taller than the screen, one just above the fold, one exactly one screenful
 * down — be decided in a unit test rather than argued about after the fact (research R2).
 */

/** Fixed product default, not a preference (FR-010). One screenful is enough that scrolling never waits. */
export const DEMAND_LOOKAHEAD_RATIO = 1;

/** A rectangle in viewport coordinates, as a browser reports it: `top` 0 is the top of the screen. */
export interface Rect {
  top: number;
  bottom: number;
}

export interface DemandGeometry {
  /** Top of the visible area, viewport coordinates. */
  top: number;
  /** Bottom of the visible area, viewport coordinates. */
  bottom: number;
  /** How far below the fold still counts as "about to be read". */
  lookahead: number;
}

export type DemandGroup = "visible" | "lookahead";

export function demandWindow(
  viewport: { top: number; bottom: number },
  lookaheadRatio: number = DEMAND_LOOKAHEAD_RATIO,
): DemandGeometry {
  const height = Math.max(0, viewport.bottom - viewport.top);
  return { top: viewport.top, bottom: viewport.bottom, lookahead: height * lookaheadRatio };
}

/**
 * Which part of the window a rectangle falls in, or null when it is not in the window at all.
 *
 * - any part on screen: `visible`
 * - entirely between the fold and one screenful below it: `lookahead`
 * - entirely above the fold: null (the reader has left it; it is taken when they return)
 * - at or beyond the lookahead boundary: null
 * - no box at all (collapsed, hidden, detached): null
 */
export function groupFor(
  rect: Rect | null | undefined,
  window: DemandGeometry,
): DemandGroup | null {
  if (!rect) return null;
  // A collapsed element has no readable text on screen; marking it would be a mark for nothing.
  if (rect.bottom <= rect.top) return null;
  if (rect.bottom <= window.top) return null;
  if (rect.top >= window.bottom + window.lookahead) return null;
  return rect.top < window.bottom ? "visible" : "lookahead";
}

export function inDemand(rect: Rect | null | undefined, window: DemandGeometry): boolean {
  return groupFor(rect, window) !== null;
}

/**
 * The dispatch order (FR-013): everything visible first, then the lookahead, document order inside
 * each group. Input order is the document order the segmenter produced; this function never sorts
 * by position, so it cannot disagree with the page.
 */
export function orderByDemand<T extends { rect?: Rect | null }>(
  entries: readonly T[],
  window: DemandGeometry,
): Array<T & { group: DemandGroup }> {
  const ordered: Array<T & { group: DemandGroup }> = [];
  for (const group of ["visible", "lookahead"] as const) {
    for (const entry of entries) {
      if (groupFor(entry.rect ?? null, window) === group) ordered.push({ ...entry, group });
    }
  }
  return ordered;
}
