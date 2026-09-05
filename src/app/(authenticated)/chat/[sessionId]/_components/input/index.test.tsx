import type { ReactNode } from "react";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { ChatAgent } from "../chat-agent";

const mocks = vi.hoisted<{
  submit: ((message: PromptInputMessage) => Promise<void>) | undefined;
  interval: Mock<() => void>;
}>(() => ({ submit: undefined, interval: vi.fn<() => void>() }));
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
  PromptInputSubmit: () => null,
  PromptInputTextarea: () => null,
}));
import { ChatInput } from ".";

afterEach(() => vi.unstubAllGlobals());
describe("composer with a persistent session observer", () => {
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
});
