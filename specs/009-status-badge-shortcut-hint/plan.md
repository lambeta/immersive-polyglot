# Implementation Plan: A Check on the Toolbar Icon When Translation Is On, and the Shortcut on the Button

**Branch**: `009-status-badge-shortcut-hint` (the working tree stays on `master`; this project registers
no `before_plan` hook) | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-status-badge-shortcut-hint/spec.md`

## Summary

The owner asked for two small things that are both about *knowing*: a tick on the toolbar icon whenever
the current page's translation is on, and the key that toggles it shown on the panel's button.

1. **The check is composed into the icon.** The page already broadcasts its status on every change; the
   background reads it and swaps that tab's icon — one flat pink disc with a dark tick, floating past a
   padded tile, generated from a second vector master — whenever translation is on, and puts the plain
   icon back on restore, navigation and update. The browser's own text badge is not used: its size belongs to the browser and
   the first review rejected it ([R13](./research.md)). No new message type and no new permission.
2. **The key label is read, never assumed.** The panel asks the browser which combination is actually
   bound to `toggle-translation` and renders that string inside the button. The manifest now suggests
   `Alt+A` instead of `Alt+T`, but the label follows the browser — `⌥A` on the owner's Mac — and
   disappears entirely when nothing is bound ([R7](./research.md)).
3. **The mark must not disappear, and the icon must not shrink.** The pink patch answers the ground
   (4.43:1) and fills the lower-right quadrant of a tile held at the plain icon's full size, with a
   white tick the owner asked for (2.16:1 — recorded, not a threshold). The size was walked down from
   12/16, the overhang dropped, and the corner filled, because the owner's last notes kept the icon's
   size ([R5](./research.md), [R13](./research.md)).

Preserved deliberately: the icon's artwork and declared sizes, the panel's layout and height budget, the
message schema, the four translation surfaces, and the existing command listener. The panel's button
gains one inline element, not a new control.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict, `noUncheckedIndexedAccess`); the manifest is a JSON
resource copied verbatim by the build. Node.js 20 LTS for tooling only.

**Primary Dependencies**: none at runtime. The browser surfaces this feature uses — the action icon
(`setIcon`, absolute paths, four sizes), the `tabs.onUpdated` event (no permission needed), and the
commands facility (`getAll`, the existing `onCommand`) — are already declared by the manifest's
`action`, `tabs` and `commands` keys, or need no declaration at all. Vite 5.4.10, Vitest 2.1.4,
jsdom 25.0.1, Playwright 1.48.2 and @types/chrome 0.0.287 are already pinned. No package is added.

**Storage**: none. The icon is derived from the page's status on every broadcast; the background keeps
only an in-memory last-written value per tab to suppress redundant writes ([R11](./research.md)). The
shortcut is stored by the browser; the product never writes it.

**Testing**: Vitest unit tests for the predicate (every state and count combination), the painter
(per-tab `setIcon` calls, dedupe, refused write, install and navigation clears) with a recording fake at
the browser boundary, the shortcut picker (default / rebound / unbound / missing / API failure), and the
three contrast ratios plus the geometry read from `design.svg` and `design-checked.svg`. jsdom tests for
the button's markup applier — label span, hidden chip, accessible name, no focusable chip. Playwright
end-to-end in real Chromium for the real `setIcon` calls per tab, the shipped rasters decoded and
measured pixel by pixel, the live `getAll` comparison and the panel's geometry. One criterion needs a
real keyboard, one a screen reader and one a human glance; those are the manual scenarios in
[quickstart.md](./quickstart.md) §2, §3 and §5 ([R9](./research.md)).

**Target Platform**: Chromium-family desktop browsers, Manifest V3, `minimum_chrome_version` 120 (the
current floor; nothing this feature uses is newer than it). macOS reports shortcuts as `⌥A`;
Windows/Linux as `Alt+A`.

**Project Type**: Single browser-extension project (service worker, content script, panel, settings page)
— no backend.

**Performance Goals**: an icon swap lands within one second of the status that caused it (the page emits
its first status before it makes any translation request); one write per actual state change, not per
progress tick; one `getAll` call per panel open; the panel's render time and height unchanged; no
rasterisation at runtime.

**Constraints**: no new install permission, host permission, storage key or runtime dependency; no network
call and no remote asset; the mark's geometry is the product's and is generated at build time, not
rasterised at runtime; the key label is the browser's string verbatim (no re-spelling, no translation);
the panel keeps its 384 px width, 44 px primary control and 600 px height budget; every new
user-visible *word* — there are none — would have to go through the catalogue.

**Scale/Scope**: 2 user stories, 27 functional requirements, 14 success criteria. Touch points: 2 new
modules (`src/background/status-badge.ts`, `src/ui/popup/shortcut-hint.ts`), modifications to the manifest,
the service worker, three popup files, the feature 006 panel contract and the README; 5 new test
files (4 unit/DOM + 1 manifest guard), 2 new e2e suites, 2 adjusted e2e suites, 2 test-support fixtures.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Gate | How this plan satisfies it | Verdict |
|---|---|---|
| I. Specification Before Code (NON-NEGOTIABLE) | `spec.md` carries 2 prioritised stories, 27 FRs, 14 SCs, 16 edge cases, explicit out-of-scope items and eight recorded clarifications. This plan records every decision with its rejected alternative and its evidence; every place where the spec met the platform and lost — the browser's key notation, the browser's badge geometry, and the owner's four design reviews — is **amended in the spec in this same change set** ([Specification amendments](#specification-amendments)), not worked around silently. Feature 006's panel contract and the icon README are amended with it. | PASS |
| II. Test-First (NON-NEGOTIABLE) | Every behaviour has a test in [Tests this feature owes](#tests-this-feature-owes), including the refused paths: no tab on the message, unbound shortcut, missing command, rejected badge write, zero-passage page, failure before any translation, and navigation. Seven assertions in two existing suites change because the button's contents change (R12); each is retargeted and none is weakened. No assertion is deleted or skipped. | PASS |
| III. Real Data, Real Behavior (NON-NEGOTIABLE) | The mark is proven in a real Chromium against the real action API (the per-tab `setIcon` calls) and against the shipped rasters, decoded and measured pixel by pixel; the hint is proven against the real `chrome.commands.getAll()` — never against a fixture of the product's own choosing. The two boundaries no harness owns (the pinning/rebinding UI, the browser's own rendering at 16 px) are named in [R9](./research.md) and verified manually with measured pixels in [quickstart §2–§5](./quickstart.md). The contrast test reads the icon's colours from the shipped `design.svg`, so a hand-copied palette cannot pass it. | PASS |
| IV. Simplicity and Least Commitment | Two small modules, no new permission, no storage, no message schema change, no listener for an event the browser already handles, no new control and no new catalogue string. The rejected alternatives are all *more* machinery: a composited icon, a dedicated message type, `tabs.onUpdated`, `aria-keyshortcuts` re-spelling, persisted per-tab state. Costs are recorded in [Complexity Tracking](#complexity-tracking). | PASS |
| V. Accessible and Localizable by Default | The key label is a real element inside a real button, so it joins the accessible name; nothing is hidden from assistive technology; the chip is not a focus stop; the check is a shape, not a colour change, and the panel's worded status remains the non-visual equivalent (FR-007, FR-023). The platform's notation is reproduced rather than translated, and no new string bypasses the catalogue. Layout tolerates 30 % label growth and 200 % zoom (FR-024, SC-011). | PASS |
| Workflow: no secrets; traceability; no unjustified dependency | The credential path is untouched; no dependency is added; every task will cite its FR and its test. The two manual checks are recorded as manual, with their boundary and their expected measurement — not as passing tests. | PASS |

**Gate result**: PASS. No principle is violated. The Complexity Tracking table records choices and their
costs, not exceptions.

### Post-design re-check (after Phase 1)

Re-read against [data-model.md](./data-model.md), the two [contracts](./contracts/) and
[quickstart.md](./quickstart.md):

1. **A new stored value.** None. The presence is derived; the badge is browser state; the binding is the
   browser's; the write-suppression cache is memory (data-model §5).
2. **A second source of state.** The page remains the only source; the background derives and paints. The
   panel still reads the same broadcast and does not gain a second path.
3. **A new user-visible string.** None. The key label is a platform string and the check carries no text
   (FR-009). The existing catalogue is unchanged, so the i18n audit stays green.
4. **A widened blast radius.** The service worker gains one small case and one install-time clear; its
   credential, provider and port paths are untouched. The panel's button keeps its id, its role, its
   disabled logic and its height.
5. **A requirement the mechanism cannot meet.** FR-013's original area bound was a product choice the
   browser's badge does not offer; it is amended to the guarantee the mechanism can keep (a corner
   overlay that leaves the icon's mark visible), and the rendered result is verified ([R10](./research.md)).
6. **A state that could contradict the story.** A page whose own script removes rendered translations
   keeps the check, because the check answers "is translation on", not "is a translation visible"; the
   spend row keeps the narrower question and the difference is deliberate ([R4](./research.md)).
7. **A hint that could lie.** The label is empty exactly when the browser reports no binding, and the
   e2e suite compares the rendered label with the live API result, so a hardcoded key cannot pass
   (FR-020, SC-007).

No new violation was found; the gate result stands.

## Risks and decisions the reviewer should see

| Risk | Treatment |
|---|---|
| **The tick may be a hairline at 16 px.** The mark is vector-drawn into a 16 px raster, so a 1-unit stroke is one device pixel and the renderer anti-aliases it. | The tick is two explicit strokes with round caps, not a glyph ([R13](./research.md)); `tests/e2e/badge-icon.spec.ts` decodes the shipped rasters and refuses a mark without both the pink fill and the dark ink. One glance (T036) covers taste; the numbers are asserted. |
| **The mark covers part of 文.** A patch filling the lower-right quadrant covers the glyph's lower-right corner. | The mark is the product's now, so the geometry is chosen and measured: the quadrant from (8, 8) to the corner, flush, the A visible above-left, the tile unchanged in size ([R13](./research.md)). The pixel test asserts it. |
| **`Alt+A` may be refused at install** (another extension or the OS already owns it), and Option+A produces "å" in text fields on a Mac. | A refusal is not an error: the command is simply unbound, the panel shows no key, and the button still works. The shipped binding is verified on the owner's platform before the feature is called done ([quickstart §3](./quickstart.md) step 1–2, step 5). |
| **The label could lie** after a rebind, or hardcode a string. | The label is read per panel open and rendered verbatim; the e2e suite compares it with the live `getAll` result; the unbound state hides it rather than leaving a placeholder (FR-020, FR-021). |
| **The browser's notation is not the spec's prose.** The spec says "Alt+A"; macOS reports `⌥A`. | The spec is amended in this plan so the requirement and the rendered result agree ([Specification amendments](#specification-amendments)). |
| **Seven existing assertions read the button's whole text,** which now includes the key. | They are retargeted at `#translate-label` — the element that owns the action words — and the new suite owns the key label. No assertion is removed or loosened (R12). |
| **A stale check left behind** after a restore, a navigation or a worker restart. | Restore broadcasts `idle` in the same tick; the browser clears on navigation (probed); a restarted worker re-derives on the next broadcast; an install/update clears globally. Each path has an e2e row (T7, T8) or a manual step. |
| **The background now answers `jobUpdated`** where it used to ignore it. | The response is `{ ok: true }` and carries no payload; the page already ignores the reply, the panel keeps listening to the same broadcast, and the existing status/panel suites are part of the gate. |
| **A tab id disappears between the message and the write.** | The write is rejected by the browser and swallowed; the handler still answers `ok` and the page's run is unaffected (contract §4). |
| **The badge's numbers could rot** if someone edits a token in `ui.css`. | The colours are declared once in `status-badge.ts` with the token they come from in a comment, and a unit test proves the ratios; changing either constant without re-measuring fails the test. |

## Project Structure

### Documentation (this feature)

```text
specs/009-status-badge-shortcut-hint/
├── plan.md              # This file
├── spec.md              # Feature specification (amended in this plan)
├── research.md          # Phase 0: twelve decisions with evidence and rejected alternatives
├── data-model.md        # Phase 1: the derived presence, the mark, the binding, the control
├── quickstart.md        # Phase 1: five scenarios, including the two manual ones
├── contracts/
│   ├── status-badge.md  # What the background paints, when, and what it refuses
│   └── shortcut-hint.md # Markup, derivation, states, accessibility, layout
└── checklists/
    └── requirements.md  # Spec quality checklist (16/16 passing)
```

### Source Code (repository root)

```text
src/
├── manifest.json                 # MODIFIED: suggested_key Alt+T → Alt+A
├── background/
│   ├── service-worker.ts         # MODIFIED: jobUpdated → icon swap, tabs.onUpdated clear, install clear
│   └── status-badge.ts           # NEW: on/off predicate, mark constants, per-tab setIcon painter
├── icons/
│   ├── design-checked.svg        # NEW: the master with the translation-on badge
│   └── icon-*-check.png          # NEW: four rasters generated by make:icons (plain set untouched)
├── ui/popup/
│   ├── popup.html                # MODIFIED: #translate-label span + #translate-key kbd inside #translate
│   ├── popup.ts                  # MODIFIED: write the label span, apply the key hint at boot
│   ├── popup.css                 # MODIFIED: .btn__key chip
│   └── shortcut-hint.ts          # NEW: pure picker + DOM applier
└── _locales/en/messages.json     # UNCHANGED: the key label is a platform string, the check has no text

tests/
├── unit/
│   ├── status-badge.test.ts      # NEW: predicate table, painter setIcon calls/dedupe/swallow
│   ├── badge-contrast.test.ts    # NEW: the ratios and geometry, read from both vector masters
│   └── shortcut-hint.test.ts     # NEW: default/rebound/unbound/missing/API-failure
├── dom/
│   └── shortcut-hint-render.test.ts  # NEW: label span, hidden chip, accessible name, no focus stop
├── e2e/
│   ├── status-badge.spec.ts      # NEW: real setIcon calls per tab, lifecycle, refusals, timing
│   ├── badge-icon.spec.ts        # NEW: the shipped checked rasters decoded and measured in Chromium
│   ├── shortcut-hint.spec.ts     # NEW: live getAll comparison, both states, a11y name, geometry
│   ├── panel-control.spec.ts     # MODIFIED: read #translate-label (6 assertions)
│   └── smoke.spec.ts             # MODIFIED: read #translate-label (1 assertion)
└── support/                       # EXTENDED: badge-action-fake.ts, command-fixtures.ts

README.md                          # MODIFIED: the check and the key in "What it is"
src/icons/README.md                # MODIFIED: the checked master, its colours and geometry
scripts/make-icons.mjs             # MODIFIED: both masters → eight rasters
specs/006-popup-settings-redesign/contracts/page-control-surface.md  # MODIFIED: §3 accessible name
```

**Structure Decision**: The existing single-project layout is kept, and each new module sits where its
owner is. The badge belongs to the background, because that is the only context with the action API, and
its pure parts (the predicate, the mark) are split from the wiring so a unit test can read them without a
browser. The hint belongs to the panel, but its selection rule is a pure function and its DOM application
is a tiny function, because `popup.ts` boots against `chrome.*` on import and cannot be exercised in
jsdom — the same reason `style-picker.ts` and `spend-row.ts` exist as separate modules. No new
directory, no framework-shaped boundary (Constitution IV).

## Complexity Tracking

No principle is violated. Seven choices were weighed and the more elaborate one rejected, and two costs
are accepted with their reasons:

| Considered | Why rejected | Where recorded |
|---|---|---|
| Compositing the check **at runtime** in the worker with OffscreenCanvas | Works (probed), but rasterises on every worker start, fetches the plain rasters each time, and keeps the geometry outside the vector master and `make:icons` | [R13](./research.md) |
| Hiding a state marker in the browser badge (zero-width text, transparent plate) so tests can read it | A test-only channel in production, and the browser still paints its own plate | [R13](./research.md) |
| A dedicated `translationState` message | A second path for a fact the page already broadcasts on every change | [R2](./research.md) |
| A `tabs.onUpdated` handler to clear on navigation | The browser already clears (probed); the handler would duplicate a platform guarantee and invite the `tabs` permission question | [R3](./research.md) |
| `aria-keyshortcuts` beside the visible chip | Its grammar cannot express `⌥A` without re-spelling the browser's string, and adding both risks a double announcement | [R8](./research.md) |
| Persisting the per-tab presence in `chrome.storage.session` | The page is the authority and re-announces on its next broadcast; storage would add a lifecycle for no observable gain | [R11](./research.md) |
| CSS-generated text (`::after { content: attr(...) }`) for the key | Generated text is not reliably exposed and not selectable; it would also silence the key for screen readers | [R8](./research.md) |
| Leaving the mark's geometry to the browser (no numeric bound) | Superseded by R13: the product composes the mark, so a bound is a property it can keep and test | [R13](./research.md) |
| **Cost accepted**: a second copy of two palette colours in `status-badge.ts` | Browser chrome cannot read the page's CSS variables; the values are declared once, commented with their token, and the contrast test fails if either drifts | [R5](./research.md) |
| **Cost accepted**: `jobUpdated` now has a second consumer | The message keeps one shape and one producer; the background's case is additive and the existing consumers are untouched | [R2](./research.md) |

## Specification amendments

Constitution I requires the specification to be updated when implementation reality contradicts it. Two
such contradictions were found during this plan, plus one interpretation recorded alongside them; the
edits are already in [spec.md](./spec.md):

| # | Where | Before | After | Why |
|---|---|---|---|---|
| A1 | US2 Independent Test and acceptance scenario 1 | "shows Alt+A", "reads … (Alt+A on a fresh profile)" | "the combination the browser reports … the binding this specification calls Alt+A, rendered in the platform's notation (⌥A on macOS)" | Chrome reports `⌥T` for the declared `Alt+T` (probe, [R7](./research.md)); a literal "Alt+A" would be wrong on the owner's Mac and would contradict FR-027. |
| A2 | FR-013 | "cover no more than the lower-right half of the icon's area" | "leave the icon's own A⇄文 mark visible above and to its left … the plate's exact geometry belongs to the browser" | Chromium paints an 11 px plate on a 16 px icon, which is 47 % of the area — inside the old bound only by luck, and not a property the product controls ([R10](./research.md)). |
| A3 | SC-013 | the same area bound in the criterion | the same rendered-result criterion as A2 | an acceptance criterion must test what the product can be held to. |
| A4 | Recorded interpretations | — | one bullet: the browser's platform notation and browser-owned plate geometry are judged as rendered | records the fact both amendments rest on, in the owner's own vocabulary. |
| A5 | Clarifications, FR-010–FR-013, SC-003, SC-013, Assumptions | a browser-painted plate at the icon's lower-right, red/white | the product composes one flat pink disc with a dark tick, floating past a padded tile | four reviews of 2026-11-16: the browser badge could not be kept small or tucked in; the colour changed three times; the mark had to float past the icon and roughly double ([R13](./research.md)) |
| A6 | Clarifications | white tick on red | dark tick on pink | white on pink measures 2.16:1; the dark ink is the only legible reading of "pink with a check" |
| A7 | Clarifications, FR-011, FR-012, FR-013, FR-016, SC-003, SC-013 | a ringed badge inset inside the tile, 9.5/16 | one flat pink patch filling the lower-right quadrant of a full-size tile, with a white tick | the owner's last five notes: "boarder 和内圈同色", "浮在右下角并超出ICON", "太大了，8px就好了，里面的对钩是白色即可", "原来的icon不应该随之变小，保持原有尺寸", then "那就直接填满右下角" ([R13](./research.md)) |

A2–A4 record the browser-badge era; A5–A6 supersede them when the mark became composed (owner reviews,
2026-11-16). The current requirement text is FR-010–FR-013 and SC-003/SC-013 as they stand in
[spec.md](./spec.md) — the table is the audit trail of how they got there.

Feature 006's `page-control-surface.md` also changes (§3: the primary action's accessible name is its
action label **plus** the bound key label). That is a downstream contract, not a requirement change, and
it is a Phase 2 task (T17).

## Phases

- **Phase 0**: [research.md](./research.md) — twelve decisions (R1–R12), each with the evidence that
  settled it, the alternatives refused, and the requirement it serves. No NEEDS CLARIFICATION remains.
  R5 carries the measured contrast table; R7 and R10 produced the spec amendments above.
- **Phase 1**: [data-model.md](./data-model.md), two [contracts](./contracts/), [quickstart.md](./quickstart.md)
  — the derived presence and its lifecycle, the mark's invariants, the binding's states, the control's
  markup, and the runnable way to see each criterion.
- **Phase 2** (`/speckit-tasks`): dependency-ordered tasks, each citing its FR and its test, with the
  manual checks (T19–T21) carrying their measurement and their boundary.

## Tests this feature owes

Every row names a behaviour the spec requires that no test pins today. Rows marked **changed** rewrite an
existing expectation because the specification changes that behaviour; none deletes an assertion.

| # | Behaviour | Level | Proves |
|---|---|---|---|
| T1 | The predicate is on for `segmenting`/`translating` at any count, on for `completed`/`failed`/`cancelled` with `translated > 0`, and off for `idle`, for `completed` with zero, and for `failed`/`cancelled` with zero | unit | FR-001, FR-002, FR-006 |
| T2 | The painter writes text, background and text colour for a tab, clears with one call, and writes nothing when the derived value has not changed | unit | FR-001, FR-008, SC-005 |
| T3 | A rejected badge write (the tab is gone) is swallowed and the handler still answers `ok`; a message with no tab paints nothing | unit | edge case, contract §4 |
| T4 | Mark-on-ground ≥ 3 : 1 and the white tick recorded at its measured 2.16 : 1, computed from the shipped constants and the colours and coordinates read out of `design.svg` and `design-checked.svg`; the patch is 8/16, one flat colour, filling the corner of a full-size tile | unit | FR-010, FR-011, FR-012, FR-013, SC-003 |
| T5 | The picker returns the exact string for `Alt+A`/`⌥A`, the new string after a rebind, `null` for an empty binding, `null` for a missing command, `null` when the list is empty, and ignores `_execute_action` | unit | FR-018, FR-020, FR-021, FR-027, SC-007 |
| T6 | The button carries `#translate-label` and a hidden `#translate-key`; binding a key shows the chip, empties the label never, keeps one focus stop, and puts the key into the accessible name; unbinding hides the chip and leaves no attribute behind | dom | FR-019, FR-022, FR-023, FR-024 |
| T7 | End to end: the real `setIcon` calls per tab — untouched page makes none; starting a run asks for the checked rasters before the first translation lands; the completed page keeps them; restoring and navigating ask for the plain set within one second; two tabs stay independent; provider-less and zero-passage runs leave no check; a partial failure keeps it | e2e | FR-001, FR-002, FR-004, FR-006, FR-008, SC-004, SC-005, SC-006, SC-012 |
| T8 | Two tabs keep their own badge, and a navigation clears the translated tab's badge (the browser's behaviour, pinned) | e2e | FR-004, SC-006, edge case |
| T9 | No provider, a rejected credential, and a zero-passage page each end with no badge, while the panel still says why | e2e | FR-002, FR-007, SC-004 |
| T10 | A partial failure that left translations on the page keeps the badge while the panel reports the failure | e2e | FR-006, SC-004 |
| T11 | The badge's state follows the run at 20 sampled moments, each within one second of the status that caused it, and never runs ahead of the run | e2e | FR-003, SC-005 |
| T12 | End to end: the panel's key label equals the live `chrome.commands.getAll()` string for `toggle-translation`; it is present in both button states; the button's accessible name contains both the action and the key | e2e | FR-018, FR-019, FR-020, FR-023, SC-007 |
| T13 | The panel with the chip is still 384 px wide with no sideways scroll, its primary control is still 44 px tall, a 30 % longer action label neither clips nor wraps and still does not clip at 200 % zoom, and the chip's text passes the theme contrast check in light and dark | e2e + measurement | FR-024, SC-011 |
| T13a | The shipped 16 px and 32 px checked rasters, decoded in Chromium: the pink patch filling the lower-right quadrant flush with the edges, the tile the same size as the plain icon's, the exact pink present and white ink on it | e2e | FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, SC-002, SC-003, SC-013 |
| T14 | **changed**: the panel-control and smoke suites read `#translate-label` for the action words (7 assertions across two files) and keep every enabled/disabled and state expectation | e2e | FR-019, R12 |
| T15 | The manifest still declares no permission beyond `storage` and hosts; the only manifest change is the command's suggested key; no outbound request or storage write is added by the feature | unit + review | FR-025, spec Assumptions, Constitution IV |
| T16 | The message schema is unchanged: `jobUpdated` still parses, still carries the same payload, and no new type exists | unit + review | contract §1 |
| T17 | Feature 006's panel contract and the README say what the product now does, in the same change set | review | Constitution I |
| T18 | The full existing suite (`npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run verify:styles`) passes with nothing skipped, weakened or excluded | all | Constitution II |
| T19 | One glance at the toolbar: the pink patch and its check fill the icon's lower-right corner, the icon looks the same size as before, the A is still visible. The pixels themselves are measured by T13a, so this is a judgement of looks, not of numbers | manual | SC-001, SC-002, SC-013 |
| T20 | Rebinding in `chrome://extensions/shortcuts` changes the panel's label on the next open; clearing it removes the label; pressing the bound combination with the panel closed translates and restores exactly as the button does | manual | FR-020, FR-021, FR-025, SC-008, SC-009 |
| T21 | A screen reader announces the action and the key on focus; the panel's `role="status"` line announces the state change, not the badge | manual | FR-023, SC-010 |
| T22 | Five readers who have never seen the feature identify which of two tabs is translated from the toolbar alone, in at least 19 of 20 paired looks | manual | SC-001 |

## Out of scope, preserved

No in-page control, no new icon artwork, no other badge state, no progress or count, no "this site is
configured" marker, no shortcut for any other command, no hint on the tooltip or the settings page, no
stored or synced shortcut, no badge click target, no other browsers, no history. The spec's Out of Scope
list is the authority; this plan adds nothing to it.

## Done when

- `npm run typecheck`, `npm test`, `npm run test:e2e` and `npm run verify:styles` are green with T1–T18.
- The two manual scenarios (T19, T20) and the accessibility one (T21) have been performed on a real
  toolbar, a real keyboard and a real screen reader, and their measurements are recorded.
- The spec's amendments A1–A7 are committed with the code; feature 006's contract, the icon README and
  the README are updated.
- Nobody has to open the panel to know whether the page is translated, and nobody is shown a key that
  does not work.