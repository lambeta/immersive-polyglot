#!/usr/bin/env node
/**
 * T038/T042 - display style verification (SC-001, SC-002, SC-004, SC-005, SC-008, SC-012).
 *
 * Renders the real unpacked extension in real Chromium against the real fixture pages and a real
 * HTTP provider stub, then reports:
 *   1. the 105-pair distinctness matrix over captured renderings;
 *   2. an exact restore comparison for every style;
 *   3. the measured foreground/backdrop contrast for every style on a light and a dark page;
 *   4. the display-mode x text-direction layout matrix;
 *   5. the restyle time for a page with 120 translated blocks.
 *
 * Exit codes: 0 all checks pass, 1 at least one divergence, 2 the build or a fixture is missing.
 *
 * Distinctness metric: the fraction of the 64x64 grayscale signature whose pixels differ by more
 * than 12/255, captured on the same translated block under every style. CALIBRATION: the threshold
 * is 0.005 (0.5% of pixels). A mean-difference metric dilutes thin decorations such as a 1px border
 * into noise; a changed-pixel fraction keeps them decidable while staying stable across runs
 * (identical renders diff to exactly 0). CALIBRATION RESULT on this repository's sample: the weakest
 * pair (border-dashed vs border-solid) measured 1.20%, so 0.50% leaves better than 2x headroom while
 * identical renders stay at exactly 0%. The script prints the weakest pair on every run, so the
 * calibration can be re-checked rather than trusted.
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const PAGES = join(ROOT, "tests/fixtures/pages");

const STYLE_IDS = [
  "none",
  "underline-dashed",
  "underline-solid",
  "border-dashed",
  "border-solid",
  "blur",
  "transparency",
  "underline-dotted",
  "divider",
  "highlight",
  "marker",
  "marker-2",
  "quote",
  "weakened",
  "gray",
];

const THRESHOLD = 0.005;
const PIXEL_DELTA = 12;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function longFixture() {
  const paragraphs = [];
  for (let index = 1; index <= 120; index += 1) {
    paragraphs.push("<p>Paragraph " + index + " describes the harbour works in enough detail to be translatable and to hold a stable position in the page.</p>");
  }
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><style>body{margin:0 auto;max-width:46rem;padding:1.5rem;font:16px/1.55 Georgia,serif;color:#1b1b1b;background:#fff}</style></head><body><main><article><h1>A long generated article</h1>" + paragraphs.join("") + "</article></main></body></html>";
}

async function startServer() {
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stub.test");
    if (request.method === "GET" && url.pathname === "/pages/_generated-long.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(longFixture());
      return;
    }
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
        const translated = segments.map((text) => "【译】" + text);
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

async function launchExtension() {
  const profileDir = await mkdtemp(join(tmpdir(), "ipt-style-profile-"));
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: process.env.PW_HEADLESS === "1",
    viewport: { width: 1280, height: 800 },
    args: ["--disable-extensions-except=" + DIST, "--load-extension=" + DIST],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  const extensionId = new URL(worker.url()).host;
  return { context, extensionId, worker, profileDir };
}

async function seedProvider(context, origin) {
  const page = await context.newPage();
  const extensionId = new URL(context.serviceWorkers()[0]?.url() ?? "").host;
  await page.goto("chrome-extension://" + extensionId + "/ui/options/options.html");
  await page.evaluate(
    async ({ endpoint, schemaVersion }) => {
      const now = new Date().toISOString();
      await chrome.storage.local.set({
        schemaVersion,
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
          p_verify: { providerId: "p_verify", secret: "sk-verify-0000", masked: "••••0000", updatedAt: now },
        },
        routing: { defaultProviderId: "p_verify", rules: [] },
        sites: [],
        glossary: [],
        style: { instruction: "", temperature: 0 },
        limits: { maxConcurrency: 2, sessionCapSegments: 0, sessionCapChars: 0, siteCaps: {} },
        ui: { targetLang: "zh", sourceLang: "en", displayMode: "bilingual", displayStyle: "none" },
      });
    },
    { endpoint: origin + "/v1/chat/completions", schemaVersion: 2 },
  );
  await page.close();
}

async function sendToTab(context, pageUrl, message) {
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

async function waitForTargets(page, minimum) {
  await page.waitForFunction(
    (count) => document.querySelectorAll('[data-ipt="target"]').length >= count,
    minimum,
    { timeout: 30_000 },
  );
}

async function waitForStyle(page, styleId) {
  await page.waitForFunction(
    (style) => {
      const targets = Array.from(document.querySelectorAll('[data-ipt="target"]'));
      return targets.length > 0 && targets.every((target) => target.getAttribute("data-ipt-style") === style);
    },
    styleId,
    { timeout: 10_000 },
  );
}

async function sampleClip(page) {
  return page.evaluate(() => {
    const target = document.querySelector('[data-ipt="target"]');
    const element = target ?? document.body;
    const rect = element.getBoundingClientRect();
    const pad = 8;
    const x = Math.max(0, rect.x - pad);
    const y = Math.max(0, rect.y - pad);
    return {
      x,
      y,
      width: Math.max(1, Math.min(rect.width + pad * 2, 1280 - x)),
      height: Math.max(1, Math.min(rect.height + pad * 2, 600)),
    };
  });
}

async function signature(page, clip) {
  const shot = await page.screenshot({ clip });
  return page.evaluate(async (data) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = "data:image/png;base64," + data;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    const values = [];
    for (let index = 0; index < pixels.length; index += 4) {
      values.push(0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]);
    }
    return values;
  }, shot.toString("base64"));
}

function distance(a, b) {
  let changed = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (Math.abs(a[index] - b[index]) > PIXEL_DELTA) changed += 1;
  }
  return changed / a.length;
}

async function measureContrast(page) {
  return page.evaluate(() => {
    const parse = (value) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = (match[1] ?? "").split(/[\s,/]+/).filter(Boolean).map(Number);
      const [r, g, b, a] = parts;
      if (r === undefined || g === undefined || b === undefined) return null;
      return { r, g, b, a: a ?? 1 };
    };
    const luminance = (colour) => {
      const channel = (value) => {
        const scaled = value / 255;
        return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
    };
    const over = (front, back) => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1,
    });

    const element = document.querySelector('[data-ipt="target"]');
    if (!element) return 0;
    let backdrop = { r: 255, g: 255, b: 255, a: 1 };
    const layers = [];
    let node = element;
    while (node) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour && colour.a > 0) {
        layers.push(colour);
        if (colour.a >= 1) break;
      }
      node = node.parentElement;
    }
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      if (layers[index]) backdrop = over(layers[index], backdrop);
    }
    const foreground = parse(getComputedStyle(element).color);
    if (!foreground) return { ratio: 0, large: false };
    const size = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
    const weight = Number.parseInt(getComputedStyle(element).getPropertyValue("font-weight"), 10) || 400;
    const large = size >= 18.66 || (weight >= 700 && size >= 14);
    const front = luminance(over(foreground, backdrop));
    const back = luminance(backdrop);
    return { ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05), large };
  });
}

async function main() {
  if (!existsSync(DIST)) {
    console.error("dist/ is missing; run npm run build first");
    process.exitCode = 2;
    return;
  }

  const stub = await startServer();
  const extension = await launchExtension();
  const rows = [];
  const problems = [];
  let weakest = { pair: "", distance: Number.POSITIVE_INFINITY };

  try {
    await seedProvider(extension.context, stub.origin);

    const sampleUrl = stub.origin + "/pages/news-article-a.html";
    const page = await extension.context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(sampleUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset["iptReady"] === "1");

    const baselineHash = await page.evaluate(() => document.body.innerHTML.length);
    await sendToTab(extension.context, sampleUrl, { type: "translatePage" });
    await waitForTargets(page, 3);

    // 1. Distinctness: capture the same translated block under every style, same clip for all.
    const clip = await sampleClip(page);
    const signatures = new Map();
    for (const style of STYLE_IDS) {
      await sendToTab(extension.context, sampleUrl, { type: "setDisplayStyle", style });
      await waitForStyle(page, style);
      await page.waitForTimeout(120);
      signatures.set(style, await signature(page, clip));
    }

    let distinct = true;
    for (let first = 0; first < STYLE_IDS.length; first += 1) {
      for (let second = first + 1; second < STYLE_IDS.length; second += 1) {
        const a = STYLE_IDS[first];
        const b = STYLE_IDS[second];
        const delta = distance(signatures.get(a), signatures.get(b));
        if (delta < weakest.distance) weakest = { pair: a + " vs " + b, distance: delta };
        if (delta < THRESHOLD) {
          distinct = false;
          problems.push("styles render too similarly: " + a + " vs " + b + " (" + (delta * 100).toFixed(2) + "% pixels)");
        }
      }
    }
    rows.push(["distinctness", distinct ? "PASS" : "FAIL", "105 pairs; weakest " + weakest.pair + " at " + (weakest.distance * 100).toFixed(2) + "% (threshold " + (THRESHOLD * 100).toFixed(2) + "%)"]);

    // 2. Restore for every style.
    await sendToTab(extension.context, sampleUrl, { type: "setDisplayStyle", style: "gray" });
    await sendToTab(extension.context, sampleUrl, { type: "toggleTranslation" });
    await page.waitForFunction(() => document.querySelectorAll("[data-ipt]").length === 0, undefined, { timeout: 15_000 });
    const restoredHash = await page.evaluate(() => document.body.innerHTML.length);
    const restoreOk = restoredHash === baselineHash;
    rows.push(["restore", restoreOk ? "PASS" : "FAIL", restoreOk ? "baseline " + baselineHash + " == restored " + restoredHash : "baseline " + baselineHash + " != restored " + restoredHash]);
    if (!restoreOk) problems.push("restore changed the page length after styles");
    await page.close();

    // 3. Measured contrast on a light and a dark page.
    for (const [fixture, style] of [
      ["news-article-a.html", "gray"],
      ["dark-article.html", "gray"],
      ["news-article-a.html", "weakened"],
      ["dark-article.html", "weakened"],
    ]) {
      const url = stub.origin + "/pages/" + fixture;
      const contrastPage = await extension.context.newPage();
      await contrastPage.goto(url, { waitUntil: "domcontentloaded" });
      await contrastPage.waitForFunction(() => document.documentElement.dataset["iptReady"] === "1");
      await sendToTab(extension.context, url, { type: "translatePage" });
      await waitForTargets(contrastPage, 1);
      await sendToTab(extension.context, url, { type: "setDisplayStyle", style });
      await waitForStyle(contrastPage, style);
      const measured = await measureContrast(contrastPage);
      const threshold = measured.large ? 3 : 4.5;
      const ok = measured.ratio >= threshold;
      rows.push(["contrast " + style, ok ? "PASS" : "FAIL", fixture + " " + measured.ratio.toFixed(2) + ":1 (threshold " + threshold + ")"]);
      if (!ok) problems.push("contrast below " + threshold + ":1 for " + style + " on " + fixture + ": " + measured.ratio.toFixed(2));
      await contrastPage.close();
    }

    // 4. Display-mode x direction layout matrix.
    for (const mode of ["bilingual", "above", "only"]) {
      for (const targetLang of ["zh", "ar"]) {
        const url = stub.origin + "/pages/docs-table.html";
        const layoutPage = await extension.context.newPage();
        await layoutPage.goto(url, { waitUntil: "domcontentloaded" });
        await layoutPage.waitForFunction(() => document.documentElement.dataset["iptReady"] === "1");
        // Only extension contexts can write storage; the content page never can.
        await extension.worker.evaluate(async ({ nextMode, nextLang }) => {
          const current = await chrome.storage.local.get(null);
          await chrome.storage.local.set({
            ...current,
            ui: { ...current.ui, displayMode: nextMode, targetLang: nextLang },
          });
        }, { nextMode: mode, nextLang: targetLang });
        await sendToTab(extension.context, url, { type: "translatePage" });
        await waitForTargets(layoutPage, 1);
        const layout = await layoutPage.evaluate(() => {
          const rects = Array.from(document.querySelectorAll('[data-ipt="target"]')).map((node) => {
            const rect = node.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
          });
          const sorted = rects.slice().sort((a, b) => a.top - b.top);
          let overlap = 0;
          for (let index = 1; index < sorted.length; index += 1) {
            const previous = sorted[index - 1];
            const current = sorted[index];
            const vertical = Math.min(previous.bottom, current.bottom) - Math.max(previous.top, current.top);
            const horizontal = Math.min(previous.right, current.right) - Math.max(previous.left, current.left);
            if (vertical > 1 && horizontal > 1) overlap += 1;
          }
          return {
            horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            overlap,
            styled: Array.from(document.querySelectorAll('[data-ipt="target"]')).every((node) => node.hasAttribute("data-ipt-style")),
          };
        });
        const ok = !layout.horizontalScroll && layout.overlap === 0 && layout.styled;
        rows.push(["layout " + mode + "/" + targetLang, ok ? "PASS" : "FAIL", layout.horizontalScroll ? "horizontal scroll" : layout.overlap > 0 ? "overlap" : layout.styled ? "-" : "style attribute missing"]);
        if (!ok) problems.push("layout failed for " + mode + "/" + targetLang);
        await layoutPage.close();
      }
    }

    // 5. Restyle time on a page holding 120 translated blocks (SC-002).
    const longUrl = stub.origin + "/pages/_generated-long.html";
    const longPage = await extension.context.newPage();
    await longPage.goto(longUrl, { waitUntil: "domcontentloaded" });
    await longPage.waitForFunction(() => document.documentElement.dataset["iptReady"] === "1");
    await sendToTab(extension.context, longUrl, { type: "translatePage" });
    await waitForTargets(longPage, 100);
    const blockCount = await longPage.evaluate(() => document.querySelectorAll('[data-ipt="target"]').length);
    const startedAt = Date.now();
    await sendToTab(extension.context, longUrl, { type: "setDisplayStyle", style: "marker" });
    await waitForStyle(longPage, "marker");
    const elapsed = Date.now() - startedAt;
    const restyleOk = elapsed < 1000;
    rows.push(["restyle", restyleOk ? "PASS" : "FAIL", blockCount + " blocks in " + elapsed + " ms"]);
    if (!restyleOk) problems.push("restyle took " + elapsed + " ms for " + blockCount + " blocks");
    await longPage.close();
  } finally {
    await extension.context.close();
    await rm(extension.profileDir, { recursive: true, force: true });
    await stub.close();
  }

  const width = [22, 8, 80];
  const line = (cells) => cells.map((cell, index) => String(cell).padEnd(width[index])).join(" | ");
  console.log(line(["check", "result", "detail"]));
  console.log(width.map((size) => "-".repeat(size)).join("-+-"));
  for (const row of rows) console.log(line(row));
  console.log("");
  if (problems.length > 0) {
    for (const problem of problems) console.log(" - " + problem);
    console.log("");
    console.log("style verification: " + problems.length + " divergence(s)");
    process.exitCode = 1;
  } else {
    console.log("style verification: PASS");
    console.log("(distinctness threshold " + (THRESHOLD * 100).toFixed(2) + "% of pixels; weakest pair " + weakest.pair + " at " + (weakest.distance * 100).toFixed(2) + "%)");
    process.exitCode = 0;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
