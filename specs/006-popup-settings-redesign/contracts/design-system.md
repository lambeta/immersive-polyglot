# Contract: The Design System

**Status**: Phase 1 design contract. Applies to both extension surfaces — the page control
(`src/ui/popup/popup.html`) and the settings page (`src/ui/options/options.html`).

**Single source**: `src/ui/shared/ui.css`. Both page stylesheets import it before their own layout
rules. A page stylesheet may set layout for its own surface; it may not define a token, a button, a
card, a field, a list or a focus ring of its own. A second system per page is the defect this contract
exists to prevent.

---

## 1. Tokens

Colour, one accent, neutral everywhere else (the interface stays ~90% neutral; colour comes from state,
not decoration):

| Token | Light | Dark | Role |
|---|---|---|---|
| `--p-bg` | `#f7f9fa` | `#11171a` | page ground |
| `--p-card` | `#ffffff` | `#1a2226` | cards, inputs, raised rail item |
| `--p-surface` | `#ecf0f2` | `#151c20` | rail, callout ground, sample ground, card foot tint |
| `--p-ink` | `#1f3038` | `#edf2f3` | text, primary glyphs |
| `--p-muted` | `#5d6b72` | `#9daaaf` | secondary text, labels, detail lines |
| `--p-line` | ink at 13% | ink at 15% | hairlines and card edges |
| `--p-line-strong` | ink at 24% | ink at 28% | control borders |
| `--p-accent` | `#0d7480` | `#63cbd3` | the one accent: links, focus ring, selected state, live state |
| `--p-action` / `--p-action-ink` | accent / white | light accent / `#08252a` | the single filled button |
| `--p-danger` | `#a2271c` | `#ff9d92` | refusal text and button |
| `--p-warn` | `#7f5300` | `#f0c987` | warning text and button |

Rules:
- **One accent.** No second hue is introduced for state, selection, hover or emphasis. Violet and
  lavender are excluded.
- **Half-tinted grounds are derived, never hand-picked**: `--p-accent-tint`, `--p-danger-tint` and
  `--p-warn-tint` are mixed from the token over `--p-card`, so a theme change moves them together.
- **Contrast**: every text pair is ≥ 4.5:1 against its own ground in both themes, measured on the live
  DOM. The lowest pair measured is 4.8:1 (light) and 6.77:1 (dark).

Spacing is a 4 px scale used for every gap, margin and padding: `--s-1…--s-8` = 4, 8, 12, 16, 24, 32,
48, 64. Radius is one family: `--r-sm` 8, `--r-md` 12, `--r-lg` 16, `--r-btn` 10, `--r-pill` 999.

## 2. Type

Two faces, both bundled (see §6): `--font-display` and `--font-text` are Host Grotesk; `--font-mono` is
JetBrains Mono.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Panel title (h1) | 16 px | 500 | tight tracking |
| Section title (h2) | 24 px | 500 | tracking −0.028em |
| Card title (h3) | 15 px | 500 | |
| Body | 14 px / 1.5 | 400 | |
| Small and labels | 13 px | 500 for labels, 400 for prose | never below 13 px |
| Machine values | 0.93 em of context | 400 | `.mono`, tabular numerals: endpoints, model ids, counts, keys |

Rules:
- Sentence case everywhere. No tracked capitals, no small caps, no italic except quoted text.
- Machine-written values (URLs, model ids, storage keys, counts inside tables) use the mono face; prose
  never does. The extra-headers field and the endpoint field are mono; the style instruction field is
  not (it is prose).
- Prose is capped at a readable measure (`max-width: 62–72ch` for hints and ledes; the instruction field
  at 68 ch).

## 3. Controls

| Control | Height | Radius | Notes |
|---|---|---|---|
| Button | 40 px (44 px for the panel's primary action) | `--r-btn` | label 13–14 px, 500 |
| Input, select, textarea | 40 px (textarea grows) | `--r-sm` | 14 px text, 1 px `--p-line-strong` border |
| Checkbox / radio | 16 px box, 28 px row | — | `accent-color` from the accent token |
| Icon-only button | 36 × 36 px | `--r-sm` | must carry an accessible name |

**Button family — exactly three:**
1. **primary** — filled with `--p-action`; the only filled button in a view; exactly one per view or per
   card foot.
2. **secondary** — card ground, 1 px border; every other action.
3. **danger** — transparent ground, danger border and label; destructive actions only.
Plus `.btn--quiet` as the secondary's quiet variant for row actions and in-card links ("Use DeepSeek
defaults", "Edit", "Delete rule"). No fourth shape, no gradient, no shadow, no ghost button.

**Fields**: every field has a visible `<label for>`; a placeholder never replaces a label. A failure sets
`aria-invalid="true"` on the field and writes the reason into the field's own error element, which is
referenced by `aria-describedby`. Hints are 13 px and muted.

**Focus**: one ring, `outline: 2px solid var(--p-accent); outline-offset: 2px` on `:focus-visible`,
never animated, never removed. Inside the sticky rail, the ring must not be clipped.

## 4. Cards, lists, callouts

- **Card**: `--p-card` ground, 1 px `--p-line` edge, `--r-lg`, with up to three parts: `head` (title +
  optional in-head control, closed by a hairline), `body` (fields or content, 20–24 px padding),
  `foot` (action row, then status line, on a `--p-surface` tint closed by a hairline). No card inside a
  card; no text in a box in a box.
- **List**: rows separated by one hairline, never boxed individually. Each row = title block + detail
  block + action block. An empty collection is one muted row.
- **Callout** (`.disclosure`): `--p-accent-tint` ground with an accent-tinted edge; used once, for the
  privacy statement, because it is the one place the product asks the reader to accept something.
- **Note lines** (`.note--error`, `.note--warn`): tinted ground, no border, used only for panel conditions.

## 5. Layout tolerance

- Both surfaces must survive **30% longer strings** and **200% zoom** without a clipped label, an
  overlapping row or sideways scrolling (FR-023).
- Both must fit **any viewport ≥ 320 px** without sideways scrolling; the settings page collapses to one
  column below 1024 px, where the rail becomes a wrapping row of section buttons (FR-024).
- Grid tracks that hold text use `minmax(min(<floor>px, 100%), 1fr)` so a narrow container can never
  push a track wider than itself.

## 6. Scope of the faces (and the boundary with feature 004)

The two bundled families are **extension chrome only**: page titles, labels, buttons, lists, and the
mono values of this product's own interface. They are declared in `src/ui/shared/ui.css`, which is
loaded by the panel and the settings page and by nothing else.

Feature 004's `contracts/typography-settings.md` governs the *reader's* typography for **translated page
text** (`ui.translationFontFamily`, `ui.translationFontScale`) and forbids fetching or bundling webfonts
for page content. That contract is unchanged and untouched: the bundled faces never reach the content
script, never enter `src/styles/`, and the translation typography fields behave exactly as 004 specifies.

Licences: both faces are SIL OFL 1.1. The licence texts ship in `src/ui/shared/fonts/` and are copied to
`dist/fonts/` by `scripts/build.mjs` so a built extension carries them.

## 7. Motion budget

| Motion | Duration / easing | Trigger |
|---|---|---|
| Button hover lift, press | 130 ms, `cubic-bezier(.2,.7,.3,1)` | pointer |
| Linked option lift, border change | 130 ms | pointer |
| Selected state swap (tile, segment) | 130 ms | selection |
| Panel entrance (fade + 5 px rise) | 240 ms, once | load |
| Working-state dot pulse | 1.6 s loop | a run in progress only |

Rules: nothing moves as a consequence of scrolling; no parallax; no tilt; no carousel; no timed tabs.
Under `prefers-reduced-motion: reduce` every duration collapses to ~0 and every element rests at its
final state — the entrance keyframe's end state is the display state, so nothing stays hidden.

## 8. Catalogue rule (copy)

- Every user-visible string is a catalogue key in `src/_locales/en/messages.json`; markup carries no
  literal text (checked by the catalogue audit test).
- Copy is sentence case, plain, and names the thing: buttons are a verb and an object ("Save provider",
  "Delete all stored data"), headings are nouns, ledes are one sentence.
- The only literals in markup are structural (ids, class names, `data-*` hooks) and the product's own
  SVG paths.
- A new control that needs a name gets a key, not an inline string; a tooltip that duplicates a visible
  label reuses the same key.
