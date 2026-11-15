# Quickstart: Validating the Redesigned Surfaces

Runnable scenarios that prove this feature works end to end. Each scenario names the success criterion it
demonstrates and, where one exists, the automated check that proves it. Figures come from the measurement reference at the end of
[research.md](./research.md).

## 1. Prerequisites

- Node.js 20 LTS or newer.
- `npm install` (nothing new is added by this feature).
- A Playwright Chromium build. Where the default browser cache is not writable, use the workspace-local
  path:

  ```bash
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium
  ```

- A Chromium-family browser to load the built extension by hand.

## 2. Build and load

```bash
npm run build
```

Then, in the browser: `chrome://extensions` → *Developer mode* → *Load unpacked* → choose `dist/`.
Optionally start the bundled stub provider and point the extension at it, so no real credential is needed:

```bash
npm run dev:provider     # http://127.0.0.1:8787, model "dev-model"
```

Endpoint `http://127.0.0.1:8787/v1/chat/completions`, model `dev-model`, any credential; open
`http://127.0.0.1:8787/` for fixture pages. Translations are prefixed `【本地测试】` so they are never
mistaken for real output.

## 3. Automated verification

| Command | Proves |
|---|---|
| `npm run typecheck` | strict build is clean |
| `npm test` | 358 unit and DOM tests, including the catalogue audit (SC-008) and the style-preview component |
| `npx playwright test` (with `PLAYWRIGHT_BROWSERS_PATH` as above) | the existing 52 end-to-end tests plus the budget tests this feature adds (SC-001 to SC-007, SC-009 to SC-011) |
| `npm run verify:styles` | the fifteen styles remain pairwise distinct after being re-presented (SC-003, no regression) |

Expected: every command exits 0, with no skipped test. The catalogue audit is the mechanical form of
SC-008: a literal in markup or a missing key fails it.

## 4. Scenario — first use of the panel (SC-001, SC-002)

1. Load the extension in an empty profile. Open any `http` page.
2. Open the panel. **Expected**: the panel is 384 px wide and needs no scrolling; the header shows the
   product mark, the title, the site's host, and the settings control; the state line reads "Not
   translated"; one filled button reads "Translate this page" and is **disabled** because no provider
   exists; a line says no provider is configured and names settings.
3. Add a provider in the settings page (see §5) and reopen the panel. **Expected**: the button is enabled.
4. Press it. **Expected**: the state line moves through "Reading the page…" and "Translating…", a cancel
   action appears while the run is in progress, and the dot pulses.
5. When it finishes. **Expected**: the state line reads "Translated · {n}", the button reads "Show
   original", and "This session" lists the counts.
6. Reproduce step 5 with three session lines and measure the panel's height in the page inspector.
   **Expected**: 599 px or less (measured 599 px); with five lines it may scroll, and the settings control
   must still be visible in the header.

## 5. Scenario — a first-time reader adds a provider (SC-012)

1. Open the settings page. **Expected**: it opens on Providers; the rail shows eight sections with the
   first active; the disclosure sits above the form; `#provider-credential` is disabled.
2. Try typing in the credential field. **Expected**: nothing is entered.
3. Tick "I understand what leaves this device". **Expected**: the field becomes editable in the same view.
4. Submit with the name empty. **Expected**: the reason appears under the name field, the field is marked
   invalid, focus moves there, and nothing is saved.
5. Fill name, endpoint, model and credential, then save. **Expected**: the status line in the same card
   confirms the save, and a row appears under "Saved providers" naming the endpoint and model.
6. Press "Test connection" with the stub provider running. **Expected**: the result is reported in place
   and the row records it with a timestamp.
7. Reload the page. **Expected**: the row is still there and the credential is shown only as a mask in the
   placeholder.

## 6. Scenario — changing how translations read (SC-003)

1. Translate a page, then reopen the panel.
2. Choose a different style tile. **Expected**: the translations already on the page redraw within one
   second; the line under the grid reads "Current style: {new name}"; no provider request is issued
   (watch the stub provider's log).
3. Open the settings page → Display. **Expected**: the device-wide style is unchanged; the site has its own
   preference in Sites.
4. In the panel, switch the display position. **Expected**: translations move below, above or instead of the
   source, and the site remembers it.
5. With focus in the tile grid, press the arrow keys. **Expected**: the selection moves, the chosen-style
   line follows, and the page follows.

## 7. Scenario — the rest of the settings page (SC-011)

1. Walk all eight sections. **Expected**: one section visible at a time, each with its h2 and one sentence;
   switching does not reload the page.
2. Add a site preference, a glossary term and a per-site cap; write a rule pointing at a provider, then
   delete that provider. **Expected**: each write reports in its own card; the rule row is marked broken in
   words and keeps its delete action.
3. In Display, change the font family and size. **Expected**: the sample (source line + styled translation)
   updates immediately; storage is unchanged until "Save display style" is used; "Reset to the page's
   typography" restores and saves.
4. In Style, confirm there is **no temperature field**, only the instruction field with its hint and
   example. **Expected**: saving writes only the instruction.
5. In Privacy, press "Delete all stored data" and confirm. **Expected**: the page falls back to defaults
   without a reload, the credential gate returns, and no stale row remains.

## 8. Scenario — keyboard, theme, zoom and longer words (SC-004 to SC-007)

1. **Keyboard**: on both surfaces press Tab repeatedly. **Expected**: focus visits controls in reading
   order, every focus ring is visible, the first Tab on the settings page lands on a section button and on
   the panel on the settings control; the style grid is entered once and leaves with one arrow-key press;
   a full task (translate → change style → open settings → save) is possible without a pointer.
2. **Dark**: switch the browser or OS to dark and reopen both surfaces. **Expected**: both render dark from
   tokens, no field keeps a light ground, and no text becomes unreadable. Changing the theme with unsaved
   input does not lose it.
3. **Contrast**: with the page inspector, read the computed colour and background of a lede, a hint, a
   primary button label and a muted nav label in both themes. **Expected**: every pair is at least 4.5:1
   (measured floor 4.8:1 light, 6.77:1 dark).
4. **200% zoom**: set the browser zoom to 200% and open Display. **Expected**: no clipped label and no
   sideways scrolling in the section, the rail or the panel.
5. **30% longer strings**: in the inspector, append a proportional suffix to each style name, as
   `long-labels.spec.ts` does, then measure. **Expected**: names wrap rather than clip, rows do not overlap,
   and the section does not scroll sideways.
6. **Reduced motion**: enable the OS reduced-motion preference and reload. **Expected**: the panel appears
   without animating and no content is missing.

## 9. Scenario — no third party is contacted (SC-009)

1. Open the DevTools Network panel, filter to "Other" and then open the panel and the settings page.
2. **Expected**: no request leaves for a font, style or script host. The two faces load from the extension
   origin (`chrome-extension://…/assets/*.woff2`) and `document.fonts.check` reports both families as
   loaded.

## 10. Scenario — narrow windows (SC-005)

1. Open the settings page and narrow the window to 1024, 768, 390 and 320 px wide, visiting each of the
   eight sections.
2. **Expected**: below 1024 px the rail becomes a wrapping row and the content is one column; at no width
   does the page scroll sideways, and no control is clipped.

## 11. When something fails

| Symptom | Read first |
|---|---|
| A surface looks different from the other one | `contracts/design-system.md` §1–§4 (one system) |
| A panel state renders the wrong words or the wrong action | `data-model.md` §1.2 (states table) |
| A save reports nowhere or in the wrong card | `contracts/settings-page-surface.md` §4 (feedback) |
| A row is missing its action or an empty collection shows a blank card | `contracts/settings-page-surface.md` §6 |
| The sample does not follow the selection | `contracts/settings-page-surface.md` §7 |
| A pixel or ratio budget drifts | `research.md` § *Derived measurement reference* and the new `panel-budget` spec |
| A string appears in a language other than the catalogue's | `contracts/design-system.md` §8 (catalogue rule) |

## 12. What this guide does not cover

- The translation pipeline, provider protocol, retry and error taxonomy — unchanged by this feature.
- The definition of the fifteen display styles and their rendering on a page — see feature 002 and
  feature 004's contracts.
- The reader's translation typography (family and scale for translated text) — feature 004.
- Stored schema, migrations and the credential store — feature 001.
