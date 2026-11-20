/** Wire shapes and the Host HTTP client behind the Client half's two surfaces. */

/** One translated section of one answer, as the Host stores and returns it. */
export interface TranslationSection {
  blockIndex: number;
  kind: string;
  text: string;
}

/** One persisted answer translation, as `/api/records` returns it. */
export interface TranslationRecord {
  schemaVersion: number;
  sessionId: string;
  messageId: string;
  targetLang: string;
  sourceHash: string;
  sections: readonly TranslationSection[];
}

/** One answer's outcome inside a `/api/page` response. */
export type PageResult =
  | { readonly messageId: string; readonly status: "translated"; readonly sections: readonly TranslationSection[] }
  | { readonly messageId: string; readonly status: "failed"; readonly failure: { readonly class: string; readonly message: string } };

/** `/api/state`: the toggle, already-translated answers, and answers in flight. */
export interface StateResponse {
  readonly control: { readonly on: boolean };
  readonly translated: readonly { readonly messageId: string }[];
  readonly pending: readonly string[];
  /** Effective per-page limits of the Host configuration, when the Host reports them. */
  readonly limits?: { readonly answers: number };
}

/** `/api/records`: every current translation of one Session. */
export interface RecordsResponse {
  readonly records: readonly TranslationRecord[];
}

/** `/api/page`: what one page attempt produced. */
export interface PageResponse {
  readonly results: readonly PageResult[];
  readonly skipped: number;
  readonly requests: number;
}

/** A Host refusal: `failureClass` is the Host's error class (`providerMissing`, `capReached`, ...). */
export class RequestFailure extends Error {
  readonly failureClass: string;

  constructor(failureClass: string, message: string) {
    super(message);
    this.name = "RequestFailure";
    this.failureClass = failureClass;
  }
}

const BASE = "/immersive-polyglot/api";
const MARKER = { "x-immersive-polyglot": "1", "content-type": "application/json" };

interface ErrorBody {
  readonly error?: { readonly class?: string; readonly message?: string };
}

/**
 * Call one Host endpoint with the plugin's required header and same-origin credentials.
 * @param path - endpoint path below `/immersive-polyglot/api`.
 * @param init - fetch options; the plugin headers are added.
 * @returns the decoded body on success.
 * @throws RequestFailure on any Host error body or transport failure.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: "same-origin",
      ...init,
      headers: { ...MARKER, ...(init.headers ?? {}) },
    });
  } catch (error) {
    throw new RequestFailure("transport", error instanceof Error ? error.message : "The plugin request failed");
  }
  const payload = (await response.json().catch(() => null)) as (T & ErrorBody) | null;
  const failure = payload?.error;
  if (failure !== undefined) {
    throw new RequestFailure(failure.class ?? "badRequest", failure.message ?? "The plugin request failed");
  }
  if (payload === null) throw new RequestFailure("badRequest", `The plugin request failed (${String(response.status)})`);
  return payload;
}

/** The Host endpoints, one function each. */
export const api = {
  diag: (input: { source: string; message: string; stack: string }): Promise<unknown> =>
    request("/diag", { method: "POST", body: JSON.stringify(input) }),
  state: (sessionId: string): Promise<StateResponse> => request(`/state?sessionId=${encodeURIComponent(sessionId)}`),
  records: (sessionId: string): Promise<RecordsResponse> => request(`/records?sessionId=${encodeURIComponent(sessionId)}`),
  control: (sessionId: string, on: boolean): Promise<unknown> =>
    request("/control", { method: "POST", body: JSON.stringify({ sessionId, on }) }),
  page: (sessionId: string, messageIds: readonly string[]): Promise<PageResponse> =>
    request("/page", { method: "POST", body: JSON.stringify({ sessionId, messageIds }) }),
};
