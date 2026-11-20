/**
 * Adapt the durable domain table to the record store the routes and the record rules already speak,
 * so nothing above this file knows whether records came from memory or from disk.
 */

import type { KvTable } from "@deepseek-ai/dsh-storage-domain";
import type { RecordStore, TranslationRecord } from "./records.js";

/**
 * Build the store the Host passes to `registerRoutes` and `saveRecord`.
 * @param table - the domain's `translations` table, already opened and validated.
 * @returns a record store backed by that table.
 */
export function domainRecordStore(table: KvTable<string, TranslationRecord>): RecordStore {
  return {
    get: async (key) => table.get(key) ?? null,
    put: async (key, value) => { await table.put(key, value as TranslationRecord); },
    delete: async (key) => { await table.delete(key); },
    list: async (prefix) => [...table.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({ key, value })),
  };
}
