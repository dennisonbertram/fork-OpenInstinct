import { ClientError, type MessageStreamEvent } from "eve/client";
import type { EveMessage } from "eve/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatConversation } from ".";
import type { ChatAgent } from "../chat-agent";

describe("chat conversation", () => {
  it.each(["submitted", "streaming"] as const)(
    "shows quiet user-facing progress while %s without exposing internal text",
    (status) => {
      const agent = {
        data: { messages: [message("turn-1:user", "Find an option")] },
        error: undefined,
        events: [],
        respond: async () => undefined,
        status,
      } satisfies Pick<
        ChatAgent,
        "data" | "error" | "events" | "respond" | "status"
      >;
      const markup = renderToStaticMarkup(
        <ChatConversation agent={agent} traceView="imessage" />
      );
      expect(markup).toContain("<output");
      expect(markup).toContain("Jory is working");
      expect(markup).toContain('data-slot="typing-indicator"');
      expect(markup.match(/data-slot="typing-dot"/g)).toHaveLength(3);
      expect(markup).toContain('class="sr-only"');
    }
  );

  it("shows background work even after the parent turn settles", () => {
    const agent = {
      data: { messages: [message("turn-1:user", "Find an option")] },
      error: undefined,
      events: [workerReceipt("task_worker")],
      respond: async () => undefined,
      status: "ready",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;
    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );
    expect(markup).toContain("Working in the browser");
    expect(markup).not.toContain("task_worker");
    expect(markup).toContain('data-slot="typing-indicator"');
  });

  it("shows send_message output instead of assistant stream text", () => {
    const agent = {
      data: {
        messages: [
          message("turn-1:user", "What happened?"),
          {
            id: "turn-1:assistant",
            metadata: { status: "complete", turnId: "turn-1" },
            parts: [
              {
                state: "done",
                stepIndex: 0,
                text: "Internal assistant narration",
                type: "text",
              },
              {
                state: "done",
                stepIndex: 1,
                text: "DELIVERY_COMPLETE",
                type: "text",
              },
            ],
            role: "assistant",
          },
        ],
      },
      error: undefined,
      events: [sendMessageResult("The visible iMessage response.")],
      respond: async () => undefined,
      status: "ready",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).toContain("What happened?");
    expect(markup).toContain("The visible iMessage response.");
    expect(markup).not.toContain("Internal assistant narration");
    expect(markup).not.toContain("DELIVERY_COMPLETE");
    expect(markup).not.toContain('data-slot="typing-indicator"');
  });

  it("keeps the previous visible message while a filtered assistant shell is pending", () => {
    const cancellationText =
      "Background task task_worker (browser-agent) is cancelled.";
    const visibleMessage = message("visible-turn:user", "Keep this visible");
    const hiddenDelivery = message("task-delivery:user", cancellationText);
    const hiddenShell = {
      id: "task-delivery:assistant",
      metadata: { status: "streaming", turnId: "task-delivery" },
      parts: [{ type: "step-start" }],
      role: "assistant",
    } satisfies EveMessage;
    const events = [
      workerReceipt("task_worker"),
      workerCancellation("task_worker"),
      delivery("task-delivery", cancellationText),
    ];
    const agent = {
      data: { messages: [visibleMessage, hiddenDelivery, hiddenShell] },
      error: undefined,
      events,
      respond: async () => undefined,
      status: "streaming",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).toContain("Keep this visible");
    expect(markup).not.toContain("Thinking");
    expect(markup).not.toContain("is cancelled");
  });

  it("explains a settled turn that did not produce a visible reply", () => {
    const agent = {
      data: { messages: [message("turn-1:user", "Did that work?")] },
      error: undefined,
      events: [completedTurn("turn-1")],
      respond: async () => undefined,
      status: "ready",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).toContain("Jory couldn’t finish this request");
    expect(markup).toContain("Please try sending your message again.");
  });

  it("directs a terminal session failure to a new chat without provider details", () => {
    const agent = {
      data: { messages: [message("turn-1:user", "Did that work?")] },
      error: undefined,
      events: [sessionFailed()],
      respond: async () => undefined,
      status: "ready",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).toContain("Jory couldn’t finish this request");
    expect(markup).toContain(
      "This conversation could not continue. Start a new chat."
    );
    expect(markup).not.toContain("Provider details must not reach the chat");
  });

  it("confirms a cancellation only after the durable cancellation boundary", () => {
    const agent = {
      data: { messages: [message("turn-1:user", "Stop this request")] },
      error: undefined,
      events: [cancelledTurn("turn-1"), waiting()],
      respond: async () => undefined,
      status: "ready",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).toContain("Jory stopped this request");
    expect(markup).toContain("You can send another message.");
    expect(markup).not.toContain("Jory couldn’t finish this request");
  });

  it("does not carry a cancellation notice into a newer active turn", () => {
    const agent = {
      data: { messages: [message("turn-2:user", "Try again")] },
      error: undefined,
      events: [cancelledTurn("turn-1"), waiting(), startedTurn("turn-2")],
      respond: async () => undefined,
      status: "ready",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).not.toContain("Jory stopped this request");
    expect(markup).not.toContain("Jory couldn’t finish this request");
  });

  it("does not carry a cancellation notice into a question or approval", () => {
    const agent = {
      data: { messages: [message("turn-2:user", "Continue")] },
      error: undefined,
      events: [cancelledTurn("turn-1"), waiting(), inputRequested("turn-2")],
      respond: async () => undefined,
      status: "ready",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).not.toContain("Jory stopped this request");
    expect(markup).not.toContain("Jory couldn’t finish this request");
  });

  it("shows a newer client submission error instead of an older cancellation", () => {
    const agent = {
      data: { messages: [message("turn-1:user", "Try again")] },
      error: new Error("HTTP 409 conflict"),
      events: [cancelledTurn("turn-1"), waiting()],
      respond: async () => undefined,
      status: "error",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).toContain("Jory couldn’t finish this request");
    expect(markup).not.toContain("Jory stopped this request");
    expect(markup).not.toContain("HTTP 409 conflict");
  });

  it("leaves a rejected 409 submission to the composer instead of failing a prior delivered turn", () => {
    const agent = {
      data: {
        messages: [
          message("turn-1:user", "The earlier request"),
          message("turn-1:assistant", "The earlier delivered reply"),
        ],
      },
      error: new ClientError(409, "session_not_active"),
      events: [delivery("turn-1", "The earlier delivered reply")],
      respond: async () => undefined,
      status: "error",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).not.toContain("Jory couldn’t finish this request");
    expect(markup).toContain("The earlier delivered reply");
  });

  it("does not treat in-progress tool work as a missing response", () => {
    const agent = {
      data: { messages: [message("turn-1:user", "Find an option")] },
      error: undefined,
      events: [workerReceipt("task_worker")],
      respond: async () => undefined,
      status: "ready",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).not.toContain("Jory couldn’t finish this request");
  });

  it.each([
    {
      developerActivityEnabled: true,
      included:
        "AI Gateway has insufficient credits. Add credits in Vercel, then send your message again.",
      excluded: "Please try sending your message again.",
    },
    {
      developerActivityEnabled: false,
      included: "Please try sending your message again.",
      excluded: "Add credits",
    },
  ])(
    "shows a safe billing remedy only with developer activity $developerActivityEnabled",
    ({ developerActivityEnabled, included, excluded }) => {
      const agent = {
        data: { messages: [message("turn-1:user", "Try this")] },
        error: undefined,
        events: [
          {
            type: "turn.failed",
            meta: { at: "2026-09-05T12:00:00.000Z", id: "failure" },
            data: {
              code: "MODEL_CALL_FAILED",
              message: "Provider body SECRET_SENTINEL",
              details: { upstreamType: "insufficient_funds", statusCode: 402 },
              sequence: 1,
              turnId: "turn-1",
            },
          },
        ],
        respond: async () => undefined,
        status: "ready",
      } satisfies Pick<
        ChatAgent,
        "data" | "error" | "events" | "respond" | "status"
      >;
      const markup = renderToStaticMarkup(
        <ChatConversation
          agent={agent}
          developerActivityEnabled={developerActivityEnabled}
          traceView="imessage"
        />
      );
      expect(markup).not.toContain("SECRET_SENTINEL");
      expect(markup).toContain(included);
      expect(markup).not.toContain(excluded);
    }
  );

  it("hides runtime errors from the iMessage transcript", () => {
    const agent = {
      data: { messages: [message("turn-1:user", "Try this")] },
      error: new Error("Internal runtime failure"),
      events: [],
      respond: async () => undefined,
      status: "error",
    } satisfies Pick<
      ChatAgent,
      "data" | "error" | "events" | "respond" | "status"
    >;

    const markup = renderToStaticMarkup(
      <ChatConversation agent={agent} traceView="imessage" />
    );

    expect(markup).toContain("Try this");
    expect(markup).not.toContain("Request failed");
    expect(markup).not.toContain("Internal runtime failure");
    expect(markup).toContain("Please try sending your message again.");
    expect(markup).not.toContain('data-slot="typing-indicator"');
  });
});

function message(id: string, text: string): EveMessage {
  return {
    id,
    metadata: { status: "complete", turnId: id.split(":")[0] },
    parts: [{ state: "done", text, type: "text" }],
    role: "user",
  };
}

function workerReceipt(taskId: string): MessageStreamEvent {
  return {
    data: {
      backgroundTask: { status: "working", taskId },
      callId: "call_worker",
      output: `{"status":"working","taskId":"${taskId}"}`,
      subagentName: "browser-agent",
    },
    meta: { at: "2026-08-27T20:00:00.000Z", id: "receipt" },
    type: "subagent.completed",
  };
}

function workerCancellation(taskId: string): MessageStreamEvent {
  return {
    data: {
      result: {
        callId: "call_cancel",
        kind: "tool-result",
        output: {
          tasks: [
            {
              metadata: {
                agentId: "agent_worker",
                kind: "subagent",
                mode: "local",
                name: "browser-agent",
              },
              status: "cancelled",
              taskId,
            },
          ],
        },
        toolName: "task_cancel",
      },
      sequence: 2,
      status: "completed",
      stepIndex: 1,
      turnId: "turn_cancel",
    },
    meta: { at: "2026-08-27T20:00:00.500Z", id: "cancel-result" },
    type: "action.result",
  };
}

function delivery(turnId: string, messageText: string): MessageStreamEvent {
  return {
    data: { message: messageText, sequence: 0, turnId },
    meta: { at: "2026-08-27T20:00:01.000Z", id: "delivery" },
    type: "message.received",
  };
}

function sendMessageResult(text: string): MessageStreamEvent {
  return {
    data: {
      result: {
        callId: "call_send_message",
        kind: "tool-result",
        output: { kind: "message", text },
        toolName: "send_message",
      },
      sequence: 1,
      status: "completed",
      stepIndex: 1,
      turnId: "turn-1",
    },
    meta: { at: "2026-09-01T20:00:00.000Z", id: "send-result" },
    type: "action.result",
  };
}

function completedTurn(turnId: string): MessageStreamEvent {
  return {
    data: { sequence: 1, turnId },
    meta: { at: "2026-09-05T12:00:01.000Z", id: "completed" },
    type: "turn.completed",
  };
}

function cancelledTurn(turnId: string): MessageStreamEvent {
  return {
    data: { sequence: 1, turnId },
    meta: { at: "2026-09-05T12:00:01.000Z", id: "cancelled" },
    type: "turn.cancelled",
  };
}

function startedTurn(turnId: string): MessageStreamEvent {
  return {
    data: { sequence: 1, turnId },
    meta: { at: "2026-09-05T12:00:03.000Z", id: "started" },
    type: "turn.started",
  };
}

function inputRequested(turnId: string): MessageStreamEvent {
  return {
    data: { requests: [], sequence: 1, stepIndex: 1, turnId },
    meta: { at: "2026-09-05T12:00:04.000Z", id: "input-requested" },
    type: "input.requested",
  };
}

function waiting(): MessageStreamEvent {
  return {
    data: { continuationToken: "", wait: "next-user-message" },
    meta: { at: "2026-09-05T12:00:02.000Z", id: "waiting" },
    type: "session.waiting",
  };
}

function sessionFailed(): MessageStreamEvent {
  return {
    data: {
      code: "SESSION_FAILED",
      message: "Provider details must not reach the chat",
      sessionId: "session-1",
    },
    meta: { at: "2026-09-05T12:00:03.000Z", id: "session-failed" },
    type: "session.failed",
  };
}
