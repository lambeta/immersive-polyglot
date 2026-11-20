/**
 * A small Markdown renderer for translated sections.
 *
 * The Host translates block by block, so each section is one block of Markdown: a heading keeps its
 * `#` markers, a list item its `-`, a paragraph its inline code and emphasis. Rendering it as plain
 * text threw that structure away, which is why a translated answer read worse than the original it
 * was translating. This file is deliberately small: it renders the constructs an answer actually
 * uses, escapes everything else as text, and lets React handle escaping — never `innerHTML`.
 */

import { createElement, type ReactNode } from "react";

export type MarkdownBlock =
  | { kind: "code"; lang: string; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "paragraph"; text: string };

const FENCE = /^(`{3,}|~{3,})(\S*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;

/**
 * Split Markdown into the blocks a translation section can contain.
 * @param source - the section's text.
 * @returns blocks in document order; text that matches nothing becomes a paragraph.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flush = (): void => {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text.length > 0) blocks.push({ kind: "paragraph", text });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    const fence = FENCE.exec(trimmed);
    if (fence !== null) {
      flush();
      const marker = fence[1] ?? "```";
      const body: string[] = [];
      while (index + 1 < lines.length) {
        index += 1;
        const next = lines[index] ?? "";
        if (next.trim().startsWith(marker)) break;
        body.push(next);
      }
      blocks.push({ kind: "code", lang: fence[2] ?? "", text: body.join("\n") });
      continue;
    }

    if (trimmed.length === 0) { flush(); continue; }

    if (RULE.test(trimmed)) { flush(); blocks.push({ kind: "rule" }); continue; }

    const heading = HEADING.exec(trimmed);
    if (heading !== null) {
      flush();
      blocks.push({ kind: "heading", level: (heading[1] ?? "#").length, text: heading[2] ?? "" });
      continue;
    }

    const bullet = BULLET.exec(trimmed);
    const ordered = ORDERED.exec(trimmed);
    if (bullet !== null || ordered !== null) {
      flush();
      const isOrdered = ordered !== null;
      const items: string[] = [];
      const first = (ordered ?? bullet)?.[1];
      if (first !== undefined) items.push(first);
      // Consecutive items of the same list kind stay in one list, so an <ol> numbers once.
      while (index + 1 < lines.length) {
        const next = (lines[index + 1] ?? "").trim();
        const nextBullet = BULLET.exec(next);
        const nextOrdered = ORDERED.exec(next);
        if (nextOrdered === null && nextBullet === null) break;
        if ((nextOrdered !== null) !== isOrdered) break;
        index += 1;
        const item = (nextOrdered ?? nextBullet)?.[1];
        if (item !== undefined) items.push(item);
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flush();
      blocks.push({ kind: "quote", text: trimmed.replace(/^>\s?/, "") });
      continue;
    }

    paragraph.push(line);
  }

  flush();
  return blocks;
}

// A link may carry one level of parentheses in its URL, as `javascript:alert(1)` does; anything
// that still does not parse is left as literal text rather than guessed at.
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^()\s]*(?:\([^()\s]*\))?[^()\s]*\))/g;
const LINK = /^\[([^\]]+)\]\(([^()\s]*(?:\([^()\s]*\))?[^()\s]*)\)$/;

/** Only the schemes a translation may legitimately link to; anything else stays literal text. */
function safeHref(href: string): boolean {
  return /^(https?:|mailto:|#)/i.test(href);
}

/**
 * Render one line's inline Markdown: code, bold, strike, italic, links.
 * @param text - one line or one list item.
 * @returns React nodes; unknown syntax stays as the literal characters.
 */
export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const token = match[0];
    key += 1;
    if (token.startsWith("`")) {
      nodes.push(createElement("code", { key, className: "ip-md-code" }, token.slice(1, -1)));
    } else if (token.startsWith("**")) {
      nodes.push(createElement("strong", { key }, token.slice(2, -2)));
    } else if (token.startsWith("~~")) {
      nodes.push(createElement("del", { key }, token.slice(2, -2)));
    } else if (token.startsWith("[")) {
      const link = LINK.exec(token);
      const href = link?.[2] ?? "";
      if (link === null) {
        nodes.push(token);
      } else if (safeHref(href)) {
        nodes.push(createElement("a", { key, className: "ip-md-link", href, target: "_blank", rel: "noreferrer noopener" }, link[1] ?? ""));
      } else if (!href.includes(":")) {
        // A repo-relative path stays visible but is not clickable: the shell, not this plugin, opens files.
        nodes.push(createElement("span", { key, className: "ip-md-path", title: href }, link[1] ?? ""));
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(createElement("em", { key }, token.slice(1, -1)));
    }
    last = at + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Render a translated section as Markdown.
 * @param props.text - the section's Markdown text.
 */
export function MarkdownText({ text }: { text: string }): ReactNode {
  return <>{parseMarkdown(text).map((block, index) => renderBlock(block, index))}</>;
}

function renderBlock(block: MarkdownBlock, key: number): ReactNode {
  switch (block.kind) {
    case "code":
      return createElement("pre", { key, className: "ip-md-pre" }, createElement("code", { className: "ip-md-code" }, block.text));
    case "heading": {
      // A transcript already owns its heading levels; a translated one starts below them.
      const tag = `h${Math.min(6, Math.max(3, block.level + 1))}`;
      return createElement(tag, { key, className: "ip-md-heading" }, renderInline(block.text));
    }
    case "list":
      return createElement(
        block.ordered ? "ol" : "ul",
        { key, className: "ip-md-list" },
        block.items.map((item, itemIndex) => createElement("li", { key: itemIndex }, renderInline(item))),
      );
    case "quote":
      return createElement("blockquote", { key, className: "ip-md-quote" }, renderInline(block.text));
    case "rule":
      return createElement("hr", { key, className: "ip-md-rule" });
    case "paragraph":
      return createElement("p", { key, className: "ip-turn-text" }, renderInline(block.text));
  }
}
