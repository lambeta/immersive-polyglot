import { sanitizeTranslatedText } from "../shared/sanitize.js";
import type {
  ProviderErrorClass,
  TranslationProvider,
} from "../shared/types.js";

/**
 * The only module that talks to a provider. It builds the request of
 * contracts/provider-adapter.md section 2, tolerantly unwraps the response of section 3, and
 * classifies every failure with the taxonomy of section 4.
 *
 * It is also the single egress point: `egressLog` records every outbound URL so a test can
 * assert that a page's text reached exactly one destination (FR-022).
 */

export type { ProviderErrorClass };

export interface ProviderConfig {
  id: string;
  endpoint: string;
  model: string;
  extraHeaders: Record<string, string>;
  timeoutMs: number;
}

export interface ProviderCall {
  provider: ProviderConfig;
  secret: string;
  systemInstruction: string;
  segments: string[];
  /** Optional external cancellation (user cancelled the job). */
  signal?: AbortSignal;
  /** Injected for tests: replaces the global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class ProviderError extends Error {
  readonly errorClass: ProviderErrorClass;
  readonly retryable: boolean;
  readonly status?: number;
  readonly failedIndices: number[];
  readonly retryAfterMs?: number;

  constructor(
    errorClass: ProviderErrorClass,
    message: string,
    options: {
      retryable?: boolean;
      status?: number;
      failedIndices?: number[];
      retryAfterMs?: number;
    } = {},
  ) {
    super(message);
    this.name = "ProviderError";
    this.errorClass = errorClass;
    this.retryable = options.retryable ?? RETRYABLE[errorClass];
    if (options.status !== undefined) this.status = options.status;
    this.failedIndices = options.failedIndices ?? [];
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

export const RETRYABLE: Record<ProviderErrorClass, boolean> = {
  unreachable: true,
  timeout: true,
  authRejected: false,
  rateLimited: true,
  quotaExhausted: false,
  modelUnavailable: false,
  malformedResponse: false,
  emptyTranslation: false,
  serverError: true,
  cancelled: false,
  invalidRequest: false,
};

export const egressLog: string[] = [];

export function clearEgressLog(): void {
  egressLog.length = 0;
}

export function buildRequestBody(
  provider: Pick<ProviderConfig, "model">,
  systemInstruction: string,
  segments: string[],
): string {
  return JSON.stringify({
    model: provider.model,
    temperature: 0,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: JSON.stringify(segments) },
    ],
  });
}

export function buildHeaders(provider: ProviderConfig, secret: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  // The credential binding owns Authorization; validation refuses an override (FR-001/FR-021).
  headers["authorization"] = `Bearer ${secret}`;
  for (const [name, value] of Object.entries(provider.extraHeaders)) {
    if (name.toLowerCase() === "authorization") continue;
    headers[name] = value;
  }
  return headers;
}

function retryAfterMs(headers: Headers): number | undefined {
  const header = headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

export function classifyStatus(status: number, body: string): ProviderErrorClass {
  const text = body.toLowerCase();
  if (status === 401 || status === 403) return "authRejected";
  if (status === 402) return "quotaExhausted";
  if (status === 404) return "modelUnavailable";
  if (status === 429) {
    return /quota|credit|balance|billing/.test(text) ? "quotaExhausted" : "rateLimited";
  }
  if (status === 400 || status === 422) {
    return /model/.test(text) ? "modelUnavailable" : "invalidRequest";
  }
  if (status >= 500) return "serverError";
  return "invalidRequest";
}

function unwrapContent(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;

  const choices = record["choices"];
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.["message"] as Record<string, unknown> | undefined;
    if (message && typeof message["content"] === "string") return message["content"];
    if (first && typeof first["text"] === "string") return first["text"];
  }
  if (typeof record["output_text"] === "string") return record["output_text"];
  if (typeof record["content"] === "string") return record["content"];
  return "";
}

/**
 * Section 3: accept an array of strings after unwrapping a fence, a prose line, or a single
 * array-valued key. Anything else is a parse outcome, never a guess.
 */
export function parseBatchOutput(
  content: string,
  expectedLength: number,
): { results: { index: number; text: string }[]; failedIndices: number[]; errorClass?: ProviderErrorClass; retryable: boolean } {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return {
      results: [],
      failedIndices: Array.from({ length: expectedLength }, (_, index) => index),
      errorClass: "malformedResponse",
      retryable: true,
    };
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  const candidate =
    firstBracket >= 0 && lastBracket > firstBracket
      ? trimmed.slice(firstBracket, lastBracket + 1)
      : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return {
      results: [],
      failedIndices: Array.from({ length: expectedLength }, (_, index) => index),
      errorClass: "malformedResponse",
      retryable: true,
    };
  }

  if (!Array.isArray(parsed)) {
    // A single array-valued key, which some providers wrap the result in.
    if (parsed && typeof parsed === "object") {
      const arrays = Object.values(parsed as Record<string, unknown>).filter(Array.isArray);
      if (arrays.length === 1) parsed = arrays[0];
    }
  }

  if (!Array.isArray(parsed)) {
    return {
      results: [],
      failedIndices: Array.from({ length: expectedLength }, (_, index) => index),
      errorClass: "malformedResponse",
      retryable: true,
    };
  }

  const strings = parsed.map((entry) => (typeof entry === "string" ? entry : ""));
  const results: { index: number; text: string }[] = [];
  const failedIndices: number[] = [];
  let emptySeen = false;

  for (let index = 0; index < expectedLength; index += 1) {
    const raw = strings[index];
    if (raw === undefined) {
      failedIndices.push(index);
      continue;
    }
    const text = sanitizeTranslatedText(raw);
    if (text.length === 0) {
      failedIndices.push(index);
      emptySeen = true;
      continue;
    }
    results.push({ index, text });
  }

  const missing = expectedLength - strings.length;
  const misaligned = strings.length > expectedLength;
  const missRate = expectedLength === 0 ? 0 : Math.max(missing, 0) / expectedLength;

  if (misaligned || missRate > 0.2) {
    return { results, failedIndices, errorClass: "malformedResponse", retryable: true };
  }
  if (failedIndices.length > 0) {
    return {
      results,
      failedIndices,
      errorClass: emptySeen ? "emptyTranslation" : "malformedResponse",
      retryable: false,
    };
  }
  return { results, failedIndices, retryable: false };
}

export interface BatchOutcome {
  results: { index: number; text: string }[];
  failedIndices: number[];
  errorClass?: ProviderErrorClass;
  retryable: boolean;
  retryAfterMs?: number;
}

export async function callProvider(request: ProviderCall): Promise<BatchOutcome> {
  const { provider, secret, systemInstruction, segments } = request;
  const timeoutMs = request.timeoutMs ?? provider.timeoutMs;
  const fetchImpl = request.fetchImpl ?? fetch;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    egressLog.push(provider.endpoint);
    const response = await fetchImpl(provider.endpoint, {
      method: "POST",
      headers: buildHeaders(provider, secret),
      body: buildRequestBody(provider, systemInstruction, segments),
      signal: controller.signal,
    });

    if (!response.ok) {
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "";
      }
      const errorClass = classifyStatus(response.status, body);
      throw new ProviderError(errorClass, `Provider responded ${response.status}`, {
        status: response.status,
        failedIndices: segments.map((_, index) => index),
        ...(response.status === 429
          ? { retryAfterMs: retryAfterMs(response.headers) ?? undefined }
          : {}),
      });
    }

    let payload: unknown;
    const rawBody = await response.text();
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = rawBody;
    }

    const content = unwrapContent(payload);
    return parseBatchOutput(content, segments.length);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (timedOut) {
      throw new ProviderError("timeout", `No response within ${timeoutMs} ms`, {
        failedIndices: segments.map((_, index) => index),
      });
    }
    if (request.signal?.aborted) {
      throw new ProviderError("cancelled", "Request cancelled by the user", {
        retryable: false,
        failedIndices: segments.map((_, index) => index),
      });
    }
    const message = (error as Error).message ?? "network failure";
    throw new ProviderError("unreachable", `Cannot reach provider: ${message}`, {
      failedIndices: segments.map((_, index) => index),
    });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** FR-003: a verification is the real path with one short segment, so success means it works. */
export async function verifyProviderConnection(
  request: Omit<ProviderCall, "segments">,
): Promise<{ ok: true } | { ok: false; errorClass: ProviderErrorClass }> {
  try {
    const outcome = await callProvider({ ...request, segments: ["Connection check"] });
    if (outcome.results.length > 0) return { ok: true };
    return { ok: false, errorClass: outcome.errorClass ?? "malformedResponse" };
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, errorClass: error.errorClass };
    return { ok: false, errorClass: "unreachable" };
  }
}

export function toProviderConfig(provider: TranslationProvider): ProviderConfig {
  return {
    id: provider.id,
    endpoint: provider.endpoint,
    model: provider.model,
    extraHeaders: provider.extraHeaders,
    timeoutMs: provider.timeoutMs,
  };
}
