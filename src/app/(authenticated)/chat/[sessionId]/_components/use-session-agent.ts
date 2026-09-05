"use client";

import {
  Client,
  defaultMessageReducer,
  isCurrentTurnBoundaryEvent,
  type InputResponse,
  type MessageStreamEvent,
  type RespondTurnOptions,
  type SendTurnOptions,
} from "eve/client";
import type { EveMessageData, UseEveAgentStatus } from "eve/react";
import type { UserContent } from "ai";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  readLatestSessionHistory,
  readOlderSessionHistory,
  type SessionHistoryPage,
} from "../_lib/session-history";
import type { ChatAgent } from "./chat-agent";

const client = new Client({ host: "" });
const messageReducer = defaultMessageReducer();

export function useSessionAgent(sessionId: string): ChatAgent {
  const [history, setHistory] = useState<SessionHistoryPage>();
  const [status, setStatus] = useState<UseEveAgentStatus>("resuming");
  const [error, setError] = useState<Error>();
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const historyRef = useRef(history);
  const loadedSessionId = useRef<string | undefined>(undefined);
  const operationRef = useRef<Promise<void> | undefined>(undefined);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const [observerVersion, setObserverVersion] = useState(0);
  const observerController = useRef<AbortController | undefined>(undefined);
  const observerRunning = useRef(false);
  const operationCompletion = useRef<
    PromiseWithResolvers<undefined> | undefined
  >(undefined);

  const runOperation = useCallback((operation: () => Promise<void>) => {
    const activeOperation = operationRef.current;
    if (activeOperation) return activeOperation;
    const promise = operation().finally(() => {
      if (operationRef.current === promise) operationRef.current = undefined;
    });
    operationRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    observerController.current = controller;
    void (async () => {
      const restored =
        loadedSessionId.current === sessionId ? historyRef.current : undefined;
      const latest =
        restored ??
        (await readLatestSessionHistory(sessionId, controller.signal));
      if (controller.signal.aborted) return;
      loadedSessionId.current = sessionId;
      historyRef.current = latest;
      setHistory(latest);
      const tail = latest.events.at(-1);
      if (tail?.type === "session.failed") {
        setError(
          new Error("This conversation could not continue. Start a new chat.")
        );
        setStatus("error");
        return;
      }
      if (tail?.type === "session.completed") {
        setStatus("ready");
        return;
      }
      setStatus(
        !tail || isCurrentTurnBoundaryEvent(tail) ? "ready" : "streaming"
      );
      const session = client.sessions.attach(sessionId, {
        streamIndex: latest.endIndex,
      });
      let nextIndex = latest.endIndex;
      const observedIds = new Set(latest.events.map((event) => event.meta.id));
      const pendingAuthorizations = new Set<string>();
      let reachedSessionTerminal = false;
      for (const event of latest.events) {
        if (
          event.type === "authorization.required" &&
          event.data.webhookUrl !== undefined
        )
          pendingAuthorizations.add(event.data.name);
        if (event.type === "authorization.completed")
          pendingAuthorizations.delete(event.data.name);
      }
      observerRunning.current = true;
      for await (const event of session.stream({
        signal: controller.signal,
        startIndex: nextIndex,
        streamReconnectPolicy: {
          streamIdleReconnectPolicy: {
            baseDelayMs: 1_000,
            maxDelayMs: 5_000,
            maxAttempts: Number.MAX_SAFE_INTEGER,
          },
        },
      })) {
        controller.signal.throwIfAborted();
        if (observedIds.has(event.meta.id)) continue;
        observedIds.add(event.meta.id);
        nextIndex += 1;
        appendSessionEvent(historyRef, setHistory, event, nextIndex);
        if (
          event.type === "authorization.required" &&
          event.data.webhookUrl !== undefined
        )
          pendingAuthorizations.add(event.data.name);
        if (event.type === "authorization.completed")
          pendingAuthorizations.delete(event.data.name);
        if (event.type === "session.failed") {
          const failure = new Error(
            "This conversation could not continue. Start a new chat."
          );
          reachedSessionTerminal = true;
          operationCompletion.current?.reject(failure);
          setError(failure);
          setStatus("error");
          break;
        }
        if (isCurrentTurnBoundaryEvent(event)) {
          setStatus("ready");
          if (
            event.type !== "session.waiting" ||
            pendingAuthorizations.size === 0
          )
            operationCompletion.current?.resolve(undefined);
          if (event.type === "session.completed") {
            reachedSessionTerminal = true;
            break;
          }
        } else {
          setStatus("streaming");
        }
      }
      observerRunning.current = false;
      controller.signal.throwIfAborted();
      if (!reachedSessionTerminal) {
        const failure = new Error(
          "The session stream ended before the request reached a ready state."
        );
        operationCompletion.current?.reject(failure);
        setError(failure);
        setStatus("error");
      }
    })().catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      observerRunning.current = false;
      operationCompletion.current?.reject(cause);
      setError(toError(cause));
      setStatus("error");
    });
    return () => {
      observerRunning.current = false;
      controller.abort();
      operationCompletion.current?.reject(
        new Error("The conversation was closed.")
      );
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Retry deliberately recreates the observer from its authoritative cursor.
  }, [observerVersion, sessionId]);

  const resume = useCallback(async () => {
    setError(undefined);
    setStatus("resuming");
    setObserverVersion((value) => value + 1);
  }, []);

  const send = useCallback(
    async <TOutput>(
      message: string | UserContent,
      options?: SendTurnOptions<TOutput>
    ) => {
      const activeOperation = operationRef.current;
      if (activeOperation) {
        if (options?.turnPolicy !== "steer") {
          throw new Error(
            "The previous request is still finishing. Try again when it is ready."
          );
        }
        const current = historyRef.current;
        if (!current) throw new Error("The conversation is still loading.");
        if (!observerRunning.current)
          throw new Error("Reconnect the conversation before responding.");
        const session = client.sessions.attach(sessionId, {
          streamIndex: current.endIndex,
        });
        await session.send(message, {
          ...options,
          turnPolicy: "steer",
        });
        await activeOperation;
        return;
      }

      await runOperation(async () => {
        const current = historyRef.current;
        if (!current) throw new Error("The conversation is still loading.");
        if (!observerRunning.current)
          throw new Error("Reconnect the conversation before responding.");
        setError(undefined);
        setStatus("submitted");
        const session = client.sessions.attach(sessionId, {
          streamIndex: current.endIndex,
        });
        const completion = Promise.withResolvers<undefined>();
        operationCompletion.current = completion;
        void completion.promise.catch(() => undefined);
        const abort = () => {
          completion.reject(options?.signal?.reason);
        };
        options?.signal?.addEventListener("abort", abort, { once: true });
        try {
          options?.signal?.throwIfAborted();
          await session.send(message, {
            ...options,
            signal: options?.signal ?? observerController.current?.signal,
          });
          await completion.promise;
          setStatus("ready");
        } catch (cause) {
          setError(toError(cause));
          setStatus("error");
          throw cause;
        } finally {
          options?.signal?.removeEventListener("abort", abort);
          if (operationCompletion.current === completion)
            operationCompletion.current = undefined;
        }
      });
    },
    [runOperation, sessionId]
  );

  const respond = useCallback(
    async <TOutput>(
      inputResponses: readonly InputResponse[],
      options?: RespondTurnOptions<TOutput>
    ) => {
      if (operationRef.current) {
        throw new Error(
          "The session is still processing another request. Try again when it is ready."
        );
      }
      await runOperation(async () => {
        const current = historyRef.current;
        if (!current) throw new Error("The conversation is still loading.");
        if (!observerRunning.current)
          throw new Error("Reconnect the conversation before responding.");
        setError(undefined);
        setStatus("submitted");
        const session = client.sessions.attach(sessionId, {
          streamIndex: current.endIndex,
        });
        const completion = Promise.withResolvers<undefined>();
        operationCompletion.current = completion;
        void completion.promise.catch(() => undefined);
        const abort = () => {
          completion.reject(options?.signal?.reason);
        };
        options?.signal?.addEventListener("abort", abort, { once: true });
        try {
          options?.signal?.throwIfAborted();
          await session.respond(inputResponses, {
            ...options,
            signal: options?.signal ?? observerController.current?.signal,
          });
          await completion.promise;
          setStatus("ready");
        } catch (cause) {
          setError(toError(cause));
          setStatus("error");
          throw cause;
        } finally {
          options?.signal?.removeEventListener("abort", abort);
          if (operationCompletion.current === completion)
            operationCompletion.current = undefined;
        }
      });
    },
    [runOperation, sessionId]
  );

  const loadOlder = async () => {
    const current = historyRef.current;
    if (!current || current.startIndex === 0 || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const older = await readOlderSessionHistory(
        sessionId,
        current.startIndex
      );
      setHistory((latest) =>
        latest
          ? {
              ...latest,
              events: [...older.events, ...latest.events],
              startIndex: older.startIndex,
            }
          : latest
      );
    } catch (cause) {
      setError(toError(cause));
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const events = history?.events ?? emptyEvents;
  const data = useMemo<EveMessageData>(
    () =>
      events.reduce(
        (current, event) => messageReducer.reduce(current, event),
        messageReducer.initial()
      ),
    [events]
  );

  return {
    cancel: async (turnId) =>
      await client.sessions
        .attach(sessionId)
        .cancel(turnId === undefined ? undefined : { turnId }),
    data,
    error,
    events,
    hasOlder: (history?.startIndex ?? 0) > 0,
    isLoadingOlder,
    loadOlder,
    respond,
    resume,
    send,
    status,
  };
}

const emptyEvents: readonly MessageStreamEvent[] = [];

function appendSessionEvent(
  historyRef: RefObject<SessionHistoryPage | undefined>,
  setHistory: Dispatch<SetStateAction<SessionHistoryPage | undefined>>,
  event: MessageStreamEvent,
  endIndex: number
) {
  setHistory((current) => {
    if (!current) return current;
    let next: SessionHistoryPage;
    if (
      current.events.some((candidate) => candidate.meta.id === event.meta.id)
    ) {
      next = { ...current, endIndex };
    } else {
      next = {
        ...current,
        endIndex,
        events: [...current.events, event],
      };
    }
    historyRef.current = next;
    return next;
  });
}

function toError(cause: unknown) {
  return cause instanceof Error
    ? cause
    : new Error("The session request failed.");
}
