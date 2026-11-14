import { describe, expect, it } from "vitest";
import {
  MessageError,
  parseCommand,
  parsePortRequest,
  parsePortResponse,
  type PortRequest,
} from "../../src/shared/messages.js";

const batch: PortRequest = {
  type: "translateBatch",
  requestId: "req-1",
  providerId: "p_1",
  segments: ["Hello", "World"],
  glossary: [
    {
      sourceTerm: "harbour",
      targetTerm: "港口",
      sourceLang: "en",
      targetLang: "zh",
      caseSensitive: false,
    },
  ],
  style: "Formal register.",
  sourceLang: "en",
  targetLang: "zh",
  timeoutMs: 60_000,
};

describe("port request guard", () => {
  it("accepts every declared request type", () => {
    const requests: PortRequest[] = [
      batch,
      { type: "verifyProvider", requestId: "req-2", providerId: "p_1" },
      { type: "cancel", requestId: "req-2" },
      { type: "ping" },
    ];
    for (const request of requests) {
      expect(parsePortRequest(request).type).toBe(request.type);
    }
  });

  it("rejects an unknown type instead of swallowing it", () => {
    expect(() => parsePortRequest({ type: "translateEverything" })).toThrowError(MessageError);
    try {
      parsePortRequest({ type: "translateEverything" });
    } catch (error) {
      expect((error as MessageError).code).toBe("unknownType");
    }
  });

  it("rejects a request missing its required fields", () => {
    const { segments: _segments, ...withoutSegments } = batch;
    expect(() => parsePortRequest(withoutSegments)).toThrowError(/segments/);
    expect(() => parsePortRequest({ ...batch, timeoutMs: "soon" })).toThrowError(/timeoutMs/);
  });

  it("refuses a payload that carries a credential field", () => {
    expect(() => parsePortRequest({ ...batch, secret: "sk-live-1" })).toThrowError(/secret/);
    try {
      parsePortRequest({ ...batch, secret: "sk-live-1" });
    } catch (error) {
      expect((error as MessageError).code).toBe("credentialField");
    }
    expect(() =>
      parsePortRequest({ ...batch, glossary: [{ ...batch.glossary[0], apiKey: "x" }] }),
    ).toThrowError(/apiKey/);
  });

  // Compile-time half of FR-021: the request type has no field that could carry a secret.
  it("does not admit a secret field in the batch payload type", () => {
    const rejected = () => {
      // @ts-expect-error - a credential must not be expressible in a translate payload
      const bad: PortRequest = { ...batch, secret: "sk-live-1" };
      return bad;
    };
    expect(() => parsePortRequest({ type: "ping" })).not.toThrow();
    expect(rejected).toBeTypeOf("function");
  });
});

describe("port response guard", () => {
  it("accepts every declared response type", () => {
    expect(parsePortResponse({ type: "chunk", requestId: "r", index: 0, text: "a" }).type).toBe("chunk");
    expect(
      parsePortResponse({ type: "batchResult", requestId: "r", results: [{ index: 0, text: "a" }] })
        .type,
    ).toBe("batchResult");
    expect(
      parsePortResponse({
        type: "batchError",
        requestId: "r",
        errorClass: "timeout",
        retryable: true,
        failedIndices: [0, 2],
        message: "timed out",
      }).type,
    ).toBe("batchError");
    expect(parsePortResponse({ type: "verifyResult", requestId: "r", ok: false }).type).toBe(
      "verifyResult",
    );
  });

  it("rejects an unknown response type", () => {
    expect(() => parsePortResponse({ type: "accepted", requestId: "r" })).toThrowError(/Unknown/);
  });
});

describe("command guard", () => {
  it("accepts the documented commands", () => {
    for (const type of [
      "translatePage",
      "translateSelection",
      "toggleTranslation",
      "cancelJob",
      "getJobStatus",
      "providerChanged",
      "clearLogs",
    ] as const) {
      expect(parseCommand({ type }).type).toBe(type);
    }
    expect(parseCommand({ type: "getCredentialMask", providerId: "p_1" }).type).toBe(
      "getCredentialMask",
    );
  });

  it("rejects an unknown command", () => {
    expect(() => parseCommand({ type: "translateAllTabs" })).toThrowError(MessageError);
  });

  it("refuses a command carrying a credential", () => {
    expect(() => parseCommand({ type: "translatePage", credential: "x" })).toThrowError(/credential/);
  });

  it("parses the style commands (FR-002, FR-019)", () => {
    expect(parseCommand({ type: "setDisplayStyle", style: "marker" })).toEqual({
      type: "setDisplayStyle",
      style: "marker",
    });
    expect(parseCommand({ type: "styleChanged", style: "quote" })).toEqual({
      type: "styleChanged",
      style: "quote",
    });
  });

  it("accepts an unknown style id but rejects a non-string one (FR-020)", () => {
    expect(parseCommand({ type: "setDisplayStyle", style: "gone" })).toMatchObject({ style: "gone" });
    expect(() => parseCommand({ type: "setDisplayStyle" })).toThrowError(/style/);
    expect(() => parseCommand({ type: "styleChanged", style: 3 })).toThrowError(/style/);
  });

  it("parses the typography commands and carries the pair verbatim (FR-019)", () => {
    const typography = { fontFamily: '"Source Han Serif SC", serif', fontScale: 125 };
    expect(parseCommand({ type: "typographyChanged", typography })).toEqual({
      type: "typographyChanged",
      typography,
    });
    expect(parseCommand({ type: "setTypography", typography })).toEqual({
      type: "setTypography",
      typography,
    });
  });

  it("refuses a malformed typography payload (FR-019)", () => {
    for (const payload of [
      {},
      { typography: null },
      { typography: [] },
      { typography: { fontFamily: 1, fontScale: 100 } },
      { typography: { fontFamily: "Georgia", fontScale: "125" } },
      { typography: { fontFamily: "Georgia", fontScale: Number.NaN } },
      { typography: { fontFamily: "Georgia", fontScale: Number.POSITIVE_INFINITY } },
      { typography: {} },
    ]) {
      expect(() => parseCommand({ type: "setTypography", ...payload }), JSON.stringify(payload)).toThrowError(
        MessageError,
      );
    }
  });

  it("still refuses a credential field inside a typography payload", () => {
    expect(() =>
      parseCommand({
        type: "typographyChanged",
        typography: { fontFamily: "Georgia", fontScale: 100, secret: "sk-live" },
      }),
    ).toThrowError(/secret/);
  });
});
