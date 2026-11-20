/** The turn tail: the translations of every answer this turn carried, or nothing. */

import { useEffect, useMemo } from "react";
import type { ChatSnapshot, UseChat } from "@deepseek-ai/dsh-client-ui-chat/client";
import { turnAnswers } from "./answers.js";
import type { Key } from "./locales.js";
import { MarkdownText } from "./markdown.jsx";
import { ensureLoaded, useSessionView } from "./store.js";

/** The inject face: the Session the entry was registered for. */
export interface TurnTranslationInjected {
  readonly sessionId: string;
}

/** Props the turn-tail entry receives: its inject face, the turn owner, and the standard seats. */
export interface TurnTranslationProps extends TurnTranslationInjected {
  readonly turn: { readonly turn: number };
  readonly useChat: UseChat;
  readonly t: (key: Key) => string;
}

const selectChat = (snapshot: ChatSnapshot): ChatSnapshot => snapshot;

/**
 * Render one turn's translated sections; an entry without content returns null.
 * @param props - inject face, turn owner, and standard seats supplied by the shell.
 */
export function TurnTranslation({ sessionId, turn, useChat, t }: TurnTranslationProps) {
  const view = useSessionView(sessionId);
  const snapshot = useChat(selectChat);
  useEffect(() => {
    ensureLoaded(sessionId);
  }, [sessionId]);
  const answers = useMemo(() => turnAnswers(snapshot, turn.turn), [snapshot, turn.turn]);
  const sections = useMemo(
    () => answers.flatMap((messageId) => view.records[messageId] ?? []),
    [answers, view.records],
  );
  // Turning translation off hides what it painted; the records stay in the store, so turning it
  // back on paints again without a provider call.
  if (!view.control) return null;
  if (answers.length === 0) return null;
  if (sections.length === 0) {
    const busy = answers.some((messageId) => view.pending.has(messageId));
    return busy ? <div className="ip-turn ip-turn--pending">{t("controlBusy")}</div> : null;
  }
  return (
    <div className="ip-turn" data-immersive-polyglot="sections">
      <div className="ip-turn-label">{t("sectionLabel")}</div>
      {sections.map((section) => (
        <div key={`${String(section.blockIndex)}-${section.text.slice(0, 16)}`} className="ip-turn-section">
          <MarkdownText text={section.text} />
        </div>
      ))}
    </div>
  );
}
