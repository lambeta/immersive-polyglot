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
- **Fifteen translation display styles.** None, dashed/solid/dotted underline, dashed/solid border,
  blur (study mode), transparency, divider, highlight, marker pen, marker pen 2, quote, weakened and
  gray — each with a generated preview icon, applied live without re-translating, and overridable per
  site. Choosing **Display** in the options page shows a live sample before you save.
- **Restore exactly.** Turning translation off replays a write journal, so the page returns to its
  original state — not "close to it".
- **Honest failures.** Every failure has a class, a message and a recovery action. Nothing is ever
  shown as a translation until a real translation arrives.

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