# Quickstart: Prove a Page of Chat Answers Translates In Place

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-19

This guide proves the feature end to end. It is a validation runbook, not an implementation: the tasks
that build each piece live in `tasks.md`, and the wire shapes live in [contracts/](./contracts/).

---

## 1. Prerequisites

| Requirement | Check |
|---|---|
| Node.js 20 LTS or newer (existing project requirement) | `node --version` |
| DSH 0.2.x installed and running | open the DSH window; the web client URL answers |
| This checkout installed | `npm install` |
| A provider, or the repository stub | the stub needs no key |

## 2. Build both artifacts from one checkout

```bash
npm run build          # the extension, exactly as before → dist/
npm run build:plugin   # the plugin package → plugin/ (manifest, patch, locale, icon, lib/)
```

Expected:

- `dist/` still loads unpacked in Chromium and contains no plugin code.
- `plugin/lib/index.js` and `plugin/lib/client.js` exist, and `plugin/package.json` declares
  `dsh.bundle.patch`, `dsh.client` and the `files` list.

## 3. Install into DSH

1. DSH → **Plugins** → **Add plugin** → choose the built `plugin/` directory.
2. Confirm the row shows the product's title, a one-sentence description and its own icon, in the
   UI language (switch DSH to Chinese and check again).
3. Open a new session. The session header shows the translation control in the state stored for that
   session.

If the row appears but the control does not, read the plugin row's diagnostics before changing
anything: a missing service keeps the plugin inactive by design (FR-005).

## 4. Configure a provider

Settings → Plugins → Immersive Polyglot:

1. Set endpoint, model and target language; save.
2. Enter the credential and save it; it must render masked afterwards.
3. Press **Test**: the provider's own verdict appears, and the test's usage is reported separately.

To run without a key, start the repository stub and point the endpoint at it:

```bash
npm run dev:provider     # http://127.0.0.1:8787 — any credential, model "dev-model"
```

## 5. Prove the page behaviour

| Step | Expected | Criterion |
|---|---|---|
| A. Open a conversation whose visible page holds three or more answers; turn translation on | Each answer gains one translation section beneath the answer it belongs to, in page order; the page reports requests, tokens and price | FR-007, FR-008, FR-024, SC-009 |
| B. Read the stub's request log | One request for the page, carrying only those answers' prose; no reasoning block, no tool payload; one host contacted | FR-009, SC-003 |
| C. Scroll down two pages, then stop | Exactly two more page requests, no request for answers never displayed | FR-012, SC-005 |
| D. Scroll back to page one | Sections still there; request count unchanged | FR-020, SC-005 |
| E. Restart DSH, reopen the session | Sections present, request count unchanged | FR-020, SC-005 |
| F. Regenerate one translated answer | No old translation under the new text | FR-021, SC-010 |
| G. Turn translation off, then scroll | No further requests; finished sections remain; untranslated answers show as untranslated | FR-013 |
| H. Delete the credential, request a page | Named failure, no request | FR-029 |
| I. Set the endpoint to a plain-HTTP non-loopback URL and save | Save rejected naming the rule | FR-030 |

An answer still streaming at step A must not be sent; it is translated once a later page request finds
it settled (FR-011).

## 6. Prove the extension is untouched

```bash
npm run typecheck
npm test                 # unit + DOM suites, unchanged
npm run test:e2e         # builds, then Playwright against real Chromium + the stub provider
```

Expected: every suite passes with no test edited, skipped or deleted; `dist/` contains no plugin
module; `package.json` still declares zero runtime dependencies (FR-038, FR-039, SC-007).

## 7. Prove the failure set

Run the plugin's own scenario suite, which drives the real DSH web client against a stub endpoint:

```bash
npm run test:plugin        # jsdom Client units + Host units
npm run test:plugin:e2e    # Playwright against the installed bundle
```

The e2e suite owns SC-003, SC-004, SC-005, SC-009, SC-010 and SC-011. Its only double is the provider
boundary; the DSH client, the session log and the storage are real.

## 8. What no harness owns (check by hand)

| Check | How |
|---|---|
| Light and dark theme, text expanded 30 percent, 390 px width | browser zoom and the host theme switch; no clipped label, no lost control |
| Keyboard operation | reach the control and every section control with Tab, see focus, operate with Enter/Space |
| Chinese locale | switch the UI language; every plugin string is Chinese, no English template copy |
| Real provider end to end | one page through the reader's own key, printing no key (the existing `verify:real-provider` pattern) |

## 9. Clean up

Disable the plugin from Plugins (the control and sections disappear from new sessions; stored
translations stay). Remove it when done. The browser extension and its settings are unaffected
throughout.
