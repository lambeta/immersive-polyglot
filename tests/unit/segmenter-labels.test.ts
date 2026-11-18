import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { segmentPage } from "../../src/content/segmenter.js";
import type { SegmentResult } from "../../src/content/segmenter.js";
import type { TranslationUnit } from "../../src/shared/types.js";

const ZH = "zh";
const EN = "en";

function segmented(
  html: string,
  options: { targetLang?: string; sourceLang?: string; seenLabels?: WeakSet<Element> } = {},
): { document: Document; result: SegmentResult } {
  const document = new JSDOM(`<body>${html}</body>`).window.document as Document;
  const result = segmentPage(document.body, {
    targetLang: options.targetLang ?? ZH,
    ...(options.sourceLang === undefined ? {} : { sourceLang: options.sourceLang }),
    ...(options.seenLabels ? { seenLabels: options.seenLabels } : {}),
  });
  return { document, result };
}

function queued(result: SegmentResult): TranslationUnit[] {
  return result.units.filter((unit) => unit.state === "queued");
}

function texts(units: TranslationUnit[]): string[] {
  return units.map((unit) => unit.sourceText);
}

const drawing = `
  <svg id="d">
    <style>#d{font-family:inherit;font-size:16px;fill:#333;}@keyframes dash{to{stroke-dashoffset:0;}}</style>
    <rect x="0" y="0" width="10" height="10"></rect>
    <text>Return metric scores</text>
    <text>Agent</text>
    <text>loop</text>
    <text>1</text>
    <text>Update prompt, model, or logic</text>
  </svg>`;

describe("a drawing is not prose, but its phrases are labels", () => {
  it("harvests only the phrases and never the style sheet", () => {
    const { result } = segmented(`<p>Here is a diagram.</p><div id="wrap">${drawing}</div><p>After.</p>`);
    expect(texts(queued(result))).toEqual([
      "Here is a diagram.",
      "Return metric scores",
      "Update prompt, model, or logic",
      "After.",
    ]);
    expect((result.units.map((unit) => unit.sourceText).join(" "))).not.toContain("font-family");
    expect((result.units.map((unit) => unit.sourceText).join(" "))).not.toContain("#d");
    expect(result.skipped).toBe(0);
  });

  it("gives a drawing-only wrapper no unit and no skipped passage", () => {
    const { result } = segmented(`<div>${drawing}</div>`);
    expect(texts(queued(result))).toEqual(["Return metric scores", "Update prompt, model, or logic"]);
    expect(result.skipped).toBe(0);
  });

  it("keeps the prose around an inline drawing and never appends the drawing's text", () => {
    const { result } = segmented(
      `<p>Before <svg><text>Return metric scores</text><title>Agent</title></svg> after.</p>`,
    );
    expect(texts(queued(result))).toEqual(["Before after.", "Return metric scores"]);
    expect(texts(queued(result)).join(" ")).not.toContain("Agent");
  });

  it("does not queue a style element as prose", () => {
    const { result } = segmented("<div><style>.x{color:red}</style>Hello world</div>");
    expect(texts(queued(result))).toEqual(["Hello world"]);
    expect(result.skipped).toBe(0);
  });
});

describe("grouping, duplicates and the seen set", () => {
  it("joins a wrapped tspan label into one phrase", () => {
    const { result } = segmented(
      `<svg><text><tspan x="0" dy="0">Generate outputs</tspan><tspan x="0" dy="20">for test cases</tspan></text></svg>`,
    );
    expect(texts(queued(result))).toEqual(["Generate outputs for test cases"]);
  });

  it("reuses one translation for a repeated phrase", () => {
    const { document, result } = segmented(
      `<svg><text id="a">Return metric scores</text><text id="b">Return metric scores</text></svg>`,
    );
    expect(queued(result)).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]!.element).toBe(document.querySelector("#b"));
  });

  it("does not read back a label root already considered in this run", () => {
    const seen = new WeakSet<Element>();
    const document = new JSDOM(
      '<body><svg><text>Return metric scores</text></svg></body>',
    ).window.document as Document;
    const first = segmentPage(document.body, { targetLang: ZH, seenLabels: seen });
    expect(first.units.filter((unit) => unit.state === "queued")).toHaveLength(1);
    const second = segmentPage(document.body, { targetLang: ZH, seenLabels: seen });
    expect(second.units.filter((unit) => unit.state === "queued")).toHaveLength(0);
  });
});

describe("refusals and opaque graphics", () => {
  it("skips a phrase already in the target language", () => {
    const { result } = segmented(`<svg><text>Return metric scores</text></svg>`, {
      targetLang: EN,
      sourceLang: EN,
    });
    const skipped = result.units.filter((unit) => unit.state === "skipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.skipReason).toBe("sameLanguage");
    expect(queued(result)).toHaveLength(0);
  });

  it("does not translate a hidden or opted-out label", () => {
    const { result } = segmented(
      `<svg><text hidden>Return metric scores</text><text translate="no">Update prompt, model, or logic</text></svg>`,
    );
    expect(result.units).toHaveLength(0);
    expect(result.skipped).toBe(0);
  });

  it("leaves canvas, math and media roots alone", () => {
    const { result } = segmented(
      `<div><canvas>Chart label</canvas><math><mi>x</mi></math><video>Media text</video></div>`,
    );
    expect(result.units).toHaveLength(0);
    expect(result.skipped).toBe(0);
  });
});
