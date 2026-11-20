# Implementation Plan: A Page of Chat Answers Translates In Place

**Branch**: `011-dsh-plugin` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-dsh-plugin/spec.md`

## Summary

Ship the existing translation engine — prompt, glossary, batching, provider request and response
handling, error taxonomy, price catalogue — as a DeepSeek Harness plugin, so a reader can translate a
page of chat answers in place, through their own provider, without touching the browser extension.
The plugin has a Host half (routes on the DSH web server, session-log reading, provider calls,
credentials, durable records) and a Client half (one control in the session header, one translation
section per answer in the turn's tail, a visibility-driven page coordinator). The extension build,
its tests and its zero-runtime-dependency promise stay exactly as they are.

## Technical Context

**Language/Version**: TypeScript 5.6.3, `strict` with `noUncheckedIndexedAccess` (the ratified
compiler). Host half runs on the Node.js 22 that DSH ships; client half is compiled to the
`window.__ModuleLoader__` CommonJS factory DSH's web client loads, with React 18 taken from the
browser module table rather than bundled.

**Primary Dependencies**: none at runtime — `@deepseek-ai/*` SDK packages resolve from the DSH
installation and React from the browser module table, exactly as DSH's own bundles do. Development
only: `@deepseek-ai/*` type packages and `@types/react` (new, dev-only, pinned), plus the already
ratified Vite 5.4.10 (client bundle), Vitest 2.1.4 + jsdom 25.0.1 (tests), Playwright 1.48.2 (e2e),
TypeScript 5.6.3.

**Storage**: durable translation records in DSH's storage domain (`ctx.storageDomain`, JSON backend);
the provider key in DSH credentials (`ctx.credentials`), never in configuration; non-secret settings
(endpoint, model, target language, bounds) in the plugin's patch row through the config editor, read
through `Config`.

**Testing**: Vitest for the Host (batch planning, dedupe and caps, price and usage, credential
redaction, record binding and staleness, request routing) and for the Client in jsdom (control state,
section rendering, code preservation, failure affordances, keyboard operation); Playwright against the
real running DSH web UI with the plugin installed and a recording stub endpoint (the existing
`scripts/dev-provider.mjs` pattern) for the end-to-end page behaviour, scroll continuation and
restart persistence.

**Target Platform**: DSH 0.2.x desktop/web on macOS (host: Node 22 in the app; client: DSH's web
client in Chromium), Chromium-family browsers 120+.

**Project Type**: host + client plugin bundle inside the existing single-project repository; the
browser extension stays a separate build artifact from the same checkout.

**Performance Goals**: a page of up to six answers and 3,000 characters shows every section within
3 seconds of the provider's response arriving (SC-009); one page batch issues one request per
documented cap-sized chunk; no request is made for a page the reader never reaches (SC-005).

**Constraints**: extension output byte-identical and zero runtime dependencies (FR-038, FR-039); only
an answer's visible prose reaches the configured endpoint (FR-009); the key appears in no log, session
record or error (FR-028); every label localized in English and Chinese (FR-037); the plugin stays
inactive, not broken, in a profile without its services (FR-005); tokens and price reported per page,
never invented per answer (FR-024, FR-025).

**Scale/Scope**: sessions of several hundred messages; one translation section per translated answer,
bounded by the page cap; a single profile; storage growth proportional to translated answers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan satisfies it | Verdict |
|---|---|---|
| I. Specification Before Code (NON-NEGOTIABLE) | `spec.md` holds 40 requirements and 11 success criteria, each decidable by an outside observer; the placement wording was amended during planning when the installed DSH turned out to offer a per-turn area rather than a per-message one, and the amendment is recorded in the spec's Clarifications. Every task in `tasks.md` will cite a requirement. | PASS |
| II. Test-First (NON-NEGOTIABLE) | Each behaviour lands with a failing test first: Host unit tests for batch planning and record binding, jsdom tests for every Client state and failure, and the Playwright page scenario. No task is complete while a test is skipped or loosened; the extension's suites are re-run unchanged as the regression gate. | PASS |
| III. Real Data, Real Behavior (NON-NEGOTIABLE) | The end-to-end proof runs the real DSH web client with the real installed bundle, the real session log and a real HTTP endpoint; the only double is the provider boundary, which is the same boundary the extension already isolates, and one real-provider check is available on demand through the existing `verify:real-provider` harness. Records are read back after a real DSH restart, not from memory. | PASS |
| IV. Simplicity and Least Commitment | The plugin adds no runtime dependency and no new engine: prompt, batching, provider client, error taxonomy and pricing are imported from the existing modules, which are already free of `chrome.*` (verified: 0 references in `provider-client.ts`, `batcher.ts`, `prompt.ts`, `pricing.ts`). One bridge (same-origin HTTP routes) is used for every Client call, and one storage form is used for every record. | PASS |
| V. Accessible and Localizable by Default | Every string comes from `locale/en.json` and `locale/zh.json`; the control and the sections are keyboard operable with visible focus and accessible names; layout tolerates 30 percent expansion and does not rely on colour; RTL source text is preserved unchanged. | PASS |

**Post-design re-check**: no gate fails after Phase 1. One recorded stack change: the plugin needs
`@deepseek-ai/*` peer types, React peer types and a second build target, which requires a PATCH
amendment to *Technology and Environment Constraints* before implementation (task T001).

## Project Structure

### Documentation (this feature)

```text
specs/011-dsh-plugin/
├── plan.md              # This file
├── research.md          # Phase 0: the ten decisions behind this plan
├── data-model.md        # Phase 1: records, batches, states
├── quickstart.md        # Phase 1: how to build, install and prove it
├── contracts/
│   ├── http-api.md      # Client → Host routes
│   └── translation-record.md  # Stored record shape and binding rules
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── background/            # unchanged: provider-client.ts is reused by the Host half
├── content/               # unchanged: batcher.ts is reused by the Host half
├── shared/                # unchanged: prompt, glossary, pricing, sanitize, types
├── plugin/
│   ├── host/
│   │   ├── index.ts       # apply(ctx, config): services, routes, effects
│   │   ├── page-batch.ts  # page → bounded batches, dedupe, caps, partial failure mapping
│   │   ├── answers.ts     # session-log reading: an answer's prose, settled state, identity
│   │   ├── translate.ts   # provider call through the shared client, usage and price
│   │   ├── records.ts     # durable translation records, binding and staleness
│   │   └── routes.ts      # same-origin routes mounted on ctx.webServer
│   └── client/
│       ├── index.tsx      # apply(ctx): locales, slots, styles
│       ├── control.tsx    # the session-header on/off control
│       ├── turn-tail.tsx  # one translation section per answer, in the turn's tail
│       ├── page.ts        # visibility coordinator: which turns are "the page"
│       ├── api.ts         # same-origin calls to the Host routes
│       └── styles.ts      # theme-token styles, no literal colours
plugin/                    # the installable package (static files committed, lib/ generated)
├── package.json           # name, exports, dsh.bundle.patch, dsh.client, files
├── cordis.patch.yml       # the bundle's insert row
├── locale/en.json, zh.json
├── icon.svg
├── docs/DETAIL.md
└── lib/                   # built: index.js (Host), client.js (Client) — git-ignored

scripts/
└── build-plugin.mjs       # one command: Host tsc + Client Vite bundle + package copy
tests/
├── unit/plugin/           # Host logic
├── dom/plugin/            # Client components in jsdom
└── e2e/plugin.spec.ts     # Playwright against the real DSH web UI
```

**Structure Decision**: the repository keeps one source tree and gains a second build target. Sources
live under `src/plugin/` beside the extension's `src/background|content|shared`, so the shared engine
is imported, never copied; `plugin/` is the installable package directory DSH's Plugins page takes,
holding committed manifest, patch, locale, icon and detail document plus a generated `lib/`. The
extension build (`scripts/build.mjs` → `dist/`) is untouched.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A second build target and DSH/React peer types in one repository | FR-001 requires one command per artifact from one checkout, and FR-040 requires the engine to have exactly one definition; a separate repository would copy prompt, batching and pricing. | A single Vite config emitting both artifacts was rejected: the extension bundle must contain no plugin code and keep zero runtime dependencies (FR-038, FR-039), and the two targets need different formats (ES extension modules vs a CommonJS `__ModuleLoader__` factory). |
| A same-origin HTTP bridge instead of generated Remote descriptors | The Host must own the credential, the session log and durable records; the Client needs results. HTTP routes are the pattern DSH's own out-of-tree bundle uses, need no code generation, and keep the credential on the Host. | Generated Remotes were rejected for v1: they need the deployment's code-generation step and add a protocol surface this feature does not need; they can replace the routes later without changing the contract in `contracts/http-api.md`. |
