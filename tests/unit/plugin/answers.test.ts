import { describe, expect, it } from "vitest";
import { extractAnswer, hashSegments, splitIntoBlocks } from "../../../src/plugin/host/answers.js";

const message = (id: string, blocks: { type: string; text?: string }[]) => ({ id, role: "assistant", content: blocks });

describe("splitIntoBlocks", () => {
  it("keeps a fenced block whole and out of the prose", () => {
    const blocks = splitIntoBlocks("Intro line\n\n```ts\nconst a = 1;\n```\n\nAfter", 0);
    expect(blocks.map((block) => block.kind)).toEqual(["text", "fence", "text"]);
    expect(blocks[1]?.text).toContain("const a = 1;");
  });

  it("recognizes headings, list items and quotes", () => {
    const blocks = splitIntoBlocks("# Title\n- item\n> quoted", 0);
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "list-item", "quote"]);
  });

  it("numbers blocks in order when continuing an answer", () => {
    const blocks = splitIntoBlocks("second paragraph", 4);
    expect(blocks[0]?.blockIndex).toBe(4);
  });
});

describe("extractAnswer", () => {
  it("reads only visible text: reasoning and tool calls never become segments", () => {
    const result = extractAnswer(
      [message("m-1", [
        { type: "reasoning", text: "thinking hard" },
        { type: "text", text: "Visible answer." },
        { type: "tool-call", text: "{\"x\":1}" },
      ])],
      "m-1",
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.prose.segments.map((segment) => segment.text)).toEqual(["Visible answer."]);
  });

  it("reports a missing message instead of inventing one", () => {
    expect(extractAnswer([], "m-9").status).toBe("missing");
  });

  it("reports an answer with no prose, and one that is not an assistant message", () => {
    expect(extractAnswer([message("m-2", [{ type: "text", text: "```\ncode\n```" }])], "m-2").status).toBe("noProse");
    const user = { id: "m-3", role: "user", content: [{ type: "text", text: "hi" }] };
    expect(extractAnswer([user], "m-3").status).toBe("notAssistant");
  });

  it("changes the hash when the answer changes, and not otherwise", () => {
    const a = extractAnswer([message("m-4", [{ type: "text", text: "Same words." }])], "m-4");
    const b = extractAnswer([message("m-4", [{ type: "text", text: "Same words." }])], "m-4");
    const c = extractAnswer([message("m-4", [{ type: "text", text: "Other words." }])], "m-4");
    expect(a.status === "ready" && b.status === "ready" && c.status === "ready").toBe(true);
    if (a.status !== "ready" || b.status !== "ready" || c.status !== "ready") return;
    expect(a.prose.sourceHash).toBe(b.prose.sourceHash);
    expect(a.prose.sourceHash).not.toBe(c.prose.sourceHash);
    expect(hashSegments(a.prose.segments)).toBe(a.prose.sourceHash);
  });
});
