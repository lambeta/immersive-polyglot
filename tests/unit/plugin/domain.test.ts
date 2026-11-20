import { describe, expect, it } from "vitest";
import { DOMAIN_NAME, RECORDS_TABLE, translationDomain } from "../../../src/plugin/host/domain.js";
import type { TranslationRecord } from "../../../src/plugin/host/records.js";

const record = (overrides: Partial<TranslationRecord> = {}): TranslationRecord => ({
  schemaVersion: 1, sessionId: "s-1", messageId: "m-1", targetLang: "zh", sourceHash: "sha256:aaa",
  sections: [{ blockIndex: 0, kind: "text", text: "你好" }], provider: { model: "deepseek-chat", endpointHost: "api.deepseek.com" },
  batchId: "b-1", createdAt: "2026-11-19T00:00:00.000Z", updatedAt: "2026-11-19T00:00:00.000Z", ...overrides,
});

/** The schema the durable boundary runs over every stored value. */
const schema = translationDomain.tables[RECORDS_TABLE].valueSchema;

describe("translation domain", () => {
  it("names the domain in the shape the storage hub accepts", () => {
    expect(DOMAIN_NAME).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(translationDomain.name).toBe(DOMAIN_NAME);
    expect(translationDomain.version).toBe(1);
  });

  it("stores one file per record and keeps a corrupt one as a backup instead of blocking the domain", () => {
    expect(translationDomain.layout).toBe("per-record");
    expect(translationDomain.invalidRecords).toBe("backup-and-skip");
  });

  it("declares exactly the translations table", () => {
    expect(Object.keys(translationDomain.tables)).toEqual([RECORDS_TABLE]);
  });

  it("accepts a record this plugin wrote", () => {
    const parsed = schema.safeParse(record());
    expect(parsed.success).toBe(true);
    expect((parsed.data as TranslationRecord).sections[0]?.text).toBe("你好");
  });

  it("rejects a value that is not a record, so a corrupt file never reads as a translation", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse(record({ schemaVersion: 2 as 1 })).success).toBe(false);
    expect(schema.safeParse("translations").success).toBe(false);
  });
});
