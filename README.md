# Immersive Polyglot

A Manifest V3 browser extension that translates the readable content of a page with a translation
provider **you** configure, and shows the result bilingually in place.

There is no account, no vendor backend, no analytics and no built-in provider list. Your credential
travels only to the endpoint you configure; page text travels only there too.

## What it is

- **Bring-your-own-provider.** Any OpenAI-compatible chat-completions endpoint: a hosted model, a
  local server, or a gateway you already pay for. Add it in the options page, test it, and use it.
  A fresh profile is pre-filled with DeepSeek's endpoint and model as a convenience; the preset only
  fills the fields, the credential is still yours to enter, and any endpoint works.
- **Bilingual reading.** Each paragraph gets its translation as an adjacent block, with the display
  mode you choose (translation below, above, or instead of the original).
- **A drawing keeps its drawing, and its phrases read in your language.** A generated diagram's
  shapes, arrows and positions stay exactly where the page drew them; the phrases inside it are
  translated in place, at their own position. Single-token names and diagram keywords, opaque graphics
  (a chart, a photo, an embedded frame, media, an equation) and the drawing's own style sheet stay as
  drawn and are never sent to the provider.
- **Progressive, on demand.** Translation is requested for the passages you are about to read — the
  screen in front of you plus one screenful — instead of the whole page. Each such passage wears a
  small rotating mark in the exact slot its translation will take, and that mark becomes the
  translation when it arrives. Scrolling asks for the next stretch; text you never reach is never
  sent, and therefore never paid for.
- **A check on the toolbar icon.** While translation is on for the page in front of you, the
  extension's icon fills its lower-right corner with a flat pink patch and a white tick — the icon keeps
  its size, so the mark reads as an added corner badge rather than a different icon. It appears as
  a run starts — before the first translation lands — and is gone when the page is restored or
  navigated, so a glance at the toolbar answers "is this tab being translated?" without opening
  anything.
- **The shortcut, named on the button.** The panel's translate control shows the combination the browser
  has actually bound (Alt+A by default, `⌥A` on macOS) and shows nothing at all when nothing is bound.
  A shortcut nobody can find is not a shortcut, and a hint for a key that does nothing is worse.
- **Fifteen translation display styles.** None, dashed/solid/dotted underline, dashed/solid border,
  blur (study mode), transparency, divider, highlight, marker pen, marker pen 2, quote, weakened and
  gray — each with a generated preview icon, applied live without re-translating, and overridable per
  site. Divider draws a short dashed line of about fifteen segments just above each translation, never
  a full-width rule. Choosing **Display** in the options page shows a live sample before you save.
- **Translations in your reading typeface.** Choose a font-family stack and a size from 50 % to 200 %
  of each block's original size; translations update in place, the page's own text is untouched, and
  Reset returns to the page's typography in one click.
- **Restore exactly.** Turning translation off replays a write journal, so the page returns to its
  original state — not "close to it".
- **Honest failures.** Every failure has a class, a message and a recovery action. Nothing is ever
  shown as a translation until a real translation arrives.
- **Pressing translate again is harmless.** While a page is being translated, or once it already
  shows its translation, pressing the control again starts nothing, requests nothing and adds no
  second translation — one passage always keeps exactly one. To translate a page again, turn
  translation off first.

## Ratified stack

Pinned in [package.json](package.json) and recorded in `.specify/memory/constitution.md`:

| Tool | Version | Role |
|---|---|---|
| TypeScript | 5.6.3 | source language, `strict` + `noUncheckedIndexedAccess` |
| Vite | 5.4.10 | bundling the four extension entries |
| Vitest | 2.1.4 | unit tests (node) and DOM tests (jsdom) |
| Playwright | 1.48.2 | end-to-end in real Chromium with the unpacked extension |
| jsdom | 25.0.1 | DOM-shaped logic under Vitest |
| @types/chrome | 0.0.287 | extension API types |
| Node.js | 20 LTS or newer | tooling only; the shipped extension has **zero runtime dependencies** |

### Type and colour

Both surfaces — the page control and the settings page — are built from one system:
[src/ui/shared/ui.css](src/ui/shared/ui.css). Host Grotesk sets the words, JetBrains Mono sets
anything a machine wrote (endpoints, model ids, counts). The two faces are bundled under
[src/ui/shared/fonts](src/ui/shared/fonts) with their SIL Open Font License texts, so an
extension page never asks a font host for anything: the product's promise is that page text and
settings leave the device only through the endpoint the user configured, and a remote font would
quietly break it.

## Run and test

```bash
npm install
npm run build        # produces dist/, loadable unpacked
npm run typecheck    # tsc --noEmit, strict
npm test             # unit + DOM suites (Vitest)
npm run test:e2e     # builds, then Playwright against real Chromium + a local stub provider
npm run verify:styles # fifteen-style capture: distinctness, restore, contrast, layout, restyle time
npm run make:icons   # regenerate src/icons/*.png from the single vector design
```

The e2e suite needs a Playwright Chromium build. In an environment where the default browser cache
is not writable, install it inside the workspace and run the local variant:

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npx playwright install chromium
npm run test:e2e:local
```

Load `dist/` via `chrome://extensions` → *Developer mode* → *Load unpacked*.

To try it without any API key, run the local dev provider and point the extension at it:

```bash
npm run dev:provider        # http://127.0.0.1:8787, translate with model "dev-model"
```

Then use endpoint `http://127.0.0.1:8787/v1/chat/completions`, model `dev-model`, any credential,
and open `http://127.0.0.1:8787/` for the fixture pages. Its translations are prefixed
`【本地测试】` so they are never mistaken for real output.

To verify one real provider end to end (tasks T090), put the key in a git-ignored file and run the
harness — it never prints the key and makes one small real translation:

```bash
printf 'DEEPSEEK_API_KEY=sk-...' > .env.local
npm run verify:real-provider
```

## Rendering verification (SC-011)

```bash
npm run verify:rendering
```

It compares the product's output against the frozen capture corpus in
[tests/fixtures/captures](tests/fixtures/captures/README.md): relation to the source block,
container element, language attribute, source association, layout (no horizontal scroll, no
bounding-box overlap), and the restored DOM hash.

**The real corpus is not captured yet.** `T010` requires a manual capture with Immersive Translate
installed; without it the script exits 2 and SC-011 cannot be judged. The synthetic example under
`_example-synthetic/` exercises the machinery only:

```bash
npm run verify:rendering -- --include-example
```

## DSH plugin (feature 011)

The plugin half of the product, described by [specs/011-dsh-plugin](specs/011-dsh-plugin/), runs
inside DeepSeek Harness instead of a browser. `plugin/` is its build output; `src/plugin/` is the
source, split into a Host half (routes, session log, provider call, durable records) and a Client
half (React surfaces rendered into DSH's slots).

```bash
npm run build:plugin    # plugin/lib/index.js (Host) and plugin/lib/client.js (Client)
npm run check:plugin    # typecheck, tests, build and the Client JSX guard
```

Install it with **DSH → Plugins → Add plugin**, choosing this repository's `plugin/` directory (the
same thing `plugin_manager install_bundle` does; it links the directory, so a rebuild is enough).
Then toggle it off and on, or restart DSH, so the new bundle is loaded.

Two surfaces appear once a conversation is open:

- a **control in the session header** — one click turns translation on and sends the page; clicking
  again turns it off and the translations leave the transcript (they stay stored, so turning it back
  on paints them again without a provider call);
- a **translation section under each answer**, labelled with the answer it belongs to.

### How a translated answer is drawn

A section's text is Markdown, so the Client renders it as Markdown rather than as one grey
paragraph ([markdown.tsx](src/plugin/client/markdown.tsx)): headings, bullet and numbered lists,
quotes, rules, fenced code verbatim, and inline code, bold, italic, strike-through and links. Two
limits are deliberate: a pipe table inside one section still reads as a paragraph, and a
repository-relative link shows as a labelled path instead of a clickable anchor, because opening
files belongs to the shell, not to this plugin (the turn tail's `openFile` is the hook to wire up).
Markdown markers survive because the Host translates block-shaped text and keeps the provider's
answer as returned, so turning the control off and on replays stored sections without a second
provider call.

### Where the translations come from

`route: "dsh"` (the default) sends each page through **DSH's own model services** — the provider and
model already selected in DSH, with DSH's credential. Nothing else needs configuring: if DSH can
answer in this conversation, the plugin can translate it. The record names that provenance as
`endpointHost: "dsh:<provider>"`.

`route: "own"` keeps the older behaviour: the plugin calls `endpoint` itself and spends the
credential below. Choose it to translate with a cheaper or different model than the one answering,
or when the reader's DSH has no model selected.

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml, in the plugin's patch row
- id: immersive-polyglot
  config:
    route: own
    endpoint: https://api.deepseek.com/chat/completions
    model: deepseek-chat
    glossary:
      - sourceTerm: KV cache
        targetTerm: KV 缓存
```

For `route: own`, the credential is stored in DSH's own secret store, never in the profile patch,
and the GUI never sees it. Until the settings surface (US2) lands, set it once over the plugin's own
route:

```bash
PORT=50386   # the port of the DSH page you are using
curl -X PUT "http://127.0.0.1:$PORT/immersive-polyglot/api/credential" \
  -H 'x-immersive-polyglot: 1' -H 'content-type: application/json' \
  -H "Origin: http://127.0.0.1:$PORT" \
  -d '{"value":"sk-..."}'
```

`GET` returns `{ "configured": true, "writable": true, "masked": "sk-…" }`, `DELETE` unsets it.
Records live under `~/.dsh/storages/immersive_polyglot/translations/`, so a restart keeps them.

Known limits of this increment, recorded rather than hidden:

1. A page is the **last `maxAnswersPerPage` finished answers**, not the viewport-visible ones —
   viewport-following (FR-012) needs the shell's own scrolling anchors.
2. Translations render as **Markdown** (headings, lists, quotes, fenced code verbatim, inline
   code, bold/italic, links), but a pipe table inside one section is still shown as a paragraph, and
   a relative-path link is shown as a label instead of being clickable (FR-019).
3. There is no settings surface yet (US2): `route`, endpoint, model and glossary are changed only
   through the plugin's `Config` patch.
4. The `dsh` route does not retry: DSH's adapters own their retry policy, and a page that fails
   reports the failure class instead of spending more of the reader's quota.

## Architecture

```text
src/
├── manifest.json            MV3 manifest: storage permission, <all_urls>, popup, options
├── background/
│   ├── service-worker.ts    message router; owns the wire, holds no job state
│   ├── provider-client.ts   the only egress point: request, tolerant parse, error taxonomy
│   ├── credentials.ts       the only secret read path (service-worker internal), redacting log
│   └── retry.ts             bounded jittered backoff, Retry-After, per-class retryability
├── content/
│   ├── index.ts             page agent: commands, lazy port with reconnect, job lifecycle
│   ├── job.ts               batching, index mapping, reuse, caps, cancellation, rendering
│   ├── segmenter.ts         readable-content extraction, stable ids, dedupe, language detect
│   ├── batcher.ts           token-budget packing with a stable unit-to-index mapping
│   ├── renderer.ts          Immersive-Translate-style placement, modes, typography inheritance
│   ├── graphics.ts          graphic roots, label runs, the phrase rule
│   ├── label-renderer.ts    in-place label write, measure, shrink-to-floor
│   ├── restorer.ts          the write journal, inverse replay, DOM hash
│   ├── observer.ts          late content, debounced, idempotent, loop-proof
│   ├── limiter.ts           concurrency ceiling, volume budget, cancellation signal
│   └── selection.ts         selection-only and single-block translation
├── ui/
│   ├── popup/               current-page control, provider override, mode, usage
│   ├── options/             providers, routing, sites, glossary, style, privacy, diagnostics
│   └── shared/              i18n bindings, credential field, DOM helpers
├── shared/                  types, messages, settings, prompt, routing, glossary, validation
└── _locales/en/messages.json
```

Two build passes produce `dist/` ([vite.config.ts](vite.config.ts)): the content script must be a
classic IIFE bundle because Chrome does not load content scripts as modules, while the service
worker and the two extension pages are ES modules. `scripts/build.mjs` runs both and copies the
manifest, the locale catalog and the manifest-declared stylesheet verbatim.

## Security and privacy posture

- The credential is stored in `chrome.storage.local`, is read only inside the service worker, and
  never appears in a message payload (the message guard rejects such a field), a log line (the
  logger redacts), or a rendered surface (the UI only receives a mask).
- **`chrome.storage.local` is not encrypted at rest.** An attacker who can copy your browser
  profile can read the stored credential. This is a documented limitation (research R4), disclosed
  in the product before the first credential is entered, not papered over with a key stored beside
  the ciphertext.
- Page content is never written to storage: the settings writer rejects page-content keys, and the
  e2e suite asserts a marker string never appears in storage.
- Exactly one outbound destination per request: the resolved provider endpoint. Another call would
  be a defect, and the provider client logs every egress URL so tests can assert it.

## Testing strategy

| Layer | Location | What it proves |
|---|---|---|
| Unit (node) | `tests/unit` | segmentation, batching, prompt assembly, parsing, retry, caps, routing, glossary, settings/migrations, credential masking, i18n coverage, performance |
| DOM (jsdom) | `tests/dom` | rendering placement and modes, journal restore with a DOM hash, 20 translate/restore cycles, observer idempotence |
| End-to-end (Chromium) | `tests/e2e` | the whole product against real `chrome.storage` and real HTTP to a local stub provider, plus accessibility and RTL |
| Style verification (Chromium) | `scripts/verify-styles.mjs` | 105-pair style distinctness, exact restore per style, measured contrast on light and dark pages, the mode × direction layout matrix, and 120-block restyle time |

The stub provider in `tests/support/stub-provider.ts` is the one permitted double: a provider is
the user's to run, not ours. It also serves the fixture pages over HTTP so the extension meets them
exactly as it meets a web page.

## Known gaps, recorded rather than hidden

1. **Reference capture corpus (T010) is not captured.** SC-011 stays unverifiable until someone
   performs the one-time manual capture described in
   [tests/fixtures/captures/README.md](tests/fixtures/captures/README.md).
2. **The 20 fixture pages are authored, not captured from live sites.** They are labelled as
   fixtures everywhere and are not evidence that real sites work
   ([tests/fixtures/README.md](tests/fixtures/README.md)).
3. **One real provider has not been verified end to end** (T090). The stub proves the wire; only a
   real provider proves the product against a real vendor.
4. **SC-002's five-participant walkthrough** has not been run; the e2e suite proves the setup path
   is completable in the product's own UI, not that four of five first-time users finish it.
5. **The error taxonomy gained one class beyond the contract** — `invalidRequest` for a provider
   that rejects the request itself. Recorded in
   [contracts/provider-adapter.md](specs/001-llm-web-translator/contracts/provider-adapter.md).