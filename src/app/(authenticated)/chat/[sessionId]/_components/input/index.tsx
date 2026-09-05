import { ClientError, isCurrentTurnBoundaryEvent } from "eve/client";
import { ArrowUpIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { messageContent } from "../../../_lib/message-input";
import { api } from "@/trpc/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ChatAgent } from "../chat-agent";

import { ComposerAttachments } from "../../../_components/composer-attachments";

interface SubmissionFeedback {
  readonly message: string;
  readonly title: string;
}

export function ChatInput({
  agent,
  sessionId,
}: {
  readonly agent: Pick<
    ChatAgent,
    "cancel" | "data" | "events" | "send" | "status"
  >;
  readonly sessionId?: string;
}) {
  return (
    <PromptInputProvider>
      <ChatInputForm agent={agent} sessionId={sessionId} />
    </PromptInputProvider>
  );
}

function ChatInputForm({
  agent,
  sessionId,
}: {
  readonly agent: Pick<
    ChatAgent,
    "cancel" | "data" | "events" | "send" | "status"
  >;
  readonly sessionId?: string;
}) {
  const { mutate: saveChat } = api.chats.save.useMutation();
  const latestEvents = useRef(agent.events);
  const [submissionFeedback, setSubmissionFeedback] =
    useState<SubmissionFeedback>();
  const [stopFeedback, setStopFeedback] = useState<string>();
  const [stopRequestAfterEventId, setStopRequestAfterEventId] = useState<
    string | undefined
  >();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const activeTurn = activeTurnId(agent.events);
  const canStop = agent.status === "streaming" && activeTurn !== undefined;
  const isRestoring =
    agent.status === "resuming" && agent.data.messages.length === 0;

  useEffect(() => {
    latestEvents.current = agent.events;
  }, [agent.events]);
  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (text.length === 0 && message.files.length === 0) return;

    setSubmissionFeedback(undefined);
    if (
      agent.status === "submitted" ||
      isRestoring ||
      isStopping ||
      isStopUncertain
    ) {
      setSubmissionFeedback({
        message:
          "Jory is still finishing the current request. Your draft and attachments are still in the composer.",
        title: "Message not sent",
      });
      throw new Error(
        "Wait for the current request to finish before sending another message."
      );
    }

    try {
      if (sessionId !== undefined) saveChat({ sessionId });
      await agent.send(
        messageContent(message),
        agent.status === "streaming" ? { turnPolicy: "steer" } : undefined
      );
    } catch (cause) {
      setSubmissionFeedback(
        isConflict(cause)
          ? {
              message:
                "Jory is still getting ready for another message. Your draft and attachments are still in the composer; wait for the current request to finish, then try again.",
              title: "Message not sent",
            }
          : {
              message:
                "We couldn’t confirm this request finished. Your draft and attachments are still in the composer; check the conversation before trying again.",
              title: "Check this request",
            }
      );
      throw cause;
    }
  };

  const stopSettlement =
    stopRequestAfterEventId === undefined
      ? undefined
      : stopSettlementAfter(agent.events, stopRequestAfterEventId);
  const isStopping =
    stopRequestAfterEventId !== undefined &&
    stopSettlement === undefined &&
    agent.status !== "error";
  const isStopUncertain =
    stopRequestAfterEventId !== undefined &&
    stopSettlement === undefined &&
    agent.status === "error";
  const visibleStopFeedback = isStopUncertain
    ? "We couldn’t confirm that Stop worked. Reload this chat to reconnect before sending another message."
    : stopSettlement === "cancelled"
      ? undefined
      : stopSettlement === "completed"
        ? "Jory finished before Stop could take effect."
        : stopSettlement === "failed"
          ? "Jory couldn’t finish stopping this request. Check the conversation before trying again."
          : stopFeedback;
  const handleStop = async () => {
    if (!activeTurn || isStopping) return;
    setSubmissionFeedback(undefined);
    const afterEventId = agent.events.at(-1)?.meta.id ?? "start";
    setStopFeedback("Stopping Jory…");
    setStopRequestAfterEventId(afterEventId);
    try {
      const result = await agent.cancel(activeTurn);
      if (stopSettlementAfter(latestEvents.current, afterEventId)) return;
      if (result.status === "accepted") {
        setStopFeedback("Stop requested. Waiting for Jory to finish stopping.");
      } else {
        setStopFeedback("Jory already finished. You can send another message.");
        setStopRequestAfterEventId(undefined);
      }
    } catch {
      setStopFeedback(
        "We couldn’t confirm that Stop worked. Reload this chat to reconnect before sending another message."
      );
    }
  };

  return (
    <div className="z-20 mx-auto w-full max-w-3xl shrink-0 bg-background px-4 pt-4 pb-6 sm:px-6">
      <PromptInput
        className="[&>[data-slot=input-group]]:rounded-3xl [&>[data-slot=input-group]]:bg-card [&>[data-slot=input-group]]:shadow-card"
        multiple
        onSubmit={handleSubmit}
      >
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message Jory"
            className="min-h-20 px-5 pt-5 pb-2"
            disabled={
              agent.status === "submitted" || isStopping || isStopUncertain
            }
            placeholder="Send a message…"
          />
        </PromptInputBody>
        <PromptInputFooter className="items-end px-3 pb-3">
          <ComposerAttachments />
          <PromptInputSubmit
            aria-label={
              isBusy && !canStop
                ? "Starting request"
                : canStop
                  ? "Stop"
                  : "Submit"
            }
            className="size-10 shrink-0 rounded-full"
            disabled={
              isRestoring ||
              isStopping ||
              isStopUncertain ||
              (isBusy && !canStop)
            }
            onStop={canStop ? () => void handleStop() : undefined}
            status={isBusy ? (canStop ? "streaming" : "submitted") : undefined}
          >
            {isBusy ? undefined : (
              <ArrowUpIcon aria-hidden="true" className="size-4" />
            )}
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
      {submissionFeedback ? (
        <Alert className="mt-3" variant="destructive">
          <AlertTitle>{submissionFeedback.title}</AlertTitle>
          <AlertDescription>{submissionFeedback.message}</AlertDescription>
        </Alert>
      ) : null}
      {visibleStopFeedback ? (
        <Alert className="mt-3">
          <AlertTitle>Stop status</AlertTitle>
          <AlertDescription>{visibleStopFeedback}</AlertDescription>
          {isStopUncertain ||
          stopFeedback?.startsWith("We couldn’t confirm") ? (
            <Button
              className="mt-3"
              onClick={() => {
                window.location.reload();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Reload chat
            </Button>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}

function isConflict(cause: unknown) {
  return cause instanceof ClientError && cause.status === 409;
}

export function stopSettlementAfter(
  events: ChatAgent["events"],
  afterEventId: string
) {
  let terminal: "cancelled" | "completed" | "failed" | undefined;
  const boundaryIndex = events.findLastIndex(
    (event) => event.meta.id === afterEventId
  );
  for (const event of events.slice(boundaryIndex + 1)) {
    if (event.type === "turn.cancelled") terminal = "cancelled";
    if (event.type === "turn.completed") terminal = "completed";
    if (event.type === "session.failed") return "failed";
    if (event.type === "turn.failed") {
      terminal = "failed";
    }
    if (terminal && event.type === "session.waiting") return terminal;
  }
  return undefined;
}

function activeTurnId(events: ChatAgent["events"]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.type === "turn.started") return event.data.turnId;
    if (
      event.type === "turn.cancelled" ||
      event.type === "turn.completed" ||
      event.type === "turn.failed" ||
      isCurrentTurnBoundaryEvent(event)
    ) {
      return undefined;
    }
  }
  return undefined;
}
