import { describe, expect, it } from "vitest";
import { ScrollAnchor } from "../../src/content/scroll-anchor.js";

/** Feature 007 US4: filling in above must not move the passage under the reader's eye. */

/** `tops` is what the measured element's document position reads on each successive measurement. */
function rig(tops: number[]) {
  const scrolled: number[] = [];
  let cursor = 0;
  const anchor = new ScrollAnchor({
    view: null,
    pick: () => ({}) as Element,
    measure: () => tops[Math.min(cursor++, tops.length - 1)] ?? 0,
    scrollBy: (delta) => scrolled.push(delta),
    tolerance: 2,
  });
  return { anchor, scrolled };
}

describe("the reading position guard", () => {
  it("corrects the scroll only when the passage the reader is on has moved", () => {
    const moves = rig([100, 160]);
    moves.anchor.capture();
    moves.anchor.restore();

    // Translations landed above: the passage is now 60px lower, so the page is scrolled by 60.
    expect(moves.scrolled).toEqual([60]);
  });

  it("does nothing when the browser already compensated", () => {
    const moves = rig([100, 101]);
    moves.anchor.capture();
    moves.anchor.restore();

    expect(moves.scrolled).toEqual([]);
  });

  it("does nothing when there is no passage to pin", () => {
    const scrolled: number[] = [];
    const anchor = new ScrollAnchor({
      view: null,
      pick: () => null,
      measure: () => 0,
      scrollBy: (delta) => scrolled.push(delta),
    });

    anchor.capture();
    anchor.restore();

    expect(scrolled).toEqual([]);
  });

  it("corrects in both directions, so a passage that moved up does not jump either", () => {
    const moves = rig([200, 120]);
    moves.anchor.capture();
    moves.anchor.restore();

    expect(moves.scrolled).toEqual([-80]);
  });
});
