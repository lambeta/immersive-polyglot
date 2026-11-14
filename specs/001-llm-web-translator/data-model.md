# Phase 1 Data Model: Immersive Web Translator

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-13

Entities are named as the spec names them. Field lists are behavioural contracts, not class
definitions; the persisted shape is in [contracts/storage-schema.md](./contracts/storage-schema.md).

---

## Translation Provider

A service the user owns and the product calls.

| Field | Meaning | Validation (FR) |
|---|---|---|
| `id` | Stable local identifier | Generated once, never reused (FR-001) |
| `name` | User-facing label shown in menus | Required, 1-64 chars, unique per user (FR-001) |
| `endpoint` | Full request URL | Required, absolute `https` (loopback `http` allowed for local models), must parse (FR-001) |
| `model` | Model identifier sent to the provider | Required, non-empty (FR-001) |
| `credentialRef` | Reference to the stored secret | Exactly one credential per provider (FR-001) |
| `extraHeaders` | Additional request header names/values | Optional; must not override `Authorization` from the credential binding without explicit confirmation (FR-004) |
| `enabled` | Whether it may be selected by routing | Default true; a disabled provider is never chosen (FR-005) |
| `lastVerification` | Outcome of the most recent connection check | `{at, ok, errorClass?}`; drives the UI state (FR-003) |
| `timeoutMs` | Per-request timeout | Default 60000, bounds 5000-300000 |
| `maxConcurrency` | Ceiling of in-flight requests | Default 3, bounds 1-10 (FR-027) |

**Invariants**: a provider with `enabled: false` may not be referenced as the target of an active
route without the route being reported broken (US3 scenario 4). Deleting a provider deletes its
credential in the same transaction and leaves referencing routes visibly broken, never silently
repointed.

---

## Provider Credential

| Field | Meaning | Validation (FR) |
|---|---|---|
| `providerId` | Owning provider | Exactly one; deleting the provider deletes this (FR-001) |
| `secret` | The token/API key | Never blank when saved; never returned to any context other than the service worker (FR-021) |
| `masked` | Display form, e.g. last four characters | Derived, never stored in clear (FR-021) |
| `updatedAt` | Last change | Set on every write |

**Invariants**: the plaintext secret never appears in a message payload, a log, a rendered surface, or
an export (SC-006). Redaction is a property of the type system boundary, not of discipline: the
credential crosses only through a service-worker-internal accessor.

---

## Routing Rule

| Field | Meaning | Validation (FR) |
|---|---|---|
| `id` | Stable identifier | Generated |
| `kind` | `site` or `languagePair` | Enum, required (FR-005) |
| `match` | Site pattern, or `{sourceLang, targetLang}` | Required; a site rule must parse as a host or pattern (FR-032) |
| `providerId` | Provider to use | Must reference an enabled provider at evaluation time (FR-005) |
| `enabled` | Whether the rule participates | Default true |

**Resolution order** (deterministic, tested): page-level override → language-pair rule → site rule →
global default. Ties inside one kind resolve to the most specific site pattern, then to the most
recently created. A rule whose provider is missing or disabled is skipped and reported, and evaluation
falls through rather than failing (US3 scenario 4).

---

## Translation Unit

The atom of work and of rendering.

| Field | Meaning | Validation (FR) |
|---|---|---|
| `id` | Stable ID: document position + content hash | Stable across re-segmentation of an unchanged page (R6) |
| `sourceText` | Original text | Non-empty after trimming; else `skipped` |
| `sourceLang` / `targetLang` | Language pair for this unit | Detected or configured; identical pair ⇒ `skipped` (edge case) |
| `translatedText` | Result | Present only for `translated` (FR-020) |
| `state` | See state machine | Enum |
| `skipReason` | Why it was not translated | `editable`, `code`, `hidden`, `nav`, `sameLanguage`, `siteOptOut`, `capReached` (FR-007, FR-014, FR-029) |
| `errorClass` | Why it failed | One of the taxonomy in [contracts/provider-adapter.md](./contracts/provider-adapter.md) |
| `attempts` | Retry count | Drives bounded retry (FR-026) |
| `reusedFrom` | Unit ID when deduplicated | Set when the same source text was already translated (FR-011) |
| `domRef` | Ephemeral handle to the node(s) | Never persisted; dropped on restore |

**State machine**:

```text
queued ──▶ translating ──▶ translated
   │            │
   │            ├──▶ failed ──(retry budget left)──▶ queued
   │            └──▶ cancelled
   └──▶ skipped
```

Rules: `translated` is terminal and requires non-empty `translatedText`. `failed` must carry an
`errorClass` the user can act on. No unit may be rendered while in any state other than `translated`
(FR-020).

---

## Translation Job

One run over one page. Lives in the content script only (R3).

| Field | Meaning | Validation (FR) |
|---|---|---|
| `jobId` | Identifier | Generated per run |
| `pageKey` | Origin + path, without credentials or query fragments | Used for per-site preferences only |
| `providerId` | Provider actually used | Resolved at start, recorded for the usage view (FR-028) |
| `units` | Unit set | Non-empty for a run to start |
| `state` | `idle`, `segmenting`, `translating`, `completed`, `cancelled`, `failed` | Enum |
| `counts` | `{total, translated, failed, skipped, reused}` | Displayed live and in the session record |
| `capState` | `{cap, consumed, reached}` | Crossing the cap stops dispatch and sets `reached` (FR-029) |
| `startedAt` / `endedAt` | Timestamps | `endedAt` set on terminal states |

**Cancellation contract (FR-012)**: cancelling aborts every in-flight request, marks in-flight units
`cancelled`, leaves already-translated units on the page unless the user asked to translate off, and
completes within 2 seconds. No result arriving after cancellation may be applied.

---

## Site Preference

| Field | Meaning | Validation (FR) |
|---|---|---|
| `sitePattern` | Host or pattern | Parses; most specific wins |
| `targetLang` | Preferred target language for this site | Optional; falls back to global (FR-032) |
| `displayMode` | Chosen rendering mode | One of the modes in [contracts/rendering-dom.md](./contracts/rendering-dom.md) (FR-017) |
| `providerId` | Per-page/per-site override | Optional; expired override applies to one page load only (FR-005) |
| `enabled` | Auto-translate on load for this site | Default false |

---

## Glossary Entry

| Field | Meaning | Validation (FR) |
|---|---|---|
| `sourceTerm` | Term as it appears | Required, non-empty, trimmed |
| `targetTerm` | Required rendering | Required, non-empty |
| `sourceLang` / `targetLang` | Applicability | Required |
| `caseSensitive` | Matching rule | Default false |

**Invariant**: conflicting entries for the same source term and pair are rejected at save time with the
conflict named, rather than resolved arbitrarily at request time (FR-030).

---

## Session Usage Record

| Field | Meaning | Validation (FR) |
|---|---|---|
| `segmentsTranslated` | Count this session | Increments on `translated` |
| `approxChars` | Volume this session | Increments on dispatch |
| `perProvider` | Breakdown by provider ID | Keyed map |
| `reusedSegments` | Savings from dedupe | Surfaces FR-011's "reuse saved work" message |

**Invariant**: the record is session-scoped and cleared with the tab; it is never transmitted, and it
is not a billing ledger — it is a cost-visibility aid (FR-028).

---

## Relationships

```text
Provider 1 ──── 1 Credential
Provider 1 ──── * RoutingRule        (rule must point at an enabled provider)
RoutingRule * ── 1 SitePreference    (a site rule may also set target language/mode)
Job      1 ──── 1 Provider           (resolved by routing at start)
Job      1 ──── * TranslationUnit    (units reference the job for counts and cancellation)
SitePreference 1 ── * GlossaryEntry  (glossaries are language-pair scoped, not site scoped)
Provider 1 ──── * SessionUsageRecord (breakdown key)
```

## Validation Summary (maps to requirements)

| Rule | Requirement |
|---|---|
| Endpoint must be absolute and HTTPS (loopback exempt) | FR-001, FR-021 |
| Secret never leaves the service worker | FR-021, FR-022, SC-006 |
| Identical source text translates once per page | FR-011 |
| Same-language pair becomes `skipped`, not `translated` | Edge case, FR-007 |
| Unit renders only in `translated` | FR-020 |
| Cap reached stops dispatch and is reported | FR-029 |
| Broken route falls through to the next rule and is reported | US3, FR-005 |
| Restore removes 100% of journaled changes | FR-019, SC-008 |
