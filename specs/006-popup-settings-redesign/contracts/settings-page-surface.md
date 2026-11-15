# Contract: Settings Page Surface

**Status**: Phase 1 design contract for `src/ui/options/options.html`, `options.css` and `options.ts`.
**Depends on**: `design-system.md`. **Preserves**: every id, `aria-expanded`/`aria-controls` pair and
`hidden` contract the existing end-to-end suite binds to, so no existing test is rewritten by this
feature.

---

## 1. Shell

| Property | Desktop (≥1024 px) | Below 1024 px |
|---|---|---|
| Rail | 264 px, `position: sticky`, full viewport height, `--p-surface` ground, 1 px right hairline | becomes a static header block; section buttons wrap onto rows |
| Content column | one column, `max-width: 880 px`, centred in the remaining width, 40 px top / 32 px sides | full width, 24 px / 16 px |
| Sections | one `main > section.panel` visible at a time | same |
| Section gap | 20 px between cards | same |

Only the rail is sticky. Nothing else on the page is fixed or sticky; a section never becomes a modal,
a drawer or a new page.

## 2. Rail

- Brand block: the product mark (30 px), the h1 (`optionsTitle`, 14.5 px), the version line (mono, from
  `chrome.runtime.getManifest().version` through the catalogue key `sideVersion`).
- Section buttons: eight `<button aria-controls="panel-…" aria-expanded="true|false">` in the existing
  order — Providers, Routing, Sites, Glossary, Display, Style, Privacy and data, Diagnostics. The active
  one is a raised card (card ground, 1 px edge, ink label); the others are muted labels on the rail.
- Rail foot: one muted sentence of reassurance (`sideNote`: no account, no analytics, everything stays in
  this profile). No links, no badges, no version footer duplication.
- Keyboard: buttons are a plain sequence of buttons in reading order; Tab reaches them first.

## 3. Section anatomy

Every section is exactly: `h2` (the section name) → one `.lede` sentence saying what the section governs →
one or more cards. No paragraph before the h2; no second h2; no section without a lede.

| Section | Cards (in order) | Primary action per card |
|---|---|---|
| Providers | disclosure callout · provider form · saved providers | Save provider |
| Routing | default provider · add-a-rule · rules in force | Add rule |
| Sites | add-a-site-preference · saved preferences · default for every page | Save site preference / Save |
| Glossary | add-a-term · terms | Add glossary entry |
| Display | style picker with sample · translation text · save/reset row | Save display style |
| Style | instruction field | Save style |
| Privacy and data | policy + erase · volume caps · per-site caps | Save caps / Save |
| Diagnostics | stored keys | Refresh |

Exactly one filled (primary) button per card foot. Row actions are quiet buttons. Destructive actions use
the danger style and are confirmed before they run.

## 4. Feedback contract

Every write has one status element in its own card, `id="…-feedback"`, `role="status"`,
`aria-live="polite"`. It is empty until something happens, renders as plain text, and names the object or
the failure. It never reserves empty space, and it never appears in a different card from the button that
caused it.

Failure of a *field* is not a feedback line: it is `#error-<field>` under the field, plus
`aria-invalid="true"` and focus on the first failing field.

## 5. Form contract

- Every field: visible label above, control below, optional hint (13 px muted) and an error slot under it.
- The provider form keeps the disclosure gate: `#provider-credential` is disabled until `#acknowledge` is
  checked, and is cleared when the acknowledgement is withdrawn.
- A stored credential is only ever shown as a mask in the field's placeholder; it is never written into a
  value.
- The preset control fills name, endpoint and model only; it never fills a credential.
- Field groups use one to four columns (`.grid-2 / .grid-3 / .grid-4`), collapsing to one column on a
  narrow viewport; no field is narrower than its label can wrap at 30% longer.

## 6. List row contract

Each stored collection renders `li` rows with: a title block (name, plus state pills), a detail block
(muted; mono where the value is machine-written), and an action block with its own buttons. Empty
collections render one muted row saying what to add. A rule pointing at a missing provider renders the
broken state in words and keeps its delete action.

## 7. Display preview contract

The Display section contains a style picker whose options are the fifteen catalogue entries, and a sample
presented as a small page: a source line in the reader's language (`displaySampleSource`) above the
translated sample (`displayStyleSample`). The sample element (`.ipt-style-sample`) carries the selected
style marker, the live font family and the live size. Nothing is stored until the save action is used; the
reset action restores the page's own typography and saves.

The picker's options are a real radio group in a `.style-picker__grid` wrapper: two to three columns on
the settings page, every option showing its preview mark and its name. Selection is visible as ground +
edge + glyph, and it is also announced by the radio's checked state.

## 8. Removed control

The Style section no longer renders a temperature field, and the save action no longer writes
`style.temperature`. The stored value is untouched. The instruction field keeps its label, gains a hint
that it is sent with every request, and an example as its placeholder (a placeholder never replaces the
label).

## 9. Invariants a reviewer checks on screen

1. Exactly one section is visible; every section begins with its h2 and one lede sentence.
2. Every save reports in its own card; no feedback line is empty-but-reserved.
3. Every stored collection with entries has one row per entry and one action per row; an empty collection
   has one muted row.
4. The disclosure gates the credential field; a stored credential appears only as a mask.
5. The sample follows style, family and size before saving, and the stored values do not change until
   save.
6. From 320 px up there is no sideways scrolling; below 1024 px the rail is a wrapping row and the content
   is one column.
7. No control on the page lacks an observable effect.
