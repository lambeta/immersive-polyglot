/** Pure selectors tying the Chat snapshot to the Host's message ids — no React, no Host. */

import type { ChatSnapshot } from "@deepseek-ai/dsh-client-ui-chat/client";

/** Every completed assistant message id, oldest first, without duplicates. */
function assistantIds(snapshot: ChatSnapshot): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const node of snapshot.legacy.nodes) {
    if (node.kind !== "assistant") continue;
    if (node.interrupted === true) continue;
    const messageId = node.messageId;
    if (messageId === undefined) continue;
    if (seen.has(messageId)) continue;
    seen.add(messageId);
    ids.push(messageId);
  }
  return ids;
}

/**
 * The answers one page means: the most recent completed answers, oldest first.
 * @param snapshot - the Chat snapshot of the Session.
 * @param limit - the Host's per-page cap; values below one mean one.
 */
export function pageAnswers(snapshot: ChatSnapshot, limit: number): string[] {
  const ids = assistantIds(snapshot);
  const size = Math.max(1, Math.trunc(limit));
  return ids.slice(Math.max(0, ids.length - size));
}

/**
 * The answers an Agent turn carries, in reading order.
 * @param snapshot - the Chat snapshot of the Session.
 * @param turn - the Agent turn number (`TurnLocation.turn`).
 */
export function turnAnswers(snapshot: ChatSnapshot, turn: number): string[] {
  const ids: string[] = [];
  for (const node of snapshot.legacy.nodes) {
    if (node.kind !== "assistant") continue;
    if (node.turn !== turn) continue;
    const messageId = node.messageId;
    if (messageId === undefined) continue;
    if (ids.includes(messageId)) continue;
    ids.push(messageId);
  }
  return ids;
}
