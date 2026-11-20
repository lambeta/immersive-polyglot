/** The Client half's per-Session view, shared by both surfaces through an external store. */

import { useEffect, useState } from "react";
import { api, type TranslationSection } from "./api.js";

/** Everything both surfaces read for one Session. */
export interface SessionView {
  /** Whether the first `/api/state` + `/api/records` read has settled. */
  readonly loaded: boolean;
  /** The Host's toggle state for this Session. */
  readonly control: boolean;
  /** Sections already known, keyed by answer message id. */
  readonly records: Readonly<Record<string, readonly TranslationSection[]>>;
  /** Answers whose page request is still in flight. */
  readonly pending: ReadonlySet<string>;
  /** The last failure's message, cleared by the next action. */
  readonly failure: string | undefined;
  /** How many answers one page may cover, as the Host reports it. */
  readonly pageSize: number;
}

/** Page size assumed before the Host reports its own. */
const DEFAULT_PAGE_SIZE = 12;

const EMPTY: SessionView = {
  loaded: false,
  control: false,
  records: {},
  pending: new Set<string>(),
  failure: undefined,
  pageSize: DEFAULT_PAGE_SIZE,
};

const views = new Map<string, SessionView>();
const listeners = new Set<() => void>();
const loading = new Map<string, Promise<void>>();

/**
 * Read one Session's view without subscribing.
 * @param sessionId - the Session to read; unknown Sessions report the empty view.
 */
export function sessionView(sessionId: string): SessionView {
  return views.get(sessionId) ?? EMPTY;
}

function publish(sessionId: string, next: SessionView): void {
  views.set(sessionId, next);
  for (const listener of listeners) listener();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Subscribe to every Session view change; used by {@link useSessionView}. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Read one Session's view, re-rendering on change.
 * @param sessionId - the Session the entry belongs to.
 */
export function useSessionView(sessionId: string): SessionView {
  const [view, setView] = useState(() => sessionView(sessionId));
  useEffect(() => {
    setView(sessionView(sessionId));
    return subscribe(() => {
      setView(sessionView(sessionId));
    });
  }, [sessionId]);
  return view;
}

/**
 * Load one Session's toggle and current translations once.
 * @param sessionId - the Session to read; repeated calls while loading are no-ops.
 */
export function ensureLoaded(sessionId: string): void {
  if (sessionView(sessionId).loaded || loading.has(sessionId)) return;
  const task = (async () => {
    const [state, records] = await Promise.all([api.state(sessionId), api.records(sessionId)]);
    const translated: Record<string, readonly TranslationSection[]> = {};
    for (const record of records.records) translated[record.messageId] = record.sections;
    publish(sessionId, {
      loaded: true,
      control: state.control.on,
      records: translated,
      pending: new Set(state.pending),
      failure: undefined,
      pageSize: state.limits?.answers ?? DEFAULT_PAGE_SIZE,
    });
  })()
    .catch((error: unknown) => {
      publish(sessionId, { ...sessionView(sessionId), loaded: true, failure: messageOf(error) });
    })
    .finally(() => {
      loading.delete(sessionId);
    });
  loading.set(sessionId, task);
}

/**
 * Flip the Session toggle optimistically and persist it.
 * @param sessionId - the Session to toggle.
 * @param on - the requested state.
 */
export async function setControl(sessionId: string, on: boolean): Promise<void> {
  const previous = sessionView(sessionId);
  publish(sessionId, { ...previous, control: on, failure: undefined });
  try {
    await api.control(sessionId, on);
  } catch (error) {
    publish(sessionId, { ...sessionView(sessionId), control: previous.control, failure: messageOf(error) });
  }
}

/**
 * Translate one page of answers and fold the outcome into the view.
 * @param sessionId - the Session to translate.
 * @param messageIds - the answers the page covers.
 */
export async function translate(sessionId: string, messageIds: readonly string[]): Promise<void> {
  if (messageIds.length === 0) return;
  publish(sessionId, { ...sessionView(sessionId), pending: new Set(messageIds), failure: undefined });
  let failure: string | undefined;
  const records = { ...sessionView(sessionId).records };
  try {
    const { results } = await api.page(sessionId, messageIds);
    for (const result of results) {
      if (result.status === "translated") records[result.messageId] = result.sections;
      else failure = result.failure.message;
    }
  } catch (error) {
    failure = messageOf(error);
  }
  publish(sessionId, { ...sessionView(sessionId), records, pending: new Set<string>(), failure });
}
