import type { GlossaryEntry } from "./types.js";

/**
 * The translation instruction. Implements contracts/provider-adapter.md section 2: six
 * obligations, glossary and style injection, and a JSON-array output contract that makes
 * FR-008 segment correspondence mechanically checkable.
 */

export interface PromptInput {
  sourceLang: string;
  targetLang: string;
  glossary: GlossaryEntry[];
  style?: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  auto: "the page's own language",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ar: "Arabic",
  hi: "Hindi",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  uk: "Ukrainian",
  vi: "Vietnamese",
  th: "Thai",
  he: "Hebrew",
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? LANGUAGE_NAMES[code.toLowerCase()] ?? code;
}

export function buildSystemInstruction(input: PromptInput): string {
  const source = languageName(input.sourceLang);
  const target = languageName(input.targetLang);
  const lines: string[] = [];

  lines.push(
    `You are a professional translator. Translate from ${source} into ${target}.`,
  );
  lines.push("");
  lines.push("Rules:");
  lines.push(
    `1. The input is a JSON array of ${"segments"}. Translate every element into ${target}.`,
  );
  lines.push("2. Preserve the order and the count exactly. Element n of your output is the translation of element n of the input.");
  lines.push("3. Keep code, URLs, identifiers, placeholders and numbers unchanged, character for character.");
  lines.push("4. Preserve leading and trailing whitespace. Never merge or split segments.");
  lines.push("5. Do not add explanations, headings, notes or alternatives.");
  lines.push("6. Keep the segment's Markdown as Markdown: leading #, - and >, list numbering, **bold**, *italic*, `code` and [links](…) stay markers; translate only the words around them.");

  const glossary = input.glossary.filter(
    (entry) => entry.sourceTerm.trim().length > 0 && entry.targetTerm.trim().length > 0,
  );
  if (glossary.length > 0) {
    lines.push("7. Use these required term translations whenever the term appears in a segment:");
    for (const entry of glossary) {
      const sensitivity = entry.caseSensitive ? "case-sensitive" : "case-insensitive";
      lines.push(
        `   - "${entry.sourceTerm}" must be rendered as "${entry.targetTerm}" (${sensitivity}).`,
      );
    }
  }

  const style = (input.style ?? "").trim();
  if (style.length > 0) {
    lines.push(`${glossary.length > 0 ? 8 : 7}. Style instruction from the reader, applied to every segment: ${style}`);
  }

  lines.push("");
  lines.push("Output contract:");
  lines.push(
    `Return only a JSON array of ${"strings"}: one string per input element, in the same order. No prose, no markdown code fence, no keys, no surrounding text.`,
  );

  return lines.join("\n");
}

export function buildUserMessage(segments: string[]): string {
  return JSON.stringify(segments);
}
