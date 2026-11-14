import { buildPage, type TestPage } from "./helpers.js";
import {
  TranslationJob,
  type BatchCaller,
  type BatchReply,
  type BatchRequestPayload,
} from "../../src/content/job.js";
import type { DisplayMode, Settings } from "../../src/shared/types.js";

/** Shared jsdom harness for job-level block tests. The caller is the only test double. */

export const PREFIX = "【译】";

export const settings: Settings = {
  schemaVersion: 2,
  providers: [
    {
      id: "p1",
      name: "fake",
      endpoint: "http://127.0.0.1:1/v1/chat/completions",
      model: "fake-model",
      extraHeaders: {},
      enabled: true,
      timeoutMs: 5_000,
      maxConcurrency: 2,
    },
  ],
  credentials: {},
  routing: { defaultProviderId: "p1", rules: [] },
  sites: [],
  glossary: [],
  style: { instruction: "", temperature: 0 },
  limits: { maxConcurrency: 2, sessionCapSegments: 0, sessionCapChars: 0, siteCaps: {} },
  ui: { targetLang: "zh", sourceLang: "en", displayMode: "bilingual" },
};

export const phrase =
  "the harbour records describe cargo moving inland by barge and the toll books list every crossing in the same hand for eleven years";
const sentences = [
  `Alpha ${phrase}, ${phrase}.`,
  `Bravo ${phrase}, ${phrase}, and the clerks copied each line twice.`,
  `Charlie ${phrase}, ${phrase}, although the columns changed in the spring.`,
  `Delta ${phrase}, ${phrase}, which the auditors never asked about.`,
];

export function longParagraph(): string {
  return sentences.join(" ");
}

export function abstractPage(): string {
  return `<article><section class="frontMatter"><p class="abstract">${longParagraph()}</p><p class="byline">By Maren Holt</p></section><p>Short.</p></article>`;
}

export class FakeCaller implements BatchCaller {
  readonly requests: BatchRequestPayload[] = [];
  readonly #order: (indices: number[]) => number[];

  constructor(order?: (indices: number[]) => number[]) {
    this.#order = order ?? ((indices) => indices);
  }

  async translate(payload: BatchRequestPayload): Promise<BatchReply> {
    this.requests.push(payload);
    const indices = payload.segments.map((_, index) => index);
    return {
      results: this.#order(indices).map((index) => ({
        index,
        text: `${PREFIX}${payload.segments[index] ?? ""}`,
      })),
      failedIndices: [],
    };
  }
}

/** Returns a translation for every part except the listed indices, which fail. */
export class FailingCaller implements BatchCaller {
  readonly requests: BatchRequestPayload[] = [];
  readonly #failed: number[];

  constructor(failed: number[]) {
    this.#failed = failed;
  }

  async translate(payload: BatchRequestPayload): Promise<BatchReply> {
    this.requests.push(payload);
    return {
      results: payload.segments.map((text, index) => ({ index, text: `${PREFIX}${text}` })),
      failedIndices: [...this.#failed],
    };
  }
}

/** Never answers; the job's own abort signal is the only way out. */
export class AbortableCaller implements BatchCaller {
  readonly requests: BatchRequestPayload[] = [];

  translate(payload: BatchRequestPayload, signal: AbortSignal): Promise<BatchReply> {
    this.requests.push(payload);
    return new Promise<BatchReply>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("cancelled"), { errorClass: "cancelled" }));
      });
    });
  }
}

/** Resolves only when the test releases it, so a mode switch can happen mid-flight. */
export class DeferredCaller implements BatchCaller {
  readonly requests: BatchRequestPayload[] = [];
  readonly #pending: Array<() => void> = [];

  async translate(payload: BatchRequestPayload): Promise<BatchReply> {
    this.requests.push(payload);
    return new Promise<BatchReply>((resolve) => {
      this.#pending.push(() => {
        resolve({
          results: payload.segments.map((text, index) => ({ index, text: `${PREFIX}${text}` })),
          failedIndices: [],
        });
      });
    });
  }

  release(): void {
    const pending = this.#pending.splice(0);
    for (const resolve of pending) resolve();
  }
}

export function startJob<C extends BatchCaller = FakeCaller>(
  html: string,
  options: {
    displayMode?: DisplayMode;
    caller?: C;
    targetLang?: string;
  } = {},
): { page: TestPage; job: TranslationJob; caller: C } {
  const page = buildPage(html);
  const caller = (options.caller ?? new FakeCaller()) as C;
  const job = new TranslationJob({
    document: page.document,
    root: page.body,
    settings,
    providerId: "p1",
    displayMode: options.displayMode ?? "bilingual",
    targetLang: options.targetLang ?? "zh",
    sourceLang: "en",
    caller,
    view: page.window,
  });
  return { page, job, caller };
}

export function partsOf(job: TranslationJob, element: Element): string[] {
  return job.units
    .filter((unit) => unit.domRef === element)
    .slice()
    .sort((left, right) => left.partIndex - right.partIndex)
    .map((unit) => `${PREFIX}${unit.sourceText}`);
}
