import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-session";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import type {} from "@deepseek-ai/dsh-credentials";
import type {} from "@deepseek-ai/dsh-storage-domain";
import { RECORDS_TABLE, translationDomain } from "./domain.js";
import { registerRoutes } from "./routes.js";
import { domainRecordStore } from "./store.js";
import type { DshLlm, DshModelRoute } from "./dsh-route.js";

/**
 * The Host half of the plugin: it owns the credential, reads answers from the session log, calls the
 * reader's endpoint and keeps the translation records. It registers nothing the reader can see; that
 * is the Client half's job.
 */

export const name = "immersive-polyglot";

/** Services this plugin cannot work without; a profile missing one leaves it inactive (FR-005). */
export const inject = ["webServer", "sessions", "credentials", "storageDomain"];

export interface PluginConfig {
  /**
   * Where a page goes: `dsh` uses the model the reader already configured in DSH (no second
   * credential), `own` calls the endpoint below with the plugin's own credential.
   */
  route?: "own" | "dsh";
  endpoint?: string;
  model?: string;
  targetLang?: string;
  glossary?: { sourceTerm: string; targetTerm: string; caseSensitive?: boolean }[];
  maxAnswersPerPage?: number;
  maxCharsPerBatch?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

const CREDENTIAL = credentialRef("IMMERSIVE_POLYGLOT_API_KEY");

/** The credential surface the routes expose: DSH's own store, never the profile patch (FR-028). */
function credentialSurface(credentials: Context["credentials"]) {
  const describe = async () => {
    const info = await credentials.describe(CREDENTIAL);
    return {
      configured: info.configured,
      writable: info.writable,
      ...(info.masked === undefined ? {} : { masked: info.masked }),
      ...(info.source === undefined ? {} : { source: info.source }),
    };
  };
  return {
    describe,
    async store(value: string): Promise<void> { await credentials.set(CREDENTIAL, value); },
    async clear(): Promise<void> { await credentials.unset(CREDENTIAL); },
  };
}

const DEFAULTS = {
  route: "dsh" as "own" | "dsh",
  endpoint: "https://api.deepseek.com/chat/completions",
  model: "deepseek-chat",
  targetLang: "zh",
  maxAnswersPerPage: 12,
  maxCharsPerBatch: 6000,
  timeoutMs: 60000,
  maxRetries: 2,
};

/**
 * The settings this plugin accepts (data-model §1). Every field carries its documented default, so a
 * profile patch only names what the reader changed.
 */
export const Config: z<PluginConfig> = z.object({
  route: z.union([z.const("own"), z.const("dsh")]).default(DEFAULTS.route).description("Translate with DSH's own model services, or with the endpoint below and the plugin's credential."),
  endpoint: z.string().default(DEFAULTS.endpoint).description("Chat-completions endpoint of the provider."),
  model: z.string().default(DEFAULTS.model).description("Model id sent with every page."),
  targetLang: z.string().default(DEFAULTS.targetLang).description("Language the answers are translated into."),
  glossary: z.array(z.object({
    sourceTerm: z.string().required(),
    targetTerm: z.string().required(),
    caseSensitive: z.boolean().default(false),
  })).default([]).description("Terms the provider must translate the same way every time."),
  maxAnswersPerPage: z.number().min(1).default(DEFAULTS.maxAnswersPerPage).description("Answers one page may carry."),
  maxCharsPerBatch: z.number().min(1).default(DEFAULTS.maxCharsPerBatch).description("Source characters one provider request may carry."),
  timeoutMs: z.number().min(1).default(DEFAULTS.timeoutMs).description("Abort one provider request after this long."),
  maxRetries: z.number().min(0).default(DEFAULTS.maxRetries).description("Retries for one failed provider request."),
});

/**
 * Mount the plugin.
 * @param ctx - profile context.
 * @param config - the patch row's config, already filled with the defaults above (data-model §1).
 */
export function apply(ctx: Context, config: PluginConfig = {}): void {
  const settings = {
    route: config.route ?? DEFAULTS.route,
    endpoint: config.endpoint ?? DEFAULTS.endpoint,
    model: config.model ?? DEFAULTS.model,
    targetLang: config.targetLang ?? DEFAULTS.targetLang,
    glossary: config.glossary ?? [],
    maxAnswersPerPage: config.maxAnswersPerPage ?? DEFAULTS.maxAnswersPerPage,
    maxCharsPerBatch: config.maxCharsPerBatch ?? DEFAULTS.maxCharsPerBatch,
    timeoutMs: config.timeoutMs ?? DEFAULTS.timeoutMs,
    maxRetries: config.maxRetries ?? DEFAULTS.maxRetries,
  };

  /** Per-session switch, from the reader's client. Deliberately not durable: it is a reading mode. */
  const diagnostics: { at: string; source: string; message: string; stack: string }[] = [];
  const control = new Map<string, boolean>();

  ctx.effect(async () => {
    const domain = await ctx.storageDomain.open(translationDomain);
    let unregister: (() => void) | undefined;
    try {
      unregister = registerRoutes(ctx, {
        sessions: ctx.sessions,
        records: domainRecordStore(domain.table(RECORDS_TABLE)),
        diagnostics,
        control,
        config: settings,
        secret: async () => (await ctx.credentials.resolve(CREDENTIAL))?.value,
        dsh: () => {
          const llm = ctx.get("llm" as never) as unknown as DshLlm | undefined;
          const defaultModel = ctx.get("agentDefaultModel" as never) as unknown as { currentSelection(): DshModelRoute } | undefined;
          if (llm === undefined || defaultModel === undefined) return undefined;
          return { llm, selection: () => defaultModel.currentSelection() };
        },
        credential: credentialSurface(ctx.credentials),
        now: () => new Date(),
      });
    } catch (error) {
      await domain.close();
      throw error;
    }
    return async () => {
      unregister?.();
      await domain.close();
    };
  }, "immersive-polyglot: records and routes");
}
