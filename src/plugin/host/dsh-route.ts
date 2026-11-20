import { buildSystemInstruction } from "../../shared/prompt.js";
import type { ProviderErrorClass, UsageReport } from "../../shared/types.js";
import { mapBatchResults, type PagePlan, type PlannedBatch } from "./page-batch.js";
import type { PageTranslation, TranslateConfig } from "./translate.js";

/**
 * The second route to a provider: DSH's own model services instead of the reader's endpoint.
 *
 * A reader who signed into DSH already has a model, a provider route and its credential; asking them
 * for a second API key to translate their own answers is a second setup for the same capability. So
 * when the route is `dsh`, the plugin sends the same instruction and the same segment array through
 * `ctx.llm` and lets DSH resolve the credential (spec FR-009/FR-040 keep the prompt identical).
 *
 * The service is described structurally here rather than imported: the plugin stays a package that
 * compiles against no DSH internals, and the shapes below are the subset it actually uses.
 */

export interface DshModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface DshStreamChunk {
  type: string;
  text?: string | undefined;
  usage?: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined;
  reason?: { kind?: string | undefined; failure?: { message?: string | undefined; code?: string | undefined } | undefined } | undefined;
}

/** One model call; `stream` is the only member this plugin uses. */
export interface DshLlm {
  stream(options: {
    provider: string;
    model: string;
    reasoningEffort?: string;
    system?: string;
    messages: { role: "user"; content: { type: "text"; text: string }[] }[];
    temperature?: number;
    sessionId?: string;
    signal?: AbortSignal;
    purpose?: string;
  }): AsyncIterable<DshStreamChunk>;
}

export interface DshRoute {
  llm: DshLlm;
  /** The model DSH would use for a new agent, read at call time so a switch applies immediately. */
  selection: () => DshModelRoute | undefined;
}

/** Map a DSH failure onto the engine's error taxonomy, so a page reports one vocabulary. */
function classNameOf(failure: { message?: string | undefined; code?: string | undefined }): ProviderErrorClass {
  const text = `${failure.code ?? ""} ${failure.message ?? ""}`.toLowerCase();
  if (/auth|unauthor|invalid.?key|401|403/.test(text)) return "authRejected";
  if (/quota|credit|balance|billing|402/.test(text)) return "quotaExhausted";
  if (/rate.?limit|too.?many|429/.test(text)) return "rateLimited";
  if (/timeout|timed.?out/.test(text)) return "timeout";
  if (/abort|cancel/.test(text)) return "cancelled";
  if (/model|404/.test(text)) return "modelUnavailable";
  if (/invalid.?request|400/.test(text)) return "invalidRequest";
  return "serverError";
}

interface BatchOutcome {
  text: string;
  usage: UsageReport | undefined;
  failure: { errorClass: ProviderErrorClass; message: string } | undefined;
}

/** Stream one batch and collect its text, usage and terminal failure. */
async function callBatch(route: DshRoute, model: DshModelRoute, batch: PlannedBatch, system: string, timeoutMs: number, sessionId: string): Promise<BatchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let usageSeen = false;
  let failure: BatchOutcome["failure"];
  try {
    const chunks = route.llm.stream({
      provider: model.provider,
      model: model.model,
      ...(model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort }),
      system,
      messages: [{ role: "user", content: [{ type: "text", text: JSON.stringify(batch.segments.map((segment) => segment.text)) }] }],
      temperature: 0,
      sessionId,
      signal: controller.signal,
      purpose: "immersive-polyglot",
    });
    for await (const chunk of chunks) {
      if (chunk.type === "text-delta") { text += chunk.text ?? ""; continue; }
      if (chunk.type === "usage" && chunk.usage !== undefined) {
        usageSeen = true;
        promptTokens += chunk.usage.inputTokens ?? 0;
        completionTokens += chunk.usage.outputTokens ?? 0;
        continue;
      }
      if (chunk.type === "finish" && chunk.reason?.kind === "error") {
        const reported = chunk.reason.failure;
        failure = { errorClass: classNameOf(reported ?? {}), message: reported?.message ?? "The DSH model call failed." };
      }
    }
  } catch (error) {
    const aborted = controller.signal.aborted;
    failure =
      aborted
        ? { errorClass: "timeout", message: `No response within ${timeoutMs} ms` }
        : { errorClass: "unreachable", message: error instanceof Error ? error.message : "The DSH model call failed." };
  } finally {
    clearTimeout(timer);
  }
  return {
    text,
    usage: usageSeen ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } : undefined,
    failure,
  };
}

/**
 * Translate every batch of one page through DSH's model service.
 * @param plan - the page plan, identical to the own-endpoint route's.
 * @param config - the reader's language and glossary choices.
 * @param route - the LLM service plus the model selection to use.
 * @param sessionId - the Session whose credential and accounting the call belongs to.
 * @returns per-unit translations, request count, usage and per-unit failures.
 */
export async function translateWithDsh(plan: PagePlan, config: TranslateConfig, route: DshRoute, sessionId: string): Promise<PageTranslation> {
  const system = buildSystemInstruction({
    sourceLang: "auto",
    targetLang: config.targetLang,
    glossary: config.glossary.map((entry) => ({
      sourceTerm: entry.sourceTerm,
      targetTerm: entry.targetTerm,
      sourceLang: "auto",
      targetLang: config.targetLang,
      caseSensitive: entry.caseSensitive ?? false,
    })),
  });

  const model = route.selection();
  if (model === undefined) {
    return { byUnitId: new Map(), requests: 0, usage: undefined, failures: [{ unitIds: [], errorClass: "serverError", message: "No DSH model is selected." }] };
  }

  const byUnitId = new Map<string, string>();
  const failures: PageTranslation["failures"] = [];
  let requests = 0;
  let usage: UsageReport | undefined;

  for (const batch of plan.batches) {
    requests += 1;
    const outcome = await callBatch(route, model, batch, system, config.timeoutMs, sessionId);
    if (outcome.usage !== undefined) usage = outcome.usage;
    if (outcome.failure !== undefined) {
      failures.push({ unitIds: batch.segments.map((segment) => segment.unitId), ...outcome.failure });
      continue;
    }
    const parsed = parseArray(outcome.text, batch.segments.length);
    if (parsed.failedIndices.length > 0) {
      const failed = new Set(parsed.failedIndices);
      failures.push({
        unitIds: batch.segments.filter((_, index) => failed.has(index)).map((segment) => segment.unitId),
        errorClass: parsed.errorClass ?? "malformedResponse",
        message: "The model did not return a translation for every segment.",
      });
    }
    const mapped = mapBatchResults(batch, parsed.results);
    if (mapped.ok) for (const [unitId, text] of mapped.byUnitId) byUnitId.set(unitId, text);
  }

  return { byUnitId, requests, usage, failures };
}

/** The provider client's tolerant array parse, kept local so this module imports no egress code. */
function parseArray(content: string, expected: number): { results: { index: number; text: string }[]; failedIndices: number[]; errorClass?: ProviderErrorClass } {
  const trimmed = content.trim();
  const first = trimmed.indexOf("[");
  const last = trimmed.lastIndexOf("]");
  const candidate = first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  let parsed: unknown;
  try { parsed = JSON.parse(candidate); }
  catch { return { results: [], failedIndices: Array.from({ length: expected }, (_, index) => index), errorClass: "malformedResponse" }; }
  if (!Array.isArray(parsed)) return { results: [], failedIndices: Array.from({ length: expected }, (_, index) => index), errorClass: "malformedResponse" };
  const results: { index: number; text: string }[] = [];
  const failedIndices: number[] = [];
  for (let index = 0; index < expected; index += 1) {
    const value = parsed[index];
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length === 0) { failedIndices.push(index); continue; }
    results.push({ index, text });
  }
  return { results, failedIndices, ...(failedIndices.length === 0 ? {} : { errorClass: "emptyTranslation" as const }) };
}
