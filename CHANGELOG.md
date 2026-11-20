# Changelog

All notable changes to this project are recorded here. The plugin that runs inside DeepSeek Harness
(`plugin/`, package `immersive-polyglot-dsh`) and the browser extension share this file: an entry
says which half it changes when the distinction matters.

## 0.2.0 - 2026-11-20

### Features

- **DSH plugin (feature 011).** The product now runs inside DeepSeek Harness as well as in a browser:
  a control in the session header translates a page of answers in place, and a section under each
  answer shows the translation.
- **DSH's own model by default.** `route: "dsh"` sends a page through `ctx.llm.stream()` with the
  model from `agentDefaultModel.currentSelection()`, so a reader already signed into DSH needs no
  second credential; records name the provenance as `endpointHost: "dsh:<provider>"`. `route: "own"`
  keeps the plugin's own endpoint and credential.
- **Translations are Markdown.** Headings, lists, quotes, rules, fenced code, inline code, emphasis
  and links render as such instead of one plain paragraph. Stored records already carried the
  markers, so existing translations gained structure without being re-translated.
- **Durable records.** Translations live in a `storage-domain` domain (`immersive_polyglot`, table
  `translations`, per-record layout under `~/.dsh/storages/immersive_polyglot/`) with the plugin's
  `Config` declared as a schemastery schema, so a restart keeps every record and the plugin appears
  in the Config inspector with a real schema.
- **Credential and diagnostics surfaces.** `GET/PUT/DELETE /api/credential` reads and writes the
  provider key in DSH's secret store without ever echoing it; `POST/GET /api/diag` keeps a ring of
  Client slot-render failures, which is how the Client bug below was found.

### Fixes

- **Silent Client abdication.** The Client bundle compiled JSX to `React.createElement` without a
  `React` binding, so both surfaces threw on first render and DSH quietly retired them. The build now
  uses the automatic runtime (`react/jsx-runtime`, which the shell provides), and
  `scripts/check-client-jsx.mjs` fails `npm run check:plugin` if that ever regresses.
- **No provider spend on a re-opened page.** The Host used to pass an empty set of already-translated
  answers to `planPage`, so turning the control off and on translated the page again. A page now
  skips answers whose record still matches the source hash (`alreadyTranslated`, `requests: 0`).

### Documentation

- README section for the plugin: install, the two surfaces, how translations are drawn, where they
  come from, and the known limits of this increment.
- Contracts updated for the shipped behaviour: `sections[].text` is Markdown, `route` and the
  `dsh:<provider>` provenance, `alreadyTranslated` skipping, and the credential/diagnostics routes.

### Tests

- 656 tests across the repository (70 files) pass with `npm test`; the plugin's own suite
  (`npm run check:plugin`, 13 files) covers the domain spec and store, the two translation routes,
  the HTTP layer, Markdown parsing and DOM rendering of both surfaces.
