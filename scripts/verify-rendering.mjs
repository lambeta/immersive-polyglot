#!/usr/bin/env node
/**
 * T043/T044 - rendering verification against the frozen capture corpus (SC-011).
 *
 * The corpus under tests/fixtures/captures/ is the reference: it is captured once from Immersive
 * Translate and then frozen, so "looks right" is replaced by a structural comparison. This script
 * is deliberately independent of the product's own modules: it must be able to disagree with them.
 *
 * Exit codes: 0 all captures match, 1 at least one divergence, 2 no capture corpus present.
 *
 * A capture directory whose name starts with "_" is a synthetic example used to exercise this
 * script; it is never evidence of Immersive Translate's behaviour.
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const PAGES = join(ROOT, "tests/fixtures/pages");
const CAPTURES = join(ROOT, "tests/fixtures/captures");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

/** Structural fingerprint. Kept in one function so the in-page run and the unit test agree. */
export function domHashInPage(root) {
  const FNV_OFFSET = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue || "";
      if (text.trim().length > 0) parts.push("#text:" + text.replace(/\s+/g, " ").trim());
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node;
    const attributes = [];
    for (const attribute of Array.from(element.attributes)) {
      attributes.push(attribute.name + "=" + attribute.value);
    }
    attributes.sort();
    const tag = element.tagName.toLowerCase();
    parts.push("<" + tag + (attributes.length ? " " + attributes.join(" ") : "") + ">");
    for (const child of Array.from(element.childNodes)) walk(child);
    parts.push("</" + tag + ">");
  };
  walk(root);
  const joined = parts.join("|");
  let hash = FNV_OFFSET;
  for (let index = 0; index < joined.length; index += 1) {
    hash ^= joined.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function parseArgs(argv) {
  const options = { includeExample: false, only: null, record: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--include-example") options.includeExample = true;
    else if (argument === "--only") options.only = argv[index + 1] ?? null;
    else if (argument === "--dump") options.dump = true;
  }
  return options;
}

async function startServer() {
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stub.test");
    if (request.method === "GET" && url.pathname.startsWith("/pages/")) {
      const file = normalize(join(PAGES, url.pathname.slice("/pages/".length)));
      if (!file.startsWith(PAGES)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      readFile(file)
        .then((body) => response.writeHead(200, { "content-type": MIME[extname(file)] ?? "text/plain" }).end(body))
        .catch(() => response.writeHead(404).end("not found"));
      return;
    }
    if (request.method === "POST") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        let segments = [];
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const user = body.messages.find((message) => message.role === "user");
          segments = JSON.parse(user.content);
        } catch {
          segments = [];
        }
        requests.push(segments);
        const translated = segments.map((text) => "\u3010\u8bd1\u3011" + text);
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(translated) } }] }));
      });
      return;
    }
    response.writeHead(405).end("method not allowed");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    origin: "http://127.0.0.1:" + address.port,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function loadCaptures(options) {
  let entries;
  try {
    entries = await readdir(CAPTURES, { withFileTypes: true });
  } catch {
    return [];
  }
  const captures = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") && !options.includeExample) continue;
    if (options.only && entry.name !== options.only) continue;
    for (const file of await readdir(join(CAPTURES, entry.name))) {
      if (!file.endsWith(".json")) continue;
      const path = join(CAPTURES, entry.name, file);
      const parsed = JSON.parse(await readFile(path, "utf8"));
      captures.push({ id: entry.name, mode: file.replace(/\.json$/, ""), path, ...parsed });
    }
  }
  return captures;
}

async function seedProvider(context, origin) {
  const page = await context.newPage();
  const extensionId = new URL(context.serviceWorkers()[0]?.url() ?? "").host;
  if (!extensionId) throw new Error("extension did not register a service worker");
  await page.goto("chrome-extension://" + extensionId + "/ui/options/options.html");
  await page.evaluate(
    async (endpoint) => {
      const now = new Date().toISOString();
      await chrome.storage.local.set({
        schemaVersion: 1,
        providers: [
          {
            id: "p_verify",
            name: "Verify stub",
            endpoint,
            model: "stub-model",
            extraHeaders: {},
            enabled: true,
            timeoutMs: 15000,
            maxConcurrency: 2,
          },
        ],
        credentials: {
          p_verify: { providerId: "p_verify", secret: "sk-verify-0000", masked: "\u2022\u2022\u2022\u20220000", updatedAt: now },
        },
        routing: { defaultProviderId: "p_verify", rules: [] },
        sites: [],
        glossary: [],
        style: { instruction: "", temperature: 0 },
        limits: { maxConcurrency: 2, sessionCapSegments: 0, sessionCapChars: 0, siteCaps: {} },
        ui: { targetLang: "zh", sourceLang: "en", displayMode: "bilingual" },
      });
    },
    origin + "/v1/chat/completions",
  );
  await page.close();
  return extensionId;
}

async function sendToPage(context, pageUrl, message) {
  const worker = context.serviceWorkers()[0];
  return worker.evaluate(
    async ({ url, command }) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url?.startsWith(url));
      if (!tab?.id) throw new Error("no tab for " + url);
      return chrome.tabs.sendMessage(tab.id, command);
    },
    { url: pageUrl, command: message },
  );
}

function compareSegments(capture, observed) {
  const problems = [];
  for (const segment of capture.segments) {
    const found = observed.find((item) => item.selector === segment.sourceSelector);
    if (!found) {
      problems.push(segment.sourceSelector + ": source segment not found");
      continue;
    }
    if (found.relation !== segment.relation) {
      problems.push(segment.sourceSelector + ": relation " + found.relation + " != " + segment.relation);
    }
    if (segment.containerTag && found.containerTag !== segment.containerTag) {
      problems.push(segment.sourceSelector + ": container " + found.containerTag + " != " + segment.containerTag);
    }
    if (segment.langAttribute && found.lang !== segment.langAttribute) {
      problems.push(segment.sourceSelector + ": lang " + found.lang + " != " + segment.langAttribute);
    }
    if (capture.displayStyle && found.style !== capture.displayStyle) {
      problems.push(segment.sourceSelector + ": style " + found.style + " != " + capture.displayStyle);
    }
    if (!found.associated) problems.push(segment.sourceSelector + ": translation is not associated with its source");
    if (!found.hasText) problems.push(segment.sourceSelector + ": translation is empty");
  }
  return problems;
}

async function observe(page, mode) {
  return page.evaluate((displayMode) => {
    const sources = Array.from(
      document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt, figcaption, caption, summary'),
    );
    const items = [];
    for (const source of sources) {
      const candidate =
        displayMode === "above" ? source.previousElementSibling : source.nextElementSibling;
      if (!candidate || candidate.getAttribute("data-ipt") !== "target") continue;
      items.push({
        selector: selectorOf(source),
        relation: displayMode === "above" ? "siblingBefore" : "siblingAfter",
        containerTag: candidate.tagName.toLowerCase(),
        lang: candidate.getAttribute("lang"),
        style: candidate.getAttribute("data-ipt-style"),
        associated:
          candidate.getAttribute("data-ipt-unit") === source.getAttribute("data-ipt-unit") &&
          source.getAttribute("data-ipt") === "source",
        hasText: (candidate.textContent ?? "").trim().length > 0,
      });
    }
    return items;

    function selectorOf(element) {
      const path = [];
      let node = element;
      while (node && node.nodeType === 1 && path.length < 6) {
        const tag = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (!parent) {
          path.unshift(tag);
          break;
        }
        const sameTag = Array.from(parent.children).filter(
          (child) => child.tagName === node.tagName,
        );
        const index = sameTag.indexOf(node) + 1;
        path.unshift(tag + ":nth-of-type(" + index + ")");
        if (parent.tagName === "ARTICLE" || parent.tagName === "BODY") break;
        node = parent;
      }
      return path.join(" > ");
    }
  }, mode);
}

function layoutProblems(rects) {
  const problems = [];
  const sorted = [...rects].sort((a, b) => a.top - b.top);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) continue;
    const verticalOverlap = Math.min(previous.bottom, current.bottom) - Math.max(previous.top, current.top);
    const horizontalOverlap =
      Math.min(previous.right, current.right) - Math.max(previous.left, current.left);
    if (verticalOverlap > 1 && horizontalOverlap > 1) {
      problems.push("translated segments overlap by more than 1px");
    }
  }
  return problems;
}

async function verifyCapture(extension, stub, capture) {
  const pageUrl = stub.origin + "/pages/" + capture.page;
  const page = await extension.context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset["iptReady"] === "1");

  const baselineHash = await page.evaluate(domHashInPage, await page.$("body"));

  if (capture.restoreBaseline?.domHash === "RECORD") {
    // Only a synthetic example may be written back. A real capture is frozen: re-recording it
    // silently redefines "correct", which is exactly what the corpus exists to prevent.
    if (!capture.id.startsWith("_")) {
      await page.close();
      return { problems: ["refusing to record into a frozen capture; re-capture by hand"] };
    }
    const updated = { ...capture, restoreBaseline: { ...capture.restoreBaseline, domHash: baselineHash } };
    delete updated.path;
    delete updated.id;
    await writeFile(capture.path, JSON.stringify(updated, null, 2) + "\n");
    await page.close();
    return { problems: [], recordedHash: baselineHash };
  }

  await sendToPage(extension.context, pageUrl, { type: "translatePage" });
  await page.waitForFunction(() => document.querySelectorAll('[data-ipt="target"]').length > 0, undefined, {
    timeout: 30_000,
  });

  // A capture may pin the display style it was recorded with (SC-012). Applying it after the
  // translation also exercises the live restyle path.
  const capturedStyle = capture.displayStyle ?? "none";
  if (capturedStyle !== "none") {
    await sendToPage(extension.context, pageUrl, { type: "setDisplayStyle", style: capturedStyle });
    await page.waitForFunction(
      (style) => {
        const targets = Array.from(document.querySelectorAll('[data-ipt="target"]'));
        return targets.length > 0 && targets.every((target) => target.getAttribute("data-ipt-style") === style);
      },
      capturedStyle,
      { timeout: 10_000 },
    );
  }
  await page.waitForTimeout(500);

  const observed = await observe(page, capture.mode);
  if (capture.dump) console.log(JSON.stringify(observed, null, 2));
  const problems = compareSegments(capture, observed);

  const layout = await page.evaluate(() => ({
    horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    rects: Array.from(document.querySelectorAll('[data-ipt="target"]')).map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    }),
  }));
  if (layout.horizontalScroll) problems.push("page gained a horizontal scrollbar");
  problems.push(...layoutProblems(layout.rects));

  await sendToPage(extension.context, pageUrl, { type: "toggleTranslation" });
  await page.waitForFunction(() => document.querySelectorAll("[data-ipt]").length === 0, undefined, {
    timeout: 15_000,
  });
  const restoredHash = await page.evaluate(domHashInPage, await page.$("body"));
  if (capture.restoreBaseline?.domHash && restoredHash !== capture.restoreBaseline.domHash) {
    problems.push("restored DOM hash " + restoredHash + " != baseline " + capture.restoreBaseline.domHash);
  }
  await page.close();
  return { problems };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const captures = await loadCaptures(options);
  for (const capture of captures) capture.dump = options.dump;
  if (captures.length === 0) {
    console.error(
      [
        "BLOCKED: no reference captures under tests/fixtures/captures/.",
        "SC-011 cannot be judged without them. Task T010 (capture the corpus once, by hand, with the",
        "reference product installed) is outstanding. Use --include-example to exercise this script",
        "against the synthetic example only.",
      ].join("\n"),
    );
    process.exitCode = 2;
    return;
  }

  const stub = await startServer();
  const context = await chromium.launchPersistentContext("", {
    headless: process.env.PW_HEADLESS === "1",
    args: ["--disable-extensions-except=" + DIST, "--load-extension=" + DIST],
    viewport: { width: 1280, height: 800 },
  });
  let failures = 0;
  const rows = [];
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
    const extensionId = new URL(worker.url()).host;
    await seedProvider(context, stub.origin);
    const extension = { context, extensionId };

    for (const capture of captures) {
      const result = await verifyCapture(extension, stub, capture);
      if (result.recordedHash) {
        rows.push([capture.id, capture.mode, "recorded", result.recordedHash]);
        continue;
      }
      const status = result.problems.length === 0 ? "PASS" : "FAIL";
      if (result.problems.length > 0) failures += 1;
      rows.push([capture.id, capture.mode, status, result.problems.join("; ") || "-"]);
    }
  } finally {
    await context.close();
    await stub.close();
  }

  const width = [18, 12, 10, 60];
  const header = ["page", "mode", "result", "divergence"];
  const line = (cells) => cells.map((cell, index) => String(cell).padEnd(width[index])).join(" | ");
  console.log(line(header));
  console.log(width.map((size) => "-".repeat(size)).join("-+-"));
  for (const row of rows) console.log(line(row));
  console.log("");
  console.log(failures === 0 ? "rendering verification: PASS" : "rendering verification: " + failures + " divergence(s)");
  process.exitCode = failures === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}