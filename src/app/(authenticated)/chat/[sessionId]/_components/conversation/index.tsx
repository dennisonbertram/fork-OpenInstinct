import { ClientError } from "eve/client";
import { AlertCircleIcon, BrainIcon, LoaderCircleIcon } from "lucide-react";
import { Fragment, useMemo } from "react";
import {
  imessageTimestamps,
  messageTimestamps,
  sentMessages,
} from "../../_lib/message-events";
import {
  hasPendingBackgroundWorker,
  messagesForTraceView,
  type TraceView,
} from "../../_lib/trace-view";
import {
  getLatestTurnFailure,
  getLatestTurnFailureDiagnostic,
  getLatestTurnOutcome,
} from "../../_lib/turn-failure";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AgentMessage } from "./message";
import type { ChatAgent } from "../chat-agent";
import styles from "./typing-indicator.module.css";

export function ChatConversation({
  agent,
  developerActivityEnabled = false,
  history,
  initial,
  sessionId,
  traceView,
}: {
  readonly agent: Pick<
    ChatAgent,
    "data" | "error" | "events" | "respond" | "status"
  >;
  readonly developerActivityEnabled?: boolean;
  readonly history?: {
    readonly hasOlder: boolean;
    readonly isLoadingOlder: boolean;
    readonly loadOlder: () => Promise<void>;
  };
  readonly initial?: false;
  readonly sessionId?: string;
  readonly traceView: TraceView;
}) {
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isRestoring =
    agent.status === "resuming" && agent.data.messages.length === 0;
  const lastMessage = agent.data.messages.at(-1);
  const pendingAssistantMessageId =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.every((part) => part.type === "step-start")
      ? lastMessage.id
      : undefined;
  const showPendingThinking =
    traceView === "trace" &&
    isBusy &&
    (agent.status === "submitted" ||
      lastMessage?.role !== "assistant" ||
      pendingAssistantMessageId !== undefined);
  const turnFailure =
    isBusy || isRestoring ? undefined : getLatestTurnFailure(agent.events);
  const developerDiagnostic = developerActivityEnabled
    ? getLatestTurnFailureDiagnostic(agent.events)
    : undefined;
  const messages = useMemo(
    () => messagesForTraceView(agent.data.messages, agent.events, traceView),
    [agent.data.messages, agent.events, traceView]
  );
  const timestamps = useMemo(
    () =>
      traceView === "imessage"
        ? imessageTimestamps(agent.events)
        : messageTimestamps(agent.events),
    [agent.events, traceView]
  );
  const deliveredMessages = useMemo(
    () => sentMessages(agent.events),
    [agent.events]
  );
  const hasPendingWorker = useMemo(
    () => hasPendingBackgroundWorker(agent.events),
    [agent.events]
  );
  const turnOutcome =
    isBusy || isRestoring || hasPendingWorker
      ? undefined
      : getLatestTurnOutcome(agent.events);
  const errorMessage =
    turnOutcome === "session-failed"
      ? "This conversation could not continue. Start a new chat."
      : ((agent.error && !isSubmissionConflict(agent.error)
          ? toErrorMessage(agent.error)
          : undefined) ??
        turnFailure ??
        (turnOutcome === "missing-response"
          ? "Please try sending your message again."
          : undefined));
  const wasCancelled =
    turnOutcome === "cancelled" && errorMessage === undefined;

  return (
    <Conversation
      className="min-h-0 flex-1"
      initial={initial}
      resize={sessionId === undefined ? "smooth" : "instant"}
      scrollRestorationKey={
        agent.data.messages.length === 0 || sessionId === undefined
          ? undefined
          : `eve:web-chat-scroll:${sessionId}`
      }
    >
      <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-8 sm:px-6">
        {history?.hasOlder ? (
          <Button
            className="self-center"
            disabled={history.isLoadingOlder}
            onClick={() => void history.loadOlder()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {history.isLoadingOlder ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : null}
            {history.isLoadingOlder ? "Loading…" : "Load older messages"}
          </Button>
        ) : null}
        {isRestoring && messages.length === 0 ? (
          <Shimmer className="type-supporting-body self-center" duration={1}>
            Loading recent messages
          </Shimmer>
        ) : null}
        {messages.map((message, index) => {
          if (showPendingThinking && message.id === pendingAssistantMessageId) {
            return null;
          }

          const deliveries =
            traceView === "imessage"
              ? deliveredMessages.get(message.id)
              : undefined;
          if (deliveries) {
            return (
              <Fragment key={message.id}>
                {deliveries.map((delivery) => (
                  <AgentMessage
                    canRespond={!isBusy && agent.status !== "resuming"}
                    isStreaming={false}
                    key={delivery.id}
                    message={{ ...message, id: delivery.id }}
                    onInputResponses={(responses) => agent.respond(responses)}
                    sentMessageParts={delivery.parts}
                    timestamp={delivery.timestamp}
                    userVisibleOnly
                  />
                ))}
              </Fragment>
            );
          }

          return (
            <AgentMessage
              canRespond={!isBusy && agent.status !== "resuming"}
              isStreaming={
                agent.status === "streaming" && index === messages.length - 1
              }
              key={message.id}
              message={message}
              onInputResponses={(responses) => agent.respond(responses)}
              timestamp={timestamps.get(message.id)}
              userVisibleOnly={traceView === "imessage"}
            />
          );
        })}
        {showPendingThinking ? <PendingThinking /> : null}
        {traceView === "imessage" &&
        !errorMessage &&
        (isBusy || hasPendingWorker) ? (
          <output
            className="flex w-fit items-center gap-1.5 rounded-bubble rounded-bl-md bg-bubble-assistant px-5 py-4 text-muted-foreground"
            data-slot="typing-indicator"
          >
            <span className="sr-only">
              {hasPendingWorker
                ? "Working in the browser…"
                : "Jory is working…"}
            </span>
            {[0, 1, 2].map((dot) => (
              <span
                aria-hidden="true"
                className={styles.dot}
                data-slot="typing-dot"
                key={dot}
              />
            ))}
          </output>
        ) : null}
        {traceView === "imessage" && errorMessage ? (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Jory couldn’t finish this request</AlertTitle>
            <AlertDescription>
              {developerDiagnostic ??
                (turnOutcome === "session-failed"
                  ? errorMessage
                  : "Please try sending your message again.")}
            </AlertDescription>
          </Alert>
        ) : null}
        {traceView === "imessage" && wasCancelled ? (
          <Alert>
            <AlertTitle>Jory stopped this request</AlertTitle>
            <AlertDescription>You can send another message.</AlertDescription>
          </Alert>
        ) : null}
        {traceView === "trace" && errorMessage ? (
          <ErrorMessage message={errorMessage} />
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function toErrorMessage(cause: unknown): string {
  if (!(cause instanceof Error)) return "Unable to complete the request.";
  if (/<!doctype html|<html[\s>]/i.test(cause.message)) {
    return "The agent runtime is unavailable. Try again in a moment.";
  }
  return cause.message;
}

function isSubmissionConflict(cause: unknown) {
  return cause instanceof ClientError && cause.status === 409;
}

function ErrorMessage({ message }: { readonly message: string }) {
  return (
    <Message className="max-w-full" from="assistant">
      <MessageContent>
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </MessageContent>
    </Message>
  );
}

function PendingThinking() {
  return (
    <Message aria-live="polite" from="assistant">
      <MessageContent>
        <div className="type-supporting-body mb-4 flex w-full items-center gap-2 text-muted-foreground">
          <BrainIcon className="size-4" />
          <Shimmer duration={1}>Thinking</Shimmer>
        </div>
      </MessageContent>
    </Message>
  );
}
