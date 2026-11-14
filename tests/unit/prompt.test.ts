import { describe, expect, it } from "vitest";
import { buildSystemInstruction, buildUserMessage, languageName } from "../../src/shared/prompt.js";
import type { GlossaryEntry } from "../../src/shared/types.js";

const glossary: GlossaryEntry = {
  sourceTerm: "harbour",
  targetTerm: "港口",
  sourceLang: "en",
  targetLang: "zh",
  caseSensitive: false,
};

const base = { sourceLang: "en", targetLang: "zh", glossary: [], style: "" };

describe("system instruction", () => {
  it("names the source and target languages in words", () => {
    const instruction = buildSystemInstruction(base);
    expect(instruction).toContain("English");
    expect(instruction).toContain("Chinese (Simplified)");
    expect(languageName("ja")).toBe("Japanese");
    expect(languageName("pt-BR")).toBe("pt-BR");
  });

  it("carries all six obligations", () => {
    const instruction = buildSystemInstruction(base);
    expect(instruction).toMatch(/order and the count exactly/i);
    expect(instruction).toMatch(/code, URLs, identifiers, placeholders and numbers/i);
    expect(instruction).toMatch(/leading and trailing whitespace/i);
    expect(instruction).toMatch(/Do not add explanations/i);
    expect(instruction).toMatch(/JSON array/i);
  });

  it("includes every glossary pair, with its case rule", () => {
    const instruction = buildSystemInstruction({
      ...base,
      glossary: [
        glossary,
        { sourceTerm: "Tide", targetTerm: "潮汐", sourceLang: "en", targetLang: "zh", caseSensitive: true },
      ],
    });
    expect(instruction).toContain('"harbour" must be rendered as "港口"');
    expect(instruction).toContain("case-insensitive");
    expect(instruction).toContain('"Tide" must be rendered as "潮汐"');
    expect(instruction).toContain("case-sensitive");
  });

  it("includes the reader's style instruction", () => {
    const instruction = buildSystemInstruction({ ...base, style: "Formal register; no contractions." });
    expect(instruction).toContain("Formal register; no contractions.");
  });

  it("forbids prose and a markdown fence in the output contract", () => {
    const instruction = buildSystemInstruction(base);
    expect(instruction).toMatch(/No prose/i);
    expect(instruction).toMatch(/no markdown code fence/i);
  });

  it("stays valid with an empty glossary and an empty style", () => {
    const instruction = buildSystemInstruction(base);
    expect(instruction).not.toMatch(/undefined|null/);
    expect(instruction).not.toMatch(/\n\s*\n\s*\n/);
    expect(instruction.trim().length).toBeGreaterThan(0);
    expect(instruction).not.toContain("Style instruction");
  });

  it("does not invent a glossary section for entries with blank terms", () => {
    const instruction = buildSystemInstruction({
      ...base,
      glossary: [{ ...glossary, sourceTerm: "   ", targetTerm: " " }],
    });
    expect(instruction).not.toContain("required term translations");
  });
});

describe("user message", () => {
  it("is a JSON array of the segments, in order", () => {
    const message = buildUserMessage(["First", "Second"]);
    expect(JSON.parse(message)).toEqual(["First", "Second"]);
  });

  it("keeps whitespace-significant segments intact", () => {
    const message = buildUserMessage(["  padded  "]);
    expect(JSON.parse(message)).toEqual(["  padded  "]);
  });
});
