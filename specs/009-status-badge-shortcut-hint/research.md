# Phase 0 Research: A Check on the Toolbar Icon and the Shortcut on the Button

**Feature**: `009-status-badge-shortcut-hint` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

Every decision below was made against the built extension running in the repository's own Playwright
Chromium (with `--load-extension=dist`), not against documentation alone. The probe transcripts are
quoted verbatim; the script that produced them was a throwaway under `tmp-crops/` and is not part of
the deliverable. Where a requirement cannot be proven automatically, the boundary is named and the
manual check is in [quickstart.md](./quickstart.md).

---

## R1 — How the check is drawn

**Decision**: use the browser's own action badge: badge text `✔` (U+2714), per-tab, with an explicit
background and text colour. The icon files, the icon's declared sizes and the icon's artwork are not
touched.

**Evidence** (real Chromium, fresh profile):

```text
set: {"text":"ok","bg":"ok","fg":"ok"}
badge after set: {"text":"✓","bg":[99,203,211,255],"fg":[8,37,42,255],"title":"Immersive Polyglot — translate this page"}
badge second tab: ""
```

The badge is a first-class per-tab surface: text, background and text colour can all be set and read
back, and a second tab keeps its own (empty) badge. (The probe used `✓` to prove that any glyph round-trips;
R6 chooses the heavier `✔`.) The browser paints the plate at the icon's
lower-right (Chromium's `badge_util.cc`: `rect_y = bounds.bottom() - bottom_margin - kBadgeHeight`,
right-aligned), which is exactly the position in the owner's screenshot. No new permission is needed:
the `action` key is already in the manifest, and the API lives in the background context.

**Alternatives considered**:

- **Composite the check into the icon and call `setIcon`** — control over geometry and an outline, but
  it requires drawing four sizes in a service worker (no DOM canvas), re-rendering the icon artwork that
  `design.svg` owns, and keeping the raster in step with `npm run make:icons`. Rejected: it moves the
  icon's source of truth and buys nothing the requirements ask for.
- **A content-script overlay** — would sit on the page, not on the toolbar icon; rejected against FR-001.
- **Badge text with a count or a letter** — rejected by FR-009 and by the owner's screenshot.

**Cost accepted**: the plate's size, radius and glyph rendering belong to the browser. The plan records
it (R10) and the spec was amended (FR-013/SC-013) so the requirement is judged on the rendered result.

**Superseded by R13 (owner review, 2026-11-16):** the badge's size and position were rejected outright —
"启用的图标太大了，超出了ICON，应该在包裹在ICON右下角里面". A surface whose geometry the product cannot choose
cannot carry FR-013, so the product now composes the checked icon itself.

---

## R2 — Where "this tab's translation is on" comes from

**Decision**: the content script stays the authority, and the background reuses the status broadcast it
already receives. `jobUpdated` is already a documented command type (`src/shared/messages.ts`, parsed
today and ignored by the background); the background adds a case that reads `sender.tab.id` and paints
that tab's badge. No new message type, no new payload field, no storage.

**Evidence**: the page agent broadcasts `{ type: "jobUpdated", status }` from
`src/content/index.ts` (`broadcast`), and `TranslationJob` emits its first status synchronously when a
run begins: `collect()` sets `segmenting` and calls `#emit()`, and a selection run sets
`segmenting`/`translating` and emits (`src/content/job.ts` lines 235–275). So the first broadcast precedes the first translation
request — the only work in between is one settings read and provider resolution — which keeps it well
inside FR-003's one second. `sender.tab.id` is present for a message sent by a content script; messages
from the panel or the options page carry no tab and are ignored by this case.

**Alternatives considered**:

- **A dedicated `translationState` message** — clearer, but a second path for a fact the product already
  broadcasts on every change; rejected under principle IV.
- **The background polling tabs / reading storage** — translation state is ephemeral page state and is
  deliberately not stored; rejected.
- **The content script calling `chrome.action`** — neither Chrome's content-script context nor its API
  surface exposes the action API there; rejected.

---

## R3 — Clearing the check

**Decision**: two clearing paths and no listener: a restore broadcasts `state: "idle"`, and the browser
clears the badge itself on navigation. A tab that closes takes its badge with it.

**Evidence** (real Chromium):

```text
badge after navigation: ""
```

The badge was set on the tab, the tab navigated to a new document, and the badge read back empty. This
is the browser's own behaviour, so the plan does **not** add a `chrome.tabs.onUpdated` handler, does not
ask for the `tabs` permission and does not add a navigation code path. An e2e test pins the behaviour
anyway (contract `status-badge.md` §3), because it is a browser fact the feature depends on: if a future
Chromium stopped clearing, that test fails before a reader ever sees a stale check.

**Amended by R13:** a composed icon has no read-back API, so the product can neither observe nor trust
the browser's reset. It clears the tab's icon itself on `tabs.onUpdated` `status: "loading"`; the probe
in R13 shows that event fires without the `tabs` permission.

**Alternatives considered**: `tabs.onUpdated` (needs the event plus a status filter, duplicates a
platform guarantee); `webNavigation` (a new permission for no gain); clearing from the new document's
content script (fires after the browser has already cleared, and cannot fire for documents the product
does not run in).

---

## R4 — What the check means, as a predicate

**Decision**: the check is on when

```text
state !== "idle"  &&  (counts.translated > 0  ||  state === "segmenting"  ||  state === "translating")
```

and off otherwise. This is a pure function over the existing `JobStatusPayload`.

**Rationale**: the owner asked for confirmation that translation *engaged*, so the check appears while
the run is collecting and translating, before the first translation arrives. A run that ends in failure
or cancellation keeps the check exactly when it left at least one translation on the page (FR-006), and
a page with no translatable passage ends `completed` with `translated === 0`, so no check appears
(FR-002). `restore()` broadcasts `idle` with zeroed counts, which turns the check off in the same tick.

The predicate deliberately does **not** test whether the translation nodes are still connected to the
document. The badge answers "is translation on for this page", not "is a translation visible right
now"; that is the owner's phrasing ("已经启用了翻译"), and it is also what a run that the page's own script
has reflowed still is. Feature 008's spend row owns the narrower "still on the page" question for money,
and that difference is deliberate.

**Alternatives considered**: a live DOM-connectivity count (would need a new status field and would make
the badge flicker when a host page re-renders); "completed only" (rejected — the owner wants feedback
during the run); "any non-idle state" (would claim translation for a failed start that rendered nothing).

---

## R5 — The plate and tick colours

**Decision**: plate `#63CBD3`, tick `#08252A`. Both already exist in the ratified palette as the dark
theme's accent and action ink (`src/ui/shared/ui.css`); the badge lives in browser chrome, which cannot
read CSS variables, so the pair is declared once in code and proven by a contrast test.

**Measured with the project's own `contrastRatio`** (`src/shared/contrast.ts`):

| Pair | Ratio | Requirement |
|---|---|---|
| plate `#63CBD3` on icon ground `#13501B` | **5.03 : 1** | ≥ 3 : 1 (FR-010) |
| tick `#08252A` on plate | **8.42 : 1** | ≥ 4.5 : 1 (FR-011) |
| plate on icon lettering `#F9F2E0` | 1.71 : 1 | an edge, not a ratio (FR-012) |

Candidates that were measured and rejected:

| Plate | vs ground | vs lettering | Why not |
|---|---|---|---|
| `#F9F2E0` cream | 9.98 | 1.00 | merges with the 文 glyph in the same corner — FR-012 |
| `#FFFFFF` | 9.58 | 1.12 | same failure, colder |
| `#0D7480` (light-theme accent) | 1.75 | 4.91 | fails the ground ratio: the icon is too dark for it |
| `#FFB300` amber | 5.34 | 1.61 | passes the numbers, reads as a warning in a product with no warning here |
| `#7BD88F`, `#9BE15D`, `#3DDC97` | 5.50 / 6.08 / 5.42 | 1.56 / 1.41 / 1.58 | green-family plates on a green icon — the exact confusion the owner raised |
| `#C084FC` violet | 3.63 | 2.37 | best edge, but a foreign accent in a green/teal system |
| `#FF7A9C` pink | 3.89 | 2.21 | the screenshot's icon colour, not the product's |

A design probe rendered the real `icon-16.png` and `icon-32.png` with an approximated browser plate at
10× and 5× for review. It confirmed the arithmetic visually — the cream plate dissolves into the 文
glyph, the teal plate keeps a clear edge — and it is recorded as a *design aid only*, not as acceptance
evidence; the capture in [quickstart.md](./quickstart.md) is the evidence.

**Cost accepted**: no plate colour can reach 3:1 against both the dark green ground and the cream
lettering (the two windows do not overlap: the ground needs luminance ≥ 0.279, the lettering needs
≤ 0.263). That is why FR-012 asks for a visible edge rather than a ratio, and why the plate is chosen to
be hue-distinct from the lettering.

**Superseded by R13** for both colour and mechanism. The final mark is a pink disc (`#F692B7`) with a
dark-green ring and tick (`#0F4517`): the pink answers the ground (4.43:1), the dark ink answers the pink
(5.16:1), and the ring answers the cream lettering (9.98:1). Three adjacencies, three measured pairs.

---

## R6 — The glyph

**Decision**: `✔` (U+2714, heavy check mark). At a 16 px icon the browser's badge text is roughly 8–10 px,
so the heavier tick survives better than `✓` (U+2713); the text is a single constant, and the fallback if
a capture shows a hairline (or a missing glyph on a platform) is `✓` with one test expectation updated.
The glyph is not a localised string: no catalogue entry.

**Alternatives considered**: `✓` (lighter); an SVG tick (impossible in badge text); "OK" (FR-009 rejects
a word).

**Superseded by R13:** the tick is no longer a glyph at all — it is two vector strokes in the checked
master, so no font, no fallback and no font-size heuristic is involved.

---

## R7 — Where the key label comes from

**Decision**: read `chrome.commands.getAll()` when the panel opens, pick the entry named
`toggle-translation`, and display its `shortcut` string verbatim. If the string is empty or the command
is missing, show no label. The manifest suggests `Alt+A` (replacing `Alt+T`).

**Evidence** (real Chromium, macOS, fresh profile):

```text
commands.getAll: [{"description":"","name":"_execute_action","shortcut":""},
                  {"description":"Translate or restore the current page","name":"toggle-translation","shortcut":"⌥T"}]
```

Two facts follow. First, Chrome binds the declared `Alt+T` on macOS and reports it as `⌥T` — the platform
notation, not the manifest string. The product must therefore reproduce the browser's string; a
hardcoded "Alt+A" would be wrong on the owner's own Mac. Second, the list also carries Chrome's
`_execute_action` command with an empty shortcut, so selection is **by name**, never by index.

This is why the spec was amended in this plan: US2's scenario and independent test now say "the
combination the browser reports for the command — the binding this specification calls Alt+A,
rendered in the platform's notation (⌥A on macOS)".

**Alternatives considered**: parsing `manifest.json` (the manifest's suggested key is a request, not the
result — R9's refused-binding case is exactly where it lies); hardcoding (same failure, worse);
`chrome.commands.onCommand` bookkeeping (the event tells us a key fired, not which key).

---

## R8 — Making the label accessible

**Decision**: the key label is a real `<kbd>` element inside the `<button>`, after a `<span>` holding the
action label. The button's accessible name becomes the action plus the key ("Translate this page ⌥A"),
which is exactly what FR-023 asks a screen reader to announce. No `aria-keyshortcuts` attribute is added.

**Rationale**: name-from-contents is the platform behaviour, it works for every notation the browser can
report (including `⌥`), and it cannot drift from what is on screen. `aria-keyshortcuts` accepts only a
grammar of modifier names (`Alt+A`, not `⌥A`), so adding it would either be silent on macOS or force the
product to re-spell the browser's string — which FR-027 forbids. Adding both would risk a double
announcement.

**Alternatives considered**: `aria-keyshortcuts` alone (invisible on macOS without re-spelling);
`aria-label` computed in JS (duplicates the visible label and can drift); CSS `::after { content:
attr(...) }` (generated text is not reliably exposed and is not selectable).

---

## R9 — Verification boundaries

The feature touches three things that no test harness owns. Each is named, with the closest real check:

1. **Rebinding and clearing the shortcut.** Chrome exposes no setter; the binding is edited on
   `chrome://extensions/shortcuts`, which is browser UI. The rule "the label equals the live binding, and
   an empty binding shows no label" is a pure function over `getAll()`'s result, so it is unit-tested for
   all three states (default / rebound / unbound) against a fake list; the e2e suite separately proves the
   panel reads the **real** API by comparing the rendered label to the live `getAll()` output. The rebind
   itself is a manual check in the quickstart.
   *Rejected*: pre-seeding the profile's `Preferences` file before launch (version-dependent, tests
   Chrome's storage format rather than the product) and automating `chrome://extensions/shortcuts`
   (unstable, and it would be a test of the browser's own UI).
2. **Pressing the accelerator.** Extension commands are browser-level accelerators; Playwright's
   keyboard events go to the page and never reach `chrome.commands.onCommand`. The handler is already
   exercised over the real wire (the e2e fixtures send the same `toggleTranslation` command the command
   listener sends), and the pressure of the real key is a manual check in the quickstart.
3. **The badge's pixels at 16 px.** Browser chrome is not part of any page Playwright can screenshot. The
   badge's *state* is proven automatically (`getBadgeText`/`getBadgeBackgroundColor`/`getBadgeTextColor`
   in a real browser), and the *look* is proven by one manual toolbar capture at 1× and 2×, measured with
   the bundled Python and Pillow (quickstart §3). This follows the project's existing precedent for
   captures that need a real browser UI.

   **Amended by R13:** the product now ships the pixels, so they are measured automatically — the checked
   rasters are decoded in Chromium and their colour, size and position asserted in
   `tests/e2e/badge-icon.spec.ts`. What remains manual is one glance: does the toolbar read well.

---

## R10 — Badge geometry and the amended FR-013

**Decision**: the spec's original "no more than the lower-right half of the icon's area" was a product
choice the product cannot make. Chromium's badge paints an 11 × 11 plate on a 16 px icon
(`kBadgeHeight = 11`, `kPadding = 2`, no bottom margin for a browser action), which is 47 % of the icon's
area — inside the old bound, but only by luck, and it covers most of the 文 glyph.

The requirement is now: anchored to the lower-right, inside the icon, never centred, and leaving the
icon's A⇄文 mark visible above and to its left. That is what the mechanism can actually guarantee, and it
is what the owner asked for ("在 icon 右下角显示"). FR-013 and SC-013 carry the new wording; the plan's
[Specification amendments](#specification-amendments) records the diff.

**Alternatives considered**: keeping the area bound and failing the plan's own gate if a Chromium update
grew the plate by a pixel; drawing the badge ourselves (R1).

---

## R11 — Where the state lives, and what happens when the worker stops

**Decision**: the badge is derived state, never stored. The background keeps a small in-memory cache of
the last value written per tab, only to avoid redundant browser calls on every progress tick. If the
service worker is terminated, the browser keeps the painted badge, and the next broadcast from the page
re-applies the derived value; the cache being empty only costs one extra write.

**Rationale**: nothing durable is involved (spec, Key Entities), so no storage key, no migration and no
schema version. The one thing the product must not do — leave a check behind after a restore — is
covered by the restore broadcast and by the browser's navigation clearing (R3).

**Alternatives considered**: persisting the per-tab state in `chrome.storage.session` (survives worker
restarts, but the page is the authority and comes back on its next broadcast; adds storage and a
lifecycle for no observable gain).

---

## R12 — The panel-side churn

**Decision**: the key label lives inside the button, which changes the button's text content. Seven
existing assertions read the button's exact text (`tests/e2e/panel-control.spec.ts` ×6,
`tests/e2e/smoke.spec.ts` ×1); each is retargeted at `#translate-label`, the span that carries the action
label, and the new suite asserts the key label separately. No assertion is deleted or loosened, and no
other test reads `#translate`'s text.

**Rationale**: putting the hint inside the button is the honest reading of "在 button 给出提示", and it
keeps one primary control instead of adding a second surface. The panel's 384 px width, 44 px primary
control height and 600 px budget are unchanged (feature 006's contract), which the layout tests re-check.

**Alternatives considered**: a sibling chip outside the button (no test churn, weaker association, and a
second focusable-looking chip); CSS-generated text (R8).

---

## R13 — The mark is composed, not borrowed (owner review, 2026-11-16)

**Decision**: the product draws the check itself. `src/icons/design-checked.svg` is a second vector
master — the same mark plus a badge — rendered by `npm run make:icons` into
`icon-{16,32,48,128}-check.png`. The background swaps the tab's icon with
`chrome.action.setIcon({ tabId, path: {16,32,48,128} })`, using absolute URLs, and puts the plain set
back on restore, on navigation (`tabs.onUpdated`, `status: "loading"`), on install and on update.

**Why the first mechanism failed**: the browser's text badge is sized and positioned by Chromium. The
first review (2026-11-16) reported it "太大了，超出了ICON" — it covered most of the icon and read as an
overhang. There is no API to shrink it, set its radius or attach an outline, so no amount of colour
tuning could satisfy FR-013. Composing the asset makes the geometry, the tick and the colours the
product's, and makes them measurable.

**Evidence** (real Chromium, built extension):

```text
tab-relative            "Error: Failed to set icon 'icons/icon-16.png': Failed to fetch"
tab-leading-slash       "ok"
tab-absolute            "ok"
tab-imageData           "ok"        (OffscreenCanvas + createImageBitmap available in the worker)
chrome.action.setIcon   patchable — wrapping it recorded the real call and its arguments
tabs.onUpdated          fires with { status: "loading" }, { status: "complete" } and no "tabs" permission
```

The first line is why the painter resolves every path through `chrome.runtime.getURL`: a bare relative
path is rejected from a service worker. The last two lines are why the state e2e wraps `setIcon` and why
the product can clear on navigation without asking for a new permission.

**Colour and size, two more reviews (2026-11-16)**: after the yellow and the quadrant-sized version, the
owner said "需要浮在右下角并超出ICON", then "启用图标的boarder和内圈同色，整体尺寸扩大2倍". The final mark is
therefore:

- **one flat colour** — the border and the inner circle are the same `#F692B7`;
- **white tick** — `#FFFFFF`, as the owner asked after seeing the dark version; white on this pink is
  2.16:1, below the 4.5:1 the rest of the product keeps, and the owner accepted the look;
- **filled corner, 8 of 16** — the tile keeps the plain icon's full 16/16 and the pink patch fills the
  lower-right quadrant, flush with the icon's right and bottom edges, its inner corner rounded. The
  earlier float needed a 10/16 tile, which shrank the icon; the owner's notes kept the icon's size, so
  the overhang went and the corner was filled instead: a 16 px action image cannot hang a mark outside
  itself without shrinking the icon;
- **measured** — disc on ground 4.43:1; the tick's 2.16:1 is recorded rather than claimed as a
  threshold, and the disc's 1.94:1 against the cream 文 is a hue shift, not a luminance claim.

The size was walked down from 12/16 on the owner's "太大了，8px就好了", the tick from `#0F4517` to white on
the same note, the float dropped for a full-size tile on "原来的icon不应该随之变小", and the mark then
filled the corner on "那就直接填满右下角". FR-010–FR-013, FR-016, SC-003 and SC-013 were amended in the
same change set.

**Alternatives considered**:

- **Composite at runtime with OffscreenCanvas in the service worker** — the probe shows it works
  (`tab-imageData: ok`), but it would rasterise on every worker start, fetch the plain PNGs each time,
  and leave the geometry out of the vector master and out of `make:icons`. Rejected: the build already
  knows how to turn an SVG into rasters.
- **Keep the badge and hide a state marker in it** (a zero-width badge text, a transparent plate) so the
  e2e could still read `getBadgeText` — rejected: that is a test-only channel in production, and the
  hidden plate is still painted by the browser.
- **Read the icon back** — Chrome has no `getIcon`, so the state test wraps the real `setIcon` in the
  real worker and asserts the tab and the four paths. That is the product's side of the contract; the
  browser's side is proven by the decoded rasters and by one glance.

**Verification now**:

1. `tests/unit/status-badge.test.ts` — the predicate, and the painter's per-tab `setIcon` calls against
   a recording action (checked on, plain off, dedupe, refused write, install clear, navigation clear).
2. `tests/unit/badge-contrast.test.ts` — the three ratios and the geometry, read from the two masters.
3. `tests/e2e/badge-icon.spec.ts` — the shipped 16 px and 32 px rasters decoded in Chromium: the disc
   between half and seven eighths of the canvas, mark pixels present beyond the padded tile's edge and
   none past the canvas, the exact pink and dark ink present.
4. `tests/e2e/status-badge.spec.ts` — the real `setIcon` calls per tab: start, restore, navigation,
   two tabs, provider-less failure, zero-passage page, partial failure.
5. One glance at the toolbar (quickstart §2), because taste is not a pixel assertion.
