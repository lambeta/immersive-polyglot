import type { GlossaryEntry } from "./types.js";

/**
 * Glossary handling (FR-030). Entries are language-pair scoped, and a conflict is refused at
 * save time rather than resolved arbitrarily at request time (data-model.md Glossary Entry).
 */

export interface GlossaryConflict {
  incoming: GlossaryEntry;
  existing: GlossaryEntry;
}

function sameTerm(left: string, right: string, caseSensitive: boolean): boolean {
  const a = left.trim();
  const b = right.trim();
  return caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase();
}

function assertTerm(value: string, field: "sourceTerm" | "targetTerm"): void {
  if (value.trim().length === 0) {
    throw new RangeError(`Glossary ${field} must be a non-empty, non-whitespace string`);
  }
}

/**
 * Entries that apply to the requested pair, in stored order. "auto" as an entry's source
 * language means "any source language"; languages are otherwise compared literally.
 */
export function entriesFor(
  settings: { glossary: GlossaryEntry[] },
  sourceLang: string,
  targetLang: string,
): GlossaryEntry[] {
  return settings.glossary.filter(
    (entry) =>
      (entry.sourceLang === sourceLang || entry.sourceLang === "auto") &&
      entry.targetLang === targetLang,
  );
}

/**
 * The stored entry that the incoming one would contradict, or null. Case is folded unless both
 * entries ask for case-sensitive matching, so one insensitive entry owns "API" and "api" alike.
 */
export function findConflict(entries: GlossaryEntry[], incoming: GlossaryEntry): GlossaryEntry | null {
  for (const existing of entries) {
    if (existing.sourceLang !== incoming.sourceLang) continue;
    if (existing.targetLang !== incoming.targetLang) continue;
    if (sameTerm(existing.sourceTerm, incoming.sourceTerm, existing.caseSensitive && incoming.caseSensitive)) {
      return existing;
    }
  }
  return null;
}

/**
 * Appends a glossary entry. A conflict leaves the list untouched and is handed back to the caller
 * so the UI can name both sides; terms are trimmed here because storage promises trimmed terms.
 */
export function addEntry(
  entries: GlossaryEntry[],
  incoming: GlossaryEntry,
): { entries: GlossaryEntry[]; conflict: GlossaryConflict | null } {
  assertTerm(incoming.sourceTerm, "sourceTerm");
  assertTerm(incoming.targetTerm, "targetTerm");
  const trimmed: GlossaryEntry = {
    ...incoming,
    sourceTerm: incoming.sourceTerm.trim(),
    targetTerm: incoming.targetTerm.trim(),
  };
  const existing = findConflict(entries, trimmed);
  if (existing) return { entries, conflict: { incoming: trimmed, existing } };
  return { entries: [...entries, trimmed], conflict: null };
}
