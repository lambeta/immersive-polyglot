import { callProvider, ProviderError, type ProviderConfig } from "../../background/provider-client.js";
import { buildSystemInstruction } from "../../shared/prompt.js";
import type { UsageReport } from "../../shared/types.js";
import { mapBatchResults, type PagePlan, type PlannedSegment } from "./page-batch.js";

/**
 * The one place the plugin talks to the reader's endpoint. It reuses the extension's provider client
 * and instruction, so the two surfaces send the same request shape (FR-009, FR-040) and a failure
 * carries the same class the extension would report.
 */

export interface TranslateConfig {
  endpoint: string;
  model: string;
  targetLang: string;
  timeoutMs: number;
  glossary: { sourceTerm: string; targetTerm: string; caseSensitive?: boolean }[];
}

export interface PageTranslation {
  /** Translated text per unit id, for the units that succeeded. */
  byUnitId: Map<string, string>;
  requests: number;
  usage: UsageReport | undefined;
  failures: { unitIds: string[]; errorClass: ProviderError["errorClass"]; message: string; retryAfterMs?: number }[];
}

function providerOf(config: TranslateConfig): ProviderConfig {
  return { id: "immersive-polyglot", endpoint: config.endpoint, model: config.model, extraHeaders: {}, timeoutMs: config.timeoutMs };
}

/**
 * Translate every batch of one page.
 * @param plan - the page plan.
 * @param config - the reader's configuration.
 * @param secret - the credential, read from the credential store per call.
 * @param fetchImpl - injected only by tests, which own the provider boundary.
 * @returns per-unit translations, request count, usage and per-unit failures.
 */
export async function translatePage(
  plan: PagePlan,
  config: TranslateConfig,
  secret: string,
  fetchImpl?: typeof fetch,
): Promise<PageTranslation> {
  const systemInstruction = buildSystemInstruction({
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

  const byUnitId = new Map<string, string>();
  const failures: PageTranslation["failures"] = [];
  let requests = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let usageSeen = false;

  for (const batch of plan.batches) {
    requests += 1;
    try {
      const outcome = await callProvider({
        provider: providerOf(config),
        secret,
        systemInstruction,
        segments: batch.segments.map((segment: PlannedSegment) => segment.text),
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
        timeoutMs: config.timeoutMs,
      });
      if (outcome.usage !== undefined) {
        usageSeen = true;
        promptTokens += outcome.usage.promptTokens ?? 0;
        completionTokens += outcome.usage.completionTokens ?? 0;
      }
      if (outcome.failedIndices.length > 0) {
        const failed = new Set(outcome.failedIndices);
        const unitIds = batch.segments.filter((_, index) => failed.has(index)).map((segment) => segment.unitId);
        failures.push({
          unitIds,
          errorClass: outcome.errorClass ?? "malformedResponse",
          message: "The provider did not return a translation for every segment.",
          ...(outcome.retryAfterMs === undefined ? {} : { retryAfterMs: outcome.retryAfterMs }),
        });
      }
      const mapped = mapBatchResults(batch, outcome.results);
      if (mapped.ok) for (const [unitId, text] of mapped.byUnitId) byUnitId.set(unitId, text);
    } catch (error) {
      const failure = error instanceof ProviderError
        ? { errorClass: error.errorClass, message: error.message, ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }) }
        : { errorClass: "unreachable" as const, message: error instanceof Error ? error.message : "The provider call failed." };
      failures.push({ unitIds: batch.segments.map((segment) => segment.unitId), ...failure });
    }
  }

  return {
    byUnitId,
    requests,
    usage: usageSeen ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } : undefined,
    failures,
  };
}
