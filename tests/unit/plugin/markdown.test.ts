import { describe, expect, it } from "vitest";
import { parseMarkdown, renderInline } from "../../../src/plugin/client/markdown.jsx";

describe("Markdown parsing of a translated section", () => {
  it("keeps a heading at its own level", () => {
    expect(parseMarkdown("## 1. 构建")).toEqual([{ kind: "heading", level: 2, text: "1. 构建" }]);
  });

  it("groups consecutive bullets into one list and separates a different kind", () => {
    const blocks = parseMarkdown("- 第一项\n- 第二项\n\n1. 一\n2. 二");
    expect(blocks).toEqual([
      { kind: "list", ordered: false, items: ["第一项", "第二项"] },
      { kind: "list", ordered: true, items: ["一", "二"] },
    ]);
  });

  it("keeps a fenced block verbatim, so code is never read as Markdown", () => {
    const blocks = parseMarkdown("```bash\nnpm run build:plugin\n```");
    expect(blocks).toEqual([{ kind: "code", lang: "bash", text: "npm run build:plugin" }]);
  });

  it("turns a quote, a rule and a paragraph into distinct blocks", () => {
    expect(parseMarkdown("> 注意\n\n---\n\n普通段落")).toEqual([
      { kind: "quote", text: "注意" },
      { kind: "rule" },
      { kind: "paragraph", text: "普通段落" },
    ]);
  });

  it("keeps text that is not Markdown as plain paragraphs", () => {
    expect(parseMarkdown("安装只有三步。\n\n其中第一步很容易漏。")).toEqual([
      { kind: "paragraph", text: "安装只有三步。" },
      { kind: "paragraph", text: "其中第一步很容易漏。" },
    ]);
  });

  it("never lets a javascript: link become an anchor", () => {
    const nodes = renderInline("[点我](javascript:alert(1))");
    expect(nodes).toEqual(["[点我](javascript:alert(1))"]);
  });

  it("renders inline code, bold and a safe link as separate nodes", () => {
    const nodes = renderInline("用 `plugin/lib` 里的 **构建产物**，见 [README](https://example.com/README.md)。");
    expect(nodes.map((node) => (typeof node === "string" ? node : typeof node === "object" && node !== null && "type" in node ? node.type : "?"))).toEqual([
      "用 ",
      "code",
      " 里的 ",
      "strong",
      "，见 ",
      "a",
      "。",
    ]);
  });

  it("keeps a repo-relative path visible but does not make it an anchor", () => {
    const nodes = renderInline("见 [records.ts](src/plugin/host/records.ts)。");
    const element = nodes.find((node) => typeof node === "object" && node !== null && "type" in node);
    expect(element).toMatchObject({ type: "span", props: { title: "src/plugin/host/records.ts" } });
  });
});
