# Research: A Page of Chat Answers Translates In Place

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-19

Every decision below was checked against the installed build (DSH 0.2.x inside
`/Applications/DeepSeek Harness.app`), not against memory: the plugin-development documents shipped
with the installation (`skills/dsh-doc/references/*`), the installed package sources, and one real
out-of-tree bundle (`dsh-superagent`) that already ships a Host and a Client half.

---

## R1. The plugin is a bundle with a Host half and a Client half

**Decision**: One installable package `immersive-polyglot-dsh` whose `package.json` declares
`dsh.bundle.patch` (`cordis.patch.yml` inserts one plugin row) and `dsh.client` (platform `web`,
inject list, `./client` export). The Host entry exports `apply(ctx, config)`; the Client entry
exports `apply(ctx)` and registers slots, locales and styles inside `ctx.effect`.

**Rationale**: This is the format the installed Plugin Manager installs from a local directory, and
the format `dsh-superagent` uses for the same job. It keeps the credential, the session log and the
records on the Host, where the browser cannot reach them.

**Alternatives considered**: A Host-only bundle (cannot render under an answer); a Client-only
bundle (cannot hold a credential or read the session log).

---

## R2. The bridge between Client and Host is the plugin's own same-origin routes

**Decision**: The Host registers one prefix on `ctx.webServer.register({ kind: 'prefix', path:
'/immersive-polyglot', handler })`, refuses non-loopback hosts and non-same-origin callers, and
answers JSON on `/immersive-polyglot/api/*`. The Client calls those routes with `fetch` from the
page it is already on.

**Rationale**: `dsh-superagent` does exactly this for its panel; the web server service is part of
the composition the plugin declares. It needs no code-generation step, keeps the secret on the Host,
and a same-origin check keeps other sites from calling it.

**Alternatives considered**: Generated Typert Remotes (`ctx.remote.$mount`) — a second protocol
surface and a generation step for one feature; Node IPC — not available to the browser half;
`postMessage` — no durable authority for credentials.

---

## R3. The control lives in the session header, the sections in the turn tail

**Decision**: The on/off control registers into `conversation.session.header.actions` (a list slot,
per session). Each translated answer's section registers into `conversation.chat.turnTail` (a list
slot rendered once per completed turn, above the action row), and each turn-tail entry renders one
section per answer of that turn, labelled and ordered.

**Rationale**: These are the two surfaces the installed Chat package declares for exactly this
purpose: `turnTail` is documented as "ordered feature contributions before a completed Turn's action
row", and the header actions slot is where per-session controls already live. The alternative — a
per-message body area — does not exist: the assistant renderer declares only reasoning-body and
image children, and the per-message strip (`conversation.chat.assistant-actions`) is for actions, not
content. The spec's placement wording was amended for this reason during planning.

**Alternatives considered**: A dedicated `conversation.view` tab that re-renders the whole
conversation translated — rejected: it would reimplement chat rendering and take the reader out of
the conversation; `shell.overlay` positioned over messages — rejected: DSH's own practices forbid
writing outside one's own component and estimating placement from another package's DOM.

---

## R4. "The page" is defined by the plugin's own visible anchors

**Decision**: Each turn's tail entry is an anchor owned by the plugin. One `IntersectionObserver` per
session watches all anchors with a bottom root margin of one viewport height; the visible anchors,
ordered by position, define the turn span of the page (a turn extends from the previous anchor to its
own). The reader's control being on is what turns observation into requests.

**Rationale**: The anchor is the plugin's own DOM, so no other package's DOM is read or measured.
Ordered anchors give turn spans without asking the Chat package for scroll internals. Anchors below
the fold arrive through the one-viewport margin, which is exactly the spec's page definition. A turn
counts as on the page when its own anchor is in the band, or when the previous turn's anchor is (its
top is then visible), so a turn taller than the viewport is not missed.

**Alternatives considered**: Reading the chat's scroll container and node positions — reaches into
another package's internals; translating everything and hiding unseen results — breaks the promise
that unreached text is never sent (SC-005).

---

## R5. The Host reads an answer's prose from the session log, not from the Client

**Decision**: The Client sends only session and message identities. The Host resolves each assistant
message through the session services it injects (`sessionPersistence`, `session`) and extracts the
answer's visible text blocks: `text` blocks yes, `reasoning` blocks and `tool-call` blocks no.

**Rationale**: DSH's own plugin practices make the session log the only source of truth; deriving the
text on the Host also means the browser never has to hold or forward anything the reader cannot see,
and the extraction is testable in Vitest against recorded session fixtures.

**Alternatives considered**: The Client reading the Chat snapshot and posting the text — two sources
of truth for the same answer, and a stale snapshot could send a superseded answer; the Client
scraping rendered DOM — forbidden and lossy.

---

## R6. Blocks, not whole answers, are the translation segments

**Decision**: Each answer is split into block-level segments: paragraphs, headings, list items, and
block quotes are translated; fenced code blocks, tables with code, and image-only blocks are never
sent. Prose segments are packed by the existing batcher and sent through the existing provider client
as the JSON array the engine already uses (`src/shared/prompt.ts`), whose contract already requires
order and count preservation and leaves code, URLs and placeholders untouched.

**Rationale**: The engine is segment-based already; using blocks as segments gives structural
fidelity without inventing a second prompt, and an answer whose code stays unsent is both cheaper and
honest. A count mismatch in the returned array fails that request rather than misaligning output.

**Alternatives considered**: Whole answers as one segment — loses block structure and makes a long
answer one giant element; a second prompt that returns translated Markdown — a second definition of
the instruction, which FR-040 forbids.

---

## R7. Durable records live in the storage domain, keyed by message identity

**Decision**: One record per translated answer in `ctx.storageDomain` (domain
`immersive_polyglot`, table `translations`, `per-record` layout), keyed by
`<sessionId>/<messageId>` and spelled `hex(sessionId)_hex(messageId)` on the medium, carrying the translated segments, the source hash, the provider and model,
the usage and price of the batch that produced it, the target language and timestamps. A record is
served only when its source hash still matches the current answer; otherwise it is stale and is not
displayed.

**Rationale**: `dsh-storage` exists exactly for durable, non-session, versioned application data, and
the message id is the Chat's own durable identity. Hashing the source is the cheapest honest answer to
"the answer was regenerated" (FR-021).

**Alternatives considered**: Storing translations as session events — DSH refuses new event types and
reserves plugin records for its own experimental packages; a file per session — no versioning, no
atomic writes, reinvents the domain.

---

## R8. The build reuses the ratified toolchain, and the package directory is installable as built

**Decision**: `npm run build:plugin` compiles the Host with the project's TypeScript to ESM in
`plugin/lib/`, bundles the Client with the project's Vite 5 to the CommonJS
`window.__ModuleLoader__.load({ id, factory })` form with `react` and `react/jsx-runtime` external,
and copies the committed manifest, patch, locales, icon and detail document. `plugin/` is the
directory Plugins → Add plugin takes.

**Rationale**: Vite is already ratified and configured; the module-loader shape is what DSH's Client
documentation and `dsh-superagent`'s `lib/client.js` show; no new bundler and no new runtime
dependency enter the repository.

**Alternatives considered**: `tsdown` (what `dsh-superagent` uses) — a new toolchain for one artifact;
one Vite build for both artifacts — the extension must keep zero runtime dependencies and contain no
plugin code (FR-038, FR-039).

---

## R9. Settings are configuration, the key is a credential

**Decision**: Endpoint, model, target language, glossary, page and batch bounds live in the plugin's
patch row (`Config`), edited through `ctx.get('configEditor').edit(...)` from the plugin's settings
section; the API key lives only in `ctx.credentials` under a fixed reference, readable on the Host,
described (never read) for the settings UI, and set or unset through the routes. The Test action
sends one small request and reports the provider's own verdict.

**Rationale**: DSH's configuration reference says secrets belong in credentials records, never in
configuration, and that the user's patch layer survives upgrades. `describe()` is the only API that
can back a masked field without the value ever crossing to the browser.

**Alternatives considered**: Storing the key in the plugin's own storage — outside the product's
credential seam, invisible to revoke flows; a second settings store — configuration would then have
two homes.

---

## R10. Verification runs the real client, the real session log and a real endpoint

**Decision**: Four layers. (1) Vitest Host units against recorded session fixtures and a fake HTTP
provider. (2) jsdom Client units for the control, the sections, code preservation, failure and
keyboard paths. (3) Playwright against the running DSH web UI with the bundle installed and the
repository's stub provider recording every request: turn translation on, read a page, scroll two
pages, restart DSH, reopen — asserting the request count and the rendered sections (SC-003, SC-005,
SC-009, SC-010). (4) One on-demand real-provider check through the existing
`scripts/verify-real-provider.mjs` pattern, using the reader's own key and printing no key.

**Rationale**: Constitution III forbids declaring the feature done on doubles. The only double here is
the provider boundary, which is the same boundary the extension isolates, and the restart check proves
durability rather than in-memory state.

**Alternatives considered**: A fake Client shell instead of the real DSH page — would pass while the
real slot registration fails; a mock storage — would not prove FR-020 after a restart.

---

## R11. Localization and accessibility follow the host, not a local design

**Decision**: One locale namespace with `locale/en.json` and `locale/zh.json`; every string through
`ctx.locale`; the control is a `role="switch"` button with `aria-checked` and a visible label; the
sections are `<section>` elements with an accessible name per answer; styles use only `--dsw-alias-*`
theme tokens, follow light and dark, and never carry meaning by colour alone.

**Rationale**: Constitution V and DSH's own UI practices; the host's theme tokens are the only way a
plugin's surface survives a theme change.
