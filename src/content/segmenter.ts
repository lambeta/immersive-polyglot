import type { SkipReason, TranslationUnit } from "../shared/types.js";
import { MARKER_ATTRIBUTE, TARGET_MARKER } from "./markers.js";

/**
 * Block-level segmentation (research R6). The walk produces one translation unit per leaf block,
 * assigns a stable id from document position plus a content hash, deduplicates identical text, and
 * refuses non-prose by declaration. The root is always passed in: this module never touches a
 * global document, so it runs unchanged inside a content script and under a synthetic DOM.
 */

export interface SegmentOptions {
  targetLang: string;
  sourceLang?: string;
}

export interface SegmentDuplicate {
  unitId: string;
  ofUnitId: string;
  /** 0-based position this occurrence stands in for within its own source block. */
  partIndex: number;
  element: Element;
}

export interface SegmentResult {
  /** Unique source texts in document order; state is "queued" or "skipped". */
  units: TranslationUnit[];
  /** Later occurrences of an identical source text, to be rendered from the first unit's result. */
  duplicates: SegmentDuplicate[];
  /** Number of elements (or units) skipped, for the "N passages skipped" message. */
  skipped: number;
  /** Detected page language, or the configured sourceLang when it is not "auto"/absent. */
  sourceLang: string;
}

/** Past this length a block is split at sentence boundaries (FR-010, translation quality). */
const MAX_UNIT_CHARS = 400;

/** Text sampled per page when no language is declared; longer pages add nothing to a guess. */
const PAGE_SAMPLE_CHARS = 2000;

const CANDIDATE_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "BLOCKQUOTE",
  "TD",
  "TH",
  "DD",
  "DT",
  "FIGCAPTION",
  "CAPTION",
  "SUMMARY",
]);

/**
 * Block-level elements. A candidate that contains one is a container, not a unit: the leaf rule of
 * R6 is what keeps a list item from swallowing the paragraphs inside it.
 */
const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BODY",
  "CAPTION",
  "DD",
  "DETAILS",
  "DIALOG",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HGROUP",
  "HTML",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

/**
 * Subtrees that never hold readable prose. They are declined silently: a script tag is not a
 * "passage skipped" a reader would understand, so it must not inflate that count.
 */
const SILENT_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "SVG",
  "CANVAS",
  "IFRAME",
  "VIDEO",
  "AUDIO",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
]);

/** FR-009: code is reproduced verbatim, so it is never sent to a provider. */
const CODE_TAGS = new Set(["CODE", "PRE", "KBD", "SAMP"]);

/** Chrome and furniture around the content (FR-014). */
const NAV_TAGS = new Set(["NAV", "ASIDE", "FOOTER", "FORM"]);

const SENTENCE_TERMINATORS = new Set([".", "!", "?", "…", "。", "！", "？", "．"]);
const SENTENCE_CLOSERS = new Set(['"', "'", "”", "’", ")", "]", "»", "）"]);

/**
 * Function words for the Latin languages the product will meet most often. Counting them beats
 * guessing from a character set that half of Europe shares; two hits are required so that a single
 * coincidence ("in", "no") is not a verdict.
 */
const LATIN_STOPWORDS: Record<string, Set<string>> = {
  en: new Set([
    "the",
    "and",
    "of",
    "to",
    "is",
    "are",
    "was",
    "were",
    "that",
    "this",
    "these",
    "those",
    "with",
    "for",
    "on",
    "in",
    "as",
    "by",
    "at",
    "from",
    "or",
    "not",
    "have",
    "has",
    "had",
    "will",
    "would",
    "you",
    "they",
    "their",
    "its",
    "but",
    "which",
    "there",
    "if",
    "when",
    "what",
    "how",
    "all",
    "can",
    "we",
    "an",
    "be",
    "been",
    "it",
    "he",
    "she",
  ]),
  es: new Set([
    "el",
    "la",
    "los",
    "las",
    "de",
    "del",
    "que",
    "y",
    "en",
    "un",
    "una",
    "es",
    "por",
    "para",
    "con",
    "se",
    "su",
    "sus",
    "al",
    "no",
    "como",
    "más",
    "pero",
    "este",
    "esta",
    "son",
    "fue",
    "hay",
    "muy",
  ]),
  fr: new Set([
    "le",
    "la",
    "les",
    "de",
    "des",
    "du",
    "et",
    "en",
    "un",
    "une",
    "est",
    "que",
    "qui",
    "dans",
    "pour",
    "avec",
    "sur",
    "pas",
    "au",
    "aux",
    "ce",
    "cette",
    "sont",
    "il",
    "elle",
    "nous",
    "vous",
    "mais",
    "plus",
  ]),
  de: new Set([
    "der",
    "die",
    "das",
    "und",
    "ist",
    "nicht",
    "ein",
    "eine",
    "mit",
    "für",
    "auf",
    "den",
    "dem",
    "des",
    "zu",
    "von",
    "sich",
    "im",
    "sind",
    "auch",
    "als",
    "werden",
    "wird",
    "dass",
    "es",
    "sie",
    "er",
    "wir",
    "oder",
  ]),
  it: new Set([
    "il",
    "lo",
    "la",
    "gli",
    "le",
    "di",
    "del",
    "che",
    "un",
    "una",
    "è",
    "per",
    "con",
    "non",
    "sono",
    "si",
    "questo",
    "questa",
    "più",
    "ma",
    "come",
    "anche",
    "della",
    "nel",
    "dei",
  ]),
  pt: new Set([
    "os",
    "as",
    "do",
    "da",
    "dos",
    "das",
    "de",
    "que",
    "um",
    "uma",
    "é",
    "para",
    "com",
    "não",
    "se",
    "por",
    "mais",
    "como",
    "mas",
    "este",
    "esta",
    "são",
    "foi",
    "muito",
  ]),
  nl: new Set([
    "het",
    "een",
    "en",
    "van",
    "is",
    "dat",
    "zijn",
    "niet",
    "met",
    "voor",
    "op",
    "aan",
    "ook",
    "als",
    "maar",
    "dit",
    "deze",
    "wordt",
    "door",
  ]),
};

/** Characters one language uses and its neighbours do not. */
const LATIN_SIGNALS: Array<{ test: RegExp; lang: string; weight: number }> = [
  { test: /ß/u, lang: "de", weight: 3 },
  { test: /ñ/u, lang: "es", weight: 3 },
  { test: /¿|¡/u, lang: "es", weight: 3 },
  { test: /ã|õ/u, lang: "pt", weight: 3 },
  { test: /œ|ç/u, lang: "fr", weight: 2 },
];

export function segmentPage(root: ParentNode, options: SegmentOptions): SegmentResult {
  const document = documentOf(root);
  const targetLang = options.targetLang;
  const targetPrimary = primarySubtag(targetLang);
  const configuredSource = normalizeConfiguredSource(options.sourceLang);
  const markupLang = (document.documentElement?.getAttribute("lang") ?? "").trim();

  const units: TranslationUnit[] = [];
  const duplicates: SegmentDuplicate[] = [];
  // Queued and skipped texts dedupe separately: a paragraph that merely repeats a menu label is
  // still a paragraph, and must not inherit the menu's refusal.
  const firstQueued = new Map<string, string>();
  const firstSkipped = new Map<string, string>();
  const samples: string[] = [];
  let sampledChars = 0;
  let skipped = 0;
  let nextIndex = 0;

  // Position keeps repeated identical text from colliding; the content hash keeps an id meaningful
  // when the page has shifted. Re-segmenting unchanged content re-derives both, so ids repeat
  // exactly. The counter also numbers duplicate occurrences, which render under their own marker.
  const idFor = (text: string): string => `${nextIndex++}-${fnv1a6(text)}`;

  const pushUnit = (
    element: Element,
    text: string,
    state: "queued" | "skipped",
    partIndex: number,
    reason?: SkipReason,
  ): string => {
    const id = idFor(text);
    const unit: TranslationUnit = {
      id,
      sourceText: text,
      sourceLang: configuredSource ?? detectLanguage(text),
      targetLang,
      state,
      attempts: 0,
      partIndex,
      domRef: element,
    };
    if (reason !== undefined) unit.skipReason = reason;
    units.push(unit);
    return id;
  };

  const pushDuplicate = (
    element: Element,
    text: string,
    ofUnitId: string,
    partIndex: number,
  ): void => {
    duplicates.push({ unitId: idFor(text), ofUnitId, partIndex, element });
  };

  const pushSkipped = (element: Element, text: string, reason: SkipReason): void => {
    skipped += 1;
    // Nothing to name as a unit when there is no text at all, but the passage was still declined.
    if (text.length === 0) return;
    const first = firstSkipped.get(text);
    if (first !== undefined) {
      pushDuplicate(element, text, first, 0);
      return;
    }
    firstSkipped.set(text, pushUnit(element, text, "skipped", 0, reason));
  };

  const pushQueued = (element: Element, text: string, partIndex: number): void => {
    const first = firstQueued.get(text);
    if (first !== undefined) {
      pushDuplicate(element, text, first, partIndex);
      return;
    }
    firstQueued.set(text, pushUnit(element, text, "queued", partIndex));
    if (sampledChars < PAGE_SAMPLE_CHARS) {
      samples.push(text.slice(0, 200));
      sampledChars += text.length;
    }
  };

  const stack = initialElements(root);
  while (stack.length > 0) {
    const element = stack.pop() as Element;
    // Product output is not page content: prune it before any text is read, and never count it as a
    // passage the reader would see skipped (contracts/page-markup-ownership.md §3, FR-005).
    if (isProductOutput(element)) continue;
    const tag = tagOf(element);
    if (SILENT_TAGS.has(tag)) continue;

    const reason = skipReasonFor(element);
    if (reason !== null) {
      // Offsets are irrelevant for a refusal, but the words must not run together: a refused
      // subtree keeps its block boundaries as spaces before normalisation.
      pushSkipped(element, subtreeText(element), reason);
      continue;
    }

    const isBlockCandidate = CANDIDATE_TAGS.has(tag) || tag === "DIV" || tag === "SPAN";
    if (!isBlockCandidate || hasBlockDescendant(element)) {
      pushChildren(element, stack);
      continue;
    }

    // subtreeText skips product output and keeps block boundaries apart; for a leaf candidate it is
    // exactly the element's own text.
    const text = subtreeText(element);
    if (!hasLetters(text)) {
      pushSkipped(element, text, "empty");
      continue;
    }
    if (primarySubtag(detectLanguage(text)) === targetPrimary) {
      pushSkipped(element, text, "sameLanguage");
      continue;
    }
    const chunks = splitForUnits(text);
    for (let partIndex = 0; partIndex < chunks.length; partIndex += 1) {
      const chunk = chunks[partIndex];
      if (chunk !== undefined) pushQueued(element, chunk, partIndex);
    }
  }

  const detectedSample = detectLanguage(samples.join(" "));
  const pageSourceLang =
    configuredSource ?? (markupLang.length > 0 ? markupLang : detectedSample);

  // A unit whose own text was too short to classify inherits the page's answer.
  for (const unit of units) {
    if (unit.sourceLang === "und") unit.sourceLang = pageSourceLang;
  }

  return { units, duplicates, skipped, sourceLang: pageSourceLang };
}

/**
 * Scripts and function words only: text the product translates is prose, where a script tells the
 * language apart far more reliably than statistics. "und" is returned when nothing is known, which
 * is honest about the guess instead of defaulting to English.
 */
export function detectLanguage(text: string): string {
  if (!hasLetters(text)) return "und";
  if (/[\u3040-\u30ff]/u.test(text)) return "ja";
  if (/[\uac00-\ud7af\u1100-\u11ff]/u.test(text)) return "ko";
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/u.test(text)) return "zh";
  if (/[\u0400-\u04ff]/u.test(text)) return "ru";
  if (/[\u0370-\u03ff]/u.test(text)) return "el";
  if (/[\u0600-\u06ff]/u.test(text)) return "ar";
  if (/[\u0590-\u05ff]/u.test(text)) return "he";
  if (/[\u0e00-\u0e7f]/u.test(text)) return "th";
  if (/[\u0900-\u097f]/u.test(text)) return "hi";
  return detectLatinLanguage(text);
}

/** Origin and path only: query and fragment identify a state, not a site (data model, SitePreference). */
export function pageKeyOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const [withoutFragment = ""] = url.split("#");
    const [withoutQuery = ""] = withoutFragment.split("?");
    return withoutQuery;
  }
}

function detectLatinLanguage(text: string): string {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  let best = "und";
  let bestScore = 1;

  for (const [lang, stopwords] of Object.entries(LATIN_STOPWORDS)) {
    let score = 0;
    for (const word of words) {
      if (word.length > 1 && stopwords.has(word)) score += 1;
    }
    for (const signal of LATIN_SIGNALS) {
      if (signal.lang === lang && signal.test.test(text)) score += signal.weight;
    }
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }

  return best;
}

function normalizeConfiguredSource(sourceLang: string | undefined): string | null {
  if (sourceLang === undefined) return null;
  const trimmed = sourceLang.trim();
  if (trimmed.length === 0 || primarySubtag(trimmed) === "auto") return null;
  return trimmed;
}

function primarySubtag(lang: string): string {
  const trimmed = lang.trim().toLowerCase();
  if (trimmed.length === 0) return "und";
  return trimmed.split(/[-_]/)[0] ?? "und";
}

function documentOf(root: ParentNode): Document {
  const node = root as Node;
  if (node.nodeType === 9) return root as Document;
  const owner = (node as { ownerDocument?: Document | null }).ownerDocument;
  if (!owner) throw new Error("segmentPage needs a root that belongs to a document");
  return owner;
}

/** Document order matters for ids and for the reading order the renderer relies on. */
function initialElements(root: ParentNode): Element[] {
  const node = root as Node;
  if (node.nodeType === 1) return [root as Element];
  const children = elementChildren(node as ParentNode);
  return children.reverse();
}

function elementChildren(parent: ParentNode): Element[] {
  const children: Element[] = [];
  for (let child = parent.firstChild; child !== null; child = child.nextSibling) {
    if (child.nodeType === 1) children.push(child as Element);
  }
  return children;
}

/** Element children minus product output: a translation container never counts as page structure. */
function readableChildren(parent: ParentNode): Element[] {
  return elementChildren(parent).filter((child) => !isProductOutput(child));
}

function isProductOutput(element: Element): boolean {
  return element.getAttribute(MARKER_ATTRIBUTE) === TARGET_MARKER;
}

function pushChildren(element: Element, stack: Element[]): void {
  const children = readableChildren(element);
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child !== undefined) stack.push(child);
  }
}

function tagOf(element: Element): string {
  return element.tagName.toUpperCase();
}

function hasBlockDescendant(element: Element): boolean {
  for (const child of readableChildren(element)) {
    if (BLOCK_TAGS.has(tagOf(child))) return true;
    if (hasBlockDescendant(child)) return true;
  }
  return false;
}

function skipReasonFor(element: Element): SkipReason | null {
  const tag = tagOf(element);
  if (CODE_TAGS.has(tag)) return "code";
  if (NAV_TAGS.has(tag)) return "nav";
  if (hasEditableAttribute(element)) return "editable";
  if (isOptedOut(element)) return "siteOptOut";
  if (isHiddenByAttributeOrStyle(element)) return "hidden";
  return null;
}

function hasEditableAttribute(element: Element): boolean {
  const value = element.getAttribute("contenteditable");
  return value !== null && value.trim().toLowerCase() !== "false";
}

function isOptedOut(element: Element): boolean {
  const translate = element.getAttribute("translate");
  if (translate !== null && translate.trim().toLowerCase() === "no") return true;
  return hasClass(element, "notranslate");
}

function hasClass(element: Element, name: string): boolean {
  const classes = element.getAttribute("class");
  if (classes === null) return false;
  return classes.split(/\s+/u).includes(name);
}

function isHiddenByAttributeOrStyle(element: Element): boolean {
  if (element.hasAttribute("hidden")) return true;
  const ariaHidden = element.getAttribute("aria-hidden");
  if (ariaHidden !== null && ariaHidden.trim().toLowerCase() === "true") return true;

  const style = (element.getAttribute("style") ?? "").toLowerCase();
  if (style.length === 0) return false;
  // Matched on the declaration, not on the parsed CSSOM property: a strict-CSP page or an
  // unsupported value must not turn a hidden block into a translated one.
  return (
    /(?:^|;)\s*display\s*:\s*none\b/u.test(style) ||
    /(?:^|;)\s*visibility\s*:\s*hidden\b/u.test(style)
  );
}

/**
 * Text of a subtree with block boundaries kept apart. textContent would join "...</p><p>..."
 * into one word, which corrupts the phrasing a reader sees once the passage is named as skipped.
 */
function subtreeText(element: Element): string {
  let out = "";
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      out += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const child = node as Element;
    if (isProductOutput(child)) return;
    const isBlock = BLOCK_TAGS.has(tagOf(child));
    if (isBlock) out += " ";
    for (let inner = child.firstChild; inner !== null; inner = inner.nextSibling) visit(inner);
    if (isBlock) out += " ";
  };
  for (let child = element.firstChild; child !== null; child = child.nextSibling) visit(child);
  return normalizeText(out);
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/gu, " ").trim();
}

function hasLetters(text: string): boolean {
  return /\p{L}/u.test(text);
}

/** FNV-1a, low 24 bits: short enough for an id, wide enough that position disambiguates. */
function fnv1a6(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash ^ text.charCodeAt(index)) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash & 0xffffff).toString(16).padStart(6, "0");
}

interface Span {
  start: number;
  end: number;
}

function splitForUnits(text: string): string[] {
  if (text.length <= MAX_UNIT_CHARS) return [text];

  const chunks: string[] = [];
  let start = -1;
  let end = -1;

  for (const span of sentenceSpans(text)) {
    if (start >= 0 && text.slice(start, span.end).trim().length > MAX_UNIT_CHARS) {
      chunks.push(text.slice(start, end).trim());
      start = span.start;
      end = span.end;
      continue;
    }
    if (start < 0) {
      start = span.start;
      end = span.end;
      continue;
    }
    end = span.end;
  }
  if (start >= 0) chunks.push(text.slice(start, end).trim());

  const usable = chunks.filter((chunk) => chunk.length > 0);
  // A single sentence longer than the limit stays whole: a mid-sentence cut translates worse than
  // an over-long request.
  return usable.length > 0 ? usable : [text];
}

/** Sentence spans over the normalised text; boundaries are only where a sentence really ends. */
function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  let index = 0;

  while (index < text.length) {
    if (!SENTENCE_TERMINATORS.has(text.charAt(index))) {
      index += 1;
      continue;
    }
    let cursor = index + 1;
    while (cursor < text.length) {
      const next = text.charAt(cursor);
      if (!SENTENCE_TERMINATORS.has(next) && !SENTENCE_CLOSERS.has(next)) break;
      cursor += 1;
    }
    if (cursor >= text.length || /\s/u.test(text.charAt(cursor))) {
      spans.push({ start, end: cursor });
      start = cursor;
    }
    index = cursor;
  }

  if (start < text.length) spans.push({ start, end: text.length });
  return spans;
}
