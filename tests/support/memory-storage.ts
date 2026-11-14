import type { StorageAreaLike } from "../../src/shared/settings.js";

/**
 * In-memory storage used by unit tests. It is intentionally dumb: every real-persistence
 * assertion lives in the e2e suite, which runs against chrome.storage.local in a real profile.
 */
export class MemoryStorageArea implements StorageAreaLike {
  #data: Record<string, unknown> = {};
  #failNextSet: Error | null = null;
  readonly writes: Record<string, unknown>[] = [];

  constructor(initial: Record<string, unknown> = {}) {
    this.#data = structuredClone(initial);
  }

  failNextSet(error: Error): void {
    this.#failNextSet = error;
  }

  get size(): number {
    return Object.keys(this.#data).length;
  }

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === null || keys === undefined) return structuredClone(this.#data);
    const wanted = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const key of wanted) {
      if (key in this.#data) out[key] = structuredClone(this.#data[key]);
    }
    return out;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    if (this.#failNextSet) {
      const error = this.#failNextSet;
      this.#failNextSet = null;
      throw error;
    }
    this.writes.push(structuredClone(items));
    Object.assign(this.#data, structuredClone(items));
  }

  async remove(keys: string | string[]): Promise<void> {
    const wanted = Array.isArray(keys) ? keys : [keys];
    for (const key of wanted) delete this.#data[key];
  }

  async clear(): Promise<void> {
    this.#data = {};
  }
}
