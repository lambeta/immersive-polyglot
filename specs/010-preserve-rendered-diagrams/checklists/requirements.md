# Specification Quality Checklist: Drawing Labels Translate In Place Without Breaking the Drawing

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-18
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Re-validated on 2026-11-18 after all four clarification answers (drawing text is translated; in
  place with geometry unchanged; a translation that does not fit shrinks only its own phrase to a
  floor, then falls back to the original; only phrases are eligible, single tokens stay as drawn).
  All 16 items pass; no item changed from checked to unchecked.
- The specification names kinds of page content — a drawing's stylesheet text, its generated
  identifiers, its labels — because those are the observable subject of the defect. It names no
  product internals, source structure, API, or library, and it prescribes no detection mechanism.
- Clarified scope, recorded in the spec's Clarifications, Assumptions, and Out of Scope: the drawing's
  visible phrases are translated in place; the drawing is not re-rendered, resized, or given a second
  copy; a phrase that does not fit shrinks no lower than 75% of its drawn size or 10 px at 100% zoom
  and otherwise keeps its original text; single tokens (participant names, diagram keywords,
  identifiers) are not translated. Opaque graphics and typeset equations are preserved and
  untranslated.
- **Recorded consequence of the phrase-only choice**: on the reported article the five message labels
  and the loop's description are translated, while "Agent", "Evaluator", "Dataset", "Developer", and
  "loop" stay in English. A source language written without spaces between words makes a space-less
  label one token, so it stays as drawn (Assumptions). If either consequence is not wanted, the rule
  must be amended before planning.
- Plan-time amendments were applied to `spec.md` in the same change set: **A1** defines the label
  grouping unit (one text-bearing element; sibling text elements are separate labels) in FR-004;
  **A2** records the own-bounds reading and the fit fallback in Assumptions; **A3** resolves the
  contradiction between the fit/RTL writes and the old "no typography/direction" rule in FR-009,
  FR-010 and FR-014. Re-validated after the edits: 16/16, no marker changes.
- Evidence behind the defect is recorded in "Observed failure": the live page's drawing subtree text
  was captured on 2026-11-18 and matched the failing line exactly, stylesheet included. The regression
  fixture is separate from the live page and will be labelled as a fixture, so one is never presented
  as evidence for the other.
- SC-001, SC-004, SC-005, SC-006, SC-009, SC-010, SC-012, SC-015, and SC-016 are decidable from
  captured page renderings, assistive-technology output, and position comparisons; SC-002, SC-003,
  SC-007, SC-011, and SC-014 from recorded requests and usage reports; SC-008 and SC-013 from
  per-label state. Each names the pass threshold (3 of 3, 20 of 20, 7 of 7, 0 occurrences, 0
  difference).
