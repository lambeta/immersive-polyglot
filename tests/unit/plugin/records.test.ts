import { describe, expect, it } from "vitest";
import { listSession, readCurrent, recordKey, saveRecord, sectionsOf, sessionKeyPrefix } from "../../../src/plugin/host/records.js";
import type { RecordStore, TranslationRecord } from "../../../src/plugin/host/records.js";

class MemoryStore implements RecordStore {
  readonly map = new Map<string, unknown>();
  async get(key: string) { return this.map.get(key); }
  async put(key: string, value: unknown) { this.map.set(key, value); }
  async delete(key: string) { this.map.delete(key); }
  async list(prefix: string) { return [...this.map].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })); }
}

const record = (overrides: Partial<TranslationRecord> = {}): TranslationRecord => ({
  schemaVersion: 1, sessionId: "s-1", messageId: "m-1", targetLang: "zh", sourceHash: "sha256:aaa",
  sections: [{ blockIndex: 0, kind: "text", text: "你好" }], provider: { model: "deepseek-chat", endpointHost: "api.deepseek.com" },
  batchId: "b-1", createdAt: "2026-11-19T00:00:00.000Z", updatedAt: "2026-11-19T00:00:00.000Z", ...overrides,
});

describe("translation records", () => {
  it("keys a record by session and message", () => {
    expect(recordKey("s-1", "m-1")).toBe("732d31_6d2d31");
  });

  it("keeps every key path-safe, because the backend names one file per record", () => {
    const pairs: [string, string][] = [["s-1", "m-1"], ["sess:1/2", "msg:3"], ["会话/一", "回答:二"]];
    for (const [sessionId, messageId] of pairs) {
      expect(recordKey(sessionId, messageId)).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });

  it("starts every key of a session with that session's prefix, without matching a longer id", () => {
    expect(recordKey("s-1", "m-1").startsWith(sessionKeyPrefix("s-1"))).toBe(true);
    // "s-1" and "s-12" encode to prefixes of one another; the separator keeps them apart.
    expect(recordKey("s-12", "m-1").startsWith(sessionKeyPrefix("s-1"))).toBe(false);
  });

  it("round-trips and serves a record whose source hash still matches", async () => {
    const store = new MemoryStore();
    await saveRecord(store, record());
    const hit = await readCurrent(store, "s-1", "m-1", "sha256:aaa");
    expect(hit?.sections[0]?.text).toBe("你好");
  });

  it("never serves a stale record after the answer changed", async () => {
    const store = new MemoryStore();
    await saveRecord(store, record());
    expect(await readCurrent(store, "s-1", "m-1", "sha256:bbb")).toBeNull();
  });

  it("treats an unknown or newer schema as absent", async () => {
    const store = new MemoryStore();
    await store.put(recordKey("s-1", "m-9"), { ...record(), schemaVersion: 2 });
    expect(await readCurrent(store, "s-1", "m-9", "sha256:aaa")).toBeNull();
  });

  it("lists one session's records only", async () => {
    const store = new MemoryStore();
    await saveRecord(store, record());
    await saveRecord(store, record({ messageId: "m-2" }));
    await saveRecord(store, record({ sessionId: "s-2", messageId: "m-3" }));
    expect((await listSession(store, "s-1")).map((hit) => hit.messageId).sort()).toEqual(["m-1", "m-2"]);
  });

  it("groups a page's translated text into one answer's sections in block order", () => {
    const segments = [
      { unitId: "m-1#2", messageId: "m-1", blockIndex: 2, text: "c" },
      { unitId: "m-1#0", messageId: "m-1", blockIndex: 0, text: "a" },
      { unitId: "m-2#0", messageId: "m-2", blockIndex: 0, text: "x" },
    ];
    const mapped = new Map([["m-1#2", "丙"], ["m-1#0", "甲"], ["m-2#0", "叉"]]);
    expect(sectionsOf("m-1", segments, mapped).map((section) => section.text)).toEqual(["甲", "丙"]);
  });
});
