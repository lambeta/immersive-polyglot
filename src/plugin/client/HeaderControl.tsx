/** The session-header control: one click turns this page's answers into translations. */

import { useEffect, useMemo } from "react";
import type { ChatSnapshot, UseChat } from "@deepseek-ai/dsh-client-ui-chat/client";
import { pageAnswers } from "./answers.js";
import type { Key } from "./locales.js";
import { ensureLoaded, setControl, translate, useSessionView } from "./store.js";

/** The inject face: the Session the entry was registered for. */
export interface HeaderControlInjected {
  readonly sessionId: string;
}

/** Props the header entry receives: its inject face plus the slot's standard seats. */
export interface HeaderControlProps extends HeaderControlInjected {
  readonly useChat: UseChat;
  readonly t: (key: Key) => string;
}

const selectChat = (snapshot: ChatSnapshot): ChatSnapshot => snapshot;

/**
 * Render the header toggle.
 * @param props - inject face and standard seats supplied by the shell.
 */
export function HeaderControl({ sessionId, useChat, t }: HeaderControlProps) {
  const view = useSessionView(sessionId);
  const snapshot = useChat(selectChat);
  useEffect(() => {
    ensureLoaded(sessionId);
  }, [sessionId]);
  const answers = useMemo(() => pageAnswers(snapshot, view.pageSize), [snapshot, view.pageSize]);
  const busy = view.pending.size > 0;
  const ready = answers.length > 0;
  const failed = view.failure !== undefined;
  const label = failed
    ? t("unavailable")
    : busy ? t("controlBusy") : view.control ? t("controlOn") : t("controlLabel");
  const title = view.failure ?? (ready ? label : t("unavailable"));
  const className = [
    "ip-control",
    view.control && !failed ? "ip-control--on" : "",
    busy ? "ip-control--busy" : "",
    failed ? "ip-control--error" : "",
  ]
    .filter((part) => part !== "")
    .join(" ");

  const onClick = (): void => {
    if (busy) return;
    // A failure is retried before the switch flips: the toggle stays on, so a lonely
    // off-click would read as "translation finished" when it never ran.
    if (failed) {
      void translate(sessionId, answers);
      return;
    }
    if (view.control) {
      void setControl(sessionId, false);
      return;
    }
    void (async () => {
      await setControl(sessionId, true);
      await translate(sessionId, answers);
    })();
  };

  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-pressed={view.control}
      aria-busy={busy}
      disabled={!ready && !view.control}
      data-immersive-polyglot="control"
      onClick={onClick}
    >
      <span className="ip-dot" aria-hidden="true" />
      {label}
    </button>
  );
}
