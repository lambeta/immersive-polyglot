import { describe, expect, it } from "vitest";
import type { KvTable } from "@deepseek-ai/dsh-storage-domain";
import { domainRecordStore } from "../../../src/plugin/host/store.js";
import type { TranslationRecord } from "../../../src/plugin/host/records.js";

const record = (messageId: string, sessionId = "s-1"): TranslationRecord => ({
  schemaVersion: 1, sessionId, messageId, targetLang: "zh", sourceHash: "sha256:aaa",
  sections: [{ blockIndex: 0, kind: "text", text: "你好" }], provider: { model: "deepseek-chat", endpointHost: "api.deepseek.com" },
  batchId: "b-1", createdAt: "2026-11-19T00:00:00.000Z", updatedAt: "2026-11-19T00:00:00.000Z",
});

/** The slice of the domain table the store touches, so this test never opens a backend. */
function fakeTable(entries = new Map<string, TranslationRecord>()): KvTable<string, TranslationRecord> {
  return {
    get: (key) => entries.get(key),
    entries: () => entries.entries(),
    keys: () => entries.keys(),
    get size() { return entries.size; },
    put: async (key, value) => { entries.set(key, value); },
    delete: async (key) => entries.delete(key),
    deleteMany: async (keys) => {
      let removed = 0;
      for (const key of keys) if (entries.delete(key)) removed += 1;
      return removed;
    },
    update: async (key, fn) => {
      const current = entries.get(key);
      if (current === undefined) throw new Error("missing-key");
      const next = fn(current);
      entries.set(key, next);
      return next;
    },
  };
}

describe("domain record store", () => {
  it("writes through to the table and reads back", async () => {
    const store = domainRecordStore(fakeTable());
    await store.put("k-1", record("m-1"));
    expect(await store.get("k-1")).toEqual(record("m-1"));
  });

  it("reads an absent key as null, which the record rules treat as absent", async () => {
    expect(await domainRecordStore(fakeTable()).get("k-1")).toBeNull();
  });

  it("lists only the entries under the prefix", async () => {
    const store = domainRecordStore(fakeTable());
    await store.put("a_1", record("m-1"));
    await store.put("a_2", record("m-2"));
    await store.put("b_1", record("m-3"));
    const listed = await store.list("a_");
    expect(listed.map((entry) => entry.key).sort()).toEqual(["a_1", "a_2"]);
  });

  it("deletes one record", async () => {
    const store = domainRecordStore(fakeTable());
    await store.put("k-1", record("m-1"));
    await store.delete("k-1");
    expect(await store.get("k-1")).toBeNull();
  });
});
