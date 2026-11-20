<!--
Sync Impact Report
==================
Version change: (none - unratified template scaffold) -> 1.0.0 -> 1.0.1 -> 1.0.2
Bump rationale: Initial ratification. The file previously contained only the unmodified
constitution template with every placeholder unfilled, so no prior governance exists to
compare against. First adopted version is therefore 1.0.0 (initial adoption, not a breaking
change).

Modified principles (placeholder -> ratified):
  - PRINCIPLE_1_NAME -> I. Specification Before Code (NON-NEGOTIABLE)
  - PRINCIPLE_2_NAME -> II. Test-First (NON-NEGOTIABLE)
  - PRINCIPLE_3_NAME -> III. Real Data, Real Behavior (NON-NEGOTIABLE)
  - PRINCIPLE_4_NAME -> IV. Simplicity and Least Commitment
  - PRINCIPLE_5_NAME -> V. Accessible and Localizable by Default

Added sections (template placeholder slots populated, not appended):
  - SECTION_2_NAME "Technology and Environment Constraints"
  - SECTION_3_NAME "Development Workflow and Quality Gates"
  - GOVERNANCE_RULES "Governance"

Removed sections: none

Deferred items / follow-up TODOs:
  - RESOLVED in v1.0.1: TODO(TECH_STACK). The toolchain was fixed during the first planning
    pass and is now ratified in "Technology and Environment Constraints". Source of the
    decision: specs/001-llm-web-translator/plan.md (Technical Context) and research.md (R1).
  - The design principle behind the deferral stands as guidance, not as an open item: a new
    runtime, framework, or test runner still requires a PATCH amendment before it is used.

Amendment 1 (2026-11-13, v1.0.0 -> v1.0.1):
  - Scope: filled the one blank slot left by initial ratification; no principle was added,
    removed, or redefined.
  - Bump type: PATCH (recording a decision the section already required, no new obligation).

Amendment 2 (2026-11-19, v1.0.1 -> v1.0.2):
  - Scope: extended "Technology and Environment Constraints" with the second ship target ratified
    by spec 011 — the same checkout also builds a DeepSeek Harness plugin — and with the toolchain
    that target needs: the DSH SDK packages as pinned, dev-only type dependencies resolved at
    runtime from the DSH installation itself, React 18 taken from DSH's browser module table, and
    Vite 5 compiling both bundles. No principle was added, removed, or redefined.
  - Bump type: PATCH, as this section itself prescribes for a stack change. The extension's stack,
    its zero runtime dependencies, and every principle remain exactly as ratified.

Provenance note: the file was drafted from the project name and directory context only.
Principles I-IV are stack-neutral process commitments; principle V follows from a
multi-language product. Any of them may be amended via the Governance procedure.
-->

# Immersive Polyglot Constitution

## Core Principles

### I. Specification Before Code (NON-NEGOTIABLE)

No behavior is implemented before it is written down. Every change begins as a
specification that a reviewer can falsify.

- Every feature MUST produce a specification containing user scenarios, functional
  requirements, and success criteria before any implementation task starts.
- Every acceptance criterion MUST be decidable by an outside observer: a concrete input,
  a concrete observable outcome, and a pass or fail verdict. Statements such as "works
  well", "fast enough", or "user friendly" MUST NOT appear as acceptance criteria.
- Every requirement MUST be traceable to implementation: each task cites the requirement
  it satisfies, and each requirement is satisfied by at least one task. A task that
  cannot cite a requirement MUST be re-derived or dropped, never silently implemented.
- Every specification MUST state what is explicitly out of scope, so scope growth is a
  recorded decision rather than an accident.
- When implementation reality contradicts the specification, the specification MUST be
  updated in the same change set. Code and specification MUST NOT diverge across commits.

Rationale: the constitution is the contract the rest of the workflow reads. A decidable
specification is the only artifact that lets an implementer, a reviewer, and an automated
check reach the same verdict on whether the work is done.

### II. Test-First (NON-NEGOTIABLE)

Correctness is demonstrated by a failing test that is made to pass, not by a passing
demonstration after the fact.

- Every new behavior MUST begin with a test that fails for the right reason. The
  red-green-refactor cycle MUST be observable in the work, not merely claimed.
- A task is complete only when the full test suite passes. A task with a failing or
  skipped test MUST NOT be checked off, and tests MUST NOT be made green by deleting
  assertions, loosening a check, adding skips, or excluding a file from the run.
- Each behavior MUST have at least two tests: one for the intended path and one for the
  refused or boundary path. Validation rules, authorization decisions, and empty or
  oversized input are behaviors and MUST be tested as such.
- Tests MUST assert observable outcomes, not internal call sequences. A test that only
  proves a collaborator was called does not prove the feature works.
- A bug fix MUST land with a regression test that fails before the fix and passes after
  it.
- Test suites MUST be deterministic and runnable offline by a fresh checkout with one
  documented command, with no manual setup steps.

Rationale: tests are the executable form of the specification. Requiring the failing test
first is what keeps principle I honest when the pressure to ship arrives.

### III. Real Data, Real Behavior (NON-NEGOTIABLE)

What ships is what was verified. Verification MUST exercise the real system.

- Acceptance verification MUST run against the real persistence layer and real integration
  boundaries of the feature. A stand-in that bypasses the actual storage, transport, or
  contract MUST NOT be used to declare a feature done.
- Test doubles are permitted only at external, unowned boundaries and only when the real
  boundary is unavailable. Where a double is used, the boundary MUST additionally be
  covered by at least one test against the real implementation.
- Sample, seed, or fixture data MUST be clearly labeled as such and MUST NOT be presented
  as evidence that real flows work.
- Data MUST survive process restart. No feature MAY rely on in-memory state for anything
  the specification calls durable.
- Destructive or irreversible operations MUST require explicit confirmation and MUST be
  reversible or explicitly documented as irreversible.

Rationale: defects escape in the gap between the model of the system and the system. Closing
that gap to the smallest honest surface is cheaper than debugging production.

### IV. Simplicity and Least Commitment

Complexity is a cost paid on every future change, so it MUST be earned.

- Implementations MUST NOT include functionality that no current requirement asks for.
  Speculative extension points, unused configuration, and unrequested abstractions MUST be
  rejected in review.
- The simplest design that satisfies the current specification MUST be chosen. Choosing a
  more elaborate design REQUIRES a written justification in the plan: what future
  requirement it serves, and what it costs today.
- New dependencies MUST be justified against the alternative of not adding them. A
  dependency MUST be pinned, maintained, and free of unresolved critical advisories.
- Irreversible commitments - public contracts, schemas, on-disk formats, and identifiers -
  MUST be made as late as the specification allows and documented at the moment they are
  made.
- Module boundaries MUST follow the domain, not the framework. A package, service, or
  directory boundary that exists only to match a framework layout MUST NOT be introduced.

Rationale: the cheapest way to keep a system changeable is to not spend its flexibility
early. Most cost in a young codebase comes from abstractions adopted before their need is
proven.

### V. Accessible and Localizable by Default

The product teaches languages, so its own interface MUST respect language and ability
diversity rather than treat either as a later feature.

- User-visible text MUST NOT be hardcoded in source. It MUST be referenced through a
  translation catalog keyed by a stable identifier, with the source language declared.
- Layouts MUST tolerate text expansion of at least 30 percent and MUST NOT assume
  left-to-right rendering. Right-to-left locales MUST remain a supported target.
- Core journeys MUST be operable by keyboard alone, with visible focus, semantic
  structure, and accessible names on interactive controls. Color MUST NOT be the only
  carrier of meaning.
- Language and locale selection MUST be explicit, persisted, and changeable without data
  loss.
- Accessibility and localization regressions are defects, and MUST be filed, tested, and
  fixed through the same path as any other defect.

Rationale: a language-learning product whose interface is monolingual and mouse-only
contradicts its own premise. Retrofitting either is the most expensive option available.

## Technology and Environment Constraints

The stack below is ratified, not advisory. Every implementation binds to it until an
amendment replaces it.

- The ratified stack is TypeScript 5.6 (strict mode) compiled with Vite 5, tested with
  Vitest 2 plus jsdom for DOM-shaped logic and Playwright 1.48 driving a real Chromium for
  end-to-end behaviour, shipped as a Manifest V3 extension for Chromium-family desktop
  browsers. Runtime code MUST use platform APIs only; no UI framework and no extension
  framework are part of the stack. Every toolchain version MUST be pinned in a committed
  lockfile and recorded in the project README.
- Changing any element of that stack REQUIRES a PATCH amendment to this section before the
  change lands, so that the recorded stack never drifts from the one in use.
- The same checkout also builds a second, optional ship target: a DeepSeek Harness plugin, added by
  spec 011. Its stack is the same TypeScript 5.6 and the same Vite 5; the DSH SDK packages are
  pinned dev-only type dependencies that resolve at runtime from the DSH installation, React 18
  comes from DSH's browser module table, and neither half of the plugin declares a runtime
  dependency of its own. The plugin is additive: the extension's stack, its output and its zero
  runtime dependencies are unchanged, and the extension MUST build and pass its suites with the
  plugin absent.
- A fresh checkout MUST become runnable, including its full test suite, through one
  documented command per package, with no undocumented manual steps.
- Secrets and credentials MUST NOT be committed. They MUST be supplied through environment
  configuration or a secret store, and MUST NOT be written to logs.
- Configuration that differs between environments MUST be externalized and MUST have a
  documented default that is safe for local development.
- Data MUST be stored in a real persistent store owned by the feature. Cross-feature
  access MUST go through that feature's documented contract, not through shared tables.
- Every long-running operation MUST declare a timeout and a bounded failure behavior.

## Development Workflow and Quality Gates

Work proceeds specification, then plan, then tasks, then implementation, then verification.
Skipping a stage requires a written justification recorded in the plan.

- A feature MUST NOT enter implementation before its specification is reviewed and its
  plan records the chosen approach, the rejected alternatives, and the complexity
  justification required by principle IV.
- Tasks MUST be ordered by dependency and sized to one reviewable unit of work. A task
  MUST name the requirement it satisfies and the test that will prove it.
- Quality gates, all enforced before a task is marked complete:
  - the full test suite passes with no skips introduced by the change;
  - new behavior has both an intended-path and a refused-path test;
  - the change is traceable to a requirement, and the requirement is traceable to a test;
  - no user-visible string bypasses the translation catalog;
  - no secret, credential, or environment-specific value is committed;
  - no dependency was added without a stated justification.
- A change MUST be reviewed by someone other than its author, or, where a single
  contributor exists, reviewed against this constitution by re-reading the diff before
  merge. The review MUST explicitly confirm principle compliance or name the exception.
- Breaking a published contract, schema, or on-disk format REQUIRES a documented migration
  path and, where consumers exist, a coordinated rollout. Silent breaks MUST NOT ship.
- Every deferred or partial item MUST be recorded as an open task or an explicit TODO in
  the specification. Undocumented incompleteness MUST NOT be merged.

## Governance

This constitution supersedes conflicting habits, framework defaults, and local preferences.
Where guidance elsewhere in the project disagrees with this document, this document wins and
the other guidance MUST be corrected.

- Amendment procedure: a proposal MUST state the principle or section to change, the
  motivation, the cost to existing work, and the migration path for work in flight. The
  amendment MUST be written back into this file as a whole-document update, reviewed like
  any other change, and accompanied by a version bump and an updated amendment date.
- Versioning policy: MAJOR for removing or redefining a principle in a way that
  invalidates existing compliant work, or for a governance change that invalidates prior
  decisions; MINOR for adding a principle or section, or materially expanding existing
  guidance; PATCH for clarifications and non-semantic wording fixes. Every amendment
  appends one line to the amendment log below.
- Compliance review: every plan MUST include a constitution check naming each principle
  and how the design satisfies it. Every task completion and every review MUST verify the
  quality gates above. Violations found after merge MUST be fixed or recorded as an
  explicit, time-boxed exception in the specification, with an owner.
- Complexity justification: any deviation from principle IV MUST be recorded at the point
  of deviation, not retroactively.

### Amendment Log

- 2026-11-13 - v1.0.0 - Initial ratification: five core principles, technology and
  environment constraints, development workflow and quality gates, governance.
- 2026-11-13 - v1.0.1 - PATCH: recorded the ratified toolchain in "Technology and Environment
  Constraints", resolving TODO(TECH_STACK). No principle changed.
- 2026-11-19 - v1.0.2 - PATCH: ratified the DeepSeek Harness plugin as a second ship target from the
  same checkout (spec 011), with its pinned dev-only SDK dependencies and the unchanged extension
  guarantees. No principle changed.

**Version**: 1.0.2 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-19
