/**
 * Durable translation records: one per translated answer, keyed by session and message identity, so
 * reopening a conversation paints from disk and never re-bills (spec FR-020, FR-021). The store is
 * injected, so the record rules are testable without DSH running; the Host adapts the storage domain
 * to this interface.
 */

export interface RecordStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<{ key: string; value: unknown }[]>;
}

export interface TranslationSection {
  blockIndex: number;
  kind: string;
  text: string;
}

export interface TranslationRecord {
  schemaVersion: 1;
  sessionId: string;
  messageId: string;
  targetLang: string;
  sourceHash: string;
  sections: TranslationSection[];
  provider: { model: string; endpointHost: string };
  usage?: { promptTokens?: number; completionTokens?: number };
  price?: { amount: number; currency: string; basis: string } | { unknown: string };
  batchId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Encode one identity as a path-safe segment.
 *
 * The durable backend stores one file per record and names it after the key, so a key may only carry
 * `[a-zA-Z0-9_-]`. Hex is that subset and injective, which keeps the encoding reversible in principle
 * and unambiguous in practice: no separator can occur inside a segment.
 */
function segment(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

/** The one spelling of a record key. */
export function recordKey(sessionId: string, messageId: string): string {
  return `${sessionKeyPrefix(sessionId)}${segment(messageId)}`;
}

/**
 * Every key of one session starts with this: hex is prefix-free, so the trailing `_` cannot be
 * matched by a shorter session id whose hex is a prefix of a longer one.
 */
export function sessionKeyPrefix(sessionId: string): string {
  return `${segment(sessionId)}_`;
}

/** Read a stored value as a current record; anything else reads as absent, never guessed. */
export function parseRecord(raw: unknown): TranslationRecord | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Partial<TranslationRecord>;
  if (record.schemaVersion !== 1) return null;
  if (typeof record.sessionId !== "string" || typeof record.messageId !== "string") return null;
  if (typeof record.sourceHash !== "string" || typeof record.targetLang !== "string") return null;
  if (!Array.isArray(record.sections)) return null;
  return record as TranslationRecord;
}

/** Store one record, replacing any previous translation of the same answer. */
export async function saveRecord(store: RecordStore, record: TranslationRecord): Promise<void> {
  await store.put(recordKey(record.sessionId, record.messageId), record);
}

/**
 * Read the record that still describes the answer.
 * @returns the record, or null when it is absent or stale (the answer changed).
 */
export async function readCurrent(
  store: RecordStore,
  sessionId: string,
  messageId: string,
  currentHash: string,
): Promise<TranslationRecord | null> {
  const record = parseRecord(await store.get(recordKey(sessionId, messageId)));
  if (record === null) return null;
  return record.sourceHash === currentHash ? record : null;
}

/** Every current record of one session, in no particular order. */
export async function listSession(store: RecordStore, sessionId: string): Promise<TranslationRecord[]> {
  const entries = await store.list(sessionKeyPrefix(sessionId));
  return entries.map((entry) => parseRecord(entry.value)).filter((record): record is TranslationRecord => record !== null);
}

/**
 * Build the sections of one answer from a page's translated text.
 * @param messageId - the answer being written.
 * @param segments - that answer's planned segments, in block order.
 * @param byUnitId - translated text per segment.
 */
export function sectionsOf(
  messageId: string,
  segments: readonly { unitId: string; messageId: string; blockIndex: number; text: string }[],
  byUnitId: ReadonlyMap<string, string>,
): TranslationSection[] {
  return segments
    .filter((segment) => segment.messageId === messageId)
    .map((segment) => {
      const text = byUnitId.get(segment.unitId);
      return text === undefined ? null : { blockIndex: segment.blockIndex, kind: "text", text };
    })
    .filter((section): section is TranslationSection => section !== null)
    .sort((a, b) => a.blockIndex - b.blockIndex);
}
