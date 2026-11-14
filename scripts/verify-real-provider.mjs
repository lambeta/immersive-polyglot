#!/usr/bin/env node
/**
 * T090 / constitution principle III: verify one REAL provider end to end, with the real extension
 * in a real browser. The stub proves the wire; only a real provider proves the product against a
 * vendor.
 *
 * It reads the key from the environment or from .env.local, never prints it, and makes one small
 * real translation (a three-paragraph fixture, a few hundred tokens).
 *
 *   printf 'DEEPSEEK_API_KEY=sk-...\n' > .env.local     # git-ignored
 *   npm run verify:real-provider
 *
 * Optional: DEEPSEEK_MODEL (default deepseek-chat), DEEPSEEK_ENDPOINT.
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const PAGES = join(ROOT, "tests/fixtures/pages");
const PAGE = process.env.REAL_PAGE ?? "blog-short.html";
const ENDPOINT = process.env.DEEPSEEK_ENDPOINT ?? "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

function readKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return "";
  const line = readFileSync(envPath, "utf8")
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("DEEPSEEK_API_KEY="));
  return line ? line.slice("DEEPSEEK_API_KEY=".length).trim().replace(/^["']|["']$/g, "") : "";
}

// readFileSync is imported below to keep the env parsing in one place.
import { readFileSync } from "node:fs";

const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8" };

async function startServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://local");
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
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404).end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const key = readKey();
if (key.length < 16) {
  console.error(
    [
      "BLOCKED: no DEEPSEEK_API_KEY.",
      "Put it in .env.local (git-ignored) or the environment; never in a commit or a chat message:",
      "  printf 'DEEPSEEK_API_KEY=sk-...' > .env.local",
      "Then re-run: npm run verify:real-provider",
    ].join("\n"),
  );
  process.exitCode = 2;
  process.exit();
}

const server = await startServer();
const context = await chromium.launchPersistentContext("", {
  headless: process.env.PW_HEADLESS === "1",
  args: ["--disable-extensions-except=" + DIST, "--load-extension=" + DIST],
  viewport: { width: 1280, height: 800 },
});

let failed = 0;
try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  const extensionId = new URL(worker.url()).host;

  const options = await context.newPage();
  await options.goto("chrome-extension://" + extensionId + "/ui/options/options.html");
  await options.evaluate(
    async ({ endpoint, model, secret }) => {
      await chrome.storage.local.set({
        schemaVersion: 1,
        providers: [
          {
            id: "p_real",
            name: "DeepSeek (real)",
            endpoint,
            model,
            extraHeaders: {},
            enabled: true,
            timeoutMs: 90000,
            maxConcurrency: 2,
          },
        ],
        credentials: {
          p_real: {
            providerId: "p_real",
            secret,
            masked: "••••" + secret.slice(-4),
            updatedAt: new Date().toISOString(),
          },
        },
        routing: { defaultProviderId: "p_real", rules: [] },
        sites: [],
        glossary: [],
        style: { instruction: "", temperature: 0 },
        limits: { maxConcurrency: 2, sessionCapSegments: 20, sessionCapChars: 0, siteCaps: {} },
        ui: { targetLang: "zh", sourceLang: "en", displayMode: "bilingual" },
      });
      await chrome.runtime.sendMessage({ type: "providerChanged" });
    },
    { endpoint: ENDPOINT, model: MODEL, secret: key },
  );
  await options.close();

  const pageUrl = server.origin + "/pages/" + PAGE;
  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset["iptReady"] === "1");

  const startedAt = Date.now();
  await worker.evaluate(
    async (url) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url?.startsWith(url));
      if (!tab?.id) throw new Error("no tab for " + url);
      await chrome.tabs.sendMessage(tab.id, { type: "translatePage" });
    },
    pageUrl,
  );

  await page.waitForFunction(() => document.querySelectorAll('[data-ipt="target"]').length > 0, undefined, {
    timeout: 120_000,
  });
  await page.waitForTimeout(3000);
  const elapsedMs = Date.now() - startedAt;

  const result = await page.evaluate(() => {
    const targets = Array.from(document.querySelectorAll('[data-ipt="target"]'));
    return {
      count: targets.length,
      texts: targets.map((node) => (node.textContent ?? "").trim()),
      lang: targets[0]?.getAttribute("lang") ?? null,
      placeholder: targets.some((node) => (node.textContent ?? "").includes("【译】")),
    };
  });

  const restored = await (async () => {
    await worker.evaluate(
      async (url) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((candidate) => candidate.url?.startsWith(url));
        if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "toggleTranslation" });
      },
      pageUrl,
    );
    await page.waitForFunction(() => document.querySelectorAll("[data-ipt]").length === 0, undefined, {
      timeout: 20_000,
    });
    return true;
  })();

  const checks = [
    ["endpoint reached over real HTTPS", result.count > 0],
    ["translations are non-empty", result.texts.every((text) => text.length > 0)],
    ["no stub marker in the output", !result.placeholder],
    ["target language announced", result.lang === "zh"],
    ["page restored with no residue", restored],
  ];

  console.log("real provider: " + MODEL + " @ " + new URL(ENDPOINT).host + "  page: " + PAGE);
  console.log("segments translated: " + result.count + "   first response: " + elapsedMs + " ms");
  for (const [index, text] of result.texts.slice(0, 3).entries()) {
    console.log("  [" + index + "] " + text.slice(0, 120).replace(/\s+/g, " "));
  }
  console.log("");
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label);
  }
  console.log("");
  console.log(failed === 0 ? "real provider verification: PASS" : "real provider verification: FAIL");
} catch (error) {
  failed += 1;
  console.error("real provider verification: ERROR — " + (error?.message ?? String(error)).slice(0, 400));
} finally {
  await context.close();
  await server.close();
}

process.exitCode = failed === 0 ? 0 : 1;
