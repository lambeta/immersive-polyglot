import { describe, expect, it } from "vitest";
import type { ChatSnapshot } from "@deepseek-ai/dsh-client-ui-chat/client";
import { pageAnswers, turnAnswers } from "../../../src/plugin/client/answers.js";

/** One node as the legacy Chat slice carries it; only the fields the selectors read matter. */
function node(kind: string, turn: number, messageId?: string, interrupted?: boolean) {
  return { kind, seq: 0, turn, messageId, interrupted, blocks: [] };
}

/** Build the smallest snapshot the selectors read. */
function snapshot(nodes: readonly unknown[]): ChatSnapshot {
  return { legacy: { nodes } } as unknown as ChatSnapshot;
}

describe("pageAnswers", () => {
  it("keeps the most recent completed answers, oldest first", () => {
    const chat = snapshot([
      node("user", 1),
      node("assistant", 1, "m-1"),
      node("assistant", 2, "m-2"),
      node("assistant", 3, "m-3"),
    ]);
    expect(pageAnswers(chat, 2)).toEqual(["m-2", "m-3"]);
    expect(pageAnswers(chat, 12)).toEqual(["m-1", "m-2", "m-3"]);
  });

  it("skips interrupted answers, missing ids, and duplicates", () => {
    const chat = snapshot([
      node("assistant", 1, "m-1", true),
      node("assistant", 1),
      node("assistant", 1, "m-2"),
      node("assistant", 1, "m-2"),
      node("user", 1),
    ]);
    expect(pageAnswers(chat, 5)).toEqual(["m-2"]);
  });

  it("treats a limit below one as one", () => {
    const chat = snapshot([node("assistant", 1, "m-1"), node("assistant", 2, "m-2")]);
    expect(pageAnswers(chat, 0)).toEqual(["m-2"]);
  });

  it("answers nothing for an empty conversation", () => {
    expect(pageAnswers(snapshot([]), 12)).toEqual([]);
  });
});

describe("turnAnswers", () => {
  it("returns only the answers of the requested turn, in order", () => {
    const chat = snapshot([
      node("assistant", 1, "m-1"),
      node("assistant", 2, "m-2"),
      node("assistant", 2, "m-3"),
      node("user", 2),
    ]);
    expect(turnAnswers(chat, 2)).toEqual(["m-2", "m-3"]);
    expect(turnAnswers(chat, 9)).toEqual([]);
  });

  it("keeps an interrupted answer, which is still an answer of its turn", () => {
    const chat = snapshot([node("assistant", 4, "m-4", true)]);
    expect(turnAnswers(chat, 4)).toEqual(["m-4"]);
  });
});
