import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureLoaded, sessionView, setControl, translate } from "../../../src/plugin/client/store.js";

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
  readonly headers: Record<string, string>;
}

/** Stub `fetch` with one responder and collect the calls it saw. */
function stubFetch(respond: (call: Call) => { status?: number; body: unknown }): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const call: Call = {
        url: String(input),
        method: init.method ?? "GET",
        body: init.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown),
        headers: (init.headers ?? {}) as Record<string, string>,
      };
      calls.push(call);
      const { status = 200, body } = respond(call);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

const RECORD = {
  schemaVersion: 1,
  sessionId: "s-1",
  messageId: "m-1",
  targetLang: "zh",
  sourceHash: "hash",
  sections: [{ blockIndex: 0, kind: "paragraph", text: "你好" }],
};

describe("the Client view store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the toggle, translations, and page size once", async () => {
    const calls = stubFetch((call) =>
      call.url.includes("/records")
        ? { body: { records: [RECORD] } }
        : { body: { control: { on: true }, translated: [{ messageId: "m-1" }], pending: [], limits: { answers: 3 } } },
    );
    ensureLoaded("s-load");
    ensureLoaded("s-load");
    await vi.waitFor(() => expect(sessionView("s-load").loaded).toBe(true));
    const view = sessionView("s-load");
    expect(view.control).toBe(true);
    expect(view.pageSize).toBe(3);
    expect(view.records["m-1"]).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.headers["x-immersive-polyglot"] === "1")).toBe(true);
  });

  it("records a page's sections and clears the pending set", async () => {
    stubFetch((call) =>
      call.url.includes("/page")
        ? {
            body: {
              results: [
                { messageId: "m-2", status: "translated", sections: [{ blockIndex: 0, kind: "paragraph", text: "第二段" }] },
                { messageId: "m-3", status: "failed", failure: { class: "providerMissing", message: "No credential" } },
              ],
              skipped: 0,
              requests: 1,
            },
          }
        : { body: { records: [] } },
    );
    ensureLoaded("s-page");
    await vi.waitFor(() => expect(sessionView("s-page").loaded).toBe(true));
    await translate("s-page", ["m-2", "m-3"]);
    const view = sessionView("s-page");
    expect(view.records["m-2"]?.[0]?.text).toBe("第二段");
    expect(view.pending.size).toBe(0);
    expect(view.failure).toBe("No credential");
  });

  it("reports an error body as the failure and keeps the control state", async () => {
    stubFetch((call) =>
      call.url.includes("/control")
        ? { status: 409, body: { error: { class: "providerMissing", message: "No credential is stored" } } }
        : { body: { records: [] } },
    );
    ensureLoaded("s-control");
    await vi.waitFor(() => expect(sessionView("s-control").loaded).toBe(true));
    await setControl("s-control", true);
    const view = sessionView("s-control");
    expect(view.control).toBe(false);
    expect(view.failure).toBe("No credential is stored");
  });

  it("does nothing for an empty page", async () => {
    const calls = stubFetch(() => ({ body: { records: [] } }));
    await translate("s-empty", []);
    expect(calls).toHaveLength(0);
    expect(sessionView("s-empty").pending.size).toBe(0);
  });
});
