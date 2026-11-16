import { describe, expect, it } from "vitest";
import {
  DEMAND_LOOKAHEAD_RATIO,
  demandWindow,
  groupFor,
  inDemand,
  orderByDemand,
} from "../../src/content/demand.js";

/**
 * Feature 007 US2: the demand window is a fact about rectangles, so it is decided here — in node,
 * with no layout — and never guessed from a rendered page. contracts/demand-window.md §2 is the
 * specification these cases encode.
 */

const viewport = { top: 0, bottom: 800 };
const window = demandWindow(viewport);

describe("the demand window's geography", () => {
  it("is the visible area plus exactly one viewport height below it", () => {
    expect(DEMAND_LOOKAHEAD_RATIO).toBe(1);
    expect(window.lookahead).toBe(800);
  });

  it("includes a passage any part of which is visible", () => {
    expect(groupFor({ top: 100, bottom: 160 }, window)).toBe("visible");
    expect(groupFor({ top: -300, bottom: 40 }, window)).toBe("visible");
    expect(groupFor({ top: 780, bottom: 900 }, window)).toBe("visible");
  });

  it("includes a passage inside the lookahead, below the fold", () => {
    expect(groupFor({ top: 820, bottom: 880 }, window)).toBe("lookahead");
    expect(groupFor({ top: 1590, bottom: 1599 }, window)).toBe("lookahead");
  });

  it("includes a passage taller than the screen when any of it is on screen", () => {
    expect(groupFor({ top: -1200, bottom: 2400 }, window)).toBe("visible");
    expect(groupFor({ top: 700, bottom: 3000 }, window)).toBe("visible");
  });

  it("excludes a passage entirely above the viewport until the reader scrolls back", () => {
    expect(groupFor({ top: -400, bottom: -1 }, window)).toBeNull();
    expect(inDemand({ top: -400, bottom: -1 }, window)).toBe(false);
  });

  it("excludes a passage exactly one screenful below the fold and everything beyond", () => {
    expect(groupFor({ top: 1600, bottom: 1700 }, window)).toBeNull();
    expect(groupFor({ top: 2400, bottom: 2500 }, window)).toBeNull();
  });

  it("excludes an element with no box at all (collapsed, hidden, detached)", () => {
    expect(groupFor({ top: 100, bottom: 100 }, window)).toBeNull();
    expect(groupFor(null, window)).toBeNull();
    expect(groupFor(undefined, window)).toBeNull();
  });

  it("follows the reader when the viewport moves", () => {
    const scrolled = demandWindow({ top: 4000, bottom: 4800 });
    expect(groupFor({ top: 1500, bottom: 1560 }, scrolled)).toBeNull();
    expect(groupFor({ top: 4100, bottom: 4160 }, scrolled)).toBe("visible");
    expect(groupFor({ top: 5000, bottom: 5060 }, scrolled)).toBe("lookahead");
  });
});

describe("demand ordering", () => {
  it("puts what is visible before what is merely ahead, in document order inside each group", () => {
    const ordered = orderByDemand(
      [
        { id: "ahead-1", rect: { top: 900, bottom: 960 } },
        { id: "visible-1", rect: { top: 100, bottom: 160 } },
        { id: "ahead-2", rect: { top: 1200, bottom: 1260 } },
        { id: "visible-2", rect: { top: 300, bottom: 360 } },
        { id: "above", rect: { top: -200, bottom: -100 } },
        { id: "far", rect: { top: 9000, bottom: 9200 } },
      ],
      window,
    );

    expect(ordered.map((entry) => entry.id)).toEqual([
      "visible-1",
      "visible-2",
      "ahead-1",
      "ahead-2",
    ]);
  });

  it("reports the group of each entry so a queue can re-sort without measuring again", () => {
    const ordered = orderByDemand(
      [
        { id: "ahead", rect: { top: 1000, bottom: 1060 } },
        { id: "visible", rect: { top: 10, bottom: 70 } },
      ],
      window,
    );
    expect(ordered.map((entry) => [entry.id, entry.group])).toEqual([
      ["visible", "visible"],
      ["ahead", "lookahead"],
    ]);
  });
});
