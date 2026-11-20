import { createHash } from "node:crypto";

/**
 * The prose an answer shows, split into translation units.
 *
 * One assistant message is read from the session's derived messages (the same projection the model
 * sees), its text blocks are split into Markdown blocks, and fenced code is kept out of the segments
 * so it is never sent and never reflowed. Reasoning and tool-call blocks never reach here: an answer's
 * translation carries only what the reader can read (spec FR-009).
 */

export type BlockKind = "text" | "heading" | "list-item" | "quote" | "fence";

export interface AnswerBlock {
  /** 0-based position across the whole answer; the section's render order and identity. */
  blockIndex: number;
  kind: BlockKind;
  text: string;
}

export interface AnswerProse {
  messageId: string;
  blocks: AnswerBlock[];
  /** The blocks that will be sent: every kind except `fence`. */
  segments: AnswerBlock[];
  /** Detects a regenerated or edited answer; a record whose hash differs is stale (FR-021). */
  sourceHash: string;
}

export type AnswerLookup =
  | { status: "ready"; prose: AnswerProse }
  | { status: "missing" }
  | { status: "notAssistant" }
  | { status: "noProse" };

/** The part of a derived conversation message this module needs. */
export interface SessionMessageLike {
  readonly id: string;
  readonly role: string;
  readonly content: readonly { readonly type: string; readonly text?: string }[];
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s/;
const LIST_ITEM = /^([-*+]|\d+[.)])\s/;
const QUOTE = /^>\s?/;

/**
 * Split one text block into Markdown blocks, preserving order and offsets.
 * @param raw - the text block as the assistant wrote it.
 * @param from - the index the first emitted block takes.
 * @returns the blocks, fences included and marked.
 */
export function splitIntoBlocks(raw: string, from = 0): AnswerBlock[] {
  const out: AnswerBlock[] = [];
  const lines = raw.split("\n");
  let index = from;
  let paragraph: string[] = [];
  let i = 0;

  const flush = (): void => {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text.length > 0) out.push({ blockIndex: index++, kind: "text", text });
  };

  while (i < lines.length) {
    const line = lines[i++] ?? "";
    const fence = FENCE.exec(line);
    if (fence !== null) {
      flush();
      const marker = fence[1] ?? "```";
      const body = [line];
      while (i < lines.length) {
        const next = lines[i++] ?? "";
        body.push(next);
        if (next.trim().startsWith(marker)) break;
      }
      out.push({ blockIndex: index++, kind: "fence", text: body.join("\n") });
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      flush();
      continue;
    }
    if (HEADING.test(trimmed)) {
      flush();
      out.push({ blockIndex: index++, kind: "heading", text: trimmed });
      continue;
    }
    if (LIST_ITEM.test(trimmed)) {
      flush();
      out.push({ blockIndex: index++, kind: "list-item", text: trimmed });
      continue;
    }
    if (QUOTE.test(trimmed)) {
      flush();
      out.push({ blockIndex: index++, kind: "quote", text: trimmed.replace(QUOTE, "") });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return out;
}

/**
 * Hash the segments of an answer, so a record can tell whether it still describes the answer.
 * @param segments - the blocks that would be sent, in order.
 * @returns a stable `sha256:` prefixed digest.
 */
export function hashSegments(segments: readonly AnswerBlock[]): string {
  const hash = createHash("sha256");
  for (const segment of segments) hash.update(segment.kind).update("\u0000").update(segment.text).update("\u0001");
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Read one answer out of the session's derived messages.
 * @param messages - the derived message list, in conversation order.
 * @param messageId - the durable message identity the Chat also uses.
 * @returns ready prose, or the reason there is nothing to translate.
 */
export function extractAnswer(messages: readonly SessionMessageLike[], messageId: string): AnswerLookup {
  const message = messages.find((candidate) => candidate.id === messageId);
  if (message === undefined) return { status: "missing" };
  if (message.role !== "assistant") return { status: "notAssistant" };

  const text = message.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("\n\n");

  const blocks = splitIntoBlocks(text, 0);
  const segments = blocks.filter((block) => block.kind !== "fence");
  if (segments.length === 0) return { status: "noProse" };

  return {
    status: "ready",
    prose: { messageId, blocks, segments, sourceHash: hashSegments(segments) },
  };
}
