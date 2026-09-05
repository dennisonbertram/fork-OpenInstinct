"use client";

import type { MessageStreamEvent } from "eve/client";
import { settledBackgroundWorkerTaskIds } from "../../_lib/trace-view";
import { collectSubagentSessions } from "@/app/_lib/subagent-sessions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  InputRequestActions,
  QuestionRequest,
} from "../conversation/message/input-request";
import { useSessionAgent } from "../use-session-agent";

export function PendingSubagentActions({
  events,
}: {
  readonly events: readonly MessageStreamEvent[];
}) {
  const settled = settledBackgroundWorkerTaskIds(events);
  return collectSubagentSessions(events)
    .filter((session) => {
      if (!session.completion) return true;
      const task = session.completion.backgroundTask;
      return task !== undefined && !settled.has(task.taskId);
    })
    .map((session) => (
      <ChildPendingActions
        key={`${session.childSessionId}:${session.callId}`}
        sessionId={session.childSessionId}
      />
    ));
}

function ChildPendingActions({ sessionId }: { readonly sessionId: string }) {
  const agent = useSessionAgent(sessionId);
  const pending = agent.data.messages.flatMap((message) =>
    message.parts.filter(
      (part) =>
        part.type === "dynamic-tool" &&
        part.toolMetadata?.eve?.inputRequest &&
        !part.toolMetadata.eve.inputResponse &&
        part.state === "approval-requested"
    )
  );
  if (pending.length === 0) {
    return agent.error ? (
      <Alert className="mx-4 my-3 w-auto" variant="destructive">
        <AlertDescription>
          Browser task status could not be loaded.
          <Button
            size="sm"
            variant="outline"
            onClick={() => void agent.resume()}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    ) : null;
  }
  const canRespond = agent.status === "ready";
  const respond: typeof agent.respond = async (responses) => {
    try {
      await agent.respond(responses);
    } catch {
      /* The session hook exposes the error below. */
    }
  };
  return (
    <section
      aria-label="Browser action needed"
      aria-live="polite"
      className="max-h-[40svh] shrink-0 space-y-3 overflow-y-auto px-4 py-3"
    >
      {pending.map((part) => {
        if (part.type !== "dynamic-tool") return null;
        const request = part.toolMetadata?.eve?.inputRequest;
        return request?.kind === "question" ? (
          <QuestionRequest
            key={part.toolCallId}
            canRespond={canRespond}
            inputRequest={request}
            onInputResponses={respond}
          />
        ) : (
          <InputRequestActions
            key={part.toolCallId}
            canRespond={canRespond}
            part={part}
            title={
              part.toolName === "commit_browser_action"
                ? "Approve browser action"
                : undefined
            }
            onInputResponses={respond}
          />
        );
      })}
      {agent.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            The browser response could not be sent. Reconnect before trying
            again.
            <Button
              size="sm"
              variant="outline"
              onClick={() => void agent.resume()}
            >
              Reconnect
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
