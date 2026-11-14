#!/usr/bin/env node
/**
 * Dev-only local provider + fixture host, for testing the extension in your own Chrome without a
 * real API key. It speaks the same OpenAI-compatible chat-completions shape the extension sends,
 * so the whole path (options → verify → translate → restore) is exercised for real.
 *
 * It ships nothing and is never part of dist/: it is a developer convenience only.
 *
 *   node scripts/dev-provider.mjs            # http://127.0.0.1:8787
 *   PORT=9000 node scripts/dev-provider.mjs
 *
 * Then in the extension's options page use:
 *   endpoint  http://127.0.0.1:8787/v1/chat/completions
 *   model     dev-model
 *   credential  any non-empty string
 * and open http://127.0.0.1:8787/pages/news-article-a.html
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGES = join(ROOT, "tests/fixtures/pages");
const PORT = Number(process.env.PORT ?? 8787);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const PAGE_NAMES = (await readFile(join(ROOT, "tests/fixtures/README.md"), "utf8"))
  .split("\n")
  .map((line) => /^\| ([a-z0-9-]+\.html) \|/.exec(line)?.[1])
  .filter(Boolean);

function translate(text) {
  // A visible, unmistakable marker so you can tell a real translation from this stub at a glance.
  return "【本地测试】" + text;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/") {
    const links = PAGE_NAMES.map((name) => `<li><a href="/pages/${name}">${name}</a></li>`).join("");
    response
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(`<!doctype html><meta charset="utf-8"><title>Dev pages</title>
<h1>Local fixture pages</h1>
<p>Provider endpoint: <code>http://127.0.0.1:${PORT}/v1/chat/completions</code>, model <code>dev-model</code>, any credential.</p>
<ul>${links}</ul>`);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/pages/")) {
    const file = normalize(join(PAGES, url.pathname.slice("/pages/".length)));
    if (!file.startsWith(PAGES)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { "content-type": MIME[extname(file)] ?? "text/plain" }).end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
    return;
  }

  if (url.pathname === "/favicon.ico") {
    response.writeHead(204).end();
    return;
  }

  if (request.method === "POST" && url.pathname.endsWith("/chat/completions")) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let segments = [];
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const user = body.messages?.find((message) => message.role === "user");
      const parsed = JSON.parse(user?.content ?? "[]");
      segments = Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      response.writeHead(400, { "content-type": "application/json" }).end(
        JSON.stringify({ error: { message: "expected a chat-completions body" } }),
      );
      return;
    }

    console.log(`  translated ${segments.length} segment(s) — first: ${JSON.stringify(segments[0] ?? "").slice(0, 60)}`);
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: JSON.stringify(segments.map(translate)) } }],
        }),
      );
    return;
  }

  response.writeHead(404).end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`dev provider on http://127.0.0.1:${PORT}`);
  console.log(`  endpoint: http://127.0.0.1:${PORT}/v1/chat/completions`);
  console.log("  model:    dev-model");
  console.log(`  pages:    http://127.0.0.1:${PORT}/`);
  console.log("Ctrl-C to stop.");
});
