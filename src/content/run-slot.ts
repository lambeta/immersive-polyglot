/**
 * The page's single run slot (data-model.md §1): the one authoritative record of what this page's
 * translation slot has been used for, and the pure decision that governs every activation.
 *
 * No DOM reads beyond element identity, no `chrome`, no timers, no storage — the whole rule is
 * decidable in the node test environment, which is where its failing tests live (research R3: a
 * synchronous claim is the only way to close the race between two activations).
 */

export type RunPhase = "starting" | "running" | "finished";
export type RunOutcome = "completed" | "failed" | "cancelled";

/** `outcome` is present **if and only if** `phase === "finished"` (data-model I2). */
export interface RunSnapshot {
  phase: RunPhase;
  outcome?: RunOutcome;
}

export type ActivationDecision = "start" | "replace" | "absorb-running" | "absorb-repeat";

/** What an activation asks for. Element identity is the selection's identity (data-model §2). */
export type RunTarget =
  | { kind: "page" }
  | { kind: "selection"; elements: readonly Element[] };

/**
 * True when the requested target is the one the finished run already covered: whole page against
 * whole page, or the same elements in the same order by reference. Never by text, id or class.
 */
export function sameTarget(
  previous: RunTarget | null | undefined,
  next: RunTarget | null | undefined,
): boolean {
  if (!previous || !next) return false;
  if (previous.kind === "page" || next.kind === "page") {
    return previous.kind === "page" && next.kind === "page";
  }
  const before = previous.elements;
  const after = next.elements;
  if (before.length === 0 || after.length === 0) return false;
  if (before.length !== after.length) return false;
  return before.every((element, index) => element === after[index]);
}

export class RunSlot {
  #snapshot: RunSnapshot | null = null;

  get snapshot(): RunSnapshot | null {
    return this.#snapshot === null ? null : { ...this.#snapshot };
  }

  /**
   * Decide **and** record the claim in one synchronous step: no `await`, no throw, no side effect
   * beyond the slot itself. That is what makes a second activation unable to slip through.
   */
  claim(request: { sameTarget: boolean }): ActivationDecision {
    const current = this.#snapshot;
    if (current === null) {
      this.#snapshot = { phase: "starting" };
      return "start";
    }
    if (current.phase === "starting" || current.phase === "running") {
      return "absorb-running";
    }
    // An explicit stop is a real end of a run, so the next press starts one new run from a clean page.
    if (current.outcome === "cancelled") {
      this.#snapshot = { phase: "starting" };
      return "replace";
    }
    if (request.sameTarget) return "absorb-repeat";
    this.#snapshot = { phase: "starting" };
    return "replace";
  }

  /** The job exists now. Ignored when no claim is outstanding, so a stray call cannot create one. */
  markRunning(): void {
    if (this.#snapshot?.phase === "starting") this.#snapshot = { phase: "running" };
  }

  /** At most once per claim; a second call, or one before a claim, changes nothing (I3). */
  settle(outcome: RunOutcome): void {
    if (this.#snapshot === null) return;
    if (this.#snapshot.phase === "finished") return;
    this.#snapshot = { phase: "finished", outcome };
  }

  /** The restore path only, after the run's journal has been replayed (I4). */
  reset(): void {
    this.#snapshot = null;
  }
}
