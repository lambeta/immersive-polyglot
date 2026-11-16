import type { TranslationUnit } from "../shared/types.js";
import type { SegmentDuplicate } from "./segmenter.js";

/**
 * The page's passages (feature 007, data-model §1): one source block, the parts that translate it,
 * and the repeated occurrences that will be rendered from another passage's result.
 *
 * It exists as its own module because two consumers need the same answer — the job (what to render
 * for this block) and the demand pump (what is still untouched) — and a second copy of the mapping
 * is exactly how a block ends up with two translations (feature 005).
 */

export interface Passage {
  element: Element;
  parts: TranslationUnit[];
  occurrences: SegmentDuplicate[];
}

export class PassageIndex {
  readonly #byElement = new Map<Element, Passage>();
  /** Insertion order is document order: the segmenter walks the page top to bottom. */
  readonly #order: Element[] = [];

  get size(): number {
    return this.#order.length;
  }

  addUnit(unit: TranslationUnit): void {
    const element = unit.domRef;
    if (!element) return;
    let passage = this.#byElement.get(element);
    if (!passage) {
      passage = { element, parts: [], occurrences: [] };
      this.#byElement.set(element, passage);
      this.#order.push(element);
    }
    if (!passage.parts.includes(unit)) passage.parts.push(unit);
  }

  addOccurrence(occurrence: SegmentDuplicate): void {
    // A block can consist only of repeated text: it borrows another passage's translation and has
    // no parts of its own. It still needs a record, or nothing would ever fill it.
    let passage = this.#byElement.get(occurrence.element);
    if (!passage) {
      passage = { element: occurrence.element, parts: [], occurrences: [] };
      this.#byElement.set(occurrence.element, passage);
      this.#order.push(occurrence.element);
    }
    if (
      passage.occurrences.some(
        (existing) => existing.unitId === occurrence.unitId && existing.partIndex === occurrence.partIndex,
      )
    ) {
      return;
    }
    passage.occurrences.push(occurrence);
  }

  passageOf(element: Element): Passage | undefined {
    return this.#byElement.get(element);
  }

  partsOf(element: Element): readonly TranslationUnit[] {
    return this.#byElement.get(element)?.parts ?? [];
  }

  occurrencesOf(element: Element): readonly SegmentDuplicate[] {
    return this.#byElement.get(element)?.occurrences ?? [];
  }

  /** Every occurrence on the page that will be filled from one unit's translation. */
  occurrencesOfUnit(unitId: string): SegmentDuplicate[] {
    const found: SegmentDuplicate[] = [];
    for (const element of this.#order) {
      const passage = this.#byElement.get(element);
      if (!passage) continue;
      for (const occurrence of passage.occurrences) {
        if (occurrence.ofUnitId === unitId) found.push(occurrence);
      }
    }
    return found;
  }

  /** Passages that still have something to request, in document order. */
  pending(): Passage[] {
    const pending: Passage[] = [];
    for (const element of this.#order) {
      if (!element.isConnected) continue;
      const passage = this.#byElement.get(element);
      if (!passage) continue;
      if (passage.parts.some((part) => part.state === "queued")) pending.push(passage);
    }
    return pending;
  }

  all(): Passage[] {
    const all: Passage[] = [];
    for (const element of this.#order) {
      const passage = this.#byElement.get(element);
      if (passage) all.push(passage);
    }
    return all;
  }

  /** Document-order rank of a passage's element; used to break ties inside a demand group. */
  rankOf(element: Element): number {
    return this.#order.indexOf(element);
  }
}
