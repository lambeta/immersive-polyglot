/**
 * Target-language direction (feature 004, FR-001/FR-005).
 *
 * The renderer writes `dir="rtl"` on a translation whose target language is right-to-left, so the
 * Divider style's logical `border-inline-start` mirrors and the text itself lays out correctly. A
 * left-to-right or unknown target inherits the page's direction and gets no attribute at all.
 *
 * Only the primary subtag decides: `ar-EG` is Arabic, `zh-Hans-CN` is not. Region and script
 * subtags never turn a left-to-right language right-to-left.
 */

/** Primary language subtags written right-to-left (ISO 639-1 and the 639-3 codes we expose). */
const RTL_PRIMARY_SUBTAGS: ReadonlySet<string> = new Set([
  "ar", // Arabic
  "arc", // Aramaic
  "ckb", // Central Kurdish (Sorani)
  "dv", // Divehi
  "fa", // Persian
  "he", // Hebrew
  "khw", // Khowar
  "ks", // Kashmiri
  "ku", // Kurdish (Arabic script is the RTL default for this product)
  "nqo", // N'Ko
  "ps", // Pashto
  "sd", // Sindhi
  "syr", // Syriac
  "ug", // Uyghur
  "ur", // Urdu
  "yi", // Yiddish
]);

/** Script subtags (ISO 15924, lower-cased) whose script is written right-to-left. */
const RTL_SCRIPT_SUBTAGS: ReadonlySet<string> = new Set([
  "adlm",
  "arab",
  "hebr",
  "mand",
  "nkoo",
  "rohg",
  "samr",
  "syrc",
  "thaa",
  "yezi",
]);

/**
 * True when text in `lang` runs right-to-left. Tolerates case, whitespace, region and script
 * subtags (`ar-EG`, `HE-il`, `az-Arab`); returns false for an empty or unknown tag so a broken
 * setting can never flip a page.
 */
export function isRtlLanguage(lang: string): boolean {
  if (typeof lang !== "string") return false;
  const subtags = lang.trim().toLowerCase().split(/[-_]/u);
  const primary = subtags[0] ?? "";
  if (primary.length === 0) return false;
  if (RTL_PRIMARY_SUBTAGS.has(primary)) return true;
  // A right-to-left script subtag decides even when the language subtag does not (e.g. az-Arab).
  return subtags.slice(1).some((subtag) => RTL_SCRIPT_SUBTAGS.has(subtag));
}
