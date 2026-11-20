/**
 * The Client half: two surfaces in the conversation — a session-header control that translates this
 * page, and a turn tail that shows each translated answer below it.
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-chat/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import { HeaderControl } from "./HeaderControl.js";
import { api } from "./api.js";
import { TurnTranslation } from "./TurnTranslation.js";
import { NS, en, zh, type Key } from "./locales.js";
import { installStyle } from "./styles.js";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap { immersivePolyglot: Key }
}

export const inject = ["slots", "locale"];

const HEADER_CONTROL = "immersive-polyglot-control";
const TURN_SECTIONS = "immersive-polyglot-sections";

/**
 * Mount the Client plugin.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "immersive-polyglot: dictionaries");
  ctx.effect(() => installStyle(), "immersive-polyglot: styles");
  ctx.effect(
    () =>
      ctx.slots.onEntryError((key, registration, error) => {
        if (!String(key).startsWith("conversation.")) return;
        void registration;
        const failure = error as { message?: string; stack?: string } | null;
        void api
          .diag({
            source: String(key),
            message: String(failure?.message ?? error),
            stack: String(failure?.stack ?? ""),
          })
          .catch(() => {});
      }),
    "immersive-polyglot: diagnostics",
  );
  ctx.effect(
    () =>
      ctx.slots.inject("conversation.session.header.actions", () =>
        ctx.slots.register(
          {
            name: "conversation.session.header.actions",
            id: HEADER_CONTROL,
            order: 5,
            locale: NS,
            inject: (sessionId: string) => ({ sessionId }),
          },
          HeaderControl,
        ),
      ),
    "immersive-polyglot: header control",
  );
  ctx.effect(
    () =>
      ctx.slots.inject("conversation.chat.turnTail", () =>
        ctx.slots.register(
          {
            name: "conversation.chat.turnTail",
            id: TURN_SECTIONS,
            order: 5,
            locale: NS,
            inject: (sessionId: string) => ({ sessionId }),
          },
          TurnTranslation,
        ),
      ),
    "immersive-polyglot: turn sections",
  );
}
