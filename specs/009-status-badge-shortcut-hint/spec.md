# Feature Specification: A Check on the Toolbar Icon When Translation Is On, and the Shortcut on the Button

**Feature Branch**: `009-status-badge-shortcut-hint` (no branch was created: this project registers no
`before_specify` hook, and the working tree stays on `master`)

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "我想要在icon右下角显示当前网页已经启用了翻译的小图标，如图右下角有个对钩所示，考虑到icon是绿色，这个对钩的背景色要有差异。这样，我就能感受到翻译功能正常进行了。另外，启用快捷键如 Alt+A来进行翻译操作，在button也给出快捷键的提示" — with one attached
screenshot: a toolbar icon carrying a small check plate at its lower-right corner.

## Clarifications

### Session 2026-11-16

- Q: Which "icon" carries the check? → A: The extension's icon in the browser toolbar, exactly as the
  attached screenshot shows — not a page element, and not the panel's own mark. The product ships no
  page-level control today, and this feature adds none.
- Q: When does the check appear, and when does it go? → A: From the moment the reader starts
  translating (panel button or shortcut) until the page is restored or left; a run that ends in
  failure before any translation appears leaves no check.
- Q: The shipped icon is green. What does "这个对钩的背景色要有差异" require? → A: The check sits on a
  plate of its own, and that plate must be measurably different from the icon's green: at least 3:1
  contrast against the icon's ground, with the tick itself at least 4.5:1 against the plate. The
  exact colours are chosen in the plan.
- Q: Does the check mean "finished", "working", or merely "on"? → A: "On". It is not a progress bar and
  not a success badge: it is present while the run is in flight and remains while translations are
  displayed, so the reader gets immediate confirmation that translation engaged.
- Q: Which default shortcut? → A: Alt+A, replacing the Alt+T the build declares today. The reader may
  rebind it in the browser's own shortcut settings; the product must display whatever is actually
  bound.
- Q: Where is the shortcut hinted? → A: On the panel's translate button — the owner's "在button也给出
  快捷键的提示". Not on the icon's hover tooltip, and not in the settings page.
- Q: First review of the implemented check (owner, 2026-11-16): "启用的图标太大了，超出了ICON，应该在包裹在
  ICON右下角里面，配色也不好看，可以改成配红色，中间的对钩白色". What changes? → A: The product stops using
  the browser's text badge, whose size is not the product's to choose, and draws the checked icon
  itself, inside its own silhouette. _(Colours superseded by the next entry.)_
- Q: Second to fifth reviews (owner, 2026-11-16): "红色不太行，换成黄色", then "#F692B7 作为背景色",
  then "需要浮在右下角并超出ICON", then "启用图标的boarder和内圈同色，整体尺寸扩大2倍", and finally
  "太大了，8px就好了，里面的对钩是白色即可", and finally "原来的icon不应该随之变小，保持原有尺寸". → A: The mark is
  one flat pink corner (`#F692B7`) with a **white** tick, filling the icon's lower-right quadrant —
  half the canvas — flush with its right and bottom edges. The tile keeps the plain icon's full 16/16,
  so the icon never shrinks; a 16 px action image cannot hang a mark outside itself without shrinking
  the icon, and the owner chose the icon's size. White on this pink
  measures 2.16:1, below the 4.5:1 the rest of the product keeps; the owner asked for white three times
  and accepted the look, so the requirement records that trade-off instead of a threshold. The pink
  patch itself still clears 3:1 against the ground (4.43:1).

### Recorded interpretations

- The attached screenshot is the owner's reference for *placement* and *meaning*, not for colour: its
  icon is pink, while the shipped icon is dark green. That mismatch is precisely why the owner asks
  for a plate that differs from the icon.
- "已经启用了翻译" is read as "a translation run is active, or its output is on the page", not as "this
  site is configured to translate automatically" (the product has no auto-translate today).
- One key, one action. The command toggles translation; the button's action label changes between
  translate and restore while the key stays put.
- The browser reports a key combination in its own platform notation (⌥A on macOS, Alt+A on Windows and
  Linux) and draws the action badge at a size the product does not choose. Both the key label and the
  check are therefore judged as they are rendered, not as drawn by the product.
- The two halves of the request are independent slices: the check can ship without the hint, and the
  hint can ship without the check.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The toolbar icon says, at a glance, that this page's translation is on (Priority: P1)

A reader keeps a handful of tabs open: the foreign article they translated, the article's original, a
few unrelated pages. They press Translate, and for the first seconds the page looks unchanged while
the first passages are on their way — nothing on screen confirms that the request even started. Later,
coming back to a tab after a while, they cannot tell from the page or the toolbar whether translation
is still on for it without opening the panel and reading a sentence.

What must happen instead: the toolbar icon carries a small check at its lower-right whenever
translation is on for the page in the active tab — as soon as the run starts, while it runs, and for as
long as its translations remain on the page. Switching to a tab with no translation shows the plain
icon. Restoring the page removes the check. Because the icon is dark green and its 文 is cream, the
check must have a flat pink corner of its own — one colour, no second ring — with a white tick,
filling the icon's lower-right quadrant so it reads at a glance without changing the icon's size.

**Why this priority**: This is the first half of the request and its whole point is confidence: the
reader wants to *feel* that translation is working, from the toolbar, without opening anything. It is
also the only lasting, page-independent confirmation the product can offer, because the panel is
closed most of the time.

**Independent Test**: Load the unpacked extension, translate a fixed page against the local stub
provider, and watch the toolbar icon: within a second a pink corner with a white tick fills its
lower-right quadrant, and the icon itself is drawn at exactly the same size as before. Decode the
shipped rasters: the pink reaches 3:1 against the icon's ground, the white tick is present on it at the
2.16:1 the owner accepted, and the checked raster's tile is the same size as the plain one. Switch to an
untranslated tab and the plain icon returns; restore the translated page and the check disappears.
Nothing in this test requires the panel to be open.

**Acceptance Scenarios**:

1. **Given** a page that has never been translated, **When** the reader looks at the toolbar icon,
   **Then** the icon shows no check.
2. **Given** a page where translation has just been started and no translation has appeared yet,
   **When** the reader looks at the toolbar icon, **Then** a check is present at the icon's lower-right
   within one second.
3. **Given** a page showing translations, **When** the reader switches to an untranslated tab and then
   back, **Then** only the translated tab's icon shows the check.
4. **Given** a translated page, **When** the reader restores it from the panel's button or from the
   shortcut, **Then** the check is gone within one second.
5. **Given** a page whose run ended in failure before any translation appeared, **When** the reader
   looks at the toolbar icon, **Then** no check is shown.
6. **Given** a page that has been translated, **When** one later passage fails while the page still
   shows the earlier translations, **Then** the check remains, and the failure is stated in words in
   the panel.

---

### User Story 2 - The button names the key that actually works (Priority: P2)

A reader who prefers the keyboard wants to translate without opening the panel, and a reader who does
not know a shortcut exists should be able to learn it where they already act. The panel's translate
button is that place: beside its action label it carries the key combination that the browser has
actually bound, for example Alt+A.

What must happen instead: the button shows the current binding, read from the browser when the panel
opens. If the reader rebinds the command in the browser's own shortcut settings, the next time the
panel opens it names the new combination. If the command has no binding — because the reader cleared
it, or because the browser refused the shipped default on install — the button shows no key label at
all, rather than a key that does nothing. With the panel closed, pressing the bound combination does
exactly what the button does in the same state.

**Why this priority**: This is the second half of the request. It is a discoverability and trust
feature: a shortcut nobody can find is not a shortcut, and a hint that lies is worse than none. It
stands alone — the button keeps working by click even if the reader never uses the key.

**Independent Test**: Open the panel on a fixed page and read the key label beside the translate
button; it must equal the combination the browser reports for the command — on a fresh profile the
binding this specification calls Alt+A, which the browser renders in its own notation (⌥A on macOS,
Alt+A on Windows and Linux). Rebind the command in the browser's shortcut settings, reopen the panel,
and the label names the new combination without a reinstall or a browser restart. Clear the binding,
reopen, and no key label is shown. With the panel closed, press the bound combination on a page and
compare the result to clicking the button: the page must reach the same state.

**Acceptance Scenarios**:

1. **Given** a fresh profile, **When** the panel is opened, **Then** the translate button shows the
   combination the browser reports for the command — the binding this specification calls Alt+A,
   rendered in the platform's notation (⌥A on macOS) — together with its action label.
2. **Given** the reader has rebound the command to a different combination, **When** the panel is
   opened again, **Then** the key label names that combination.
3. **Given** the command has no binding, **When** the panel is opened, **Then** the button shows no
   key label.
4. **Given** a translated page, so the button reads "Show original", **When** the reader looks at the
   button, **Then** the key label is still shown, because the same key restores the page.
5. **Given** the panel is closed and a translatable page is showing, **When** the reader presses the
   bound combination, **Then** translation starts (or is restored) exactly as the button would have
   done.
6. **Given** the reader uses a screen reader on the translate button, **Then** the announcement names
   both the action and the current key.

---

### Edge Cases

- **Navigation in the same tab.** A translated page is followed by a new document in the same tab: the
  old translation is gone with the old document, so the check must be gone too, without waiting for
  the panel.
- **Browser restart.** Nothing remains translated after a restart, so no tab may claim a check.
- **Closed tab or window.** The check belongs to a tab, so it must not outlive it or appear on another
  tab.
- **Failure after partial success.** Some translations are on the page and a later batch fails: the
  check stays (translation is on the page) while the panel reports the failure in words.
- **Failure before any translation.** No provider configured, credential rejected, restricted page,
  or a page with no translatable passages: no check, because nothing is on the page.
- **Two fast presses of the shortcut.** One run and one check; a second press must not produce a second
  badge or a flicker.
- **A page the product cannot translate** (browser-internal pages, the extension store, a non-HTML
  document). Pressing the shortcut does nothing, and no check is invented.
- **The icon is unpinned** into the extensions menu: the same check is drawn on the entry there. The
  product cannot force the icon onto the toolbar; the panel's worded status remains the fallback.
- **Two windows, different tabs translated.** Each window's active tab shows its own state.
- **High-density display.** At 16 CSS px rendered as 32 device px, the tick must still read as a tick,
  not a grey blob.
- **Light and dark toolbar themes.** The mark is opaque and half of it sits on transparent ground, so it
  meets both the icon and the toolbar background; it must not rely on either theme's colour to be seen.
- **The shipped default is refused.** Another extension or the system already owns Alt+A at install
  time, so the browser binds nothing: no check behaviour changes, the panel shows no key label, and
  the button still translates on click.
- **A rebound key the system reserves.** The browser remains the authority; the product shows the
  browser's answer and never guesses.
- **A long localised button label.** With the longest label the shipped catalogue can produce, the
  key label must not push the action label into truncation or a second line.
- **The reader rebinds while the panel is open.** The browser closes the panel when focus leaves it;
  on the next open the label must match, which is the same condition as any rebinding.
- **Forced-colours or high-contrast modes.** The toolbar badge is browser chrome outside the page's
  forced-colours control; the panel's worded status stays the accessible equivalent.

## Requirements *(mandatory)*

### Functional Requirements

**What the check means, and when it is there**

- **FR-001**: For the active tab, the extension's toolbar icon MUST show a check at its lower-right
  whenever translation is on for that tab's page — meaning a run has been started and the page has not
  been restored — including while translations are still arriving.
- **FR-002**: The check MUST be absent when no run has been started for that tab, when the page has
  been restored, when the run ended in failure having rendered no translation, when the page holds no
  translatable passage, and on pages the product cannot translate.
- **FR-003**: The check MUST appear within one second of the run starting and MUST disappear within one
  second of a restore, whether the panel's button or the shortcut caused either.
- **FR-004**: The check MUST be scoped to a tab: the icon shows the active tab's condition, switching
  tabs shows the newly active tab's condition without any other reader action, and a closed tab leaves
  nothing behind.
- **FR-005**: The check MUST become correct without the panel being opened, and opening or closing the
  panel MUST NOT be required for it to catch up.
- **FR-006**: A run that left at least one translation on the page MUST keep the check even if it also
  failed, was cancelled, or hit a volume cap; those outcomes stay words in the panel.
- **FR-007**: The check MUST add to the product's worded state, never replace it: the panel MUST keep
  stating whether the page is translated, with its existing failure, cancellation and cap messages, and
  the check MUST NOT be the only carrier of any of them.
- **FR-008**: Restoring from the shortcut MUST clear the check exactly as restoring from the panel does.

**How the check looks**

- **FR-009**: The mark MUST be a tick made of two strokes — not a dot, a number, a letter, a word, or
  the panel's state dot. It carries no locale string, so it needs no catalogue entry.
- **FR-010**: The pink corner — one flat colour, with no second ring — MUST achieve at least 3:1 contrast
  against the icon's own ground, measured on the colours actually rendered (4.43:1).
- **FR-011**: The tick MUST be white on the pink corner, as the owner asked. That pair measures 2.16:1 —
  below the 4.5:1 the product's text keeps — and the requirement records the accepted trade-off rather
  than a threshold it does not meet.
- **FR-012**: Where the patch overlaps the icon's cream lettering, the mark separates from the artwork by
  hue: pink against cream is 1.94:1 in luminance, which is recorded as the owner's choice. No luminance
  threshold is claimed for that adjacency.
- **FR-013**: The check MUST fill the icon's lower-right quadrant **without changing the icon's size**:
  the tile keeps the plain icon's full 16 of 16, the pink shape runs from the icon's middle to its right
  and bottom edges and is flush with them, its inner corner is rounded, and its outer corner follows the
  icon's own silhouette. The icon's A stays visible above and to its left, and the icon MUST NOT shrink
  when the check appears.
- **FR-014**: At the smallest size the browser renders (16 CSS px at 1×, 32 device px at 2×), the tick
  stroke MUST occupy at least one full device pixel, and an unaided viewer MUST read the mark as a
  tick.
- **FR-015**: The check's legibility MUST NOT depend on the toolbar's light or dark theme: the mark is
  opaque and sits on the icon, whose ground it contrasts with (4.43:1).
- **FR-016**: The feature MUST NOT alter the icon's artwork, declared sizes or position; the checked
  mark is a variant generated from the same vector master, on the same full-size tile, and the plain
  rasters keep their artwork and sizes.

**The shortcut and its hint**

- **FR-017**: The product MUST ship Alt+A as the suggested default binding of the translate/restore
  command, and MUST NOT present any binding the browser did not grant.
- **FR-018**: Whenever the command has a binding, the panel's translate button MUST display that
  combination together with its action label, in the platform's keyboard notation.
- **FR-019**: The key label MUST be shown in both button states — "Translate this page" and "Show
  original" — because one key performs both.
- **FR-020**: The displayed combination MUST equal the binding the browser reports at the moment the
  panel opens. After the reader rebinds the command in the browser's own shortcut settings, the next
  panel open MUST name the new combination, with no reinstall and no browser restart.
- **FR-021**: When the command has no binding — refused at install, never assigned, or cleared by the
  reader — the button MUST show no key label: no placeholder, no empty brackets, no stale key.
- **FR-022**: The key label MUST be secondary to the button's action label and MUST NOT replace it; the
  button remains a full click target with its words intact.
- **FR-023**: The key label MUST be available to assistive technology together with the action, so a
  screen reader announces both when the button receives focus. It MUST NOT be hidden from the
  accessibility tree.
- **FR-024**: At the panel's fixed width, with the longest action label the shipped catalogue can
  produce, the key label MUST stay legible and MUST NOT truncate or wrap the action label.
- **FR-025**: Pressing the bound combination MUST produce the same effect as activating the button in
  the same state. On pages the product cannot translate it MUST leave the page unchanged and MUST NOT
  cause a check to appear.
- **FR-026**: The hint MUST appear only on the panel's translate button; the toolbar icon's hover
  tooltip keeps its current wording, and no other surface gains the hint.
- **FR-027**: The label MUST reproduce the combination the browser reports rather than re-spelling the
  key names, so platform notation is preserved.

### Key Entities *(include if feature involves data)*

- **Page translation state (per tab)**: whether translation is on for the page in a given tab — a run
  started and not restored. It is derived, never persisted, and it drives the check. Variants the
  badge must distinguish: running with translations still arriving, showing translations, finished
  with translations, restored, failed with nothing rendered, and not translatable.
- **Toolbar check**: a mark made of one flat pink corner and a white tick, filling the lower-right
  quadrant of the icon's full-size tile. Its attributes are its two colours, its geometry relative to
  the canvas (a mark ratio and a tile ratio of one), and its measured contrast ratios. It is visual
  only and carries no text a reader must read.
- **Command binding**: the translate/restore command's current keyboard combination as the browser
  reports it. It may be empty. It is owned and stored by the browser, not by the product; the panel's
  key label is a faithful rendering of it.
- **Panel translate button**: one control whose action label is either "Translate this page" or "Show
  original", which may be disabled when no provider is configured, and which carries the key label as
  a secondary element.

This feature adds no durable data: no new storage area, no new setting, and no record of which pages
were translated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the toolbar icon alone, with the panel closed, an observer identifies whether the
  active tab's page has translation on in at least 19 of 20 randomised paired trials (one translated
  page, one untouched), at both 1× and 2× display density.
- **SC-002**: At the smallest rendered icon size (16 CSS px at 1×), an unaided observer identifies the
  mark as a tick in at least 9 of 10 viewings at 1:1 zoom, and its stroke measures at least one device
  pixel wide in the capture.
- **SC-003**: On the rendered pixels of the shipped 16 px and 32 px checked rasters, the pink patch
  reaches at least 3:1 against the icon's ground (4.43:1) and the white tick is present on it, at the
  2.16:1 the owner accepted — 100% of the sizes the browser actually uses.
- **SC-004**: The check never claims translation that is not there: across 30 trials spanning
  translated, restored, failed-with-nothing-rendered, restricted and no-passage pages, the check is
  present exactly when translation is on — 30 of 30.
- **SC-005**: State follows the reader: the check appears and disappears within 1 second of the action
  in at least 95 of 100 timed trials, covering both entry points and both directions.
- **SC-006**: In a window with one translated and one untouched tab, 20 consecutive switches show the
  icon matching the newly active tab's state every time, with no carry-over and no visible lag beyond
  one second.
- **SC-007**: The panel's key label equals the browser's reported binding in 100% of three conditions —
  shipped default, rebound by the reader, and unbound — so no hard-coded key can pass.
- **SC-008**: After a rebind, the very next panel open names the new combination (1 of 1), with no
  reinstall and no browser restart.
- **SC-009**: With the panel closed, pressing the bound combination reaches the same page state as
  clicking the button in the same starting state, in 10 of 10 paired trials (idle→translated,
  translated→restored).
- **SC-010**: A real screen reader announces both the action and the current combination when the
  translate button receives focus, verified once per platform the product supports.
- **SC-011**: With the longest action label the shipped catalogue can produce, the panel stays within
  its existing width and height contract, the action label is neither clipped nor wrapped, and the key
  label remains legible — verified by visual audit at the panel's fixed width.
- **SC-012**: Restoring a translated page clears the check within one second in 10 of 10 trials,
  including restores triggered by the shortcut.
- **SC-013**: In the shipped 16 px and 32 px checked rasters, the pink shape fills the lower-right
  quadrant — half the canvas — flush with the right and bottom edges, and its outer corner follows the
  icon's silhouette; the tile is the same size as the plain icon's, so the icon does not shrink; the A
  remains visible above and to its left, and the white check is present.
- **SC-014**: The hint reaches the reader from exactly one surface: the panel's translate button. An
  audit of the shipped surfaces finds no key text on the icon's hover tooltip, in the settings page,
  or anywhere else, and the icon's artwork and declared raster sizes compare identical to the ratified
  ones — 100% of surfaces audited.

## Out of Scope

- **An in-page control.** No floating button, page-level toggle, or on-page status mark; the product
  ships none today and this feature adds none.
- **New icon artwork.** The icon's shapes, its dark green ground, its cream lettering, and its declared
  raster sizes stay as ratified; only the check is added over it.
- **Other badge states.** No progress indicator, no failure mark, no cap mark, no provider-missing
  mark, no count. Those remain words in the panel.
- **A "this site is set to translate" marker.** The check reflects the current page's actual state, not
  a stored site preference.
- **Shortcuts for any other command.** Selection translation, cancel, display-style and typography
  commands gain no keys, and the product gains no shortcut editor.
- **The hint anywhere else.** Not on the icon's hover tooltip, not in the settings page, not on an
  onboarding screen.
- **Storing or syncing the shortcut.** The browser owns the binding; the product neither sets nor
  remembers it.
- **The badge as a click target.** Clicking the badge is the same as clicking the icon, which opens the
  panel.
- **Other browsers.** Firefox, Safari and Edge-specific badge or command behaviour is not covered; the
  product targets Chrome's Manifest V3.
- **History or statistics.** No record of how many pages were translated, or of which.

## Assumptions

- "icon" is the extension's toolbar icon, as in the owner's screenshot; it is not a page element. The
  product composes the checked icon from its own vector master, so the mark's geometry and colours are
  the product's to choose and to measure; the browser only swaps the per-tab icon (owner feedback,
  2026-11-16, replaced the browser's own text badge for exactly this reason).
- The icon's ground is the ratified dark green `#13501B` and its lettering is `#F9F2E0`, per
  [src/icons/README.md](../../src/icons/README.md). The mark is one flat pink corner (4.43:1 against the
  ground) with a white tick. White on this pink is 2.16:1, below the product's usual 4.5:1; the owner
  asked for white three times, so the white tick is the requirement and the ratio is recorded as the
  accepted cost. The pink shape fills the lower-right quadrant (8 of 16 each way) and the tile keeps the
  plain icon's 16 of 16, so the icon never shrinks and the corner is fully filled. A 16 px action image
  cannot hang a mark outside itself without shrinking the icon, and the owner chose the icon's size.
- "Translation is on" is a claim about the reader's page, not about completeness, quality, cost, or the
  absence of failures. A partially translated page is still on.
- The check appears while the run is starting, before the first translation arrives, because that is the
  moment the owner wants confirmed ("我就能感受到翻译功能正常进行了"). A failed start is not that
  moment and leaves no check.
- The product sets the icon per tab; the browser shows it only for the active tab and resets a tab's
  icon on navigation, which the product also clears explicitly so the promise does not depend on that.
  When the icon lives in the extensions menu rather than on the toolbar, the same checked raster is
  shown there, and the panel's worded status is the fallback for readers who never see it.
- Chrome accepts Alt+A as a command shortcut. If another shortcut already owns it at install time, the
  browser binds nothing, and the product shows no key rather than a dead one; the plan must verify the
  binding actually takes effect on the target platform, because the shipped Alt+T is being replaced.
- The panel is the product's only button surface and the only place this hint appears; the product has
  no page-level control to put it on.
- Rebinding happens in the browser's own shortcut settings; the product only reads the result, and the
  reader who never opens those settings keeps the shipped default.
- Only one locale ships today. The key label is a platform string rather than translated prose, so the
  feature adds no catalogue entry for the key itself, while the button's worded label and the panel's
  status wording stay as they are.
- The reader's display renders the icon at 16 CSS px at 1× or 32 device px at 2×; both must survive.
- The reader has several tabs open and does not keep the panel open, which is why the toolbar rather
  than the panel is the surface for this state.
- No new install permission, storage area, network destination, or runtime dependency is introduced.

## Dependencies

- The existing toolbar icon and its declared sizes, and the browser's action-badge facility already
  available to the extension without a new permission.
- The panel from feature 006 — its translate button, its action labels, and its worded status line.
- The translate/restore command already declared by the build, and its handler in the background
  context, whose current default is Alt+T and which this feature changes to Alt+A.
- The page run's lifecycle and status broadcast from features 001 and 007, from which "translation is
  on" for a tab must be derivable.
- The browser's commands facility, which reports the current binding and owns rebinding.
- The ratified palette and type system in [src/ui/shared/ui.css](../../src/ui/shared/ui.css), and the
  existing localization catalogue, neither of which gains a new dependency.

