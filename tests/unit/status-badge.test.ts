import { describe, expect, it, vi } from "vitest";
import { BADGE_MARK, BadgePainter, badgeOn, tabIdOf } from "../../src/background/status-badge.js";
import type { JobStatusPayload } from "../../src/shared/messages.js";
import { RecordingBadgeAction } from "../support/badge-action-fake.js";

/**
 * The check's whole decision (feature 009 FR-001–FR-008) is one total function over the status the
 * page already broadcasts, plus a writer that swaps the tab's icon. Both are proven here without a
 * browser; the real API calls and the shipped pixels are verified in Chromium
 * (tests/e2e/status-badge.spec.ts, tests/e2e/badge-icon.spec.ts).
 */

function status(
  state: JobStatusPayload["state"],
  translated: number,
  extra: Partial<JobStatusPayload> = {},
): JobStatusPayload {
  return {
    jobId: state === "idle" ? null : "job-1",
    pageKey: "https://example.test/article",
    providerId: "p1",
    state,
    counts: { total: 4, translated, failed: 0, skipped: 0, reused: 0 },
    capReached: false,
    skipped: 0,
    ...extra,
  };
}

function painterWith(action: RecordingBadgeAction, onError = vi.fn()) {
  return { painter: new BadgePainter({ action, resolve: (path) => path, onError }), onError };
}

describe("badgeOn (FR-001, FR-002, FR-006)", () => {
  it("is on while the run is collecting or translating, before anything is rendered", () => {
    expect(badgeOn(status("segmenting", 0))).toBe(true);
    expect(badgeOn(status("translating", 0))).toBe(true);
  });

  it("stays on once translations are on the page, whatever the run's final state", () => {
    expect(badgeOn(status("completed", 2))).toBe(true);
    expect(badgeOn(status("failed", 2))).toBe(true);
    expect(badgeOn(status("cancelled", 2))).toBe(true);
  });

  it("is off when nothing is on the page, and always off for idle", () => {
    expect(badgeOn(status("idle", 0))).toBe(false);
    expect(badgeOn(status("idle", 3))).toBe(false);
    expect(badgeOn(status("completed", 0))).toBe(false);
    expect(badgeOn(status("failed", 0))).toBe(false);
    expect(badgeOn(status("cancelled", 0))).toBe(false);
  });
});

describe("the shipped mark (FR-009, FR-010, FR-011, FR-012, FR-013)", () => {
  it("is a flat 8 px pink disc with a white tick, inside the icon's corner", () => {
    expect(BADGE_MARK).toEqual({
      fill: "#F692B7",
      tick: "#FFFFFF",
      widthRatio: 8 / 16,
      tileRatio: 1,
    });
    // One colour for border and disc; the icon keeps its full size, so the checked raster draws the
    // same tile as the plain one and the mark sits inside its lower-right corner.
    expect(BADGE_MARK.widthRatio).toBeCloseTo(8 / 16, 5);
    expect(BADGE_MARK.tileRatio).toBe(1);
  });
});

describe("BadgePainter (FR-001, FR-008, FR-010, FR-011)", () => {
  it("puts the checked raster on the tab when translation is on", async () => {
    const action = new RecordingBadgeAction();
    const { painter } = painterWith(action);

    await painter.apply(7, true);

    expect(action.calls).toHaveLength(1);
    const call = action.calls[0];
    expect(call?.tabId).toBe(7);
    expect(Object.keys(call?.path ?? {})).toEqual(["16", "32", "48", "128"]);
    for (const path of Object.values(call?.path ?? {})) {
      expect(path).toMatch(/^icons\/icon-\d+-check\.png$/);
    }
    expect(call?.path?.["16"]).toBe("icons/icon-16-check.png");
  });

  it("puts the plain raster back when the page is restored", async () => {
    const action = new RecordingBadgeAction();
    const { painter } = painterWith(action);

    await painter.apply(7, false);

    expect(action.calls).toEqual([
      { tabId: 7, path: { "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" } },
    ]);
  });

  it("does not rewrite an icon the tab already shows", async () => {
    const action = new RecordingBadgeAction();
    const { painter } = painterWith(action);

    await painter.apply(7, true);
    await painter.apply(7, true);
    expect(action.calls).toHaveLength(1);

    await painter.apply(7, false);
    await painter.apply(7, false);
    expect(action.calls).toHaveLength(2);

    await painter.apply(7, true);
    expect(action.calls).toHaveLength(3);
  });

  it("swallows a write the browser refuses, and retries it next time", async () => {
    const action = new RecordingBadgeAction();
    const { painter, onError } = painterWith(action);
    action.rejectNext();

    await expect(painter.apply(9, true)).resolves.toBeUndefined();
    expect(action.calls).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toContain("9");

    await painter.apply(9, true);
    expect(action.calls).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("paints nothing when the action API is absent, and never throws", async () => {
    const painter = new BadgePainter({ action: null });
    await expect(painter.apply(4, true)).resolves.toBeUndefined();
    await expect(painter.apply(4, false)).resolves.toBeUndefined();
    await expect(painter.clearTab(4)).resolves.toBeUndefined();
    await expect(painter.clearAll()).resolves.toBeUndefined();
  });

  it("clears a tab it believes is on, and skips one it knows is off", async () => {
    const action = new RecordingBadgeAction();
    const { painter } = painterWith(action);

    await painter.apply(7, true);
    await painter.clearTab(7);
    expect(action.calls).toHaveLength(2);
    expect(Object.values(action.calls[1]?.path ?? {})[0]).toBe("icons/icon-16.png");

    await painter.clearTab(7);
    expect(action.calls).toHaveLength(2);
  });

  it("clears a tab it has no memory of, because the worker may have restarted", async () => {
    const action = new RecordingBadgeAction();
    const { painter } = painterWith(action);

    await painter.clearTab(12);
    expect(action.calls).toHaveLength(1);
    expect(action.calls[0]?.tabId).toBe(12);
  });

  it("clears every tab on install or update, and forgets what it had written", async () => {
    const action = new RecordingBadgeAction();
    const { painter } = painterWith(action);
    await painter.apply(7, true);

    await painter.clearAll();
    expect(action.calls.at(-1)?.tabId).toBeUndefined();
    expect(Object.values(action.calls.at(-1)?.path ?? {})[0]).toBe("icons/icon-16.png");

    await painter.apply(7, true);
    expect(action.calls).toHaveLength(3);
  });
});

describe("tabIdOf (FR-004, contract §1)", () => {
  it("paints only for a real tab id", () => {
    expect(tabIdOf({ tab: { id: 12 } })).toBe(12);
    expect(tabIdOf({})).toBeNull();
    expect(tabIdOf({ tab: {} })).toBeNull();
    expect(tabIdOf({ tab: { id: Number.NaN } })).toBeNull();
    expect(tabIdOf(undefined)).toBeNull();
  });
});