---
description: "Task list for feature 009 — the toolbar check and the shortcut hint"
---

# Tasks: A Check on the Toolbar Icon When Translation Is On, and the Shortcut on the Button

**Input**: Design documents from `/specs/009-status-badge-shortcut-hint/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED for every behaviour. The project constitution makes test-first non-negotiable
(Principle II), so each behaviour below starts as a failing test and no task is done while its test is
red. Three tasks are **MANUAL** (T025–T027): the boundary is the browser's own toolbar, its shortcut
settings page and a screen reader, none of which any harness owns; each carries the measurement that
makes it decidable, and R9 in [research.md](./research.md) records why.

**Organization**: Tasks are grouped by user story so each story is independently implementable and
testable. `Proves` cites [plan.md's test table](./plan.md#tests-this-feature-owes) (T1–T22); `FR-` and
`SC-` cite [spec.md](./spec.md). Every requirement is cited by at least one task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different file, no dependency on an incomplete task)
- **[Story]**: which user story the task belongs to (US1, US2)
- Every task names its exact file path

## Path Conventions

Single project: `src/` and `tests/` at the repository root; specs under
`specs/009-status-badge-shortcut-hint/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the two test boundaries the stories need — a recording action API for the painter, and the
five `getAll()` shapes for the hint — plus a recorded green baseline.

- [X] T001 [P] Add `tests/support/badge-action-fake.ts`: a recording fake of the action API with
  `setBadgeText`, `setBadgeBackgroundColor` and `setBadgeTextColor` (each returns a Promise and records
  `{ tabId, value }` in order), a `rejectNext` switch that makes the next write reject with "No tab with
  id", and a `calls` array — so a foreground unit test can assert exactly what the painter asked the
  browser to draw without a browser (Proves T2, T3; FR-001, FR-008)
- [X] T002 [P] Add `tests/support/command-fixtures.ts` exporting the five `chrome.commands.getAll()` shapes:
  macOS default `[{ name: "_execute_action", shortcut: "" }, { name: "toggle-translation", shortcut: "⌥A" }]`,
  Windows/Linux default `Alt+A`, rebound `Ctrl+Shift+Y`, cleared `""`, and a list without
  `toggle-translation` — shared by the unit and DOM suites (Proves T5; FR-018, FR-020, FR-021, FR-027)
- [X] T003 Record the green baseline from the repository root — `npm run typecheck` and `npm test`
  on the untouched tree, no file changes — so the first red any later task sees is its own
  (Constitution II)

---

## Phase 2: Foundational (Blocking Prerequisite for US1)

**Purpose**: the mark itself — its predicate, its colours and the writer. US2 does **not** depend on this
phase and may start once Setup is complete.

> **Superseded by Phase 6 (2026-11-16).** T004–T007 first shipped the browser's text badge and were then
> replaced, after the owner's review, by a composed icon (T029–T035). Their text is kept as the record of
> what was built first; the code now implements the icon writer.

**⚠️ CRITICAL for US1**: no US1 implementation can begin until this phase is green.

- [X] T004 [P] Write failing unit tests for the badge predicate and painter in `tests/unit/status-badge.test.ts`:
  the predicate exactly
  `on = state !== "idle" && (translated > 0 || state === "segmenting" || state === "translating")`
  over every state (`idle`, `segmenting`, `translating`, `completed`, `cancelled`, `failed`) crossed with
  `translated = 0` and `> 0`; the three writes with text `✔`, background `#63CBD3` and text colour
  `#08252A`; a clear as one `setBadgeText({ tabId, text: "" })`; no write when the derived value has not
  changed; and a rejected write that is swallowed (Proves T1, T2, T3; FR-001, FR-002, FR-006, FR-008)
- [X] T005 [P] Write failing contrast tests in `tests/unit/badge-contrast.test.ts`: read the icon's ground
  and lettering out of `src/icons/design.svg`, apply `contrastRatio`/`parseColor` from
  `src/shared/contrast.ts`, and assert plate-on-ground **≥ 3**, tick-on-plate **≥ 4.5**, plate **≠** ground,
  plate **≠** lettering, and that the constants asserted are the ones the painter uses (Proves T4;
  FR-010, FR-011, FR-012, SC-003)
- [X] T006 Implement `src/background/status-badge.ts`: `BADGE_MARK = { text: "✔", background: "#63CBD3",
  textColor: "#08252A" }` commented with the token each value comes from (`--p-accent` and
  `--p-action-ink`, dark theme); `badgeOn(status)` implementing T004's predicate verbatim; and
  `BadgePainter` taking the action API as an injected dependency (default `chrome.action`) with a per-tab
  last-written value (a write suppressor only), `apply(tabId, on)`, `clear(tabId)` and `clearAll()`; a
  rejected write is caught and logged at `info` with the tab id, never rethrown (FR-001–FR-003, FR-006,
  FR-008, FR-010, FR-011; [data-model §2](./data-model.md), [contract §2–§4](./contracts/status-badge.md))
- [X] T007 Run T004 and T005 green in `tests/unit/status-badge.test.ts` and
  `tests/unit/badge-contrast.test.ts`; confirm the measured ratios are the ones in
  [research R5](./research.md) (5.03 : 1 and 8.42 : 1) (SC-003)

**Checkpoint**: the mark exists and is proven; nothing paints it yet.

---

## Phase 3: User Story 1 - The toolbar icon says, at a glance, that this page's translation is on (Priority: P1) 🎯 MVP

**Goal**: a translated page wears a check at the icon's lower-right — as soon as the run starts, while it
runs, and until the reader restores the page — per tab, without the panel ever being opened.

**Independent Test**: translate a fixture page against a slow stub and watch the real `setIcon` calls
from the background context: the checked rasters are requested before the first translation lands, the
completed page keeps them, and a restore asks for the plain set within a second. A second, untouched tab
is never touched. Nothing in the test opens the panel.

> **Superseded by Phase 6 (2026-11-16).** T008–T011 first observed the browser's badge text; the same
> behaviour is now observed through the real `setIcon` calls (T034). The old assertion text is kept as
> the record of what was built first.

### Tests for User Story 1 ⚠️ Write these FIRST and watch them fail

- [X] T008 [P] [US1] Write failing end-to-end tests in `tests/e2e/status-badge.spec.ts`: an untouched page
  reads `getBadgeText() === ""`; with `latencyMs` slow enough to hold the first batch, pressing
  `translatePage` makes the badge read exactly `✔` with
  `getBadgeBackgroundColor() === [99, 203, 211, 255]` and `getBadgeTextColor() === [8, 37, 42, 255]`
  **before** the first `[data-ipt="target"]` exists; the text is exactly the tick `✔` — not a word, a
  letter or a count; the completed page keeps it; `toggleTranslation`
  empties it within 1 s (polled, not slept); a second untouched tab stays empty; and navigating the
  translated tab empties it — with no panel opened anywhere in the test (Proves T7, T8, T11; FR-001,
  FR-003, FR-004, FR-005, FR-008, FR-009, SC-005, SC-006, SC-012)
- [X] T009 [US1] Write failing end-to-end tests in `tests/e2e/status-badge.spec.ts`: with no provider
  configured the badge stays `""` and the panel's failure line still names the reason; a zero-passage
  fixture page ends with an empty badge; and a stub that delivers the first batch and fails a later one
  leaves the badge `✔` while the panel reports the failure in words (Proves T9, T10; FR-002, FR-006,
  FR-007, SC-004)

### Implementation for User Story 1

- [X] T010 [US1] Wire the page's status into the paint in `src/background/service-worker.ts`: pass
  `sender` into `handleCommand`, add `case "jobUpdated"` that ignores a message whose `sender.tab?.id` is
  not a number, answers `{ ok: true }` **before** the paint resolves, and calls
  `painter.apply(tabId, badgeOn(status))`; call `clearAll()` from `chrome.runtime.onInstalled` so an
  update leaves no stale check; add **no** `tabs.onUpdated` listener and no new message type, and leave
  `tests/unit/messages.test.ts` untouched — its existing `jobUpdated` acceptance test is the guard that
  the wire did not change ([contract §1–§4](./contracts/status-badge.md); Proves T16; FR-001, FR-004,
  FR-005, FR-008; R2, R3)
- [X] T011 [US1] Run T008 and T009 green in `tests/e2e/status-badge.spec.ts`; record the measured interval
  from `translatePage` to the badge reading `✔`, and from `toggleTranslation` to `""`, in a comment beside
  the assertions; confirm the navigation case passes with no navigation handler (SC-005; R3, R4)

**Checkpoint**: US1 alone is the MVP — the owner can tell, from the toolbar, that translation is on.

---

## Phase 4: User Story 2 - The button names the key that actually works (Priority: P2)

**Goal**: the panel's primary action carries the combination the browser has actually bound — verbatim,
in the browser's notation — and shows nothing when there is no binding.

**Independent Test**: open the panel; the chip equals the live `chrome.commands.getAll()` string for
`toggle-translation` (`⌥A` on macOS). It is still there when the button reads "Show original". With no
binding it is absent, and the button still works. The panel is still 384 px and its action 44 px.

### Tests for User Story 2 ⚠️ Write these FIRST and watch them fail

- [X] T012 [P] [US2] Write failing unit tests for the picker in `tests/unit/shortcut-hint.test.ts`, over
  `tests/support/command-fixtures.ts`: `⌥A` and `Alt+A` returned verbatim, `Ctrl+Shift+Y` after a rebind,
  `null` for `""`, `null` when the command is missing, `null` for an empty list, `_execute_action`
  ignored, surrounding whitespace trimmed (Proves T5; FR-018, FR-020, FR-021, FR-027, SC-007)
- [X] T013 [P] [US2] Write failing DOM tests for the applier in `tests/dom/shortcut-hint-render.test.ts`:
  a bound key makes `#translate-key` visible with the exact string; no binding leaves it `hidden` with no
  text and no leftover attribute; `#translate-label` keeps the action words in both states; the button is
  still one focus stop; the `<kbd>` is never focusable; no `aria-keyshortcuts` is written (Proves T6;
  FR-019, FR-022, FR-023)
- [X] T014 [P] [US2] Write failing end-to-end tests in `tests/e2e/shortcut-hint.spec.ts`: the rendered chip
  equals the **live** `getAll()` value read in the same browser (never a literal, so a hardcoded key
  cannot pass); the chip is present with "Translate this page" and with "Show original"; the button's
  accessible name contains both; `chrome.action.getTitle()` is still "Immersive Polyglot — translate this
  page"; the panel is 384 px wide, the primary control 44 px tall, nothing overflows at 200 % zoom, and
  the chip's text passes the theme contrast check in light and dark (Proves T12, T13; FR-018, FR-019,
  FR-023, FR-024, FR-026, SC-007, SC-011)

### Implementation for User Story 2

- [X] T015 [P] [US2] Change `src/manifest.json`'s
  `commands["toggle-translation"].suggested_key.default` from `Alt+T` to `Alt+A`; nothing else in the
  manifest changes — no permission, no host, no second command (FR-017; T15)
- [X] T016 [P] [US2] Implement `src/ui/popup/shortcut-hint.ts`: `shortcutFor(commands,
  name = "toggle-translation")` — find **by name** (never by index), trim, return the string verbatim or
  `null` — and `applyShortcutHint(button, shortcut)`, which finds the `.btn__key` inside the button,
  writes its text and toggles `hidden`, and writes no `aria-keyshortcuts` (FR-018, FR-020, FR-021,
  FR-022, FR-027; [contract §2–§4](./contracts/shortcut-hint.md))
- [X] T017 [P] [US2] Put `<span id="translate-label">Translate this page</span>` and
  `<kbd id="translate-key" class="btn__key" hidden></kbd>` inside `#translate` in
  `src/ui/popup/popup.html`; keep the button's id, classes, `type`, and move `data-i18n="popupTranslate"`
  onto the label span (FR-019, FR-022)
- [X] T018 [US2] In `src/ui/popup/popup.ts`, write the action words to `#translate-label` — never to the
  button's `textContent` — in `render()`, and at boot call `chrome.commands.getAll()` once, applying
  `shortcutFor` through `applyShortcutHint`; a rejected call applies `null`; nothing is cached across
  panel opens (FR-018, FR-020, FR-021, FR-023)
- [X] T019 [P] [US2] Add `.btn__key` to `src/ui/popup/popup.css`: 11 px JetBrains Mono, a 1 px hairline
  border in `currentColor`, 5 px radius, inheriting the button's colour, vertically centred without
  changing the 44 px control height, with no hover state and no animation (FR-022, FR-024)
- [X] T020 [US2] Retarget the seven existing assertions that read `#translate`'s whole text at
  `#translate-label` — six in `tests/e2e/panel-control.spec.ts`, one in `tests/e2e/smoke.spec.ts` —
  keeping every enabled/disabled and state expectation; remove or loosen nothing (Proves T14; R12, FR-019)
- [X] T021 [US2] Run T012–T014 green in `tests/unit/shortcut-hint.test.ts`,
  `tests/dom/shortcut-hint-render.test.ts` and `tests/e2e/shortcut-hint.spec.ts`, then the adjusted
  `tests/e2e/panel-control.spec.ts` and `tests/e2e/smoke.spec.ts`; record the live label this macOS
  reports (`⌥A`) and the panel's measured width and primary-control height beside the assertions
  (SC-007, SC-011)

**Checkpoint**: US1 and US2 both hold independently; each can ship alone.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T022 [P] Add `tests/unit/manifest.test.ts` as the guard: `permissions` is exactly `["storage"]`,
  `host_permissions` is exactly `["<all_urls>"]`, `commands["toggle-translation"].suggested_key.default`
  is `Alt+A`, there is no second declared command, the manifest declares no new key for this feature, and
  the `icons`/`action.default_icon` maps are unchanged — pointed at the same four sizes and files, with
  `tests/unit/icons.test.ts` untouched (Proves T15; FR-016, FR-017; spec Assumptions — "no new install
  permission")
- [X] T023 [P] Amend `specs/006-popup-settings-redesign/contracts/page-control-surface.md` §3: the primary
  action's accessible name is its action label **plus** the bound key label; it keeps one focus stop and
  its 44 px height; the chip is part of the control, not a second control (Proves T17; Constitution I)
- [X] T024 [P] Add one bullet each to `README.md`'s "What it is" — the toolbar check for a page whose
  translation is on, and the panel showing the key that toggles it — in the file's existing voice
  (Proves T17; Constitution I)
- [X] T025 **MANUAL** The owner's review of 2026-11-16 performed this check and found the mark too
  large and overhanging the icon, which is why the mechanism changed (T029–T035). The measurements this
  task asked for are now automated by T033; one glance remains as T036 (Proves T19; SC-002, SC-003,
  SC-013)
- [ ] T026 **MANUAL** Perform [quickstart §3](./quickstart.md): the chip matches
  `chrome://extensions/shortcuts`; rebinding there changes the chip on the next open with no restart;
  clearing it removes the chip entirely; pressing the bound combination with the panel closed translates
  and restores exactly as the button does, and produces no check on a page the product cannot translate;
  the key appears on no other surface (Proves T20; FR-020, FR-021, FR-025, FR-026, SC-007, SC-008,
  SC-009, SC-014)
- [ ] T027 **MANUAL** Perform [quickstart §5](./quickstart.md): with VoiceOver, the focused primary action
  announces the action **and** the key; the state change is announced by the panel's `role="status"`
  line, not by the badge; and the five-reader glance protocol of SC-001 identifies the translated tab from
  the toolbar alone in at least 19 of 20 paired looks (Proves T21, T22; FR-023, SC-001, SC-010)
- [X] T028 Run [quickstart §1 and §4](./quickstart.md) end to end — `npm run typecheck`, `npm test`,
  `npm run test:e2e`, `npm run verify:styles`, then the refusal table of §4 — with nothing skipped,
  weakened or excluded, and record any discrepancy between the rendered result and the plan (Proves T18;
  Constitution II). _2026-11-16: typecheck clean; 539 unit/DOM; 136 e2e; styles PASS. The §4 rows that
  need eyes (unpinned icon, light/dark toolbar) belong to the manual capture T025._

---

## Phase 6: Owner feedback on the mark (2026-11-16)

**Purpose**: the two reviews of the shipped check — "启用的图标太大了，超出了ICON … 改成配红色，中间的对钩白色"
and "红色不太行，换成黄色；整体size略微超出右下角的范围会更加醒目" — replaced the browser's text badge with a
composed icon and then tuned it. The spec, research, contract and data model were amended in the same
change set (Constitution I).

- [X] T029 [P] Record the first review in [spec.md](./spec.md) (clarification) and [research R13](./research.md); decide that the product composes the mark, because the browser's badge geometry is not the product's to choose (FR-013)
- [X] T030 [P] Add `src/icons/design-checked.svg` and extend `scripts/make-icons.mjs` to render both masters into eight rasters; regenerate with `npm run make:icons` (FR-009, FR-013, FR-016)
- [X] T031 Rewrite `src/background/status-badge.ts` to swap the per-tab icon with `chrome.action.setIcon` (absolute URLs, four sizes, write-suppressing cache) and add the `tabs.onUpdated` clear in `src/background/service-worker.ts` (FR-001–FR-008; R13)
- [X] T032 [P] Rewrite `tests/unit/status-badge.test.ts` and `tests/unit/badge-contrast.test.ts` for the composed mark: per-tab `setIcon` calls, dedupe, refusal, install and navigation clears, the three ratios and the geometry read from both masters (Proves T2–T4; FR-009–FR-014)
- [X] T033 Add `tests/e2e/badge-icon.spec.ts`: decode the shipped 16 px and 32 px checked rasters in Chromium and assert containment, width, exact colours and that the plain icon carries no pink (Proves T13a; SC-002, SC-003, SC-013)
- [X] T034 Rewrite `tests/e2e/status-badge.spec.ts` to observe the real `setIcon` calls per tab through a spy installed in the real worker: start, restore, navigation, two tabs, provider-less failure, zero-passage page, partial failure (Proves T7, T8; FR-001–FR-008, SC-004–SC-006, SC-012)
- [X] T035 Apply the reviews after the first: the mark becomes a composed pink badge, then floats on a padded tile; update FR-010–FR-013, SC-003, SC-013 and the Assumptions, re-measure the ratios (4.43 / 5.16 / 9.98) and re-run T032–T034 (FR-010–FR-013, SC-003, SC-013; R13)
- [X] T037 Apply the last five reviews — "boarder 和内圈同色", "浮在右下角并超出ICON", "太大了，8px就好了，里面的对钩是白色即可", "原来的icon不应该随之变小，保持原有尺寸", "那就直接填满右下角": one flat `#F692B7` patch with a white tick filling the lower-right quadrant of a full-size tile; update FR-010–FR-013, FR-016, SC-003, SC-013, the icon README, the data model and the contract; T033 and T034 were updated but not run, on the owner's instruction (FR-010–FR-013, SC-003, SC-013; R13)
- [ ] T036 **MANUAL** One glance at the real toolbar after installing `dist/`: the flat pink patch fills the icon's lower-right corner with a white check, the icon looks the same size as before, and the A is still visible (Proves T19; SC-001, SC-013)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 and T002 are independent files, T003 must precede any edit.
- **Foundational (Phase 2)**: depends on Setup; **blocks US1 only**. US2 does not read
  `status-badge.ts` and may start as soon as Setup is done.
- **US1 (Phase 3)**: depends on Foundational. Delivers the MVP.
- **US2 (Phase 4)**: depends on Setup only; can run in parallel with Phases 2–3 if staffed.
- **Polish (Phase 5)**: T022–T024 can land as soon as their inputs exist (T022 after T015; T023/T024 at
  any time), but all must ship in the same change set as the code (Constitution I). T025–T027 must follow
  the implementation they verify; T028 is last.

### User Story Dependencies

- **US1**: no dependency on US2. Independently testable by reading the badge from the background context.
- **US2**: no dependency on US1. Independently testable by opening the panel on any page, translated or
  not (one of its assertions needs a translated page, which today's product already produces).

### Within Each Story

- Tests first (T008/T009, T012–T014), each watched failing for the right reason.
- US1: then the service-worker wiring (T010), then green (T011).
- US2: then the manifest, module, markup, boot wiring, styles (T015–T019), then the adjusted assertions
  (T020), then green (T021).

### Parallel Opportunities

- T001, T002 — different files; both can be written while T003 runs.
- T004, T005 — different test files, both plain unit suites.
- T008 — one e2e file (T009 edits the same file afterwards, so it is not [P]).
- T012, T013, T014 — three different files (unit, DOM, e2e).
- T015, T016, T017, T019 — four different files; T018 joins T016 and T017 and follows them.
- T022, T023, T024 — three different files.

---

## Parallel Example: User Story 2

```bash
# Tests first — three files, all expected to fail:
Task: "T012 failing picker tests in tests/unit/shortcut-hint.test.ts"
Task: "T013 failing applier tests in tests/dom/shortcut-hint-render.test.ts"
Task: "T014 failing end-to-end tests in tests/e2e/shortcut-hint.spec.ts"

# Then implementation files that do not touch each other:
Task: "T015 manifest suggested key in src/manifest.json"
Task: "T016 picker and applier in src/ui/popup/shortcut-hint.ts"
Task: "T017 label span and kbd in src/ui/popup/popup.html"
Task: "T019 chip styles in src/ui/popup/popup.css"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 → Phase 2 → Phase 3.
2. **STOP and VALIDATE**: translate one fixture page; the icon must swap to the checked raster before the
   first translation lands, a second tab must stay plain, and restore and navigation must put the plain
   icon back within a second.
3. That is the owner's first request — "这样，我就能感受到翻译功能正常进行了" — demonstrable without US2.

### Incremental Delivery

1. Foundation ready (the mark exists and its predicate is proven).
2. US1 → the check appears; demo from a translated page alone.
3. US2 → the panel names the live key; ship, because a hint that lies is worse than none.
4. Polish → the amended contract and README, the manifest guard, and the three manual proofs.

### Reviewer's short path

T001 → T004 → T006 → T010 → T008 → T011 gives a runnable badge; then T002 → T012 → T016 → T017 → T018 →
T021 gives the hint. Everything else hardens them.

---

## Notes

- [P] tasks are different files with no unfinished dependency.
- Tests must fail before their implementation; a green test that never failed is not evidence.
- The one **changed** expectation is the primary action's text content (T020), required by FR-019; the
  action words move to `#translate-label` and no assertion is removed.
- The specification's amendments A1–A4 are already in [spec.md](./spec.md), made when the plan probed the
  browser; T023 and T024 extend the same discipline to feature 006's contract and the README.
- No catalogue key is added: the check carries no text and the key label is the browser's platform string.
  If any task finds itself writing a new visible word, it is out of scope and needs a spec change first.
- T026, T027 and T036 are manual because the boundary is the browser's own shortcut settings, a screen
  reader and a human judgement of looks; each names its measurement, and none may be reported as a
  passing test. **They were not performed in the implementation session** — they need the owner's
  keyboard, screen reader and eyes — so they remain unchecked on purpose. T025's pixel measurement is
  now automated by T033.
- Commit after each task or logical group; stop at each checkpoint to validate the story independently.