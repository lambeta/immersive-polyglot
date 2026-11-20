/**
 * The durable half of the Host: one storage domain holding the translation records, so reopening a
 * conversation paints from disk and never re-bills (spec FR-020, FR-021). The domain layer owns
 * versioning, backend routing and durability; this module only declares the shape.
 */

import { z } from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { parseRecord, type TranslationRecord } from "./records.js";

/** Domain name; the storage hub requires `[a-z][a-z0-9_]*`, so no hyphen and no dots. */
export const DOMAIN_NAME = "immersive_polyglot";

/** Table holding one record per translated answer. */
export const RECORDS_TABLE = "translations";

/**
 * Validate a stored record at the durable boundary.
 *
 * `parseRecord` is the single rule both sides share, so a value accepted on write is accepted on the
 * next open; anything else fails loud with `invalid-record` rather than reading as a guess.
 */
const recordSchema = z.unknown().transform((value, context): TranslationRecord => {
  const record = parseRecord(value);
  if (record === null) {
    context.addIssue({
      code: "custom",
      message: "Not a translation record (needs schemaVersion 1, sessionId, messageId, sourceHash, targetLang and sections)",
    });
    return z.NEVER;
  }
  return record;
});

/**
 * One record per answer, one file per record: translating one answer never rewrites a whole session,
 * and a corrupt file is backed up and skipped instead of blocking every later read.
 */
export const translationDomain = defineDomain({
  name: DOMAIN_NAME,
  version: 1,
  layout: "per-record",
  invalidRecords: "backup-and-skip",
  tables: {
    [RECORDS_TABLE]: domainTable<string, TranslationRecord>(recordSchema),
  },
});
