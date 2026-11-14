# Phase 1 Data Model: Translation Display Styles

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-14

Entities are named as the spec names them. Field lists are behavioural contracts, not class
definitions; the persisted delta is in [contracts/settings-and-messages.md](./contracts/settings-and-messages.md).

**Naming note**: feature 001 already has `StyleSettings` for the *translation prompt* instruction
(tone/formality). This feature's entities are `DisplayStyle*` throughout, and its UI surface is a new
**Display** panel, so the two "style" concepts never share a name, a field, or a panel.

---

## Display Style

One visual treatment a translation can take. Code-defined, not persisted; the settings file holds only
its identifier.

| Field | Meaning | Validation (FR) |
|---|---|---|
| `id` | Stable identifier stored in settings | One of the fifteen catalogued ids; never localised, never reused (FR-001) |
| `order` | Position in the picker | Contiguous 0-14, matching the reference list order (FR-001) |
| `nameKey` | Catalogue key for the localised name | Must resolve in `_locales` (FR-001, FR-022) |
| `treatment` | The visual treatment class: `none`, `underline`, `border`, `divider`, `marking`, `quote`, `foreground` | Exactly one per style; drives the stylesheet selector (FR-007) |
| `concealment` | Whether the style reduces visibility until revealed | `true` only for blur, transparency, weakened (FR-012) |
| `foregroundPolicy` | How the translation's colour is decided | `inherit` for decorative styles, `hue-blend` for weakened, `neutral` for gray; both non-inherit policies go through the contrast utility (FR-013) |
| `icon` | Descriptor the SVG generator renders | Must produce a distinct, labelled icon (FR-007, FR-008, FR-010) |

**Invariants**: exactly fifteen entries; ids unique and stable; every entry has a name key and an icon;
`concealment: true` implies the reveal contract of [contracts/rendering-styles.md](./contracts/rendering-styles.md).

---

## Style Preference

The reader's stored choice.

| Field | Meaning | Validation (FR) |
|---|---|---|
| `ui.displayStyle` | Device-wide default style id | Optional in storage; missing or unknown resolves to `none` (FR-004, FR-020) |
| `sites[].displayStyle` | Per-site override | Optional; must be a catalogued id when present; an unknown stored value is ignored at resolution time rather than rewritten mid-load (FR-019, FR-020) |

**Resolution order** (deterministic, tested): matching site override → device-wide default → `none`.
Matching reuses feature 001's site-pattern matcher, so a site is matched identically for language,
display mode and style. An override for a site that also sets `displayMode` is independent: changing
one never rewrites the other.

**Default**: `none` for a fresh profile, for an upgraded profile, and for a site rule created before
this feature. Existing pages therefore render exactly as they did.

---

## Resolved Style

The style actually used for a page. Derived, not stored.

| Field | Meaning | Validation (FR) |
|---|---|---|
| `styleId` | The winning catalogue id | Always catalogued; unknown input became `none` (FR-020) |
| `source` | `site` or `global` or `default` | Observable in the picker so the reader knows why a page looks the way it does (FR-005, FR-019) |

---

## Style Preview Icon

A visual sample demonstrating one style.

| Field | Meaning | Validation (FR) |
|---|---|---|
| `styleId` | The style depicted | One per catalogue entry; fifteen total (FR-007) |
| `accessibleName` | The style's localised name | Equal to the style's name; exposed via `role="img"` and `<title>` (FR-008) |
| `shapes` | The decorative primitives shown (stroke pattern, band, bar, fade) | Must not rely on colour alone (FR-010) |
| `sampleTextKey` | Catalogue key for the sample text, or decorative bars | Resolves in the catalogue (FR-022) |

---

## Style Application (ephemeral)

The per-block state the renderer keeps while translations are on the page. Never persisted, dropped
with the journal.

| Field | Meaning | Validation (FR) |
|---|---|---|
| `container` | The translation block the renderer owns | One application per rendered block (FR-017) |
| `styleId` | Style currently applied | Matches the resolved style at apply time (FR-002) |
| `concealed` | Whether concealment attributes and focusability are active | True only for the three concealment styles; removed on switch (FR-012, FR-016) |
| `foreground` | Computed contrast-safe colour, when the style needs one | Set only for `hue-blend`/`neutral`; journalled (FR-013) |

**State machine** (per block):

```text
unstyled ──render──▶ styled(styleId)
styled(A) ──setStyle(B)──▶ styled(B)        # attribute rewrite, no job change (FR-002, FR-003)
styled(any) ──toggle off──▶ unstyled        # journal replay removes attributes/properties (FR-015)
styled(any) ──block removed by page──▶ dropped  # no writes to a detached node (edge case)
```

Rules: a switch never adds or removes the translation block itself; concealment attributes exist only
while a concealment style is applied; repeated switching converges on the last selection with no
growth in journal entries per block beyond the first journaled write of each attribute (FR-016).

---

## Persisted Schema Delta (v1 → v2)

```json
{
  "schemaVersion": 2,
  "ui": { "targetLang": "zh", "sourceLang": "auto", "displayMode": "bilingual", "displayStyle": "none" },
  "sites": [
    { "sitePattern": "news.example", "displayMode": "bilingual", "displayStyle": "highlight", "autoTranslate": false }
  ]
}
```

**Migration `add-display-style`** (v1 → v2, pure, idempotent):

1. If `ui` is an object and `ui.displayStyle` is absent, set it to `"none"`.
2. For each `sites[]` entry, drop a `displayStyle` that is not a catalogued id.
3. Write `schemaVersion: 2` only after the step succeeds; a failure aborts without persisting.

**Compatibility**: a v1 build reading a v2 profile hits the existing "newer schema" refusal and
leaves the file untouched, so a downgrade cannot silently erase the style. A v2 build reading a v1
profile migrates on load and writes once. `mergeDefaults` tolerates missing fields, so a partially
written profile still loads with `none`.

---

## Relationships

```text
DisplayStyle (catalogue, 15) 1 ──── 0..1 UiSettings.displayStyle
DisplayStyle (catalogue, 15) 1 ──── * SitePreference.displayStyle   (one per site, optional)
DisplayStyle 1 ──── 1 StylePreviewIcon                               (catalogue-driven)
DisplayStyle 1 ──── * StyleApplication                              (live, per rendered block)
SitePreference * ── 1 Resolved Style                                 (override wins, else global)
```

## Validation Summary (maps to requirements)

| Rule | Requirement |
|---|---|
| Exactly fifteen styles, ids unique and stable, order fixed | FR-001 |
| Unknown stored/override id resolves to `none`, never blocks translation | FR-020 |
| Default is `none` for fresh, upgraded, and pre-existing site rules | FR-004 |
| A style change performs no provider request and no re-translation | FR-003, SC-002 |
| Every style is applied through one journalled attribute per block | FR-002, FR-015 |
| Concealment styles are focusable only while active and always reveal on hover/focus | FR-012, SC-007 |
| Gray/weakened foreground meets 4.5:1 (or 3:1 large) against the actual backdrop | FR-013, SC-008 |
| Delete-all-local-data removes the choice and it resets to `none` | FR-021, SC-013 |
| Every style name and sample string resolves through the catalogue | FR-022, i18n audit |
