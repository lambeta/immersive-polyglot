import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import { registerRoutes, type RouteDeps } from "../../../src/plugin/host/routes.js";
import type { RecordStore } from "../../../src/plugin/host/records.js";
import type { DshLlm, DshModelRoute } from "../../../src/plugin/host/dsh-route.js";

/**
 * The HTTP surface is the only thing the Client half calls, so these tests drive it the way the
 * browser does: a real request object, a real response object, and the marker header.
 */

const ORIGIN = "http://127.0.0.1:5039";

interface Call {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  origin?: string | undefined;
}

interface Answer {
  status: number;
  body: unknown;
}

function memoryStore(): RecordStore {
  const entries = new Map<string, unknown>();
  return {
    async get(key) {
      return entries.get(key);
    },
    async put(key, value) {
      entries.set(key, value);
    },
    async delete(key) {
      entries.delete(key);
    },
    async list(prefix) {
      return [...entries].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value }));
    },
  };
}

function answerMessage(id: string, text: string) {
  return { id, role: "assistant", content: [{ type: "text", text }] };
}

function harness(options: {
  secret?: string | undefined;
  route?: "own" | "dsh";
  dsh?: (() => { llm: DshLlm; selection: () => DshModelRoute | undefined } | undefined) | undefined;
} = {}) {
  const sessions = new Map([["s-1", [answerMessage("m-1", "Hello there.")]]]);
  const deps: RouteDeps = {
    sessions: {
      get(id: string) {
        const messages = sessions.get(id);
        return messages === undefined ? undefined : { deriveMessages: () => messages };
      },
    },
    records: memoryStore(),
    control: new Map<string, boolean>(),
    config: {
      route: options.route ?? "own",
      endpoint: "https://provider.test/chat",
      model: "test-model",
      targetLang: "zh",
      timeoutMs: 1000,
      maxAnswersPerPage: 12,
      maxCharsPerBatch: 6000,
      glossary: [],
    },
    secret: async () => ("secret" in options ? options.secret : "sk-test"),
    credential: {
      async describe() {
        return { configured: false, writable: true };
      },
      async store(value: string) {
        stored.push(value);
      },
      async clear() {
        stored.length = 0;
      },
    },
    diagnostics: [],
    ...(options.dsh === undefined ? {} : { dsh: options.dsh }),
    fetchImpl: async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(["你好。"]) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
  const stored: string[] = [];
  let handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined;
  const ctx = {
    webServer: {
      host: "127.0.0.1",
      port: "5039",
      register(spec: { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) {
        handler = spec.handler;
        return () => {
          handler = undefined;
        };
      },
    },
  } as unknown as Context;
  const unregister = registerRoutes(ctx, deps);

  async function call(input: Call): Promise<Answer> {
    const sent: { status: number; body: unknown } = { status: 0, body: undefined };
    const req = {
      method: input.method,
      url: `/immersive-polyglot/api/${input.path}`,
      headers: {
        "x-immersive-polyglot": "1",
        ...(input.origin === undefined ? { origin: ORIGIN } : input.origin === "" ? {} : { origin: input.origin }),
        ...input.headers,
      },
      on(event: string, listener: (chunk?: Buffer) => void) {
        if (event === "data" && input.body !== undefined) listener(Buffer.from(JSON.stringify(input.body)));
        if (event === "end") listener();
        return req;
      },
      destroy() {},
    } as unknown as IncomingMessage;
    const res = {
      writeHead(status: number) {
        sent.status = status;
      },
      end(text: string) {
        sent.body = JSON.parse(text);
      },
    } as unknown as ServerResponse;
    if (handler === undefined) throw new Error("routes were not registered");
    await handler(req, res);
    return sent;
  }

  return { call, deps, sessions, stored, unregister };
}

describe("the plugin's HTTP surface", () => {
  it("answers health with its version", async () => {
    const { call } = harness();
    expect(await call({ method: "GET", path: "health" })).toEqual({ status: 200, body: { ok: true, version: "0.1.0" } });
  });

  it("refuses a request from another origin and one without the marker header", async () => {
    const { call } = harness();
    expect((await call({ method: "GET", path: "state", origin: "http://evil.test" })).status).toBe(403);
    expect((await call({ method: "GET", path: "state", headers: { "x-immersive-polyglot": "" } })).status).toBe(403);
  });

  it("reports the empty Session state with a page limit", async () => {
    const { call } = harness();
    expect(await call({ method: "GET", path: "state?sessionId=s-1" })).toEqual({
      status: 200,
      body: { control: { on: false }, translated: [], pending: [], limits: { answers: 12 } },
    });
  });

  it("remembers the toggle per Session", async () => {
    const { call } = harness();
    await call({ method: "POST", path: "control", body: { sessionId: "s-1", on: true } });
    const state = await call({ method: "GET", path: "state?sessionId=s-1" });
    expect((state.body as { control: { on: boolean } }).control.on).toBe(true);
  });

  it("fails a page with the missing credential's class and never calls the provider", async () => {
    const { call } = harness({ secret: undefined });
    const answer = await call({ method: "POST", path: "page", body: { sessionId: "s-1", messageIds: ["m-1"] } });
    expect(answer.status).toBe(409);
    expect((answer.body as { error: { class: string } }).error.class).toBe("providerMissing");
  });

  it("translates one page and persists it, so the next state read sees the answer", async () => {
    const { call } = harness();
    const page = await call({ method: "POST", path: "page", body: { sessionId: "s-1", messageIds: ["m-1"] } });
    expect(page.status).toBe(200);
    const body = page.body as { results: { messageId: string; status: string; sections: { text: string }[] }[] };
    expect(body.results[0]?.status).toBe("translated");
    expect(body.results[0]?.sections[0]?.text).toBe("你好。");

    const state = await call({ method: "GET", path: "state?sessionId=s-1" });
    expect((state.body as { translated: { messageId: string }[] }).translated.map((item) => item.messageId)).toEqual(["m-1"]);
    const records = await call({ method: "GET", path: "records?sessionId=s-1" });
    expect((records.body as { records: { messageId: string }[] }).records[0]?.messageId).toBe("m-1");
  });

  it("reuses a current record instead of paying for the same answer twice", async () => {
    let calls = 0;
    const { call, deps } = harness();
    const original = deps.fetchImpl;
    if (original === undefined) throw new Error("the harness always installs a fetch stub");
    deps.fetchImpl = (async (...args: Parameters<typeof original>) => {
      calls += 1;
      return original(...args);
    }) as typeof original;

    const first = await call({ method: "POST", path: "page", body: { sessionId: "s-1", messageIds: ["m-1"] } });
    expect((first.body as { results: { status: string }[] }).results[0]?.status).toBe("translated");

    // Turning the toggle off and on sends the same page again: nothing to buy, same sections.
    const second = await call({ method: "POST", path: "page", body: { sessionId: "s-1", messageIds: ["m-1"] } });
    const body = second.body as { results: unknown[]; skipped: { messageId: string; reason: string }[]; requests: number };
    expect(body.results).toEqual([]);
    expect(body.skipped).toEqual([{ messageId: "m-1", reason: "alreadyTranslated" }]);
    expect(body.requests).toBe(0);
    expect(calls).toBe(1);
  });

  it("translates again when the answer changed since its record", async () => {
    const { call, sessions } = harness();
    await call({ method: "POST", path: "page", body: { sessionId: "s-1", messageIds: ["m-1"] } });

    sessions.set("s-1", [answerMessage("m-1", "Hello there, again.")]);
    const again = await call({ method: "POST", path: "page", body: { sessionId: "s-1", messageIds: ["m-1"] } });
    expect((again.body as { results: { status: string }[] }).results[0]?.status).toBe("translated");
  });

  it("translates through DSH's own model services without any plugin credential", async () => {
    const dsh = () => ({
      llm: {
        stream: () => (async function* () {
          yield { type: "text-delta", text: "[\"你好。\"]" } as const;
          yield { type: "finish", reason: { kind: "stop" } } as const;
        })(),
      },
      selection: () => ({ provider: "deepseek", model: "deepseek-chat" }),
    });
    const { call } = harness({ secret: undefined, route: "dsh", dsh });
    const page = await call({ method: "POST", path: "page", body: { sessionId: "s-1", messageIds: ["m-1"] } });
    expect(page.status).toBe(200);
    const body = page.body as { results: { status: string; sections: { text: string }[] }[] };
    expect(body.results[0]?.status).toBe("translated");
    expect(body.results[0]?.sections[0]?.text).toBe("你好。");

    const records = await call({ method: "GET", path: "records?sessionId=s-1" });
    const record = (records.body as { records: { provider: { model: string; endpointHost: string } }[] }).records[0];
    expect(record?.provider).toEqual({ model: "deepseek-chat", endpointHost: "dsh:deepseek" });
  });

  it("names the missing DSH model instead of blaming a credential", async () => {
    const { call } = harness({ secret: undefined, route: "dsh", dsh: () => undefined });
    const page = await call({ method: "POST", path: "page", body: { sessionId: "s-1", messageIds: ["m-1"] } });
    expect(page.status).toBe(409);
    expect((page.body as { error: { class: string; message: string } }).error).toMatchObject({
      class: "providerMissing",
      message: "DSH's model services are not available",
    });
  });

  it("rejects a page over the answer cap without contacting the provider", async () => {
    const { call, deps } = harness();
    (deps.config as { maxAnswersPerPage: number }).maxAnswersPerPage = 1;
    const answer = await call({ method: "POST", path: "page", body: { sessionId: "s-1", messageIds: ["m-1", "m-2"] } });
    expect(answer.status).toBe(422);
    expect((answer.body as { error: { class: string } }).error.class).toBe("capReached");
  });

  it("stores a credential through the injected secret store and never echoes it", async () => {
    const { call, stored } = harness();
    const put = await call({ method: "PUT", path: "credential", body: { value: "sk-stored" } });
    expect(put.status).toBe(200);
    expect(stored).toEqual(["sk-stored"]);
    expect(JSON.stringify(put.body)).not.toContain("sk-stored");
  });

  it("clears a stored credential", async () => {
    const { call, stored } = harness();
    await call({ method: "PUT", path: "credential", body: { value: "sk-stored" } });
    const cleared = await call({ method: "DELETE", path: "credential" });
    expect(cleared.status).toBe(200);
    expect(stored).toEqual([]);
  });

  it("keeps the last client-side crashes for diagnosis", async () => {
    const { call } = harness();
    await call({ method: "POST", path: "diag", body: { source: "slots", message: "boom", stack: "x".repeat(9000) } });
    const read = await call({ method: "GET", path: "diag" });
    const entries = (read.body as { entries: { message: string; stack: string }[] }).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toBe("boom");
    expect(entries[0]?.stack).toHaveLength(4000);
  });

  it("answers unknown operations with the plugin version hint", async () => {
    const { call } = harness();
    const answer = await call({ method: "GET", path: "nope" });
    expect(answer.status).toBe(404);
    expect((answer.body as { error: { recovery: string } }).error.recovery).toContain("plugin version");
  });
});
