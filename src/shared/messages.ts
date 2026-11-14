import type {
  DisplayMode,
  ErrorClass,
  GlossaryEntry,
  JobCounts,
  JobState,
  SessionUsageRecord,
  TranslationTypography,
} from "./types.js";

/**
 * The wire protocol of contracts/extension-messaging.md. This module is the only place that
 * decides whether an incoming object is a message, so an unknown type cannot be swallowed.
 */

export const PORT_NAME = "translate";

export type PortRequest =
  | {
      type: "translateBatch";
      requestId: string;
      providerId: string;
      segments: string[];
      glossary: GlossaryEntry[];
      style: string;
      sourceLang: string;
      targetLang: string;
      timeoutMs: number;
    }
  | { type: "verifyProvider"; requestId: string; providerId: string }
  | { type: "cancel"; requestId: string }
  | { type: "ping" };

export type PortResponse =
  | { type: "chunk"; requestId: string; index: number; text: string }
  | { type: "batchResult"; requestId: string; results: { index: number; text: string }[] }
  | {
      type: "batchError";
      requestId: string;
      errorClass: ErrorClass;
      retryable: boolean;
      failedIndices: number[];
      message: string;
    }
  | { type: "verifyResult"; requestId: string; ok: boolean; errorClass?: ErrorClass };

export interface JobStatusPayload {
  jobId: string | null;
  pageKey: string;
  providerId: string | null;
  state: JobState;
  counts: JobCounts;
  capReached: boolean;
  skipped: number;
  failure?: { errorClass: ErrorClass; message: string };
  brokenRules?: { rule: string; provider: string; using: string }[];
  usage?: SessionUsageRecord;
}

export type CommandMessage =
  | { type: "translatePage"; providerOverrideId?: string }
  | { type: "translateSelection" }
  | { type: "toggleTranslation" }
  | { type: "cancelJob" }
  | { type: "setDisplayMode"; mode: DisplayMode }
  | { type: "setDisplayStyle"; style: string }
  | { type: "styleChanged"; style: string }
  | { type: "typographyChanged"; typography: TranslationTypography }
  | { type: "setTypography"; typography: TranslationTypography }
  | { type: "getJobStatus" }
  | { type: "jobUpdated"; status: JobStatusPayload }
  | { type: "providerChanged" }
  | { type: "getCredentialMask"; providerId: string }
  | { type: "clearLogs" };

export type CredentialMaskReply = { masked: string | null };

export class MessageError extends Error {
  readonly code: "unknownType" | "invalidPayload" | "credentialField";

  constructor(code: "unknownType" | "invalidPayload" | "credentialField", message: string) {
    super(message);
    this.name = "MessageError";
    this.code = code;
  }
}

const PORT_REQUEST_TYPES = ["translateBatch", "verifyProvider", "cancel", "ping"] as const;
const PORT_RESPONSE_TYPES = ["chunk", "batchResult", "batchError", "verifyResult"] as const;
const COMMAND_TYPES = [
  "translatePage",
  "translateSelection",
  "toggleTranslation",
  "cancelJob",
  "setDisplayMode",
  "setDisplayStyle",
  "styleChanged",
  "typographyChanged",
  "setTypography",
  "getJobStatus",
  "jobUpdated",
  "providerChanged",
  "getCredentialMask",
  "clearLogs",
] as const;

const FORBIDDEN_KEYS = /^(secret|credential|credentials|apikey|api_key|authorization|token)$/i;

/**
 * Invariant 1 of the messaging contract, enforced rather than trusted: a payload carrying a
 * credential field is refused before it reaches any dispatcher.
 */
function assertNoCredentialFields(value: unknown, path = "payload"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCredentialFields(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.test(key)) {
        throw new MessageError(
          "credentialField",
          `Credential field "${key}" must never travel in a message (${path})`,
        );
      }
      assertNoCredentialFields(child, `${path}.${key}`);
    }
  }
}

function asRecord(value: unknown, type: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MessageError("invalidPayload", `${type} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(payload: Record<string, unknown>, field: string, type: string): string {
  const value = payload[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new MessageError("invalidPayload", `${type}.${field} must be a non-empty string`);
  }
  return value;
}

function requireNumber(payload: Record<string, unknown>, field: string, type: string): number {
  const value = payload[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MessageError("invalidPayload", `${type}.${field} must be a number`);
  }
  return value;
}

/** Feature 004 FR-019: the typography pair travels whole; a partial or mistyped one is refused. */
function requireTypography(
  payload: Record<string, unknown>,
  type: string,
): TranslationTypography {
  const value = payload["typography"];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MessageError("invalidPayload", `${type}.typography must be an object`);
  }
  const record = value as Record<string, unknown>;
  const fontFamily = record["fontFamily"];
  if (typeof fontFamily !== "string") {
    throw new MessageError("invalidPayload", `${type}.typography.fontFamily must be a string`);
  }
  const fontScale = record["fontScale"];
  if (typeof fontScale !== "number" || !Number.isFinite(fontScale)) {
    throw new MessageError("invalidPayload", `${type}.typography.fontScale must be a finite number`);
  }
  return { fontFamily, fontScale };
}

function requireArray(payload: Record<string, unknown>, field: string, type: string): unknown[] {
  const value = payload[field];
  if (!Array.isArray(value)) {
    throw new MessageError("invalidPayload", `${type}.${field} must be an array`);
  }
  return value;
}

function knownType<T extends string>(value: unknown, allowed: readonly T[], kind: string): T {
  if (typeof value !== "string") {
    throw new MessageError("unknownType", `${kind} must carry a string type`);
  }
  if (!(allowed as readonly string[]).includes(value)) {
    throw new MessageError("unknownType", `Unknown ${kind} type: ${value}`);
  }
  return value as T;
}

export function parsePortRequest(raw: unknown): PortRequest {
  const payload = asRecord(raw, "port request");
  assertNoCredentialFields(payload);
  const type = knownType(payload["type"], PORT_REQUEST_TYPES, "port request");

  switch (type) {
    case "translateBatch": {
      const segments = requireArray(payload, "segments", type);
      if (!segments.every((segment) => typeof segment === "string")) {
        throw new MessageError("invalidPayload", "translateBatch.segments must contain strings");
      }
      const glossary = requireArray(payload, "glossary", type);
      return {
        type,
        requestId: requireString(payload, "requestId", type),
        providerId: requireString(payload, "providerId", type),
        segments: segments as string[],
        glossary: glossary as GlossaryEntry[],
        style: typeof payload["style"] === "string" ? payload["style"] : "",
        sourceLang: requireString(payload, "sourceLang", type),
        targetLang: requireString(payload, "targetLang", type),
        timeoutMs: requireNumber(payload, "timeoutMs", type),
      };
    }
    case "verifyProvider":
      return {
        type,
        requestId: requireString(payload, "requestId", type),
        providerId: requireString(payload, "providerId", type),
      };
    case "cancel":
      return { type, requestId: requireString(payload, "requestId", type) };
    case "ping":
      return { type };
  }
}

export function parsePortResponse(raw: unknown): PortResponse {
  const payload = asRecord(raw, "port response");
  const type = knownType(payload["type"], PORT_RESPONSE_TYPES, "port response");
  switch (type) {
    case "chunk":
      return {
        type,
        requestId: requireString(payload, "requestId", type),
        index: requireNumber(payload, "index", type),
        text: typeof payload["text"] === "string" ? payload["text"] : "",
      };
    case "batchResult": {
      const results = requireArray(payload, "results", type);
      const parsed = results.map((entry) => {
        const item = asRecord(entry, "batchResult.results[]");
        return {
          index: requireNumber(item, "index", "batchResult.results[]"),
          text: typeof item["text"] === "string" ? item["text"] : "",
        };
      });
      return { type, requestId: requireString(payload, "requestId", type), results: parsed };
    }
    case "batchError": {
      const failedIndices = requireArray(payload, "failedIndices", type);
      return {
        type,
        requestId: requireString(payload, "requestId", type),
        errorClass: requireString(payload, "errorClass", type) as ErrorClass,
        retryable: payload["retryable"] === true,
        failedIndices: failedIndices.filter((index): index is number => typeof index === "number"),
        message: typeof payload["message"] === "string" ? payload["message"] : "",
      };
    }
    case "verifyResult": {
      const errorClass = payload["errorClass"];
      return {
        type,
        requestId: requireString(payload, "requestId", type),
        ok: payload["ok"] === true,
        ...(typeof errorClass === "string" ? { errorClass: errorClass as ErrorClass } : {}),
      };
    }
  }
}

export function parseCommand(raw: unknown): CommandMessage {
  const payload = asRecord(raw, "command");
  assertNoCredentialFields(payload);
  const type = knownType(payload["type"], COMMAND_TYPES, "command");

  switch (type) {
    case "getCredentialMask":
      return { type, providerId: requireString(payload, "providerId", type) };
    case "setDisplayMode":
      return {
        type,
        mode:
          payload["mode"] === "above" || payload["mode"] === "only" ? payload["mode"] : "bilingual",
      };
    case "setDisplayStyle":
    case "styleChanged": {
      // FR-020: an unknown id is accepted and resolves to `none`; a non-string is invalid.
      const style = payload["style"];
      if (typeof style !== "string") {
        throw new MessageError("invalidPayload", `${type}.style must be a string`);
      }
      return { type, style };
    }
    case "typographyChanged":
    case "setTypography":
      return { type, typography: requireTypography(payload, type) };
    case "translatePage":
      return typeof payload["providerOverrideId"] === "string" &&
        payload["providerOverrideId"].length > 0
        ? { type, providerOverrideId: payload["providerOverrideId"] }
        : { type };
    case "jobUpdated":
      return { type, status: payload["status"] as JobStatusPayload };
    default:
      return { type } as CommandMessage;
  }
}

export function isPortResponse(value: unknown): boolean {
  try {
    parsePortResponse(value);
    return true;
  } catch {
    return false;
  }
}
