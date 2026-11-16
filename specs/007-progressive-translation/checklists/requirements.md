# Specification Quality Checklist: A Loading Mark on the Passage Being Translated, and Translation Requested on Demand

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-15
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

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
- Validation pass 1 (2026-11-15): three findings were raised and fixed in the document rather than
  deferred. (a) SC-012 measured "main-thread tasks", which is a browser-internal notion, and was
  rewritten as a user-observable delay bound. (b) FR-023, FR-026 and SC-007 used "attribute" and
  "element", which are implementation vocabulary, and were rewritten as marks, markings and styling.
  (c) FR-019 ("a passage refused by a cap MUST NOT show a mark") contradicted FR-021 (a mark is
  removed when a cap refuses it); both were reconciled to "MUST NOT be left showing a mark", and the
  matching acceptance scenario in Story 3 now spells out the removal.
- Validation pass 2 (2026-11-15): a duplicate edge case about printed or saved pages was merged into
  one entry, and the fast-scroll edge case was sharpened so it no longer contradicts Story 2's
  scenario 7: a passage on screen for even one frame is requested, a passage no frame showed is not.
- **Decision recorded, not deferred**: translation becomes on-demand against a *demand window* — the
  visible area plus a fixed one-screenful lookahead — rather than per-sentence requests or a
  background pre-fetch of the whole page. The two rejected readings and the reasons live in
  **Assumptions**; a "translate the whole page now" action is listed in **Out of Scope**.
- **Decision recorded, not deferred**: the mark sits wherever the current display mode puts the
  translation, not literally "after the paragraph" in every mode. A mark below a passage whose
  translation appears above would point at the wrong place; the reasoning is in **Assumptions**.
- **No [NEEDS CLARIFICATION] marker was needed.** The two readings of the request that genuinely
  differ — scope of "on demand", and literal-versus-mode-relative placement of the mark — both have a
  defensible default grounded in the request ("与 Immersive Translate 一致", "在文本段落后") and in the
  product's existing display modes, so both are recorded as assumptions rather than questions.
- The only non-user-facing sentences in the document are the three reading notes in **Assumptions**
  that quote the reader's own wording. They are provenance, not requirements, and name no framework,
  API or module.
- Coverage check: FR-001..FR-009 (the mark) -> Story 1, SC-001, SC-003, SC-011; FR-010..FR-020
  (on-demand scope) -> Story 2, SC-002, SC-004, SC-005, SC-012; FR-021..FR-026 (every mark ends,
  restoration) -> Story 3, SC-006, SC-007; FR-027..FR-031 (reading continuity and access) -> Story 4,
  SC-008, SC-009, SC-010; FR-032..FR-037 (preserved behaviour) -> the Edge Cases and the preserved
  clauses of every story, SC-011, SC-013.
- Deferred to later phases by design: the exact geometry of the demand window in page terms, how the
  mark is drawn and animated, where the request queue lives, and which fixture page carries the
  200-passage case. Those are planning and task concerns, not specification gaps.
