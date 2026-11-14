import { describe, expect, it } from "vitest";
import { addEntry, entriesFor, findConflict } from "../../src/shared/glossary.js";
import type { GlossaryEntry } from "../../src/shared/types.js";

function entry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    sourceTerm: "transformer",
    targetTerm: "\u53d8\u6362\u5668",
    sourceLang: "en",
    targetLang: "zh",
    caseSensitive: false,
    ...overrides,
  };
}

function store(glossary: GlossaryEntry[]): { glossary: GlossaryEntry[] } {
  return { glossary };
}

describe("entriesFor", () => {
  it("returns only the matching pair, in stored order", () => {
    const first = entry({ sourceTerm: "attention", targetTerm: "\u6ce8\u610f\u529b" });
    const second = entry({ sourceTerm: "token", targetTerm: "\u8bcd\u5143" });
    const settings = store([
      first,
      entry({ targetLang: "ja", targetTerm: "\u5909\u63db\u5668" }),
      entry({ sourceLang: "fr", targetLang: "zh", sourceTerm: "transformateur" }),
      second,
    ]);

    expect(entriesFor(settings, "en", "zh")).toEqual([first, second]);
  });

  it("lets an entry with sourceLang auto match any source", () => {
    const anySource = entry({ sourceLang: "auto", sourceTerm: "Transformer", targetTerm: "\u53d8\u6362\u5668" });

    expect(entriesFor(store([anySource]), "ja", "zh")).toEqual([anySource]);
    expect(entriesFor(store([anySource]), "auto", "zh")).toEqual([anySource]);
  });

  it("requires the target language to match exactly", () => {
    expect(entriesFor(store([entry()]), "en", "ja")).toEqual([]);
  });

  it("does not fold case when comparing languages", () => {
    expect(entriesFor(store([entry()]), "EN", "zh")).toEqual([]);
    expect(entriesFor(store([entry({ targetLang: "ZH" })]), "en", "zh")).toEqual([]);
  });

  it("returns an empty list for an empty glossary", () => {
    expect(entriesFor(store([]), "en", "zh")).toEqual([]);
  });
});

describe("findConflict", () => {
  it("names the existing entry for the same pair and term", () => {
    const existing = entry();
    const found = findConflict([entry({ sourceTerm: "other" }), existing], entry({ targetTerm: "\u53e6\u4e00\u4e2a" }));

    expect(found).toBe(existing);
  });

  it("ignores case unless both entries are case sensitive", () => {
    const sensitive = entry({ sourceTerm: "API", caseSensitive: true });
    const insensitive = entry({ sourceTerm: "API" });

    expect(findConflict([sensitive], entry({ sourceTerm: "api", caseSensitive: true }))).toBeNull();
    expect(findConflict([sensitive], entry({ sourceTerm: "api" }))).toBe(sensitive);
    expect(findConflict([insensitive], entry({ sourceTerm: "api", caseSensitive: true }))).toBe(insensitive);
  });

  it("does not conflict across language pairs", () => {
    expect(findConflict([entry()], entry({ targetLang: "ja" }))).toBeNull();
    expect(findConflict([entry()], entry({ sourceLang: "fr" }))).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    const existing = entry();

    expect(findConflict([existing], entry({ sourceTerm: "  Transformer " }))).toBe(existing);
  });

  it("returns null when nothing matches", () => {
    expect(findConflict([], entry())).toBeNull();
    expect(findConflict([entry({ sourceTerm: "attention" })], entry())).toBeNull();
  });
});

describe("addEntry", () => {
  it("appends a trimmed entry and reports no conflict", () => {
    const result = addEntry([], entry({ sourceTerm: "  transformer  ", targetTerm: " \u53d8\u6362\u5668 " }));

    expect(result.conflict).toBeNull();
    expect(result.entries).toEqual([entry()]);
    expect(result.entries).toHaveLength(1);
  });

  it("keeps the list unchanged and names both sides of a conflict", () => {
    const existing = entry({ targetTerm: "\u53d8\u538b\u5668" });
    const before = [existing];
    const incoming = entry({ sourceTerm: "Transformer", targetTerm: "\u53d8\u6362\u5668" });

    const result = addEntry(before, incoming);

    expect(result.entries).toEqual([existing]);
    expect(before).toHaveLength(1);
    expect(result.conflict).toEqual({ incoming, existing });
  });

  it("leaves the input array untouched on success", () => {
    const before: GlossaryEntry[] = [entry({ sourceTerm: "attention" })];
    const adding = entry({ sourceTerm: "token" });

    const result = addEntry(before, adding);

    expect(before).toHaveLength(1);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]).toEqual(adding);
  });

  it("refuses a blank source term with a RangeError naming the field", () => {
    expect(() => addEntry([], entry({ sourceTerm: "   " }))).toThrow(RangeError);
    expect(() => addEntry([], entry({ sourceTerm: "   " }))).toThrow(/sourceTerm/);
    expect(() => addEntry([], entry({ sourceTerm: "" }))).toThrow(RangeError);
  });

  it("refuses a blank target term with a RangeError naming the field", () => {
    expect(() => addEntry([], entry({ targetTerm: " \t " }))).toThrow(RangeError);
    expect(() => addEntry([], entry({ targetTerm: " \t " }))).toThrow(/targetTerm/);
  });
});
