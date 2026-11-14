import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { detectLanguage, pageKeyOf, segmentPage } from "../../src/content/segmenter.js";
import type { SegmentResult } from "../../src/content/segmenter.js";
import type { TranslationUnit } from "../../src/shared/types.js";

/**
 * These tests run in the node environment: each test builds its own DOM with JSDOM and hands a
 * root node to the module, which is also how the content script receives it.
 */

const ZH = "zh";
const EN = "en";

interface Segmented {
  document: Document;
  result: SegmentResult;
}

function segmented(
  html: string,
  options: { targetLang?: string; sourceLang?: string } = {},
): Segmented {
  const document = new JSDOM(html).window.document as Document;
  const result = segmentPage(document.body, {
    targetLang: options.targetLang ?? ZH,
    ...(options.sourceLang === undefined ? {} : { sourceLang: options.sourceLang }),
  });
  return { document, result };
}

function queuedOf(result: SegmentResult): TranslationUnit[] {
  return result.units.filter((unit) => unit.state === "queued");
}

function skippedOf(result: SegmentResult): TranslationUnit[] {
  return result.units.filter((unit) => unit.state === "skipped");
}

function texts(units: TranslationUnit[]): string[] {
  return units.map((unit) => unit.sourceText);
}

const ENGLISH = "The quick brown fox jumps over the lazy dog.";
const CHINESE = "这是一个用于测试的中文句子。";

describe("block extraction", () => {
  it("extracts block-level text in document order", () => {
    const { result } = segmented(
      "<body><h1>Title</h1><p>First paragraph</p><ul><li>Item one</li></ul>" +
        "<table><tbody><tr><td>Cell</td></tr></tbody></table></body>",
    );
    expect(texts(result.units)).toEqual(["Title", "First paragraph", "Item one", "Cell"]);
    expect(result.units.every((unit) => unit.state === "queued")).toBe(true);
    expect(result.skipped).toBe(0);
  });

  it("treats every heading level and every listed block tag as a candidate", () => {
    const headings = segmented(
      "<body><h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><h5>E</h5><h6>F</h6></body>",
    );
    expect(texts(headings.result.units)).toEqual(["A", "B", "C", "D", "E", "F"]);

    const blocks = segmented(
      "<body><blockquote>Quote</blockquote><dl><dt>Term</dt><dd>Definition</dd></dl>" +
        "<figure><img src=x><figcaption>Caption</figcaption></figure>" +
        "<details><summary>Summary</summary></details>" +
        "<table><caption>Table caption</caption></table></body>",
    );
    expect(texts(blocks.result.units)).toEqual([
      "Quote",
      "Term",
      "Definition",
      "Caption",
      "Summary",
      "Table caption",
    ]);
  });

  it("keeps a block whole around its inline children", () => {
    const { result, document } = segmented(
      '<body><p>Hello <b>bold</b> and <a href="#">link</a>.</p></body>',
    );
    expect(texts(result.units)).toEqual(["Hello bold and link."]);
    expect(result.units[0]!.domRef).toBe(document.querySelector("p"));
  });

  it("descends past a container that holds blocks instead of emitting it", () => {
    const { result, document } = segmented("<body><ul><li><p>Nested</p></li></ul></body>");
    expect(texts(result.units)).toEqual(["Nested"]);
    expect(result.units[0]!.domRef).toBe(document.querySelector("p"));
  });

  it("takes a leaf div as a unit but never a div that wraps blocks", () => {
    const leaf = segmented("<body><div><div>Only text</div></div></body>");
    expect(texts(leaf.result.units)).toEqual(["Only text"]);
    expect(leaf.result.units[0]!.domRef).toBe(leaf.document.querySelector("div div"));

    const wrapper = segmented("<body><div><p>one</p><p>two</p></div></body>");
    expect(texts(wrapper.result.units)).toEqual(["one", "two"]);
  });

  it("uses a span only when it is a leaf with text", () => {
    const { result } = segmented("<body><div><span>Inline only</span><p>para</p></div></body>");
    expect(texts(result.units)).toEqual(["Inline only", "para"]);
  });

  it("segments a subtree or a document handed in as the root", () => {
    const document = new JSDOM("<body><p>Only block</p></body>").window.document as Document;
    const fromElement = segmentPage(document.querySelector("p") as Element, { targetLang: ZH });
    expect(texts(fromElement.units)).toEqual(["Only block"]);

    const fromDocument = segmentPage(document, { targetLang: ZH });
    expect(texts(fromDocument.units)).toEqual(["Only block"]);
  });
});

describe("text normalisation", () => {
  it("collapses whitespace runs and trims", () => {
    const { result } = segmented("<body><p>  Lots \n\t of   space  </p></body>");
    expect(texts(result.units)).toEqual(["Lots of space"]);
  });

  it("skips a block whose text is empty and counts it", () => {
    const { result } = segmented("<body><p>   </p><p>Real</p></body>");
    expect(texts(result.units)).toEqual(["Real"]);
    expect(result.skipped).toBe(1);
  });

  it("skips digits and punctuation as empty", () => {
    const { result } = segmented("<body><p>2024 — 1,234</p><p>Real text</p></body>");
    const skipped = skippedOf(result);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.skipReason).toBe("empty");
    expect(texts(queuedOf(result))).toEqual(["Real text"]);
    expect(result.skipped).toBe(1);
  });
});

describe("refused subtrees", () => {
  it("skips nav and still translates the paragraph beside it", () => {
    const { result } = segmented('<body><nav><a href="#">Menu</a></nav><p>Body content</p></body>');
    const skipped = skippedOf(result);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.skipReason).toBe("nav");
    expect(skipped[0]!.sourceText).toBe("Menu");
    expect(texts(queuedOf(result))).toEqual(["Body content"]);
    expect(result.skipped).toBe(1);
  });

  it("skips aside, footer and form with the nav reason", () => {
    const { result } = segmented(
      "<body><aside>Related</aside><footer>Footer text</footer>" +
        '<form><label>Email</label><input type="password" value="x"></form>' +
        "<main><p>Main content</p></main></body>",
    );
    expect(skippedOf(result).map((unit) => unit.skipReason)).toEqual(["nav", "nav", "nav"]);
    expect(skippedOf(result)).toHaveLength(3);
    expect(texts(queuedOf(result))).toEqual(["Main content"]);
    expect(result.skipped).toBe(3);
  });

  it("skips code and pre verbatim", () => {
    const { result } = segmented(
      "<body><pre><code>const a = 1;</code></pre><p>Prose</p><kbd>Ctrl</kbd></body>",
    );
    expect(skippedOf(result).map((unit) => unit.skipReason)).toEqual(["code", "code"]);
    expect(texts(skippedOf(result))).toEqual(["const a = 1;", "Ctrl"]);
    expect(texts(queuedOf(result))).toEqual(["Prose"]);
  });

  it("keeps a block whole around inline code (placeholders are a prompt-level concern)", () => {
    const { result } = segmented("<body><p>Inline <code>npm test</code> stays</p></body>");
    expect(texts(queuedOf(result))).toEqual(["Inline npm test stays"]);
    expect(result.skipped).toBe(0);
  });

  it("skips hidden blocks discovered by attribute or inline style", () => {
    const { result } = segmented(
      "<body><p hidden>Hidden A</p><p aria-hidden=\"true\">Hidden B</p>" +
        '<p style="display: none">Hidden C</p><p style="visibility: hidden">Hidden D</p>' +
        "<p>Visible</p></body>",
    );
    expect(skippedOf(result)).toHaveLength(4);
    expect(skippedOf(result).every((unit) => unit.skipReason === "hidden")).toBe(true);
    expect(texts(queuedOf(result))).toEqual(["Visible"]);
    expect(result.skipped).toBe(4);
  });

  it("skips an editable subtree without descending into it", () => {
    const { result } = segmented(
      '<body><div contenteditable="true"><p>Editable text</p></div><p>Static</p></body>',
    );
    expect(skippedOf(result)).toHaveLength(1);
    expect(skippedOf(result)[0]!.skipReason).toBe("editable");
    expect(skippedOf(result)[0]!.sourceText).toBe("Editable text");
    expect(texts(queuedOf(result))).toEqual(["Static"]);
    expect(result.skipped).toBe(1);
  });

  it("honours translate=no and a notranslate class", () => {
    const { result } = segmented(
      '<body><p translate="no">Do not translate</p>' +
        '<div class="notranslate wrapper"><p>Brand name</p></div><p>Normal</p></body>',
    );
    expect(skippedOf(result).map((unit) => unit.skipReason)).toEqual(["siteOptOut", "siteOptOut"]);
    expect(texts(queuedOf(result))).toEqual(["Normal"]);
    expect(result.skipped).toBe(2);
  });

  it("never treats a form control as a unit", () => {
    const { result } = segmented(
      '<body><input type="password" value="secret"><select><option>One</option></select>' +
        "<textarea>draft</textarea><p>Paragraph</p></body>",
    );
    expect(texts(queuedOf(result))).toEqual(["Paragraph"]);
    expect(result.units).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });

  it("counts a refused subtree once, not once per descendant", () => {
    const { result } = segmented("<body><div hidden><p>a</p><p>b</p></div></body>");
    expect(skippedOf(result)).toHaveLength(1);
    expect(skippedOf(result)[0]!.sourceText).toBe("a b");
    expect(result.skipped).toBe(1);
  });
});

describe("language", () => {
  it("skips text already in the target language", () => {
    const same = segmented(`<body><p>${ENGLISH}</p></body>`, { targetLang: EN });
    expect(skippedOf(same.result)).toHaveLength(1);
    expect(skippedOf(same.result)[0]!.skipReason).toBe("sameLanguage");
    expect(queuedOf(same.result)).toHaveLength(0);
    expect(same.result.skipped).toBe(1);

    const other = segmented(`<body><p>${ENGLISH}</p></body>`, { targetLang: ZH });
    expect(queuedOf(other.result)).toHaveLength(1);
    expect(other.result.skipped).toBe(0);
  });

  it("matches a regional target language by its primary subtag", () => {
    const { result } = segmented(`<body><p>${CHINESE}</p></body>`, { targetLang: "zh-CN" });
    expect(skippedOf(result)[0]!.skipReason).toBe("sameLanguage");
    expect(queuedOf(result)).toHaveLength(0);
  });

  it("detects the page language when no source is configured", () => {
    const { result } = segmented(`<body><p>${ENGLISH}</p></body>`, { targetLang: ZH });
    expect(result.sourceLang).toBe(EN);
    expect(result.units[0]!.sourceLang).toBe(EN);
  });

  it("prefers the document's own lang declaration", () => {
    const { result } = segmented(`<html lang="de"><body><p>${ENGLISH}</p></body></html>`, {
      targetLang: ZH,
    });
    expect(result.sourceLang).toBe("de");
  });

  it("uses the configured source language and treats auto as detection", () => {
    const configured = segmented("<body><p>Bonjour le monde</p></body>", {
      targetLang: ZH,
      sourceLang: "fr",
    });
    expect(configured.result.sourceLang).toBe("fr");
    expect(configured.result.units[0]!.sourceLang).toBe("fr");

    const auto = segmented(`<body><p>${ENGLISH}</p></body>`, { targetLang: ZH, sourceLang: "auto" });
    expect(auto.result.sourceLang).toBe(EN);
  });
});

describe("long blocks", () => {
  const sentence = (n: number): string => `${"x".repeat(194)}${n}.`;
  const longText = [1, 2, 3, 4, 5].map(sentence).join(" ");

  it("splits a block over 400 characters at sentence boundaries", () => {
    const { result, document } = segmented(`<body><p>${longText}</p></body>`);
    expect(longText.length).toBeGreaterThan(400);
    expect(result.units.length).toBeGreaterThan(1);
    expect(result.units.every((unit) => unit.state === "queued")).toBe(true);
    expect(result.units.every((unit) => unit.sourceText.length <= 400)).toBe(true);
    expect(texts(result.units).join(" ")).toBe(longText);
    expect(result.units.every((unit) => unit.domRef === document.querySelector("p"))).toBe(true);
  });

  it("keeps an over-long single sentence whole", () => {
    const single = `${"y".repeat(499)}.`;
    const { result } = segmented(`<body><p>${single}</p></body>`);
    expect(result.units).toHaveLength(1);
    expect(result.units[0]!.sourceText).toBe(single);
    expect(result.units[0]!.sourceText.length).toBe(500);
  });

  it("does not split a block that fits", () => {
    const { result } = segmented(`<body><p>${"a".repeat(399)}</p></body>`);
    expect(result.units).toHaveLength(1);
  });
});

describe("segment identity", () => {
  const page =
    "<body><h2>Title</h2><p>The quick brown fox jumps over the lazy dog.</p>" +
    '<nav><a href="#">Menu</a></nav><p>The quick brown fox jumps over the lazy dog.</p></body>';

  it("formats ids as document position plus an FNV-1a hash", () => {
    const { result } = segmented(page);
    expect(result.units.length).toBeGreaterThan(0);
    for (const unit of result.units) expect(unit.id).toMatch(/^\d+-[0-9a-f]{6}$/);
  });

  it("reproduces identical ids when unchanged content is segmented again", () => {
    const first = segmented(page).result;
    const second = segmented(page).result;
    expect(second.units.map((unit) => unit.id)).toEqual(first.units.map((unit) => unit.id));
  });

  it("emits identical text once and reports later occurrences as duplicates", () => {
    const { result, document } = segmented(
      "<body><p>The quick brown fox jumps over the lazy dog.</p>" +
        "<p>The quick brown fox jumps over the lazy dog.</p></body>",
    );
    expect(queuedOf(result)).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    const duplicate = result.duplicates[0]!;
    expect(duplicate.ofUnitId).toBe(result.units[0]!.id);
    expect(duplicate.element).toBe(document.querySelectorAll("p")[1]);
    expect(duplicate.unitId).toMatch(/^\d+-[0-9a-f]{6}$/);
    expect(duplicate.unitId).not.toBe(duplicate.ofUnitId);
    expect(result.skipped).toBe(0);
  });

  it("does not let a refused block swallow an identical paragraph", () => {
    const { result, document } = segmented(
      '<body><nav><a href="#">Read more</a></nav><p>Read more</p></body>',
    );
    const queued = queuedOf(result);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.sourceText).toBe("Read more");
    expect(queued[0]!.domRef).toBe(document.querySelector("p"));
    expect(result.duplicates).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });
});

describe("unit contract", () => {
  it("carries every field the job and the renderer need", () => {
    const { result, document } = segmented('<html lang="en"><body><h2>Alpha</h2></body></html>');
    const unit = result.units[0]!;
    expect(unit).toMatchObject({
      sourceText: "Alpha",
      sourceLang: EN,
      targetLang: ZH,
      state: "queued",
      attempts: 0,
    });
    expect(unit.domRef).toBe(document.querySelector("h2"));
  });

  it("does not mutate the page", () => {
    const { document } = segmented("<body><p>one</p><div hidden><p>two</p></div></body>");
    const before = document.body.innerHTML;
    segmentPage(document.body, { targetLang: ZH });
    expect(document.body.innerHTML).toBe(before);
  });
});

describe("pageKeyOf", () => {
  it("keeps origin and path only", () => {
    expect(pageKeyOf("https://example.com/a/b?q=1#frag")).toBe("https://example.com/a/b");
    expect(pageKeyOf("https://example.com/")).toBe("https://example.com/");
    expect(pageKeyOf("http://localhost:8080/doc?id=7")).toBe("http://localhost:8080/doc");
  });

  it("strips query and fragment from a string that is not a URL", () => {
    expect(pageKeyOf("/relative/page?x=1#top")).toBe("/relative/page");
  });
});

describe("detectLanguage", () => {
  it("recognises scripts that need no statistics", () => {
    expect(detectLanguage(ENGLISH)).toBe(EN);
    expect(detectLanguage(CHINESE)).toBe("zh");
    expect(detectLanguage("これはテストです。")).toBe("ja");
    expect(detectLanguage("Это простой тест.")).toBe("ru");
  });

  it("returns und when it cannot tell", () => {
    expect(detectLanguage("")).toBe("und");
    expect(detectLanguage("1234 5678")).toBe("und");
    expect(detectLanguage("— !? …")).toBe("und");
  });
});
