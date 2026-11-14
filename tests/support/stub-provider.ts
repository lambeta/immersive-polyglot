import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

/**
 * A local provider the tests own, standing in for the user's real provider — the one boundary
 * this product does not own (constitution principle III). Everything else in the e2e suite is
 * real: Chromium, chrome.storage, HTTP, the DOM.
 *
 * It also serves the frozen fixture pages, so a page is loaded over real HTTP rather than
 * file:// (which Chrome refuses to let an extension touch without a user-granted flag).
 */

export type StubMode =
  | "success"
  | "authRejected"
  | "rateLimited"
  | "malformed"
  | "emptyStrings"
  | "slow"
  | "connectionReset"
  | "serverError"
  | "modelUnavailable"
  | "quotaExhausted"
  | "markup"
  | "fenced"
  | "shorterArray"
  | "longerArray"
  | "timeout";

export interface StubRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  at: number;
}

export interface StubOptions {
  mode?: StubMode;
  /** Number of leading requests that answer with the failure mode before succeeding. */
  failFirst?: number;
  /** Artificial latency, used by the timeout and cancellation tests. */
  latencyMs?: number;
  /** Replace the deterministic translation, per input text. */
  translate?: (text: string, index: number) => string;
  /** Directory whose files are served under /pages/. */
  staticDir?: string;
}

export interface StubProvider {
  origin: string;
  requests: StubRequest[];
  setMode(mode: StubMode, options?: { failFirst?: number; latencyMs?: number }): void;
  reset(): void;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function defaultTranslate(text: string): string {
  return `【译】${text}`;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function extractSegments(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const messages = (body as { messages?: { role?: string; content?: string }[] }).messages;
  if (!Array.isArray(messages)) return [];
  const user = messages.find((message) => message.role === "user");
  if (!user?.content) return [];
  try {
    const parsed: unknown = JSON.parse(user.content);
    if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
  } catch {
    return [user.content];
  }
  return [user.content];
}

export async function startStubProvider(options: StubOptions = {}): Promise<StubProvider> {
  let mode: StubMode = options.mode ?? "success";
  let failFirst = options.failFirst ?? 0;
  let latencyMs = options.latencyMs ?? 0;
  let served = 0;
  const requests: StubRequest[] = [];
  const translate = options.translate ?? ((text: string) => defaultTranslate(text));

  const server: Server = createServer((request, response) => {
    void handle(request, response);
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://stub.test");

    if (request.method === "GET" && options.staticDir && url.pathname.startsWith("/pages/")) {
      const fileName = url.pathname.slice("/pages/".length);
      const safe = normalize(join(options.staticDir, fileName));
      if (!safe.startsWith(options.staticDir)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      try {
        const file = await readFile(safe);
        response
          .writeHead(200, { "content-type": MIME[extname(safe)] ?? "application/octet-stream" })
          .end(file);
      } catch {
        response.writeHead(404).end("not found");
      }
      return;
    }

    if (request.method === "GET") {
      // The browser asks for a favicon on every navigation; answering it keeps a stray 405 out
      // of the console-error assertion that proves the extension is quiet.
      if (url.pathname === "/favicon.ico") {
        response.writeHead(204).end();
        return;
      }
      response.writeHead(404).end("not found");
      return;
    }

    if (request.method !== "POST") {
      response.writeHead(405).end("method not allowed");
      return;
    }

    const raw = await readBody(request);
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
    requests.push({ method: request.method, path: url.pathname, headers: request.headers, body, at: Date.now() });

    served += 1;
    // failFirst turns the configured failure into a transient one: the first N requests fail,
    // then the provider behaves, which is what the retry tests need.
    const activeMode: StubMode = failFirst > 0 && served > failFirst ? "success" : mode;

    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }

    const segments = extractSegments(body);
    const translated = segments.map((text, index) => translate(text, index));

    const json = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
      response
        .writeHead(status, { "content-type": "application/json", ...headers })
        .end(JSON.stringify(payload));
    };
    const completion = (content: string) =>
      json(200, { choices: [{ message: { role: "assistant", content } }] });

    switch (activeMode) {
      case "authRejected":
        json(401, { error: { message: "invalid api key" } });
        return;
      case "rateLimited":
        json(429, { error: { message: "rate limit" } }, { "retry-after": "1" });
        return;
      case "serverError":
        json(500, { error: { message: "boom" } });
        return;
      case "modelUnavailable":
        json(404, { error: { message: "model not found" } });
        return;
      case "quotaExhausted":
        json(402, { error: { message: "quota" } });
        return;
      case "malformed":
        json(200, { choices: [{ message: { content: "Sure! Here you go: not json at all" } }] });
        return;
      case "emptyStrings":
        completion(JSON.stringify(segments.map(() => "")));
        return;
      case "markup":
        completion(JSON.stringify(translated.map((text) => `<b>${text}</b><script>alert(1)</script>`)));
        return;
      case "fenced":
        completion("\u0060\u0060\u0060json\n" + JSON.stringify(translated) + "\n\u0060\u0060\u0060");
        return;
      case "shorterArray":
        completion(JSON.stringify(translated.slice(0, Math.max(0, translated.length - 1))));
        return;
      case "longerArray":
        completion(JSON.stringify([...translated, "extra"]));
        return;
      case "connectionReset":
        request.socket.destroy();
        return;
      case "slow":
      case "timeout":
        // Never answer; the client's own timeout must fire.
        return;
      case "success":
      default:
        completion(JSON.stringify(translated));
        return;
    }
  }

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("stub provider did not bind a port");
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    requests,
    setMode(nextMode, nextOptions = {}) {
      mode = nextMode;
      if (nextOptions.failFirst !== undefined) failFirst = nextOptions.failFirst;
      if (nextOptions.latencyMs !== undefined) latencyMs = nextOptions.latencyMs;
    },
    reset() {
      requests.length = 0;
      served = 0;
      failFirst = 0;
      latencyMs = 0;
      mode = options.mode ?? "success";
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.();
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
