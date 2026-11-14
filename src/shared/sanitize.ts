/**
 * Model output is untrusted text. Markup never reaches the page (FR-020, US4 scenario 4):
 * everything is reduced to text before it is inserted, and the renderer only ever sets
 * textContent, never innerHTML.
 */

const BLOCK_TAGS =
  /<\/?(script|style|iframe|object|embed|svg|math|template|noscript)[^>]*>[\s\S]*?<\/\1>/gi;
const ANY_TAG = /<\/?[a-z][a-z0-9:-]*(\s[^<>]*)?\/?>/gi;
const NUMERIC_ENTITY = /&#(\d+);/g;
const HEX_ENTITY = /&#x([0-9a-f]+);/gi;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const NAMED_ENTITY = /&([a-z]+);/gi;

export function decodeEntities(text: string): string {
  return text
    .replace(NUMERIC_ENTITY, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(HEX_ENTITY, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(NAMED_ENTITY, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/** Strip everything that is markup, keep the prose, and normalise whitespace runs. */
export function sanitizeTranslatedText(raw: string): string {
  const withoutDangerous = raw.replace(BLOCK_TAGS, " ");
  const withoutTags = withoutDangerous.replace(ANY_TAG, " ");
  const decoded = decodeEntities(withoutTags);
  return decoded
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
