import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
/** The slice of the session service this route needs: look up a live session by id. */
export interface SessionLookup {
  get(id: string): { deriveMessages(): readonly unknown[] } | undefined;
}
import { extractAnswer, type SessionMessageLike } from "./answers.js";
import { planPage, type PageLimits, type PagePlan } from "./page-batch.js";
import { listSession, readCurrent, saveRecord, sectionsOf, type RecordStore, type TranslationRecord } from "./records.js";
import { translatePage, type PageTranslation } from "./translate.js";
import { translateWithDsh, type DshRoute } from "./dsh-route.js";
// The shipped manifest is the one authority on the plugin's version; inlining it at build time keeps
// `/api/health` honest across releases instead of pinning a number in the source.
import manifest from "../../../plugin/package.json";

/**
 * The plugin's only Client-facing surface: same-origin JSON routes on DSH's web server. The
 * credential, the session log and the records stay on this side (contracts/http-api.md §1).
 */

export interface RouteDeps {
  sessions: SessionLookup;
  records: RecordStore;
  control: Map<string, boolean>;
  config: {
    /** Where a page goes: DSH's own model services, or the reader's endpoint. */
    route: "own" | "dsh";
    endpoint: string;
    model: string;
    targetLang: string;
    timeoutMs: number;
    maxAnswersPerPage: number;
    maxCharsPerBatch: number;
    glossary: { sourceTerm: string; targetTerm: string; caseSensitive?: boolean }[];
  };
  /** Resolves the credential per request; never cached in a route. */
  secret: () => Promise<string | undefined>;
  /** DSH's model services, resolved per request so a switch applies without a reload. */
  dsh?: (() => DshRoute | undefined) | undefined;
  /** DSH's own secret store, so a credential never lives in the profile patch (FR-028). */
  credential?: {
    describe(): Promise<{ configured: boolean; writable: boolean; masked?: string; source?: string }>;
    store(value: string): Promise<void>;
    clear(): Promise<void>;
  };
  /** Client-side slot crashes reported for diagnosis; bounded ring. */
  diagnostics?: { at: string; source: string; message: string; stack: string }[];
  /** Injected by tests only, which own the provider boundary. */
  fetchImpl?: typeof fetch;
  now: () => Date;
}

const PREFIX = "/immersive-polyglot";
const MARKER = "x-immersive-polyglot";

type Failure = { error: { class: string; message: string; recovery: string; retriable: boolean } };

const failure = (status: number, cls: string, message: string, recovery: string, retriable = false): { status: number; body: Failure } =>
  ({ status, body: { error: { class: cls, message, recovery, retriable } } });

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

async function body(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(new Error("Body too large"), { class: "tooLarge" })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.length === 0) { resolve({}); return; }
      try { resolve(JSON.parse(text)); }
      catch { reject(Object.assign(new Error("Body is not JSON"), { class: "badRequest" })); }
    });
    req.on("error", reject);
  });
}

const stringField = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0) throw Object.assign(new Error(`${name} is required`), { class: "badRequest" });
  return value;
};

/** Session log → the messages a plugin may read. Derived messages are the supported public read. */
function messagesOf(deps: RouteDeps, sessionId: string): readonly SessionMessageLike[] | undefined {
  const session = deps.sessions.get(sessionId as never);
  if (session === undefined) return undefined;
  return session.deriveMessages() as unknown as readonly SessionMessageLike[];
}

interface RoutedTranslation {
  translated: PageTranslation;
  /** What the record names as the producer: a model id and where it came from. */
  model: string;
  endpointHost: string;
}

/**
 * Send one page down the configured route.
 *
 * `dsh` reuses the model the reader already configured in DSH, so translation needs no second
 * credential; `own` keeps the endpoint-and-own-key behaviour of contracts/provider-adapter.md.
 */
async function routedTranslation(deps: RouteDeps, plan: PagePlan, sessionId: string): Promise<RoutedTranslation | { status: number; body: Failure }> {
  const config = {
    endpoint: deps.config.endpoint,
    model: deps.config.model,
    targetLang: deps.config.targetLang,
    timeoutMs: deps.config.timeoutMs,
    glossary: deps.config.glossary,
  };
  if (deps.config.route === "dsh") {
    const dsh = deps.dsh?.();
    if (dsh === undefined) return failure(409, "providerMissing", "DSH's model services are not available", "Restart DSH so its model services mount, or use the plugin's own endpoint.");
    const selection = dsh.selection();
    if (selection === undefined) return failure(409, "providerMissing", "No DSH model is selected", "Choose a model in DSH settings, or use the plugin's own endpoint.");
    return { translated: await translateWithDsh(plan, config, dsh, sessionId), model: selection.model, endpointHost: `dsh:${selection.provider}` };
  }
  const secret = await deps.secret();
  if (secret === undefined) return failure(409, "providerMissing", "No credential is stored", "Save the provider credential in the plugin settings, or switch the plugin to DSH's model.");
  return {
    translated: await translatePage(plan, config, secret, deps.fetchImpl),
    model: config.model,
    endpointHost: new URL(config.endpoint).host,
  };
}

/** Translate one page of answers. */
async function translatePageRoute(deps: RouteDeps, input: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const sessionId = stringField(input["sessionId"], "sessionId");
  const requested = Array.isArray(input["messageIds"]) ? input["messageIds"] : [];
  const messageIds = requested.filter((value): value is string => typeof value === "string");
  if (messageIds.length === 0) return failure(400, "badRequest", "messageIds is empty", "Send the answers of the page you are reading.");
  if (messageIds.length > deps.config.maxAnswersPerPage) {
    return failure(422, "capReached", `A page may carry at most ${deps.config.maxAnswersPerPage} answers`, "Scroll to a smaller page and try again.");
  }

  const messages = messagesOf(deps, sessionId);
  if (messages === undefined) return failure(404, "invalidConfiguration", "That session is not available", "Open the conversation again.");

  const proses = [];
  const skipped: unknown[] = [];
  for (const messageId of messageIds) {
    const found = extractAnswer(messages, messageId);
    if (found.status !== "ready") {
      skipped.push({ messageId, reason: found.status });
      continue;
    }
    // A record that still describes this answer is reused, not paid for twice: turning the toggle
    // off and on again paints from storage. A changed answer has a different hash and is retranslated.
    const current = await readCurrent(deps.records, sessionId, messageId, found.prose.sourceHash);
    if (current !== null) skipped.push({ messageId, reason: "alreadyTranslated" });
    else proses.push(found.prose);
  }
  if (proses.length === 0) return { status: 200, body: { results: [], skipped, requests: 0 } };

  const limits: PageLimits = { maxAnswersPerPage: deps.config.maxAnswersPerPage, maxCharsPerBatch: deps.config.maxCharsPerBatch };
  const plan = planPage(proses, new Set(), limits);
  const routed = await routedTranslation(deps, plan, sessionId);
  if (!("translated" in routed)) return routed;
  const { translated } = routed;

  const batchId = `b-${deps.now().getTime()}`;
  const results: unknown[] = [];
  for (const prose of proses) {
    const sections = sectionsOf(prose.messageId, plan.batches.flatMap((batch) => batch.segments), translated.byUnitId);
    if (sections.length === 0) {
      const failed = translated.failures.find((item) => item.unitIds.some((unitId) => unitId.startsWith(`${prose.messageId}#`)));
      results.push({
        messageId: prose.messageId,
        status: "failed",
        failure: {
          class: failed?.errorClass ?? "malformedResponse",
          message: failed?.message ?? "The provider returned no translation for this answer.",
          recovery: "Try the page again.",
          retriable: true,
        },
      });
      continue;
    }
    const record: TranslationRecord = {
      schemaVersion: 1,
      sessionId,
      messageId: prose.messageId,
      targetLang: deps.config.targetLang,
      sourceHash: prose.sourceHash,
      sections,
      provider: { model: routed.model, endpointHost: routed.endpointHost },
      ...(translated.usage === undefined ? {} : { usage: translated.usage }),
      batchId,
      createdAt: deps.now().toISOString(),
      updatedAt: deps.now().toISOString(),
    };
    await saveRecord(deps.records, record);
    results.push({ messageId: prose.messageId, status: "translated", sections });
  }

  return {
    status: 200,
    body: {
      batchId,
      results,
      skipped: [...skipped, ...plan.skipped.map((item) => ({ messageId: item.messageId, reason: item.reason }))],
      requests: translated.requests,
      ...(translated.usage === undefined ? {} : { usage: translated.usage }),
    },
  };
}

/**
 * Mount the prefix on the DSH web server.
 * @returns a disposer removing it.
 */
export function registerRoutes(ctx: Context, deps: RouteDeps): () => void {
  return ctx.webServer.register({
    kind: "prefix",
    path: PREFIX,
    handler: async (req, res) => {
      const origin = req.headers.origin;
      if (origin !== undefined && origin !== `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`) {
        json(res, 403, failure(403, "badRequest", "Same-origin requests only", "Call from the DSH page.").body);
        return;
      }
      if (req.headers[MARKER] !== "1") {
        json(res, 403, failure(403, "badRequest", "Missing plugin request header", "Call through the plugin.").body);
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      const route = url.pathname.slice(PREFIX.length + "/api/".length);
      try {
        if (req.method === "GET" && route === "health") { json(res, 200, { ok: true, version: manifest.version }); return; }
        if (req.method === "GET" && route === "state") {
          const sessionId = url.searchParams.get("sessionId") ?? "";
          const records = await listSession(deps.records, sessionId);
          json(res, 200, {
            control: { on: deps.control.get(sessionId) ?? false },
            translated: records.map((record) => ({ messageId: record.messageId, targetLang: record.targetLang, stale: false })),
            pending: [],
            limits: { answers: deps.config.maxAnswersPerPage },
          });
          return;
        }
        if (req.method === "POST" && route === "diag") {
          const input = await body(req) as Record<string, unknown>;
          const ring = deps.diagnostics;
          if (ring !== undefined) {
            ring.push({
              at: deps.now().toISOString(),
              source: String(input["source"] ?? ""),
              message: String(input["message"] ?? ""),
              stack: String(input["stack"] ?? "").slice(0, 4000),
            });
            if (ring.length > 20) ring.splice(0, ring.length - 20);
          }
          json(res, 200, { ok: true });
          return;
        }
        if (req.method === "GET" && route === "diag") {
          json(res, 200, { entries: deps.diagnostics ?? [] });
          return;
        }
        if (req.method === "POST" && route === "control") {
          const input = await body(req) as Record<string, unknown>;
          const sessionId = stringField(input["sessionId"], "sessionId");
          const on = input["on"] === true;
          deps.control.set(sessionId, on);
          json(res, 200, { on });
          return;
        }
        if (route === "credential") {
          const store = deps.credential;
          if (store === undefined) {
            json(res, 501, failure(501, "unsupported", "The credential surface is not mounted", "Upgrade DSH and reload the plugin.").body);
            return;
          }
          if (req.method === "GET") { json(res, 200, await store.describe()); return; }
          if (req.method === "PUT") {
            const input = await body(req) as Record<string, unknown>;
            await store.store(stringField(input["value"], "value").trim());
            json(res, 200, await store.describe());
            return;
          }
          if (req.method === "DELETE") { await store.clear(); json(res, 200, await store.describe()); return; }
        }
        if (req.method === "GET" && route === "records") {
          const sessionId = url.searchParams.get("sessionId") ?? "";
          json(res, 200, { records: await listSession(deps.records, sessionId) });
          return;
        }
        if (req.method === "POST" && route === "page") {
          const input = await body(req) as Record<string, unknown>;
          const result = await translatePageRoute(deps, input);
          json(res, result.status, result.body);
          return;
        }
        json(res, 404, failure(404, "badRequest", "Unknown operation", "Check the plugin version.").body);
      } catch (error) {
        const cls = (error as { class?: string }).class ?? "badRequest";
        json(res, cls === "tooLarge" ? 413 : 400, failure(cls === "tooLarge" ? 413 : 400, cls, error instanceof Error ? error.message : "Request failed", "Fix the request and try again.").body);
      }
    },
  });
}
