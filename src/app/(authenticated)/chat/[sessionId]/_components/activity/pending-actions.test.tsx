import type { EveDynamicToolPart } from "eve/react";
import type { InputResponse } from "eve/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ChatAgent } from "../chat-agent";
import type * as RequestComponents from "../conversation/message/input-request";

interface Mocks {
  childRespond: Mock<ChatAgent["respond"]>;
  rootRespond: Mock<ChatAgent["respond"]>;
  status: ChatAgent["status"];
  respond:
    | ((responses: readonly InputResponse[]) => void | Promise<void>)
    | undefined;
  resolved: boolean;
  error: Error | undefined;
  delivery: "pending" | "completed" | "cancelled" | "needs input";
  childReads: Mock<() => void>;
}

const mocks = vi.hoisted<Mocks>(() => ({
  childRespond: vi.fn<ChatAgent["respond"]>(),
  rootRespond: vi.fn<ChatAgent["respond"]>(),
  status: "ready",
  respond: undefined,
  resolved: false,
  error: undefined,
  delivery: "pending",
  childReads: vi.fn<() => void>(),
}));
vi.mock("../conversation", () => ({
  ChatConversation: () => <div>Conversation</div>,
}));
vi.mock("../input", () => ({ ChatInput: () => <div>Input</div> }));
vi.mock(".", () => ({ SubagentPanel: () => <div>Developer trace</div> }));
vi.mock("../use-session-agent", () => ({
  useSessionAgent: (id: string) => {
    if (id === "child") mocks.childReads();
    return {
      events:
        id === "root"
          ? [
              {
                type: "subagent.called",
                data: {
                  childSessionId: "child",
                  callId: "call",
                  name: "browser-agent",
                },
              },
              {
                type: "subagent.completed",
                data: {
                  callId: "call",
                  subagentName: "browser-agent",
                  backgroundTask: { taskId: "task-1", status: "working" },
                },
              },
              ...(mocks.delivery === "pending"
                ? []
                : [
                    {
                      type: "message.received",
                      data: {
                        message:
                          mocks.delivery === "completed"
                            ? "Background task task-1 (browser-agent) is completed.\n\nResult:\nDone"
                            : mocks.delivery === "cancelled"
                              ? "Background task task-1 (browser-agent) is cancelled."
                              : "Background task task-1 (browser-agent) needs input.",
                      },
                    },
                  ]),
            ]
          : [],
      data: {
        messages:
          id === "root"
            ? []
            : [{ id: "child-message", role: "assistant", parts: [part()] }],
      },
      status: mocks.status,
      error: mocks.error,
      respond: id === "child" ? mocks.childRespond : mocks.rootRespond,
    };
  },
}));
vi.mock("../conversation/message/input-request", async (importOriginal) => {
  const original = await importOriginal<typeof RequestComponents>();
  return {
    ...original,
    InputRequestActions: (
      props: Parameters<typeof original.InputRequestActions>[0]
    ) => {
      mocks.respond = props.onInputResponses;
      return <original.InputRequestActions {...props} />;
    },
  };
});
import { ChatSession } from "../chat-session";

function part(): EveDynamicToolPart {
  return {
    type: "dynamic-tool",
    toolName: "commit_browser_action",
    toolCallId: "commit-1",
    stepIndex: 0,
    state: "approval-requested",
    approval: { id: "request-1" },
    input: {
      action: "submit",
      origin: "https://example.com",
      terms: { kind: "submit", description: "Sign in to the test account" },
      browser_session_id: "private-browser",
    },
    toolMetadata: {
      eve: {
        kind: "tool-call",
        name: "commit_browser_action",
        inputRequest: {
          kind: "tool-approval",
          requestId: "request-1",
          prompt: "Approve tool call: commit_browser_action",
          options: [{ id: "approve", label: "Approve" }],
        },
        inputResponse: mocks.resolved
          ? { requestId: "request-1", optionId: "approve" }
          : undefined,
      },
    },
  };
}
describe("child approvals in normal chat", () => {
  beforeEach(() => {
    mocks.status = "ready";
    mocks.delivery = "pending";
    mocks.childReads.mockClear();
    mocks.resolved = false;
    mocks.error = undefined;
    mocks.respond = undefined;
    mocks.childRespond.mockReset().mockResolvedValue(undefined);
    mocks.rootRespond.mockReset();
  });
  it("shows safe approval terms without opening developer trace and responds to the child", async () => {
    const markup = renderToStaticMarkup(
      <ChatSession sessionId="root" developerActivityEnabled={false} />
    );
    expect(markup).toContain("Sign in to the test account");
    expect(markup).toContain("Approve browser action");
    expect(markup).not.toContain("commit_browser_action");
    expect(markup).not.toContain("private-browser");
    expect(markup).not.toContain("Developer trace");
    await mocks.respond?.([{ requestId: "request-1", optionId: "approve" }]);
    expect(mocks.childRespond).toHaveBeenCalledWith([
      { requestId: "request-1", optionId: "approve" },
    ]);
    expect(mocks.rootRespond).not.toHaveBeenCalled();
  });
  it("disables pending controls while submitting", () => {
    mocks.status = "submitted";
    const markup = renderToStaticMarkup(
      <ChatSession sessionId="root" developerActivityEnabled={false} />
    );
    expect(markup).toContain("disabled");
  });
  it("shows a safe retryable error without provider details", () => {
    mocks.status = "error";
    mocks.error = new Error("private-provider-detail");
    const markup = renderToStaticMarkup(
      <ChatSession sessionId="root" developerActivityEnabled={false} />
    );
    expect(markup).toContain(
      "The browser response could not be sent. Reconnect before trying again."
    );
    expect(markup).not.toContain("private-provider-detail");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Reconnect</button>");
  });
  it.each(["completed", "cancelled"] as const)(
    "does not subscribe to a %s child",
    (delivery) => {
      mocks.delivery = delivery;
      renderToStaticMarkup(
        <ChatSession sessionId="root" developerActivityEnabled={false} />
      );
      expect(mocks.childReads).not.toHaveBeenCalled();
    }
  );
  it("keeps an awaiting-input child subscribed", () => {
    mocks.delivery = "needs input";
    const markup = renderToStaticMarkup(
      <ChatSession sessionId="root" developerActivityEnabled={false} />
    );
    expect(mocks.childReads).toHaveBeenCalledOnce();
    expect(markup).toContain("Approve browser action");
  });
  it("removes resolved child approvals", () => {
    mocks.resolved = true;
    const markup = renderToStaticMarkup(
      <ChatSession sessionId="root" developerActivityEnabled={false} />
    );
    expect(markup).not.toContain("Approve browser action");
  });
});
