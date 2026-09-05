import type { ReactNode } from "react";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ClientError, type MessageStreamEvent } from "eve/client";
import type { ChatAgent } from "../chat-agent";

const mocks = vi.hoisted<{
  submit: ((message: PromptInputMessage) => Promise<void>) | undefined;
  interval: Mock<() => void>;
  stop: (() => void) | undefined;
  submitControl:
    | {
        readonly ariaLabel: string | undefined;
        readonly disabled: boolean | undefined;
        readonly status: string | undefined;
      }
    | undefined;
}>(() => ({
  submit: undefined,
  interval: vi.fn<() => void>(),
  stop: undefined,
  submitControl: undefined,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useEffect: (effect: () => (() => void) | undefined) => {
    effect();
  },
}));
vi.mock("../../_lib/trace-view", () => ({
  hasPendingBackgroundWorker: () => true,
}));
vi.mock("@/trpc/client", () => ({
  api: {
    chats: { save: { useMutation: () => ({ mutate: () => undefined }) } },
  },
}));
vi.mock("../../../_components/composer-attachments", () => ({
  ComposerAttachments: () => null,
}));
vi.mock("@/components/ai-elements/prompt-input", () => ({
  PromptInput: ({
    children,
    onSubmit,
  }: {
    children: ReactNode;
    onSubmit: (message: PromptInputMessage) => Promise<void>;
  }) => {
    mocks.submit = onSubmit;
    return <div>{children}</div>;
  },
  PromptInputBody: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PromptInputFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PromptInputProvider: ({ children }: { children: ReactNode }) => children,
  PromptInputSubmit: ({
    "aria-label": ariaLabel,
    disabled,
    onStop,
    status,
  }: {
    readonly "aria-label"?: string;
    readonly disabled?: boolean;
    readonly onStop?: () => void;
    readonly status?: string;
  }) => {
    mocks.stop = onStop;
    mocks.submitControl = { ariaLabel, disabled, status };
    return null;
  },
  PromptInputTextarea: () => null,
}));
import { ChatInput, stopSettlementAfter } from ".";

afterEach(() => vi.unstubAllGlobals());
describe("composer with a persistent session observer", () => {
  beforeEach(() => {
    mocks.submit = undefined;
    mocks.stop = undefined;
    mocks.submitControl = undefined;
  });
  it("does not poll or cancel browser work to submit a message", async () => {
    vi.stubGlobal("window", {
      setInterval: mocks.interval,
      clearInterval: () => undefined,
    });
    const cancel = vi.fn<ChatAgent["cancel"]>();
    const resume = vi.fn<ChatAgent["resume"]>();
    const send = vi.fn<ChatAgent["send"]>().mockResolvedValue(undefined);
    const agent = {
      cancel,
      resume,
      send,
      events: [],
      status: "ready" as const,
      data: { messages: [] },
    };
    renderToStaticMarkup(<ChatInput agent={agent} sessionId="root" />);
    expect(mocks.interval).not.toHaveBeenCalled();
    await mocks.submit?.({ text: "Next task", files: [] });
    expect(cancel).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("Next task", undefined);
  });

  it("keeps the draft under the composer after an HTTP 409 rejection", async () => {
    const send = vi
      .fn<ChatAgent["send"]>()
      .mockRejectedValue(new ClientError(409, "session_not_active"));
    const agent = {
      cancel: vi.fn<ChatAgent["cancel"]>(),
      data: { messages: [] },
      events: [],
      send,
      status: "ready" as const,
    };
    renderToStaticMarkup(<ChatInput agent={agent} sessionId="root" />);

    await expect(
      mocks.submit?.({ text: "Keep this", files: [] })
    ).rejects.toThrow("session_not_active");
    expect(send).toHaveBeenCalledOnce();
  });

  it("shows a disabled starting indicator until Eve emits an active turn ID", () => {
    const agent = {
      cancel: vi.fn<ChatAgent["cancel"]>(),
      data: { messages: [] },
      events: [],
      send: vi.fn<ChatAgent["send"]>(),
      status: "submitted" as const,
    };
    renderToStaticMarkup(<ChatInput agent={agent} sessionId="root" />);

    expect(mocks.submitControl).toEqual({
      ariaLabel: "Starting request",
      disabled: true,
      status: "submitted",
    });
    expect(mocks.stop).toBeUndefined();
  });

  it("rejects a submitted follow-up without sending it", async () => {
    const send = vi.fn<ChatAgent["send"]>();
    renderToStaticMarkup(
      <ChatInput
        agent={testAgent({ send, status: "submitted" })}
        sessionId="root"
      />
    );

    await expect(
      mocks.submit?.({ text: "Keep this draft", files: [] })
    ).rejects.toThrow("Wait for the current request to finish");
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps the deliberate streaming steer behavior", async () => {
    const send = vi.fn<ChatAgent["send"]>().mockResolvedValue(undefined);
    renderToStaticMarkup(
      <ChatInput
        agent={testAgent({
          events: [startedTurn("turn-2")],
          send,
          status: "streaming",
        })}
        sessionId="root"
      />
    );

    await mocks.submit?.({ text: "Correction", files: [] });
    expect(send).toHaveBeenCalledWith("Correction", { turnPolicy: "steer" });
  });

  it("does not settle a newer stop from an older cancellation", () => {
    const events = [
      cancelledTurn("turn-1"),
      waiting("turn-1-waiting"),
      startedTurn("turn-2"),
      cancelledTurn("turn-2"),
    ];

    expect(stopSettlementAfter(events, "turn-2-started")).toBeUndefined();
    events.push(waiting("turn-2-waiting"));
    expect(stopSettlementAfter(events, "turn-2-started")).toBe("cancelled");
  });

  it("cancels the turn that was active when Stop was clicked", () => {
    const cancel = vi
      .fn<ChatAgent["cancel"]>()
      .mockResolvedValue({ sessionId: "root", status: "accepted" });
    renderToStaticMarkup(
      <ChatInput
        agent={testAgent({
          cancel,
          events: [startedTurn("turn-2")],
          status: "streaming",
        })}
        sessionId="root"
      />
    );

    mocks.stop?.();
    expect(cancel).toHaveBeenCalledWith("turn-2");
  });
});

function testAgent({
  cancel = vi.fn<ChatAgent["cancel"]>(),
  events = [],
  send = vi.fn<ChatAgent["send"]>(),
  status = "ready",
}: {
  readonly cancel?: ChatAgent["cancel"];
  readonly events?: readonly MessageStreamEvent[];
  readonly send?: ChatAgent["send"];
  readonly status?: ChatAgent["status"];
}) {
  return { cancel, data: { messages: [] }, events, send, status };
}

function startedTurn(turnId: string): MessageStreamEvent {
  return {
    data: { sequence: 1, turnId },
    meta: { at: "2026-09-05T12:00:00.000Z", id: `${turnId}-started` },
    type: "turn.started",
  };
}

function cancelledTurn(turnId: string): MessageStreamEvent {
  return {
    data: { sequence: 1, turnId },
    meta: { at: "2026-09-05T12:00:01.000Z", id: `${turnId}-cancelled` },
    type: "turn.cancelled",
  };
}

function waiting(id: string): MessageStreamEvent {
  return {
    data: { continuationToken: "", wait: "next-user-message" },
    meta: { at: "2026-09-05T12:00:02.000Z", id },
    type: "session.waiting",
  };
}
