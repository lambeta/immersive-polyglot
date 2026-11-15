# Phase 1 Data Model: One System for the Page Control and the Settings Page

## Scope of this model

**Nothing persisted changes.** Stored settings, keys, schema version and migrations are untouched; the
persisted profile is described in `specs/001-llm-web-translator/data-model.md` and stays the authority.
What this feature introduces is a **surface model**: the values each of the two surfaces reads, the state
each one can be in, what it renders in that state, and the invariants a reviewer can check on screen.

Three kinds of thing are modelled here:

1. **Panel state** — the finite set of states the page control can show, and what each renders.
2. **View models** — the shapes the settings page renders into rows, cards and feedback lines.
3. **Invariants and refusal paths** — the rules that make "looks right" decidable.

Everything below is derived from the existing code and the feature specification; nothing is invented.

---

## 1. Page control: panel state

### 1.1 Inputs the panel reads

| Input | Source | Absent value |
|---|---|---|
| Site host | the active tab's URL | no host (browser page, extension page, blank tab) |
| Enabled providers | `settings.providers` where `enabled` | empty list |
| Job status | `getJobStatus` reply from the content agent | no reply → `IDLE` |
| Display mode for this site | site preference, else `settings.ui.displayMode` | `bilingual` |
| Display style for this site | site preference, else `settings.ui.displayStyle` | `none` |
| Style catalogue | `DISPLAY_STYLES` (15 entries) | — |

### 1.2 States and what each renders

`JobStatusPayload.state` drives the whole header region. One table, one truth:

| State | State line | Primary action | Cancel | Dot | Notes |
|---|---|---|---|---|---|
| `idle` | "Not translated" | "Translate this page", enabled | hidden | neutral | disabled when no enabled provider |
| `idle` + no provider | "Not translated" + the no-provider line | "Translate this page", **disabled** | hidden | neutral | the line names the settings page as the fix |
| `segmenting` | "Reading the page…" | "Show original" | shown | accent, pulsing | volume text is not yet meaningful |
| `translating` | "Translating…" | "Show original" | shown | accent, pulsing | counts update in place |
| `completed` | "Translated · {n}" | "Show original" | hidden | accent | `n` = `counts.translated` |
| `cancelled` | "Cancelled" | "Show original" | hidden | warn | rendered translations stay on the page |
| `failed` | "Translation failed" | "Show original" | hidden | danger | the failure line carries the reason |

Transitions: `idle → segmenting → translating → completed | cancelled | failed`, and any state → `idle`
when the reader restores the page. The panel is a read-only view of the agent's state: it never invents a
state, and it re-renders from `jobUpdated` messages and from `getJobStatus` replies.

### 1.3 Independent condition lines

Each of these is its own element and can appear at the same time as any other; none may replace the
primary action (FR-003):

| Condition | Element | Content | Tone |
|---|---|---|---|
| Failure | `#failure` | the error class's catalog message, or the no-provider message | error |
| Volume cap reached | `#cap` | "Volume cap reached; {count} passages were not sent." | warn |
| Broken routing rule | `#broken-rule` | the rule and the provider actually used | warn |
| Session record | `#usage` | one line per fact: translated, characters, reused, skipped, failed | neutral |

### 1.4 Choices rendered by the panel

**Display position** (`DisplayChoice`): three options, one radio group named `popup-mode`.

| Value | Visible label (short) | Accessible name (full) | Effect |
|---|---|---|---|
| `bilingual` | "Below" | "Translation below original" | translation block after the source block |
| `above` | "Above" | "Translation above original" | translation block before the source block |
| `only` | "Only" | "Translation only" | source block hidden, translation shown |

The short label exists because a 384 px three-way switch cannot hold the full sentence; the full text is
the control's accessible name and its tooltip, so nothing is lost to abbreviation.

**Style option** (`StyleOption`, 15): `id`, `nameKey` (catalog), preview mark (generated SVG with its own
`title`), and — in the panel — a `title` on the tile. Exactly one is checked at any time.

**Chosen-style line**: "Current style: {name}", rendered from the checked option, updated on selection and
on a storage change from another surface.

### 1.5 Panel invariants

| # | Invariant | Checkable as |
|---|---|---|
| P1 | Exactly one primary action is visible in every state | one element with the primary button style; `#translate` is the only one |
| P2 | Exactly one display-position radio is checked | count of `input[name="popup-mode"]:checked` = 1 |
| P3 | Exactly one style radio is checked | count of `input[name="popup-display-style"]:checked` = 1 |
| P4 | The chosen style is stated in words | `#style-current` is non-empty and names the checked option |
| P5 | The session record is absent when there is nothing to report | `#usage` has no children in `idle` |
| P6 | The settings control is reachable in every state | a focusable, named control in the header |
| P7 | Untranslated height ≤ 600 px | measured on the built page |
| P8 | No provider ⇒ the primary action is disabled and an explanation names settings | `#translate.disabled` and `#failure` text |

---

## 2. Settings page: sections and view models

### 2.1 Section inventory

One section is visible at a time. `id`, heading key and lede key are the contract (the headings and ledes
come from the catalog, never from markup):

| Section id | Heading key | Lede key | Cards |
|---|---|---|---|
| `panel-providers` | `tabProviders` | `providersLede` | disclosure callout · provider form · saved providers list |
| `panel-routing` | `routingTitle` | `routingLede` | default provider · add-a-rule form · rules list |
| `panel-sites` | `sitesTitle` | `sitesLede` | add-a-preference form · saved preferences list · default-for-every-page |
| `panel-glossary` | `glossaryTitle` | `glossaryLede` | add-a-term form · terms list |
| `panel-display` | `displayTitle` | `displayLede` | style picker with page-like sample · translation text · save/reset row |
| `panel-style` | `styleTitle` | `styleLede` | instruction field (removed: temperature) |
| `panel-privacy` | `privacyTitle` | `privacyLede` | policy + erase · volume caps · per-site caps |
| `panel-diagnostics` | `diagnosticsTitle` | `diagnosticsLede` | stored keys |

### 2.2 Row view models

Each stored collection renders as rows of the same shape: a **title block** (the thing being configured,
plus zero or more state pills), a **detail block** (muted, monospaced where machine-written), and an
**action block** (its own buttons). Empty collections render one muted row naming what to add.

| Row | Title | Detail | Pills | Actions |
|---|---|---|---|---|
| Provider | provider name | endpoint · model (mono); verification state; last checked | "Disabled" | Edit · Delete |
| Rule | the match (host, or `source → target`) | the provider's name, or the broken-provider warning | kind ("Site" / "Language pair"); "Disabled" | Delete rule |
| Site preference | the site pattern | `→ target · mode · style · auto` | — | Delete |
| Glossary term | `source → target` | `source → target language`(· case sensitive) | — | Delete |
| Per-site cap | the site pattern | "Site cap: {n}" | — | Delete |

### 2.3 Feedback lines

One model for every write: `(element id, message, kind)`. Placement is fixed by the contract — the line
sits inside the same card as the control that caused it, under the button row.

| Kind | Rendering | When |
|---|---|---|
| empty | not rendered (no empty box, no reserved space) | no write has happened yet |
| saved | plain text at 13 px, ink colour, naming the object where useful | after a successful write |
| refused | plain text in the danger colour, naming the fix | a validation failure or a provider refusal |

Field-level errors are a different model: `field → error slot` under the field, plus
`aria-invalid="true"` on the field and focus moved to the first failing field (FR-013).

### 2.4 Form → validation map

Validation lives in `src/shared/validation.ts` and is unchanged by this feature; the surface only has to
show its verdicts in the right place.

| Form | Fields | Error slots | Refusal shown |
|---|---|---|---|
| Provider | name, endpoint, model, credential, extra headers, timeout, concurrency | `#error-name`, `#error-endpoint`, `#error-model`, `#error-credential`, `#error-extraHeaders`, `#error-timeoutMs`, `#error-maxConcurrency` | under each field; first failing field focused |
| Display typography | font family, font scale | `#error-fontFamily`, `#error-fontScale` | under each field, plus the section's feedback line |
| Site preference | pattern, provider, languages, mode, style | section feedback line | names the pattern grammar |
| Glossary | term pair, languages | section feedback line | names the conflict when the term already exists |

### 2.5 Display preview model

The preview is a small page, not a swatch: a **source line** (the reader's own language) above the
**sample** element the style is applied to. Values:

| Value | Source | Applied how |
|---|---|---|
| Style | the picker's checked option | the sample's style marker attribute |
| Font family | the family field's live value, sanitised | inline family on the sample |
| Font scale | the size field's live value (50–200, steps of 5) | inline size as a percentage |
| Source line | catalog key `displaySampleSource` | plain text above the sample |

Stored values do not change until the save action is used (FR-015); a reset restores the page's own
typography and saves.

---

## 3. Cross-surface agreement

Both surfaces read the same stored keys and both subscribe to storage changes. The agreement the spec
requires (FR-027) is expressed as a table of who writes what:

| Key | Panel writes | Settings writes | Both re-read on change |
|---|---|---|---|
| `ui.displayStyle` | no (site-scoped only) | yes | yes |
| `ui.translationFontFamily‖FontScale` | no | yes | yes |
| `sites[]` (display style, mode) | yes, for this host | yes | yes |
| `providers[]` | no (read only, for the picker) | yes | yes |
| `routing.*` | no | yes | panel reflects broken rules from the agent |

---

## 4. Invariants and refusal paths (settings page)

| # | Invariant | Checkable as |
|---|---|---|
| S1 | Exactly one section is visible | count of visible `main .panel` = 1; the visible one has no `hidden` |
| S2 | Every section has a heading and one sentence before its first card | h2 + one `.lede` |
| S3 | Every write reports next to its control | the feedback element lives in the same card as the button |
| S4 | Every stored collection with entries renders one row per entry, each with its own action | rows = entries; each row has a button |
| S5 | An empty collection renders one muted row, never a blank card | the card body is non-empty |
| S6 | The credential field is disabled until the disclosure is acknowledged | `#provider-credential.disabled` |
| S7 | A stored credential is only ever shown as a mask in a placeholder | no element's value equals the secret |
| S8 | No control without an observable effect (FR-017) | the audit list in the contract names the effect of every control |
| S9 | One visual system: no second button shape, radius, card or accent | one button family, one card family, one accent token |
| S10 | Removing the temperature field changed no stored value | `style.temperature` unchanged in storage |

### 4.1 The removed control

| Item | Before | After | Stored value |
|---|---|---|---|
| Translation temperature | rendered in the Style section, written on save | not rendered, not written | untouched; remains at whatever it was, default 0 |

The transport still sends `temperature: 0` for every request, exactly as the provider-adapter contract
fixes it. This feature changes the surface, not the wire.

---

## 5. Traceability

| Requirement | Model element |
|---|---|
| FR-001, FR-002, FR-003 | 1.2 states table, 1.3 condition lines, P1 |
| FR-004 | 1.2 no-provider row, P8 |
| FR-005, FR-007 | 1.4 display position, provider select |
| FR-006 | 1.4 style option + chosen-style line, P3, P4 |
| FR-008, FR-009, FR-010 | P6, P7, P5 (session record) |
| FR-011, FR-012 | 2.1 section inventory, S1, S2, S6 |
| FR-013 | 2.3 feedback kinds, 2.4 form map |
| FR-014 | 2.2 row view models, S4, S5 |
| FR-015 | 2.5 preview model |
| FR-016 | 2.2 actions, 2.3 feedback |
| FR-017 | S8, 4.1 removed control |
| FR-018 | S9 |
| FR-019, FR-020 | contract `design-system.md` → theme + contrast |
| FR-021 | contract `design-system.md` → motion budget |
| FR-022 | contract `design-system.md` → catalogue rule |
| FR-023, FR-024 | contract `design-system.md` → layout tolerance |
| FR-025 | contract `design-system.md` → keyboard and focus |
| FR-026 | contract `design-system.md` → scope of the faces |
| FR-027 | §3 cross-surface agreement |
| FR-028 | S7 |
